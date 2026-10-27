"""Regras de domínio da Fase 9 — imunização (B.7-001…013, B.7-024…029).

O motor lê o esquema vacinal vigente do tenant (dado versionado por vigência)
e verifica faixa etária, sexo, ordem, dose repetida e intervalo mínimo. A
violação alerta ou bloqueia conforme o esquema; o bloqueio admite exceção
clínica justificada e auditada (B.7-002). Lote vencido ou interditado bloqueia
sempre (B.7-027). Nenhuma regra do PNI está no código.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.autorizacao import escopo_permite
from app.core.config import settings
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.integracoes.registro import obter_adaptador
from app.models.cidadao import Cidadao
from app.models.estoque import Lote, Produto
from app.models.imunizacao import (
    AgendamentoVacina,
    AplicacaoVacina,
    EsquemaVacinal,
    FrascoAberto,
    Vacina,
)
from app.models.nucleo import Estabelecimento, Profissional, Usuario
from app.schemas.imunizacao import (
    AgendamentoCreate,
    AplicacaoCreate,
    AplicacaoRetificar,
    EsquemaCreate,
    FrascoAbrir,
    VacinaCreate,
)
from app.services import estoque
from app.services.agenda_comum import abreviar_nome
from app.services.auditoria import registrar

JUSTIFICATIVA_MIN = 20


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


async def _auditar(db, ator, tenant_id, acao, recurso, recurso_id, cliente, **extra) -> None:
    await registrar(
        db,
        acao=acao,
        usuario=ator,
        tenant_id=tenant_id,
        recurso=recurso,
        recurso_id=recurso_id,
        cliente=cliente,
        **extra,
    )


async def _um(db, modelo, tenant_id, item_id, texto):
    item = await db.scalar(
        select(modelo).where(modelo.id == item_id, modelo.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound(texto)
    return item


async def _cidadao(db, tenant_id, cidadao_id) -> Cidadao:
    return await _um(db, Cidadao, tenant_id, cidadao_id, "Cidadão não encontrado.")


# ── Cadastros (B.7-001/029) ─────────────────────────────────────────────────
async def criar_vacina(db, tenant_id, dados: VacinaCreate, ator, cliente) -> Vacina:
    if await db.scalar(
        select(Vacina.id).where(Vacina.tenant_id == tenant_id, Vacina.codigo == dados.codigo)
    ):
        raise Conflict("Já existe vacina com este código.", code="codigo_duplicado")
    if dados.produto_id:
        prod = await _um(db, Produto, tenant_id, dados.produto_id, "Produto não encontrado.")
        if prod.tipo != "VACINA":
            raise Unprocessable(
                "O produto de estoque deve ser do tipo VACINA.", code="produto_nao_vacina"
            )
    item = Vacina(
        tenant_id=tenant_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "vacina",
        item.id,
        cliente,
        dados_depois={"codigo": item.codigo},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_vacinas(db, tenant_id) -> list[Vacina]:
    return list(
        (
            await db.scalars(
                select(Vacina)
                .where(Vacina.tenant_id == tenant_id, Vacina.baixa_em.is_(None))
                .order_by(Vacina.nome)
            )
        ).all()
    )


async def criar_esquema(db, tenant_id, dados: EsquemaCreate, ator, cliente) -> EsquemaVacinal:
    """Nova versão do esquema; a anterior é preservada (vigência encerrada ao ativar)."""
    await _um(db, Vacina, tenant_id, dados.vacina_id, "Vacina não encontrada.")
    ultima = await db.scalar(
        select(func.max(EsquemaVacinal.numero_versao)).where(
            EsquemaVacinal.tenant_id == tenant_id, EsquemaVacinal.codigo == dados.codigo
        )
    )
    item = EsquemaVacinal(
        tenant_id=tenant_id,
        numero_versao=(ultima or 0) + 1,
        **dados.model_dump(exclude={"doses", "ativo"}),
        doses=[d.model_dump() for d in sorted(dados.doses, key=lambda d: d.ordem)],
        ativo=False,
        origem="TENANT",
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "esquema_vacinal",
        item.id,
        cliente,
        dados_depois={"codigo": item.codigo, "versao": item.numero_versao},
    )
    await db.commit()
    if dados.ativo:
        return await ativar_esquema(
            db, tenant_id, item.id, True, dados.fonte_normativa, ator, cliente
        )
    await db.refresh(item)
    return item


async def ativar_esquema(
    db, tenant_id, esquema_id, ativo: bool, fonte: str | None, ator, cliente
) -> EsquemaVacinal:
    """Ativar exige a fonte normativa; encerra a vigência da versão ativa anterior."""
    item = await _um(db, EsquemaVacinal, tenant_id, esquema_id, "Esquema não encontrado.")
    if ativo:
        fonte = fonte or item.fonte_normativa
        if not fonte or len(fonte.strip()) < 5:
            raise Unprocessable(
                "Informe a fonte normativa (portaria, nota técnica, calendário) para ativar.",
                code="fonte_normativa_obrigatoria",
            )
        item.fonte_normativa = fonte
        for anterior in (
            await db.scalars(
                select(EsquemaVacinal).where(
                    EsquemaVacinal.tenant_id == tenant_id,
                    EsquemaVacinal.codigo == item.codigo,
                    EsquemaVacinal.ativo.is_(True),
                    EsquemaVacinal.id != item.id,
                )
            )
        ).all():
            anterior.ativo = False
            anterior.vigencia_fim = anterior.vigencia_fim or max(
                item.vigencia_inicio - timedelta(days=1), anterior.vigencia_inicio
            )
            anterior.versao += 1
    item.ativo = ativo
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "esquema_vacinal",
        item.id,
        cliente,
        dados_depois={"ativo": ativo, "fonte_normativa": item.fonte_normativa},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_esquemas(db, tenant_id, vacina_id=None) -> list[EsquemaVacinal]:
    stmt = select(EsquemaVacinal).where(EsquemaVacinal.tenant_id == tenant_id)
    if vacina_id:
        stmt = stmt.where(EsquemaVacinal.vacina_id == vacina_id)
    return list(
        (
            await db.scalars(
                stmt.order_by(EsquemaVacinal.codigo, EsquemaVacinal.numero_versao.desc())
            )
        ).all()
    )


async def _esquemas_vigentes(db, tenant_id, em: date, vacina_id=None) -> list[EsquemaVacinal]:
    stmt = select(EsquemaVacinal).where(
        EsquemaVacinal.tenant_id == tenant_id,
        EsquemaVacinal.ativo.is_(True),
        EsquemaVacinal.vigencia_inicio <= em,
        or_(EsquemaVacinal.vigencia_fim.is_(None), EsquemaVacinal.vigencia_fim >= em),
    )
    if vacina_id:
        stmt = stmt.where(EsquemaVacinal.vacina_id == vacina_id)
    return list((await db.scalars(stmt.order_by(EsquemaVacinal.numero_versao.desc()))).all())


# ── Motor de regras (B.7-002/011) ───────────────────────────────────────────
async def _aplicadas(
    db, tenant_id, cidadao_id, vacina_id, ignorar_id=None
) -> list[AplicacaoVacina]:
    stmt = select(AplicacaoVacina).where(
        AplicacaoVacina.tenant_id == tenant_id,
        AplicacaoVacina.cidadao_id == cidadao_id,
        AplicacaoVacina.vacina_id == vacina_id,
        AplicacaoVacina.situacao == "ATIVA",
    )
    if ignorar_id:
        stmt = stmt.where(AplicacaoVacina.id != ignorar_id)
    return list((await db.scalars(stmt.order_by(AplicacaoVacina.aplicada_em))).all())


async def avaliar(
    db, tenant_id, cidadao: Cidadao, vacina_id, dose: str, quando: datetime, ignorar_id=None
) -> tuple[EsquemaVacinal | None, list[dict], str]:
    """Devolve (esquema, violações, ação). Sem esquema ativo: só informa."""
    esquemas = await _esquemas_vigentes(db, tenant_id, _utc(quando).date(), vacina_id)
    if not esquemas:
        return (
            None,
            [
                {
                    "codigo": "SEM_ESQUEMA_ATIVO",
                    "mensagem": "Nenhum esquema vigente configurado; regras não avaliadas.",
                }
            ],
            "ALERTAR",
        )
    esquema = esquemas[0]
    doses = {d["dose"]: d for d in esquema.doses}
    regra = doses.get(dose)
    if regra is None:
        return (
            esquema,
            [
                {
                    "codigo": "DOSE_FORA_DO_ESQUEMA",
                    "mensagem": f"Dose {dose} não existe no esquema {esquema.codigo}.",
                }
            ],
            esquema.acao_violacao,
        )
    violacoes = []
    nascimento = cidadao.data_nascimento
    if nascimento is not None:
        idade = (_utc(quando).date() - nascimento).days
        if regra.get("idade_min_dias") is not None and idade < regra["idade_min_dias"]:
            violacoes.append(
                {
                    "codigo": "ABAIXO_DA_IDADE_MINIMA",
                    "mensagem": f"Idade {idade} dias < {regra['idade_min_dias']}.",
                }
            )
        if regra.get("idade_max_dias") is not None and idade > regra["idade_max_dias"]:
            violacoes.append(
                {
                    "codigo": "ACIMA_DA_IDADE_MAXIMA",
                    "mensagem": f"Idade {idade} dias > {regra['idade_max_dias']}.",
                }
            )
    if regra.get("sexo") and cidadao.sexo and regra["sexo"] != cidadao.sexo:
        violacoes.append(
            {"codigo": "SEXO_INCOMPATIVEL", "mensagem": f"Dose indicada para {regra['sexo']}."}
        )
    anteriores = await _aplicadas(db, tenant_id, cidadao.id, vacina_id, ignorar_id)
    if any(a.dose == dose for a in anteriores):
        violacoes.append({"codigo": "DOSE_JA_APLICADA", "mensagem": f"Dose {dose} já registrada."})
    previa = next((d for d in esquema.doses if d["ordem"] == regra["ordem"] - 1), None)
    if previa:
        feita = [a for a in anteriores if a.dose == previa["dose"]]
        if not feita:
            violacoes.append(
                {"codigo": "DOSE_ANTERIOR_AUSENTE", "mensagem": f"Falta a dose {previa['dose']}."}
            )
        elif regra.get("intervalo_min_dias") is not None:
            dias = (_utc(quando) - _utc(feita[-1].aplicada_em)).days
            if dias < regra["intervalo_min_dias"]:
                violacoes.append(
                    {
                        "codigo": "INTERVALO_MINIMO",
                        "mensagem": f"Intervalo de {dias} dias < {regra['intervalo_min_dias']}.",
                    }
                )
    return esquema, violacoes, esquema.acao_violacao


async def aprazamento(db, tenant_id, cidadao_id) -> list[dict]:
    """B.7-011 — próximas doses pelos esquemas vigentes (memória de cálculo exposta)."""
    cidadao = await _cidadao(db, tenant_id, cidadao_id)
    hoje = _agora().date()
    saida = []
    vistos = set()
    for esquema in await _esquemas_vigentes(db, tenant_id, hoje):
        if esquema.codigo in vistos:
            continue
        vistos.add(esquema.codigo)
        feitas = {a.dose: a for a in await _aplicadas(db, tenant_id, cidadao.id, esquema.vacina_id)}
        anterior_em: date | None = None
        anterior_feita = True
        for regra in esquema.doses:
            if regra["dose"] in feitas:
                anterior_em = _utc(feitas[regra["dose"]].aplicada_em).date()
                anterior_feita = True
                continue
            if regra.get("sexo") and cidadao.sexo and regra["sexo"] != cidadao.sexo:
                continue
            candidatas, memoria = [], []
            if cidadao.data_nascimento and regra.get("idade_min_dias") is not None:
                candidatas.append(cidadao.data_nascimento + timedelta(days=regra["idade_min_dias"]))
                memoria.append(f"nascimento + {regra['idade_min_dias']} dias")
            intervalo = regra.get("intervalo_recomendado_dias") or regra.get("intervalo_min_dias")
            if anterior_em and intervalo is not None:
                candidatas.append(anterior_em + timedelta(days=intervalo))
                memoria.append(f"dose anterior + {intervalo} dias")
            prevista = max(candidatas) if candidatas and anterior_feita else None
            limite = (
                cidadao.data_nascimento + timedelta(days=regra["idade_max_dias"])
                if cidadao.data_nascimento and regra.get("idade_max_dias") is not None
                else None
            )
            if not anterior_feita:
                situacao = "AGUARDA_DOSE_ANTERIOR"
            elif limite and hoje > limite:
                situacao = "FORA_DA_FAIXA"
            elif prevista and hoje > prevista:
                situacao = "ATRASADA"
            else:
                situacao = "PREVISTA"
            saida.append(
                {
                    "vacina_id": esquema.vacina_id,
                    "esquema": esquema.codigo,
                    "esquema_versao": esquema.numero_versao,
                    "dose": regra["dose"],
                    "data_prevista": prevista,
                    "data_limite": limite,
                    "situacao": situacao,
                    "dias_atraso": (hoje - prevista).days if situacao == "ATRASADA" else 0,
                    "memoria_calculo": " e ".join(memoria) or "sem idade/intervalo configurado",
                }
            )
            anterior_feita = False
    return saida


# ── Frascos (B.7-003/004/005) ───────────────────────────────────────────────
async def abrir_frasco(db, tenant_id, dados: FrascoAbrir, ator, cliente) -> FrascoAberto:
    vacina = await _um(db, Vacina, tenant_id, dados.vacina_id, "Vacina não encontrada.")
    if vacina.doses_por_frasco <= 1:
        raise Unprocessable("Vacina monodose não usa abertura de frasco.", code="monodose")
    if vacina.produto_id is None:
        raise Unprocessable("Vacina sem produto de estoque vinculado.", code="sem_produto")
    loc = await estoque.local(db, tenant_id, dados.local_id, ator, Permissao.IMUNIZACAO_APLICAR)
    aberto_em = _utc(dados.aberto_em or _agora())
    competencia = await estoque.competencia_de(db, tenant_id, aberto_em)
    await estoque._movimentavel(db, tenant_id, loc.id, competencia)
    frasco = FrascoAberto(
        tenant_id=tenant_id,
        vacina_id=vacina.id,
        local_id=loc.id,
        lote_id=dados.lote_id,
        aberto_em=aberto_em,
        usar_ate=aberto_em + timedelta(hours=vacina.validade_pos_abertura_horas or 0),
        doses_total=vacina.doses_por_frasco,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(frasco)
    await db.flush()
    await estoque._consumir(
        db,
        tenant_id,
        ator,
        local_id=loc.id,
        produto_id=vacina.produto_id,
        quantidade=1,
        lote_id=dados.lote_id,
        tipo="ABERTURA_FRASCO",
        ocorrido_em=aberto_em,
        competencia=competencia,
        referencia_tipo="frasco",
        referencia_id=frasco.id,
    )
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "frasco_aberto",
        frasco.id,
        cliente,
        dados_depois={"lote_id": str(dados.lote_id), "doses": frasco.doses_total},
    )
    await db.commit()
    await db.refresh(frasco)
    return frasco


async def listar_frascos(
    db, tenant_id, local_id, ator, situacao: str | None = "ABERTO"
) -> list[FrascoAberto]:
    loc = await estoque.local(db, tenant_id, local_id, ator, Permissao.IMUNIZACAO_LER)
    stmt = select(FrascoAberto).where(
        FrascoAberto.tenant_id == tenant_id, FrascoAberto.local_id == loc.id
    )
    if situacao:
        stmt = stmt.where(FrascoAberto.situacao == situacao)
    return list((await db.scalars(stmt.order_by(FrascoAberto.aberto_em))).all())


def _descartar(frasco: FrascoAberto, motivo: str, automatico: bool, ator_id=None) -> None:
    frasco.doses_perdidas = frasco.doses_total - frasco.doses_aplicadas
    frasco.situacao = "DESCARTADO"
    frasco.descartado_em = _agora()
    frasco.descarte_motivo = motivo
    frasco.descarte_automatico = automatico
    frasco.atualizado_por_id = ator_id


async def descartar_frasco(db, tenant_id, frasco_id, motivo, ator, cliente) -> FrascoAberto:
    frasco = await _um(db, FrascoAberto, tenant_id, frasco_id, "Frasco não encontrado.")
    await estoque.local(db, tenant_id, frasco.local_id, ator, Permissao.IMUNIZACAO_APLICAR)
    if frasco.situacao != "ABERTO":
        raise Conflict("Frasco não está aberto.", code="frasco_fechado")
    _descartar(frasco, motivo, False, ator.id)
    await _auditar(
        db,
        ator,
        tenant_id,
        "BAIXAR",
        "frasco_aberto",
        frasco.id,
        cliente,
        justificativa=motivo,
        dados_depois={"doses_perdidas": frasco.doses_perdidas},
    )
    await db.commit()
    await db.refresh(frasco)
    return frasco


async def descartar_vencidos(db: AsyncSession, tenant_id: uuid.UUID | None = None) -> dict:
    """B.7-005 — descarte automático (tarefa periódica) ou assistido (rota)."""
    stmt = select(FrascoAberto).where(
        FrascoAberto.situacao == "ABERTO", FrascoAberto.usar_ate < _agora()
    )
    if tenant_id:
        stmt = stmt.where(FrascoAberto.tenant_id == tenant_id)
    frascos = (await db.scalars(stmt)).all()
    for frasco in frascos:
        _descartar(frasco, "Prazo de uso após abertura expirado", True)
        await registrar(
            db,
            acao="BAIXAR",
            tenant_id=frasco.tenant_id,
            recurso="frasco_aberto",
            recurso_id=frasco.id,
            justificativa="descarte automático por validade pós-abertura",
            dados_depois={"doses_perdidas": frasco.doses_perdidas},
            cliente={},
        )
    await db.commit()
    return {"descartados": len(frascos)}


# ── Aplicação (B.7-002/008/009/010/027/028) ─────────────────────────────────
async def _validar_lote(db, tenant_id, vacina: Vacina, lote_id, quando: datetime) -> Lote:
    lote = await _um(db, Lote, tenant_id, lote_id, "Lote não encontrado.")
    if vacina.produto_id and lote.produto_id != vacina.produto_id:
        raise Unprocessable("Lote não pertence à vacina.", code="lote_de_outra_vacina")
    if lote.bloqueado:
        raise Conflict(
            f"Lote {lote.numero} interditado: {lote.bloqueio_motivo}", code="lote_bloqueado"
        )
    if lote.validade < _utc(quando).date():
        raise Conflict(f"Lote {lote.numero} vencido.", code="lote_vencido")
    return lote


async def aplicar(db, tenant_id, dados: AplicacaoCreate, ator: Usuario, cliente) -> AplicacaoVacina:
    cidadao = await _cidadao(db, tenant_id, dados.cidadao_id)
    vacina = await _um(db, Vacina, tenant_id, dados.vacina_id, "Vacina não encontrada.")
    quando = _utc(dados.aplicada_em or _agora())
    if quando > _agora() + timedelta(minutes=5):
        raise Unprocessable("Aplicação não pode ser futura.", code="data_futura")
    esquema, violacoes, acao = await avaliar(db, tenant_id, cidadao, vacina.id, dados.dose, quando)
    regras_reais = [v for v in violacoes if v["codigo"] != "SEM_ESQUEMA_ATIVO"]
    valores = dados.model_dump(exclude={"aplicada_em", "excecao_justificativa"})
    justificativa = None
    if dados.origem == "EXTERNA":
        if not dados.local_externo:
            raise Unprocessable(
                "Registro externo exige o local de aplicação.", code="local_externo_obrigatorio"
            )
        valores.update(local_id=None, lote_id=None, frasco_id=None, estabelecimento_id=None)
        violacoes.append(
            {
                "codigo": "REGISTRO_EXTERNO",
                "mensagem": "Aplicação feita fora da rede; não houve aplicação local.",
            }
        )
    else:
        if dados.local_id is None or (dados.lote_id is None and dados.frasco_id is None):
            raise Unprocessable(
                "Aplicação local exige local de estoque e lote (ou frasco).",
                code="lote_obrigatorio",
            )
        if vacina.produto_id is None:
            raise Unprocessable("Vacina sem produto de estoque vinculado.", code="sem_produto")
        if regras_reais and acao == "BLOQUEAR":
            if len((dados.excecao_justificativa or "").strip()) < JUSTIFICATIVA_MIN:
                raise Conflict(
                    "Aplicação fora da regra vacinal; registre a exceção clínica justificada.",
                    code="regra_vacinal",
                    extra={
                        "violacoes": regras_reais,
                        "esquema": esquema.codigo if esquema else None,
                    },
                )
            justificativa = dados.excecao_justificativa
        loc = await estoque.local(db, tenant_id, dados.local_id, ator, Permissao.IMUNIZACAO_APLICAR)
        valores["estabelecimento_id"] = loc.estabelecimento_id
    agendamento = None
    if dados.agendamento_id:
        agendamento = await _um(
            db, AgendamentoVacina, tenant_id, dados.agendamento_id, "Agendamento não encontrado."
        )
        if (
            agendamento.cidadao_id != cidadao.id
            or agendamento.vacina_id != vacina.id
            or agendamento.situacao != "AGENDADO"
        ):
            raise Conflict(
                "Agendamento não corresponde a esta aplicação.", code="agendamento_divergente"
            )
    if dados.origem == "LOCAL" and not valores.get("profissional_id"):
        # B.7-009 — o vacinador é o profissional vinculado ao usuário que registra.
        valores["profissional_id"] = await db.scalar(
            select(Profissional.id).where(
                Profissional.tenant_id == tenant_id,
                Profissional.usuario_id == ator.id,
                Profissional.baixa_em.is_(None),
            )
        )
    item = AplicacaoVacina(
        tenant_id=tenant_id,
        **valores,
        aplicada_em=quando,
        esquema_id=esquema.id if esquema else None,
        alertas=violacoes or None,
        excecao_justificativa=justificativa,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    if dados.origem == "LOCAL":
        await _baixar_dose(db, tenant_id, vacina, item, dados, quando, ator)
    if agendamento:
        agendamento.situacao = "APLICADO"
        agendamento.aplicacao_id = item.id
        agendamento.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "aplicacao_vacina",
        item.id,
        cliente,
        dados_depois={
            "dose": item.dose,
            "origem": item.origem,
            "violacoes": [v["codigo"] for v in violacoes],
        },
        justificativa=justificativa,
    )
    await db.commit()
    await db.refresh(item)
    return item


async def _baixar_dose(
    db, tenant_id, vacina: Vacina, item: AplicacaoVacina, dados, quando, ator
) -> None:
    """B.7-010 — multidose consome do frasco aberto; monodose sai do estoque."""
    if vacina.doses_por_frasco > 1:
        if dados.frasco_id:
            frasco = await _um(
                db, FrascoAberto, tenant_id, dados.frasco_id, "Frasco não encontrado."
            )
        else:
            frasco = await db.scalar(
                select(FrascoAberto)
                .where(
                    FrascoAberto.tenant_id == tenant_id,
                    FrascoAberto.local_id == dados.local_id,
                    FrascoAberto.vacina_id == vacina.id,
                    FrascoAberto.situacao == "ABERTO",
                    FrascoAberto.lote_id == dados.lote_id,
                )
                .order_by(FrascoAberto.aberto_em)
                .with_for_update()
            )
            if frasco is None:
                raise Conflict(
                    "Não há frasco aberto deste lote no local.", code="sem_frasco_aberto"
                )
        if frasco.local_id != dados.local_id or frasco.vacina_id != vacina.id:
            raise Unprocessable("Frasco de outro local ou vacina.", code="frasco_divergente")
        if frasco.situacao != "ABERTO":
            raise Conflict("Frasco esgotado ou descartado.", code="frasco_fechado")
        if frasco.usar_ate and quando > _utc(frasco.usar_ate):
            raise Conflict("Prazo de uso do frasco aberto expirou.", code="frasco_vencido")
        await _validar_lote(db, tenant_id, vacina, frasco.lote_id, quando)
        frasco.doses_aplicadas += 1
        if frasco.doses_aplicadas >= frasco.doses_total:
            frasco.situacao = "ESGOTADO"
        item.frasco_id, item.lote_id = frasco.id, frasco.lote_id
        return
    await _validar_lote(db, tenant_id, vacina, dados.lote_id, quando)
    competencia = await estoque.competencia_de(db, tenant_id, quando)
    await estoque._movimentavel(db, tenant_id, dados.local_id, competencia)
    await estoque._consumir(
        db,
        tenant_id,
        ator,
        local_id=dados.local_id,
        produto_id=vacina.produto_id,
        quantidade=1,
        lote_id=dados.lote_id,
        tipo="APLICACAO_VACINA",
        ocorrido_em=quando,
        competencia=competencia,
        referencia_tipo="aplicacao_vacina",
        referencia_id=item.id,
    )


def _visivel(ator, item: AplicacaoVacina) -> bool:
    return item.estabelecimento_id is None or escopo_permite(
        ator, Permissao.IMUNIZACAO_LER, estabelecimento_id=item.estabelecimento_id
    )


async def obter_aplicacao(db, tenant_id, aplicacao_id, ator) -> AplicacaoVacina:
    item = await _um(db, AplicacaoVacina, tenant_id, aplicacao_id, "Aplicação não encontrada.")
    if not _visivel(ator, item):
        raise NotFound("Aplicação não encontrada.")
    return item


async def retificar(
    db, tenant_id, aplicacao_id, dados: AplicacaoRetificar, ator, cliente
) -> AplicacaoVacina:
    """B.7-028 — nova versão; a anterior fica RETIFICADA. Lote e local não mudam."""
    original = await obter_aplicacao(db, tenant_id, aplicacao_id, ator)
    if original.situacao != "ATIVA":
        raise Conflict("Só a versão ativa pode ser retificada.", code="versao_superada")
    cidadao = await _cidadao(db, tenant_id, original.cidadao_id)
    dose = dados.dose or original.dose
    quando = _utc(dados.aplicada_em or original.aplicada_em)
    esquema, violacoes, _ = await avaliar(
        db, tenant_id, cidadao, original.vacina_id, dose, quando, ignorar_id=original.id
    )
    campos = {
        c: getattr(original, c)
        for c in (
            "cidadao_id",
            "vacina_id",
            "origem",
            "estabelecimento_id",
            "local_id",
            "lote_id",
            "frasco_id",
            "lote_externo",
            "local_externo",
            "profissional_id",
            "agendamento_id",
            "excecao_justificativa",
        )
    }
    nova = AplicacaoVacina(
        tenant_id=tenant_id,
        **campos,
        dose=dose,
        estrategia=dados.estrategia or original.estrategia,
        aplicada_em=quando,
        esquema_id=esquema.id if esquema else None,
        alertas=violacoes or None,
        retifica_de_id=original.id,
        motivo_alteracao=dados.justificativa,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    original.situacao = "RETIFICADA"
    original.versao += 1
    db.add(nova)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "RETIFICAR",
        "aplicacao_vacina",
        nova.id,
        cliente,
        dados_antes={"dose": original.dose, "aplicada_em": original.aplicada_em.isoformat()},
        dados_depois={"dose": dose, "retifica_de_id": str(original.id)},
        justificativa=dados.justificativa,
    )
    await db.commit()
    await db.refresh(nova)
    return nova


async def invalidar(db, tenant_id, aplicacao_id, motivo, ator, cliente) -> AplicacaoVacina:
    """B.7-028 — registro indevido sai do histórico vacinal sem ser apagado.

    O estoque não é devolvido: a dose foi consumida (ajuste, se preciso, pela Fase 8).
    """
    item = await obter_aplicacao(db, tenant_id, aplicacao_id, ator)
    if item.situacao != "ATIVA":
        raise Conflict("Só a versão ativa pode ser invalidada.", code="versao_superada")
    item.situacao = "INVALIDADA"
    item.motivo_alteracao = motivo
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "aplicacao_vacina",
        item.id,
        cliente,
        dados_depois={"situacao": "INVALIDADA"},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(item)
    return item


async def historico(db, tenant_id, cidadao_id, ator, cliente, todas=False) -> list[AplicacaoVacina]:
    await _cidadao(db, tenant_id, cidadao_id)
    stmt = select(AplicacaoVacina).where(
        AplicacaoVacina.tenant_id == tenant_id, AplicacaoVacina.cidadao_id == cidadao_id
    )
    if not todas:
        stmt = stmt.where(AplicacaoVacina.situacao == "ATIVA")
    linhas = (await db.scalars(stmt.order_by(AplicacaoVacina.aplicada_em))).all()
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "aplicacao_vacina",
        cidadao_id,
        cliente,
        finalidade="historico_vacinal",
    )
    await db.commit()
    return list(linhas)


# ── Agendamento (B.7-006/007) ───────────────────────────────────────────────
async def agendar(db, tenant_id, dados: AgendamentoCreate, ator, cliente) -> AgendamentoVacina:
    await _cidadao(db, tenant_id, dados.cidadao_id)
    await _um(db, Vacina, tenant_id, dados.vacina_id, "Vacina não encontrada.")
    await _um(
        db, Estabelecimento, tenant_id, dados.estabelecimento_id, "Estabelecimento não encontrado."
    )
    if not escopo_permite(
        ator, Permissao.IMUNIZACAO_APLICAR, estabelecimento_id=dados.estabelecimento_id
    ):
        raise NotFound("Estabelecimento não encontrado.")
    if dados.data_prevista < _agora().date():
        raise Unprocessable("Data prevista no passado.", code="data_passada")
    item = AgendamentoVacina(
        tenant_id=tenant_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id
    )
    db.add(item)
    await db.flush()
    await _auditar(db, ator, tenant_id, "CRIAR", "agendamento_vacina", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


async def _agendamento_aberto(db, tenant_id, agendamento_id, ator) -> AgendamentoVacina:
    item = await _um(
        db, AgendamentoVacina, tenant_id, agendamento_id, "Agendamento não encontrado."
    )
    if not escopo_permite(
        ator, Permissao.IMUNIZACAO_APLICAR, estabelecimento_id=item.estabelecimento_id
    ):
        raise NotFound("Agendamento não encontrado.")
    if item.situacao != "AGENDADO":
        raise Conflict("Agendamento não está em aberto.", code="situacao_invalida")
    return item


async def marcar_falta(db, tenant_id, agendamento_id, motivo, ator, cliente) -> AgendamentoVacina:
    item = await _agendamento_aberto(db, tenant_id, agendamento_id, ator)
    item.situacao, item.motivo = "FALTOU", motivo
    item.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "agendamento_vacina",
        item.id,
        cliente,
        dados_depois={"situacao": "FALTOU"},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def reagendar(
    db, tenant_id, agendamento_id, nova_data: date, motivo, ator, cliente
) -> AgendamentoVacina:
    item = await _um(
        db, AgendamentoVacina, tenant_id, agendamento_id, "Agendamento não encontrado."
    )
    if not escopo_permite(
        ator, Permissao.IMUNIZACAO_APLICAR, estabelecimento_id=item.estabelecimento_id
    ):
        raise NotFound("Agendamento não encontrado.")
    if item.situacao not in ("AGENDADO", "FALTOU"):
        raise Conflict("Agendamento não pode ser reagendado.", code="situacao_invalida")
    if nova_data < _agora().date():
        raise Unprocessable("Data prevista no passado.", code="data_passada")
    novo = AgendamentoVacina(
        tenant_id=tenant_id,
        cidadao_id=item.cidadao_id,
        estabelecimento_id=item.estabelecimento_id,
        vacina_id=item.vacina_id,
        dose=item.dose,
        data_prevista=nova_data,
        observacao=item.observacao,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(novo)
    await db.flush()
    item.situacao, item.motivo, item.reagendado_para_id = "REAGENDADO", motivo, novo.id
    item.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "agendamento_vacina",
        item.id,
        cliente,
        dados_depois={"situacao": "REAGENDADO", "novo_id": str(novo.id)},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(novo)
    return novo


async def agendamentos_do_cidadao(db, tenant_id, cidadao_id) -> list[AgendamentoVacina]:
    await _cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.scalars(
                select(AgendamentoVacina)
                .where(
                    AgendamentoVacina.tenant_id == tenant_id,
                    AgendamentoVacina.cidadao_id == cidadao_id,
                )
                .order_by(AgendamentoVacina.data_prevista)
            )
        ).all()
    )


# ── Busca ativa (B.7-024) ───────────────────────────────────────────────────
async def busca_ativa(db, tenant_id, ator, cliente, vacina_id=None, limite=200) -> list[dict]:
    cidadaos = (
        await db.scalars(
            select(Cidadao)
            .where(
                Cidadao.tenant_id == tenant_id,
                Cidadao.baixa_em.is_(None),
                Cidadao.data_nascimento.is_not(None),
            )
            .order_by(Cidadao.nome)
            .limit(5000)
        )
    ).all()
    saida = []
    for c in cidadaos:
        for p in await aprazamento(db, tenant_id, c.id):
            if p["situacao"] != "ATRASADA" or (vacina_id and p["vacina_id"] != vacina_id):
                continue
            saida.append(
                {
                    "cidadao_id": c.id,
                    "nome": c.nome_social or c.nome,
                    **{
                        k: p[k]
                        for k in ("vacina_id", "esquema", "dose", "data_prevista", "dias_atraso")
                    },
                }
            )
        if len(saida) >= limite:
            break
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "busca_ativa_vacinal",
        tenant_id,
        cliente,
        finalidade="busca_ativa_vacinal",
    )
    await db.commit()
    return sorted(saida, key=lambda x: -x["dias_atraso"])[:limite]


# ── Carteira e certificado (B.7-012) ────────────────────────────────────────
def _chave() -> bytes:
    return hashlib.sha256(
        b"govsaude:certificado-vacina:" + settings.SECRET_KEY.get_secret_value().encode()
    ).digest()


def gerar_token(
    tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ids: list[uuid.UUID], emitido: datetime
) -> str:
    """Token opaco do QR: identifica o documento e as aplicações que ele contém."""
    resumo = hashlib.sha256(",".join(sorted(str(i) for i in ids)).encode()).hexdigest()[:16]
    base = f"{tenant_id}|{cidadao_id}|{int(emitido.timestamp())}|{len(ids)}|{resumo}"
    assinatura = hmac.new(_chave(), base.encode(), hashlib.sha256).hexdigest()[:20]
    return base64.urlsafe_b64encode(f"{base}|{assinatura}".encode()).decode().rstrip("=")


def ler_token(token: str) -> dict:
    try:
        texto = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode()
        tenant, cidadao, epoch, qtd, resumo, assinatura = texto.split("|")
    except Exception as exc:  # noqa: BLE001
        raise NotFound("Documento não encontrado.") from exc
    base = f"{tenant}|{cidadao}|{epoch}|{qtd}|{resumo}"
    esperado = hmac.new(_chave(), base.encode(), hashlib.sha256).hexdigest()[:20]
    if not hmac.compare_digest(esperado, assinatura):
        raise NotFound("Documento não encontrado.")
    return {
        "tenant_id": uuid.UUID(tenant),
        "cidadao_id": uuid.UUID(cidadao),
        "emitido_em": datetime.fromtimestamp(int(epoch), timezone.utc),
        "doses": int(qtd),
        "resumo": resumo,
    }


async def carteira(db, tenant_id, cidadao_id, ator, cliente) -> dict:
    cidadao = await _cidadao(db, tenant_id, cidadao_id)
    aplicacoes = await historico(db, tenant_id, cidadao_id, ator, cliente)
    vacinas = {v.id: v for v in await listar_vacinas(db, tenant_id)}
    lotes = {}
    for a in aplicacoes:
        if a.lote_id and a.lote_id not in lotes:
            lotes[a.lote_id] = await db.get(Lote, a.lote_id)
    emitido = _agora().replace(microsecond=0)
    token = gerar_token(tenant_id, cidadao.id, [a.id for a in aplicacoes], emitido)
    return {
        "cidadao": {
            "nome": cidadao.nome_social or cidadao.nome,
            "data_nascimento": cidadao.data_nascimento,
        },
        "aplicacoes": [
            {
                "vacina": vacinas[a.vacina_id].nome if a.vacina_id in vacinas else str(a.vacina_id),
                "dose": a.dose,
                "data": a.aplicada_em,
                "lote": lotes[a.lote_id].numero if a.lote_id in lotes else a.lote_externo,
                "local": a.local_externo if a.origem == "EXTERNA" else str(a.estabelecimento_id),
                "origem": a.origem,
            }
            for a in aplicacoes
        ],
        "proximas_doses": [
            p
            for p in await aprazamento(db, tenant_id, cidadao.id)
            if p["situacao"] != "AGUARDA_DOSE_ANTERIOR"
        ],
        "emitido_em": emitido,
        "token_verificacao": token,
    }


async def verificar(db, token: str) -> dict:
    """Verificação pública do QR: confirma autenticidade sem expor dado sensível."""
    dados = ler_token(token)
    cidadao = await db.scalar(
        select(Cidadao).where(
            Cidadao.id == dados["cidadao_id"], Cidadao.tenant_id == dados["tenant_id"]
        )
    )
    if cidadao is None:
        raise NotFound("Documento não encontrado.")
    atuais = await _aplicadas_todas(db, dados["tenant_id"], cidadao.id)
    resumo = hashlib.sha256(",".join(sorted(str(a.id) for a in atuais)).encode()).hexdigest()[:16]
    return {
        "autentico": True,
        "titular": abreviar_nome(cidadao.nome_social or cidadao.nome),
        "emitido_em": dados["emitido_em"],
        "doses_no_documento": dados["doses"],
        "historico_alterado_desde_a_emissao": resumo != dados["resumo"],
    }


async def _aplicadas_todas(db, tenant_id, cidadao_id) -> list[AplicacaoVacina]:
    return list(
        (
            await db.scalars(
                select(AplicacaoVacina).where(
                    AplicacaoVacina.tenant_id == tenant_id,
                    AplicacaoVacina.cidadao_id == cidadao_id,
                    AplicacaoVacina.situacao == "ATIVA",
                )
            )
        ).all()
    )


def carteira_html(dados: dict, url_verificacao: str) -> str:
    import segno

    from app.services.exportacao import html_tabela

    qr = segno.make(url_verificacao, error="m").svg_inline(scale=3)
    corpo = html_tabela(
        f"Carteira de vacinação — {dados['cidadao']['nome']}",
        [
            ("vacina", "Vacina"),
            ("dose", "Dose"),
            ("data", "Data"),
            ("lote", "Lote"),
            ("origem", "Origem"),
        ],
        dados["aplicacoes"],
        rodape=(
            f"Emitido em {dados['emitido_em'].isoformat()}. "
            "Verifique a autenticidade pelo QR Code."
        ),
    )
    proximas = (
        html_tabela(
            "Próximas doses",
            [
                ("dose", "Dose"),
                ("esquema", "Esquema"),
                ("data_prevista", "Prevista"),
                ("situacao", "Situação"),
            ],
            dados["proximas_doses"],
        )
        .replace("<h1>", "<h2>")
        .replace("</h1>", "</h2>")
    )
    return corpo + proximas + f"<div>{qr}</div>"


# ── Exportação RNDS (B.7-013) ───────────────────────────────────────────────
async def exportacao_rnds(db, tenant_id, aplicacao_id, ator) -> dict:
    item = await obter_aplicacao(db, tenant_id, aplicacao_id, ator)
    pendencias = obter_adaptador("RNDS").validar({"modelo": "RIA", "aplicacao_id": str(item.id)})
    situacao = (
        "PENDENTE_ESPECIFICACAO_OFICIAL"
        if any(p.get("codigo") == "PENDENTE_ESPECIFICACAO_OFICIAL" for p in pendencias)
        else "VALIDO"
    )
    return {
        "aplicacao_id": item.id,
        "sistema": "RNDS",
        "modelo": "RIA",
        "situacao": situacao,
        "pendencias": pendencias,
    }


# ── Relatórios (B.7-025/026) ────────────────────────────────────────────────
async def relatorio_aplicacoes(
    db, tenant_id, inicio: date, fim: date, *, ator, agrupar_por: str
) -> dict:
    from app.services.relatorios import _chave_tempo, _faixa, _intervalo, _linhas

    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for a in (
        await db.scalars(
            select(AplicacaoVacina).where(
                AplicacaoVacina.tenant_id == tenant_id,
                AplicacaoVacina.situacao == "ATIVA",
                AplicacaoVacina.origem == "LOCAL",
                AplicacaoVacina.aplicada_em >= ini,
                AplicacaoVacina.aplicada_em < fim_,
            )
        )
    ).all():
        if not _visivel(ator, a):
            continue
        if agrupar_por == "estabelecimento":
            chave = str(a.estabelecimento_id)
        elif agrupar_por == "profissional":
            chave = str(a.criado_por_id)
        elif agrupar_por == "vacina":
            chave = str(a.vacina_id)
        elif agrupar_por == "dose":
            chave = a.dose
        elif agrupar_por == "estrategia":
            chave = a.estrategia or "SEM_ESTRATEGIA"
        elif agrupar_por == "faixa_etaria":
            c = await db.get(Cidadao, a.cidadao_id)
            chave = _faixa(c.data_nascimento if c else None, _utc(a.aplicada_em).date())
        else:
            chave = await _chave_tempo(db, tenant_id, a.aplicada_em)
        acumulado[chave]["aplicacoes"] += 1
        acumulado[chave]["com_excecao"] += bool(a.excecao_justificativa)
    metricas = ["aplicacoes", "com_excecao"]
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }


async def relatorio_frascos(db, tenant_id, inicio: date, fim: date, *, ator, local_id) -> dict:
    """B.7-026 — por lote: frascos abertos, doses aplicadas e perdidas, saldo atual."""
    from app.services.relatorios import _intervalo, _linhas

    loc = await estoque.local(db, tenant_id, local_id, ator, Permissao.IMUNIZACAO_LER)
    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    numeros = {}
    for f in (
        await db.scalars(
            select(FrascoAberto).where(
                FrascoAberto.tenant_id == tenant_id,
                FrascoAberto.local_id == loc.id,
                FrascoAberto.aberto_em >= ini,
                FrascoAberto.aberto_em < fim_,
            )
        )
    ).all():
        if f.lote_id not in numeros:
            numeros[f.lote_id] = (await db.get(Lote, f.lote_id)).numero
        chave = numeros[f.lote_id]
        acumulado[chave]["frascos_abertos"] += 1
        acumulado[chave]["doses_aplicadas"] += f.doses_aplicadas
        acumulado[chave]["doses_perdidas"] += f.doses_perdidas
        acumulado[chave]["descartados"] += f.situacao == "DESCARTADO"
        acumulado[chave]["saldo_frascos"] = await estoque.saldo(
            db, tenant_id, local_id=loc.id, lote_id=f.lote_id
        )
    metricas = [
        "frascos_abertos",
        "doses_aplicadas",
        "doses_perdidas",
        "descartados",
        "saldo_frascos",
    ]
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": "lote",
        "local_id": loc.id,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }
