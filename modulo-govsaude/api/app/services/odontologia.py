"""Regras de domínio da Fase 7 — odontologia (B.3-001…027).

Notação de dentes FDI (ISO 3950): permanentes nos quadrantes 1–4 (dentes 1–8)
e decíduos nos quadrantes 5–8 (dentes 1–5). Catálogo de condições, riscos,
anamnese e limite de digitação retroativa são dados do tenant.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.integracoes.registro import obter_adaptador
from app.models.agenda import Agendamento
from app.models.cidadao import Cidadao
from app.models.enums import AcaoAuditoria
from app.models.nucleo import FormularioDinamico, Usuario
from app.models.odontologia import (
    OdontoAtendimento,
    OdontoCondicao,
    OdontoDocumento,
    Odontograma,
    OdontoProcedimento,
)
from app.motores.formularios import validar_resposta
from app.schemas.odontologia import (
    AtendimentoCreate,
    AtendimentoUpdate,
    CondicaoCreate,
    CondicaoUpdate,
    DocumentoCreate,
    Marcacao,
    OdontogramaCreate,
    ProcedimentoCreate,
    ProcedimentoRealizar,
)
from app.services import configuracoes
from app.services.auditoria import registrar
from app.services.rede_comum import exigir_acesso_estabelecimento, validar_sigtap_contra_referencia

FACES_UPPER = {1, 2, 5, 6}


def _agora() -> datetime:
    return datetime.now(timezone.utc)


async def _um(
    db: AsyncSession,
    modelo,
    tenant_id: uuid.UUID,
    item_id: uuid.UUID,
    texto: str = "Registro odontológico não encontrado.",
):
    item = await db.scalar(
        select(modelo).where(modelo.id == item_id, modelo.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound(texto)
    return item


async def _cidadao(db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID) -> Cidadao:
    item = await db.scalar(
        select(Cidadao).where(
            Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id, Cidadao.baixa_em.is_(None)
        )
    )
    if item is None:
        raise NotFound("Cidadão não encontrado.")
    return item


# ── Notação FDI ──────────────────────────────────────────────────────────────
def denticao_do_dente(dente: int) -> str:
    """B.3-001/006 — valida o número FDI e devolve PERMANENTE ou DECIDUA."""
    quadrante, numero = divmod(dente, 10)
    if 1 <= quadrante <= 4 and 1 <= numero <= 8:
        return "PERMANENTE"
    if 5 <= quadrante <= 8 and 1 <= numero <= 5:
        return "DECIDUA"
    raise Unprocessable(
        f"Dente {dente} não existe na notação FDI.",
        code="dente_invalido",
        errors=[
            {
                "campo": "dente",
                "mensagem": "Use a notação FDI (11–48 permanentes, 51–85 decíduos).",
                "codigo_regra": "fdi",
            }
        ],
    )


def validar_faces(dente: int, faces: list[str]) -> None:
    quadrante, numero = divmod(dente, 10)
    anterior = numero <= 3
    erros = []
    for face in faces:
        if face == "O" and anterior:
            erros.append("Face oclusal (O) só existe em dentes posteriores; use incisal (I).")
        elif face == "I" and not anterior:
            erros.append("Face incisal (I) só existe em dentes anteriores; use oclusal (O).")
        elif face == "P" and quadrante not in FACES_UPPER:
            erros.append("Face palatina (P) só existe na arcada superior; use lingual (L).")
        elif face == "L" and quadrante in FACES_UPPER:
            erros.append("Face lingual (L) só existe na arcada inferior; use palatina (P).")
    if len(set(faces)) != len(faces):
        erros.append("Face repetida.")
    if erros:
        raise Unprocessable(
            "Faces incompatíveis com o dente.",
            code="face_invalida",
            errors=[{"campo": "faces", "mensagem": m, "codigo_regra": "fdi_face"} for m in erros],
        )


def _validar_local(
    condicao: OdontoCondicao, dente: int | None, faces: list[str], regiao: str | None
) -> None:
    if dente is not None:
        denticao = denticao_do_dente(dente)
        if condicao.denticao != "AMBAS" and condicao.denticao != denticao:
            raise Unprocessable(
                f"'{condicao.nome}' não se aplica à dentição {denticao.lower()}.",
                code="condicao_inaplicavel",
            )
        if faces:
            validar_faces(dente, faces)
            exigido = "FACE"
        else:
            exigido = "DENTE"
    elif faces:
        raise Unprocessable("Faces exigem o dente.", code="face_sem_dente")
    elif regiao:
        exigido = "BOCA" if regiao == "BOCA" else regiao.split("_")[0]
    else:
        raise Unprocessable("Informe dente, faces ou região.", code="local_obrigatorio")
    if exigido not in (condicao.aplicavel_a or []):
        raise Unprocessable(
            f"'{condicao.nome}' não se aplica a {exigido.lower()}.", code="condicao_inaplicavel"
        )


# ── Catálogo (B.3-001) ───────────────────────────────────────────────────────
async def listar_condicoes(
    db: AsyncSession, tenant_id: uuid.UUID, tipo: str | None = None
) -> list[OdontoCondicao]:
    filtros = [OdontoCondicao.tenant_id == tenant_id, OdontoCondicao.baixa_em.is_(None)]
    if tipo:
        filtros.append(OdontoCondicao.tipo == tipo)
    return list(
        (
            await db.execute(
                select(OdontoCondicao)
                .where(*filtros)
                .order_by(OdontoCondicao.tipo, OdontoCondicao.nome)
            )
        ).scalars()
    )


async def criar_condicao(
    db: AsyncSession, tenant_id: uuid.UUID, dados: CondicaoCreate, ator: Usuario, cliente: dict
) -> OdontoCondicao:
    if await db.scalar(
        select(OdontoCondicao.id).where(
            OdontoCondicao.tenant_id == tenant_id, OdontoCondicao.codigo == dados.codigo
        )
    ):
        raise Conflict("Já existe condição com este código.", code="codigo_duplicado")
    if dados.procedimento_sigtap:
        await validar_sigtap_contra_referencia(db, dados.procedimento_sigtap, None)
    valores = dados.model_dump(exclude_none=True)
    item = OdontoCondicao(
        tenant_id=tenant_id, **valores, criado_por_id=ator.id, atualizado_por_id=ator.id
    )
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao="CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odonto_condicao",
        recurso_id=item.id,
        dados_depois={"codigo": item.codigo, "tipo": item.tipo},
        cliente=cliente,
    )
    await db.commit()
    return item


async def atualizar_condicao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    condicao_id: uuid.UUID,
    dados: CondicaoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> OdontoCondicao:
    item = await _um(db, OdontoCondicao, tenant_id, condicao_id)
    if item.versao != versao:
        raise Conflict("A condição foi alterada por outra pessoa.", code="versao_divergente")
    mudancas = dados.model_dump(exclude_unset=True)
    if mudancas.get("procedimento_sigtap"):
        await validar_sigtap_contra_referencia(db, mudancas["procedimento_sigtap"], None)
    antes = {k: getattr(item, k) for k in mudancas}
    for chave, valor in mudancas.items():
        setattr(item, chave, valor)
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao="ATUALIZAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odonto_condicao",
        recurso_id=item.id,
        dados_antes={k: str(v) for k, v in antes.items()},
        dados_depois={k: str(v) for k, v in mudancas.items()},
        cliente=cliente,
    )
    await db.commit()
    return item


# ── Odontograma (B.3-006/024) ────────────────────────────────────────────────
async def _validar_marcacoes(
    db: AsyncSession, tenant_id: uuid.UUID, marcacoes: list[Marcacao]
) -> None:
    ids = {m.condicao_id for m in marcacoes}
    condicoes = (
        {
            c.id: c
            for c in (
                await db.execute(
                    select(OdontoCondicao).where(
                        OdontoCondicao.tenant_id == tenant_id,
                        OdontoCondicao.id.in_(ids),
                        OdontoCondicao.baixa_em.is_(None),
                    )
                )
            ).scalars()
        }
        if ids
        else {}
    )
    for marcacao in marcacoes:
        condicao = condicoes.get(marcacao.condicao_id)
        if condicao is None:
            raise NotFound("Condição odontológica não encontrada.")
        _validar_local(condicao, marcacao.dente, list(marcacao.faces), marcacao.regiao)


async def odontograma_atual(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> Odontograma | None:
    return await db.scalar(
        select(Odontograma)
        .where(Odontograma.tenant_id == tenant_id, Odontograma.cidadao_id == cidadao_id)
        .order_by(Odontograma.numero_versao.desc())
        .limit(1)
    )


async def obter_odontograma(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> dict:
    await _cidadao(db, tenant_id, cidadao_id)
    atual = await odontograma_atual(db, tenant_id, cidadao_id)
    planejados = list(
        (
            await db.execute(
                select(OdontoProcedimento)
                .where(
                    OdontoProcedimento.tenant_id == tenant_id,
                    OdontoProcedimento.cidadao_id == cidadao_id,
                    OdontoProcedimento.situacao == "PROGRAMADO",
                )
                .order_by(OdontoProcedimento.programado_para, OdontoProcedimento.created_at)
            )
        ).scalars()
    )
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odontograma",
        recurso_id=cidadao_id,
        finalidade="assistencial",
        cliente=cliente,
    )
    await db.commit()
    return {"cidadao_id": cidadao_id, "versao": atual, "planejados": planejados}


async def listar_versoes(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[Odontograma]:
    await _cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(Odontograma)
                .where(Odontograma.tenant_id == tenant_id, Odontograma.cidadao_id == cidadao_id)
                .order_by(Odontograma.numero_versao.desc())
            )
        ).scalars()
    )


async def gravar_odontograma(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: OdontogramaCreate,
    ator: Usuario,
    cliente: dict,
) -> Odontograma:
    """Cada gravação cria nova versão; a anterior nunca é alterada."""
    await _cidadao(db, tenant_id, cidadao_id)
    atual = await odontograma_atual(db, tenant_id, cidadao_id)
    numero_atual = atual.numero_versao if atual else 0
    if dados.versao_base != numero_atual:
        raise Conflict(
            "O odontograma mudou desde que foi aberto; recarregue a versão atual.",
            code="versao_divergente",
            extra={"versao_atual": numero_atual},
        )
    if dados.atendimento_id:
        atendimento = await _um(
            db,
            OdontoAtendimento,
            tenant_id,
            dados.atendimento_id,
            "Atendimento odontológico não encontrado.",
        )
        if atendimento.cidadao_id != cidadao_id:
            raise Unprocessable(
                "O atendimento é de outro cidadão.", code="atendimento_de_outro_cidadao"
            )
    await _validar_marcacoes(db, tenant_id, dados.marcacoes)
    if atual is not None and not dados.atendimento_id and not (dados.justificativa or "").strip():
        raise Unprocessable(
            "Alterar o odontograma fora de um atendimento exige justificativa.",
            code="justificativa_obrigatoria",
        )
    item = Odontograma(
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        numero_versao=numero_atual + 1,
        atendimento_id=dados.atendimento_id,
        marcacoes=[m.model_dump(mode="json") for m in dados.marcacoes],
        justificativa=dados.justificativa,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao="CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odontograma",
        recurso_id=item.id,
        dados_depois={
            "cidadao_id": str(cidadao_id),
            "numero_versao": item.numero_versao,
            "marcacoes": len(item.marcacoes),
        },
        justificativa=dados.justificativa,
        cliente=cliente,
    )
    await db.commit()
    return item


# ── Atendimento (B.3-003/004/005/009/010/013) ────────────────────────────────
async def _anamnese(
    db: AsyncSession, tenant_id: uuid.UUID, codigo: str | None, resposta: dict | None
) -> tuple[uuid.UUID | None, int | None]:
    if codigo is None:
        if resposta:
            raise Unprocessable(
                "Informe o formulário de anamnese da resposta.", code="formulario_obrigatorio"
            )
        return None, None
    formulario = await db.scalar(
        select(FormularioDinamico)
        .where(
            FormularioDinamico.tenant_id == tenant_id,
            FormularioDinamico.codigo == codigo,
            FormularioDinamico.ativo.is_(True),
        )
        .order_by(FormularioDinamico.versao.desc())
        .limit(1)
    )
    if formulario is None:
        raise NotFound("Formulário de anamnese não encontrado.")
    erros = validar_resposta(formulario.schema_json, resposta or {})
    if erros:
        raise Unprocessable(
            "A anamnese não corresponde ao formulário.", code="anamnese_invalida", errors=erros
        )
    return formulario.id, formulario.versao


async def _validar_risco(db: AsyncSession, tenant_id: uuid.UUID, risco: str | None) -> None:
    if risco is None:
        return
    permitidos = await configuracoes.valor(db, tenant_id, "odontologia.classificacoes_risco", [])
    if isinstance(permitidos, list) and permitidos and risco not in permitidos:
        raise Unprocessable(
            "Classificação de risco não configurada para o município.",
            code="risco_invalido",
            extra={"permitidos": permitidos},
        )


async def _retroativo(
    db: AsyncSession, tenant_id: uuid.UUID, iniciado_em: datetime, justificativa: str | None
) -> bool:
    """B.3-013 — digitação retroativa só com justificativa e dentro do limite do tenant."""
    agora = _agora()
    if iniciado_em.tzinfo is None:
        iniciado_em = iniciado_em.replace(tzinfo=timezone.utc)
    if iniciado_em > agora + timedelta(minutes=5):
        raise Unprocessable("O atendimento não pode começar no futuro.", code="data_futura")
    if iniciado_em >= agora - timedelta(hours=24):
        return False
    limite = await configuracoes.valor(db, tenant_id, "odontologia.retroativo_dias_maximos", 30)
    try:
        limite = int(limite)
    except (TypeError, ValueError):
        limite = 30
    if iniciado_em < agora - timedelta(days=limite):
        raise Unprocessable(
            f"Digitação retroativa limitada a {limite} dias.", code="retroativo_fora_do_limite"
        )
    if len((justificativa or "").strip()) < 20:
        raise Unprocessable(
            "Digitação retroativa exige justificativa com pelo menos 20 caracteres.",
            code="retroativo_sem_justificativa",
        )
    return True


async def criar_atendimento(
    db: AsyncSession, tenant_id: uuid.UUID, dados: AtendimentoCreate, ator: Usuario, cliente: dict
) -> OdontoAtendimento:
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.ODONTOLOGIA_GERENCIAR, dados.estabelecimento_id
    )
    await _cidadao(db, tenant_id, dados.cidadao_id)
    if dados.agendamento_id:
        agendamento = await _um(
            db, Agendamento, tenant_id, dados.agendamento_id, "Agendamento não encontrado."
        )
        if agendamento.cidadao_id != dados.cidadao_id:
            raise Unprocessable(
                "O agendamento é de outro cidadão.", code="agendamento_de_outro_cidadao"
            )
    iniciado_em = dados.iniciado_em or _agora()
    retroativo = await _retroativo(db, tenant_id, iniciado_em, dados.retroativo_justificativa)
    formulario_id, versao_formulario = await _anamnese(
        db, tenant_id, dados.formulario_anamnese_codigo, dados.anamnese
    )
    await _validar_risco(db, tenant_id, dados.classificacao_risco)
    item = OdontoAtendimento(
        tenant_id=tenant_id,
        cidadao_id=dados.cidadao_id,
        estabelecimento_id=dados.estabelecimento_id,
        profissional_id=dados.profissional_id or getattr(ator, "profissional_id", None),
        agendamento_id=dados.agendamento_id,
        tipo=dados.tipo,
        iniciado_em=iniciado_em,
        formulario_anamnese_id=formulario_id,
        versao_formulario=versao_formulario,
        anamnese=dados.anamnese,
        triagem=dados.triagem,
        classificacao_risco=dados.classificacao_risco,
        evolucao=dados.evolucao,
        retroativo=retroativo,
        retroativo_justificativa=dados.retroativo_justificativa if retroativo else None,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao="CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=item.estabelecimento_id,
        recurso="odonto_atendimento",
        recurso_id=item.id,
        dados_depois={
            "cidadao_id": str(item.cidadao_id),
            "tipo": item.tipo,
            "retroativo": retroativo,
        },
        justificativa=item.retroativo_justificativa,
        cliente=cliente,
    )
    await db.commit()
    return item


async def obter_atendimento(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario, cliente: dict
) -> OdontoAtendimento:
    item = await _um(
        db, OdontoAtendimento, tenant_id, atendimento_id, "Atendimento odontológico não encontrado."
    )
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.ODONTOLOGIA_LER, item.estabelecimento_id
    )
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=item.estabelecimento_id,
        recurso="odonto_atendimento",
        recurso_id=item.id,
        finalidade="assistencial",
        cliente=cliente,
    )
    await db.commit()
    return item


async def listar_atendimentos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID | None,
    estabelecimento_id: uuid.UUID | None,
) -> list[OdontoAtendimento]:
    filtros = [OdontoAtendimento.tenant_id == tenant_id]
    if cidadao_id:
        filtros.append(OdontoAtendimento.cidadao_id == cidadao_id)
    if estabelecimento_id:
        filtros.append(OdontoAtendimento.estabelecimento_id == estabelecimento_id)
    return list(
        (
            await db.execute(
                select(OdontoAtendimento)
                .where(*filtros)
                .order_by(OdontoAtendimento.iniciado_em.desc())
                .limit(200)
            )
        ).scalars()
    )


async def _aberto(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario
) -> OdontoAtendimento:
    item = await _um(
        db, OdontoAtendimento, tenant_id, atendimento_id, "Atendimento odontológico não encontrado."
    )
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.ODONTOLOGIA_GERENCIAR, item.estabelecimento_id
    )
    if item.situacao != "ABERTO":
        raise Conflict(
            "Atendimento finalizado ou cancelado não pode ser alterado.", code="atendimento_fechado"
        )
    return item


async def atualizar_atendimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: AtendimentoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> OdontoAtendimento:
    item = await _aberto(db, tenant_id, atendimento_id, ator)
    if item.versao != versao:
        raise Conflict("O atendimento foi alterado por outra pessoa.", code="versao_divergente")
    mudancas = dados.model_dump(exclude_unset=True)
    if "anamnese" in mudancas:
        if item.formulario_anamnese_id is None:
            raise Unprocessable(
                "Atendimento sem formulário de anamnese.", code="formulario_obrigatorio"
            )
        formulario = await _um(
            db,
            FormularioDinamico,
            tenant_id,
            item.formulario_anamnese_id,
            "Formulário de anamnese não encontrado.",
        )
        erros = validar_resposta(formulario.schema_json, mudancas["anamnese"] or {})
        if erros:
            raise Unprocessable(
                "A anamnese não corresponde ao formulário.", code="anamnese_invalida", errors=erros
            )
    if "classificacao_risco" in mudancas:
        await _validar_risco(db, tenant_id, mudancas["classificacao_risco"])
    for chave, valor in mudancas.items():
        setattr(item, chave, valor)
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao="ATUALIZAR",
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=item.estabelecimento_id,
        recurso="odonto_atendimento",
        recurso_id=item.id,
        dados_depois={"campos": sorted(mudancas)},
        cliente=cliente,
    )
    await db.commit()
    return item


async def finalizar_atendimento(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario, cliente: dict
) -> OdontoAtendimento:
    item = await _aberto(db, tenant_id, atendimento_id, ator)
    item.situacao = "FINALIZADO"
    item.finalizado_em = _agora()
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao="ATUALIZAR",
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=item.estabelecimento_id,
        recurso="odonto_atendimento",
        recurso_id=item.id,
        dados_depois={"situacao": "FINALIZADO"},
        cliente=cliente,
    )
    await db.commit()
    return item


async def cancelar_atendimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    motivo: str,
    ator: Usuario,
    cliente: dict,
) -> OdontoAtendimento:
    item = await _aberto(db, tenant_id, atendimento_id, ator)
    realizados = await db.scalar(
        select(func.count())
        .select_from(OdontoProcedimento)
        .where(
            OdontoProcedimento.tenant_id == tenant_id,
            OdontoProcedimento.atendimento_id == item.id,
            OdontoProcedimento.situacao == "REALIZADO",
        )
    )
    if realizados:
        raise Conflict(
            "Atendimento com procedimento realizado não pode ser cancelado.",
            code="atendimento_com_producao",
        )
    item.situacao = "CANCELADO"
    item.cancelamento_motivo = motivo
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao="ATUALIZAR",
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=item.estabelecimento_id,
        recurso="odonto_atendimento",
        recurso_id=item.id,
        dados_depois={"situacao": "CANCELADO"},
        justificativa=motivo,
        cliente=cliente,
    )
    await db.commit()
    return item


# ── Procedimentos (B.3-011/018/022) ──────────────────────────────────────────
async def criar_procedimento(
    db: AsyncSession, tenant_id: uuid.UUID, dados: ProcedimentoCreate, ator: Usuario, cliente: dict
) -> OdontoProcedimento:
    await _cidadao(db, tenant_id, dados.cidadao_id)
    if not dados.condicao_id and not dados.procedimento_sigtap:
        raise Unprocessable(
            "Informe o procedimento do catálogo ou o código SIGTAP.",
            code="procedimento_obrigatorio",
        )
    sigtap = dados.procedimento_sigtap
    if dados.condicao_id:
        condicao = await _um(
            db,
            OdontoCondicao,
            tenant_id,
            dados.condicao_id,
            "Procedimento odontológico não encontrado.",
        )
        if condicao.tipo != "PROCEDIMENTO":
            raise Unprocessable(
                "O item do catálogo é uma condição, não um procedimento.", code="nao_e_procedimento"
            )
        _validar_local(condicao, dados.dente, list(dados.faces), dados.regiao)
        sigtap = sigtap or condicao.procedimento_sigtap
    elif dados.dente is not None:
        denticao_do_dente(dados.dente)
        validar_faces(dados.dente, list(dados.faces))
    if sigtap:
        await validar_sigtap_contra_referencia(db, sigtap, None)
    atendimento = None
    if dados.atendimento_id:
        atendimento = await _aberto(db, tenant_id, dados.atendimento_id, ator)
        if atendimento.cidadao_id != dados.cidadao_id:
            raise Unprocessable(
                "O atendimento é de outro cidadão.", code="atendimento_de_outro_cidadao"
            )
    if dados.realizar_agora and atendimento is None:
        raise Unprocessable(
            "Procedimento realizado precisa do atendimento.", code="atendimento_obrigatorio"
        )
    item = OdontoProcedimento(
        tenant_id=tenant_id,
        cidadao_id=dados.cidadao_id,
        atendimento_id=dados.atendimento_id,
        condicao_id=dados.condicao_id,
        procedimento_sigtap=sigtap,
        dente=dados.dente,
        faces=list(dados.faces),
        regiao=dados.regiao,
        quantidade=dados.quantidade,
        programado_para=dados.programado_para,
        insumos=[i.model_dump(mode="json") for i in dados.insumos],
        situacao="REALIZADO" if dados.realizar_agora else "PROGRAMADO",
        realizado_em=(
            atendimento.iniciado_em.date() if dados.realizar_agora and atendimento else None
        ),
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao="CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odonto_procedimento",
        recurso_id=item.id,
        dados_depois={"situacao": item.situacao, "dente": item.dente, "sigtap": sigtap},
        cliente=cliente,
    )
    await db.commit()
    return item


async def realizar_procedimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    procedimento_id: uuid.UUID,
    dados: ProcedimentoRealizar,
    ator: Usuario,
    cliente: dict,
) -> OdontoProcedimento:
    item = await _um(
        db,
        OdontoProcedimento,
        tenant_id,
        procedimento_id,
        "Procedimento odontológico não encontrado.",
    )
    if item.situacao != "PROGRAMADO":
        raise Conflict(
            "Somente procedimento programado pode ser realizado.",
            code="procedimento_nao_programado",
        )
    atendimento = await _aberto(db, tenant_id, dados.atendimento_id, ator)
    if atendimento.cidadao_id != item.cidadao_id:
        raise Unprocessable(
            "O atendimento é de outro cidadão.", code="atendimento_de_outro_cidadao"
        )
    item.situacao = "REALIZADO"
    item.atendimento_id = atendimento.id
    item.realizado_em = dados.realizado_em or atendimento.iniciado_em.date()
    if dados.insumos is not None:
        item.insumos = [i.model_dump(mode="json") for i in dados.insumos]
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao="ATUALIZAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odonto_procedimento",
        recurso_id=item.id,
        dados_depois={"situacao": "REALIZADO", "atendimento_id": str(atendimento.id)},
        cliente=cliente,
    )
    await db.commit()
    return item


async def cancelar_procedimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    procedimento_id: uuid.UUID,
    motivo: str,
    ator: Usuario,
    cliente: dict,
) -> OdontoProcedimento:
    item = await _um(
        db,
        OdontoProcedimento,
        tenant_id,
        procedimento_id,
        "Procedimento odontológico não encontrado.",
    )
    if item.situacao != "PROGRAMADO":
        raise Conflict(
            "Procedimento realizado não é cancelado; registre retificação.",
            code="procedimento_nao_programado",
        )
    item.situacao = "CANCELADO"
    item.cancelamento_motivo = motivo
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao="ATUALIZAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="odonto_procedimento",
        recurso_id=item.id,
        dados_depois={"situacao": "CANCELADO"},
        justificativa=motivo,
        cliente=cliente,
    )
    await db.commit()
    return item


async def listar_procedimentos(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID | None, situacao: str | None
) -> list[OdontoProcedimento]:
    filtros = [OdontoProcedimento.tenant_id == tenant_id]
    if cidadao_id:
        filtros.append(OdontoProcedimento.cidadao_id == cidadao_id)
    if situacao:
        filtros.append(OdontoProcedimento.situacao == situacao)
    return list(
        (
            await db.execute(
                select(OdontoProcedimento)
                .where(*filtros)
                .order_by(OdontoProcedimento.created_at.desc())
                .limit(500)
            )
        ).scalars()
    )


# ── Documentos (B.3-014) ─────────────────────────────────────────────────────
async def emitir_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: DocumentoCreate,
    ator: Usuario,
    cliente: dict,
) -> OdontoDocumento:
    atendimento = await _um(
        db, OdontoAtendimento, tenant_id, atendimento_id, "Atendimento odontológico não encontrado."
    )
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.ODONTOLOGIA_GERENCIAR, atendimento.estabelecimento_id
    )
    if atendimento.situacao == "CANCELADO":
        raise Conflict("Atendimento cancelado não emite documento.", code="atendimento_fechado")
    item = OdontoDocumento(
        tenant_id=tenant_id,
        atendimento_id=atendimento_id,
        tipo=dados.tipo,
        titulo=dados.titulo,
        conteudo=dados.conteudo,
        emitido_em=_agora(),
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao="CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=atendimento.estabelecimento_id,
        recurso="odonto_documento",
        recurso_id=item.id,
        dados_depois={"tipo": item.tipo},
        cliente=cliente,
    )
    await db.commit()
    return item


async def listar_documentos(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario
) -> list[OdontoDocumento]:
    atendimento = await _um(
        db, OdontoAtendimento, tenant_id, atendimento_id, "Atendimento odontológico não encontrado."
    )
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.ODONTOLOGIA_LER, atendimento.estabelecimento_id
    )
    return list(
        (
            await db.execute(
                select(OdontoDocumento)
                .where(
                    OdontoDocumento.tenant_id == tenant_id,
                    OdontoDocumento.atendimento_id == atendimento_id,
                    OdontoDocumento.baixa_em.is_(None),
                )
                .order_by(OdontoDocumento.emitido_em)
            )
        ).scalars()
    )


# ── Relatórios (B.3-019…021) e LEDI (B.3-027) ────────────────────────────────
async def relatorio(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    inicio: date,
    fim: date,
    agrupar_por: str,
    estabelecimento_id: uuid.UUID | None,
) -> dict:
    if fim < inicio:
        raise Unprocessable("A data final antecede a inicial.", code="periodo_invalido")
    filtros = [
        OdontoProcedimento.tenant_id == tenant_id,
        OdontoProcedimento.situacao == "REALIZADO",
        OdontoProcedimento.realizado_em >= inicio,
        OdontoProcedimento.realizado_em <= fim,
    ]
    consulta = select(OdontoProcedimento)
    if estabelecimento_id:
        consulta = consulta.join(
            OdontoAtendimento, OdontoAtendimento.id == OdontoProcedimento.atendimento_id
        )
        filtros.append(OdontoAtendimento.estabelecimento_id == estabelecimento_id)
    linhas: dict[str, list[int]] = {}
    for proc in (await db.execute(consulta.where(*filtros))).scalars():
        if agrupar_por == "face":
            chaves = [f"{proc.dente}-{f}" for f in proc.faces] or [
                str(proc.dente or proc.regiao or "SEM_LOCAL")
            ]
        elif agrupar_por == "procedimento":
            chaves = [proc.procedimento_sigtap or str(proc.condicao_id)]
        else:
            chaves = [str(proc.dente) if proc.dente else (proc.regiao or "SEM_LOCAL")]
        for chave in chaves:
            acumulado = linhas.setdefault(chave, [0, 0])
            acumulado[0] += 1
            acumulado[1] += proc.quantidade
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "linhas": [
            {"chave": k, "procedimentos": v[0], "quantidade": v[1]}
            for k, v in sorted(linhas.items())
        ],
    }


async def exportacao_ledi(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario
) -> dict:
    """B.3-027 — sem o .thrift oficial, a porta só informa a pendência."""
    atendimento = await _um(
        db, OdontoAtendimento, tenant_id, atendimento_id, "Atendimento odontológico não encontrado."
    )
    await exigir_acesso_estabelecimento(
        db, ator, Permissao.ODONTOLOGIA_LER, atendimento.estabelecimento_id
    )
    adaptador = obter_adaptador("LEDI_APS")
    pendencias = adaptador.validar(
        {"tipo": "ATENDIMENTO_ODONTOLOGICO", "atendimento_id": str(atendimento.id)}
    )
    situacao = (
        "PENDENTE_ESPECIFICACAO_OFICIAL"
        if any(p.get("codigo") == "PENDENTE_ESPECIFICACAO_OFICIAL" for p in pendencias)
        else "VALIDO"
    )
    return {
        "atendimento_id": atendimento.id,
        "sistema": "LEDI_APS",
        "situacao": situacao,
        "pendencias": pendencias,
    }
