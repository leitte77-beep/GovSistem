"""Regras de domínio da Fase 10 — laboratório (B.8-001…030, B.8-032…034).

Fluxo do exame: REQUISITADO (ou AGUARDANDO_AUTORIZACAO) → COLETADO →
EM_PROCESSAMENTO → RESULTADO → LIBERADO → ENTREGUE. Cada transição e cada
problema geram ``OcorrenciaExame`` (histórico, B.8-029). Limites, referências
e valores críticos vêm da configuração versionada do exame (B.8-001/017);
nenhuma faixa de referência está no código. Exame sigiloso (B.8-025) tem o
conteúdo velado para quem não tem permissão de sigilo nem é do laboratório.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, select

from app.core.autorizacao import escopo_permite, pode_ver_conteudo, tem_permissao
from app.core.errors import (
    AppError,
    Conflict,
    Locked,
    NotFound,
    PermissionDenied,
    Unprocessable,
)
from app.core.permissoes import Permissao
from app.models.agenda import Agendamento
from app.models.anexo import AnexoClinico
from app.models.cidadao import Cidadao
from app.models.laboratorio import (
    ExameLaboratorio,
    ItemExame,
    MensagemEquipamento,
    OcorrenciaExame,
    RequisicaoExame,
)
from app.models.nucleo import Estabelecimento, Profissional, Usuario, VinculoProfissional
from app.models.prontuario import Atendimento
from app.schemas.laboratorio import (
    Coleta,
    Entrega,
    ExameCreate,
    MensagemEquipamentoIn,
    PortalLaudo,
    Problema,
    RequisicaoCreate,
    ResultadoCreate,
)
from app.services.auditoria import registrar

JUSTIFICATIVA_MIN = 20
PORTAL_MAX_TENTATIVAS = 5
PORTAL_BLOQUEIO_MIN = 30
ETAPAS = [
    "REQUISITADO",
    "RECEBIDO",
    "COLETADO",
    "EM_PROCESSAMENTO",
    "RESULTADO",
    "LIBERADO",
    "ENTREGUE",
]
COLETAVEIS = {"REQUISITADO"}
COM_AMOSTRA = {"COLETADO", "EM_PROCESSAMENTO", "RESULTADO"}
CAMPOS_EXAME = [
    "metodo",
    "material",
    "bancada",
    "campos",
    "layout_laudo",
    "procedimento_sigtap",
    "cids",
    "regras_faturamento",
    "valor_unitario",
    "exige_autorizacao",
    "alto_custo",
    "carencia_dias",
    "validade_autorizacao_dias",
    "validade_resultado_dias",
    "prazo_entrega_dias",
    "sigiloso",
    "estabelecimentos_requisitantes",
    "cbos_liberacao",
    "integrado_equipamento",
    "equipamento_codigo",
    "tipo",
    "nome",
]


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


async def _hoje_local(db, tenant_id, quando: datetime | None = None) -> date:
    """Dia no fuso do município (prazos e validades são contados em dias locais)."""
    from app.services.janela_acesso import fuso_do_tenant

    return (quando or _agora()).astimezone(await fuso_do_tenant(db, tenant_id)).date()


def _hash(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()


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


def _ocorrencia(db, item: ItemExame | None, req: RequisicaoExame, tipo, ator, **campos) -> None:
    db.add(
        OcorrenciaExame(
            tenant_id=req.tenant_id,
            requisicao_id=req.id,
            item_id=item.id if item else None,
            tipo=tipo,
            responsavel_id=ator.id if ator else None,
            ocorrido_em=campos.pop("ocorrido_em", None) or _agora(),
            criado_por_id=ator.id if ator else None,
            **campos,
        )
    )


# ── Configuração de exames (B.8-001/003/004/005/008) ───────────────────────
async def criar_exame(db, tenant_id, dados: ExameCreate, ator, cliente) -> ExameLaboratorio:
    """Nova versão do exame para (código, unidade); a anterior é desativada e preservada."""
    if dados.estabelecimento_id:
        await _um(
            db, Estabelecimento, tenant_id, dados.estabelecimento_id, "Unidade não encontrada."
        )
    return await _nova_versao(
        db,
        tenant_id,
        dados.codigo,
        dados.estabelecimento_id,
        _serializar_config(dados.model_dump(exclude={"codigo", "estabelecimento_id"})),
        ator,
        cliente,
    )


def _serializar_config(valores: dict) -> dict:
    if valores.get("estabelecimentos_requisitantes"):
        valores["estabelecimentos_requisitantes"] = [
            str(e) for e in valores["estabelecimentos_requisitantes"]
        ]
    return valores


async def _nova_versao(
    db, tenant_id, codigo, estabelecimento_id, valores: dict, ator, cliente, copiado_de=None
) -> ExameLaboratorio:
    filtro = [
        ExameLaboratorio.tenant_id == tenant_id,
        ExameLaboratorio.codigo == codigo,
        ExameLaboratorio.estabelecimento_id.is_(None)
        if estabelecimento_id is None
        else ExameLaboratorio.estabelecimento_id == estabelecimento_id,
    ]
    ultima = await db.scalar(select(func.max(ExameLaboratorio.numero_versao)).where(*filtro))
    for anterior in (
        await db.scalars(select(ExameLaboratorio).where(*filtro, ExameLaboratorio.ativo.is_(True)))
    ).all():
        anterior.ativo = False
        anterior.versao += 1
    item = ExameLaboratorio(
        tenant_id=tenant_id,
        codigo=codigo,
        estabelecimento_id=estabelecimento_id,
        numero_versao=(ultima or 0) + 1,
        ativo=True,
        copiado_de_id=copiado_de,
        **valores,
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
        "exame_laboratorio",
        item.id,
        cliente,
        dados_depois={
            "codigo": codigo,
            "versao": item.numero_versao,
            "estabelecimento_id": str(estabelecimento_id) if estabelecimento_id else None,
            "copiado_de": str(copiado_de) if copiado_de else None,
        },
    )
    await db.commit()
    await db.refresh(item)
    return item


async def copiar_exame(db, tenant_id, exame_id, estabelecimento_id, ator, cliente):
    """B.8-003 — cópia para outra unidade vira nova versão rastreável à origem."""
    origem = await _um(db, ExameLaboratorio, tenant_id, exame_id, "Exame não encontrado.")
    await _um(db, Estabelecimento, tenant_id, estabelecimento_id, "Unidade não encontrada.")
    if origem.estabelecimento_id == estabelecimento_id:
        raise Unprocessable("A unidade de destino é a mesma da origem.", code="mesma_unidade")
    valores = {c: getattr(origem, c) for c in CAMPOS_EXAME}
    return await _nova_versao(
        db, tenant_id, origem.codigo, estabelecimento_id, valores, ator, cliente, origem.id
    )


async def listar_exames(db, tenant_id, estabelecimento_id=None, todas=False) -> list:
    filtros = [ExameLaboratorio.tenant_id == tenant_id, ExameLaboratorio.baixa_em.is_(None)]
    if not todas:
        filtros.append(ExameLaboratorio.ativo.is_(True))
    if estabelecimento_id:
        filtros.append(
            or_(
                ExameLaboratorio.estabelecimento_id == estabelecimento_id,
                ExameLaboratorio.estabelecimento_id.is_(None),
            )
        )
    return list(
        (
            await db.scalars(
                select(ExameLaboratorio)
                .where(*filtros)
                .order_by(ExameLaboratorio.codigo, ExameLaboratorio.numero_versao)
            )
        ).all()
    )


# ── Visibilidade (B.8-006/025) ─────────────────────────────────────────────
def _ve_requisicao(ator: Usuario, req: RequisicaoExame) -> bool:
    return any(
        escopo_permite(ator, Permissao.LABORATORIO_LER, estabelecimento_id=e)
        for e in {req.estabelecimento_origem_id, req.estabelecimento_coleta_id}
    )


def _ve_sigilo(ator: Usuario, req: RequisicaoExame) -> bool:
    return pode_ver_conteudo(ator, "SIGILOSO") or escopo_permite(
        ator, Permissao.LABORATORIO_RESULTADO, estabelecimento_id=req.estabelecimento_coleta_id
    )


async def _requisicao(db, tenant_id, requisicao_id, ator) -> RequisicaoExame:
    req = await _um(db, RequisicaoExame, tenant_id, requisicao_id, "Requisição não encontrada.")
    if not _ve_requisicao(ator, req):
        raise NotFound("Requisição não encontrada.")
    return req


async def _item(db, tenant_id, item_id, ator, permissao=None) -> tuple[ItemExame, RequisicaoExame]:
    item = await _um(db, ItemExame, tenant_id, item_id, "Exame não encontrado.")
    req = await _requisicao(db, tenant_id, item.requisicao_id, ator)
    if permissao and not escopo_permite(
        ator, permissao, estabelecimento_id=req.estabelecimento_coleta_id
    ):
        raise PermissionDenied("Sem permissão nesta unidade.")
    return item, req


def item_saida(item: ItemExame, ator: Usuario, req: RequisicaoExame) -> dict:
    dados = {c.key: getattr(item, c.key) for c in ItemExame.__table__.columns}
    dados["velado"] = False
    if item.sigiloso and not _ve_sigilo(ator, req):
        for campo in ("valores", "texto_livre", "anexos", "avaliacao", "alertas"):
            dados[campo] = None
        dados["fora_referencia"] = dados["critico"] = False
        dados["velado"] = True
    return dados


async def requisicao_saida(db, req: RequisicaoExame, ator, codigo_acesso=None, dup=False):
    itens = (
        await db.scalars(
            select(ItemExame).where(ItemExame.requisicao_id == req.id).order_by(ItemExame.etiqueta)
        )
    ).all()
    dados = {c.key: getattr(req, c.key) for c in RequisicaoExame.__table__.columns}
    dados.update(
        itens=[item_saida(i, ator, req) for i in itens],
        codigo_acesso=codigo_acesso,
        duplicada=dup,
    )
    return dados


# ── Requisição (B.8-005/006/010/011/021/034) ────────────────────────────────
async def _codigo_unico(db, modelo, coluna, tenant_id, gerar) -> str:
    for _ in range(20):
        codigo = gerar()
        if not await db.scalar(
            select(modelo.id).where(modelo.tenant_id == tenant_id, coluna == codigo)
        ):
            return codigo
    raise Conflict("Não foi possível gerar código único.", code="codigo_indisponivel")


def _novo_codigo_acesso() -> str:
    alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(8))


async def requisitar(
    db, tenant_id, dados: RequisicaoCreate, ator: Usuario, cliente, *, commit=True
) -> dict:
    if dados.id_cliente:
        existente = await db.scalar(
            select(RequisicaoExame).where(
                RequisicaoExame.tenant_id == tenant_id,
                RequisicaoExame.id_cliente == dados.id_cliente,
            )
        )
        if existente:
            return await requisicao_saida(db, existente, ator, dup=True)
    cidadao = await _um(db, Cidadao, tenant_id, dados.cidadao_id, "Cidadão não encontrado.")
    await _um(
        db, Estabelecimento, tenant_id, dados.estabelecimento_origem_id, "Unidade não encontrada."
    )
    coleta_id = dados.estabelecimento_coleta_id or dados.estabelecimento_origem_id
    await _um(db, Estabelecimento, tenant_id, coleta_id, "Unidade de coleta não encontrada.")
    if not (
        escopo_permite(
            ator, Permissao.EXAME_SOLICITAR, estabelecimento_id=dados.estabelecimento_origem_id
        )
        or escopo_permite(ator, Permissao.LABORATORIO_COLETAR, estabelecimento_id=coleta_id)
    ):
        raise PermissionDenied("Sem permissão para requisitar exames nesta unidade.")
    if dados.atendimento_id:
        atend = await _um(
            db, Atendimento, tenant_id, dados.atendimento_id, "Atendimento não encontrado."
        )
        if atend.cidadao_id != cidadao.id:
            raise Unprocessable("Atendimento de outro cidadão.", code="atendimento_divergente")
    if dados.agendamento_id:
        ag = await _um(
            db, Agendamento, tenant_id, dados.agendamento_id, "Agendamento não encontrado."
        )
        if ag.cidadao_id != cidadao.id:
            raise Unprocessable("Agendamento de outro cidadão.", code="agendamento_divergente")
    if dados.profissional_solicitante_id:
        await _um(
            db,
            Profissional,
            tenant_id,
            dados.profissional_solicitante_id,
            "Profissional não encontrado.",
        )
    if len(set(dados.exames)) != len(dados.exames):
        raise Unprocessable("Exame repetido na requisição.", code="exame_repetido")

    quando = _utc(dados.registrada_em) if dados.contingencia and dados.registrada_em else _agora()
    planos = []
    for exame_id in dados.exames:
        exame = await _um(db, ExameLaboratorio, tenant_id, exame_id, "Exame não encontrado.")
        if not exame.ativo or exame.baixa_em:
            raise Unprocessable(f"Exame {exame.codigo} não está ativo.", code="exame_inativo")
        permitidos = exame.estabelecimentos_requisitantes
        if permitidos and str(dados.estabelecimento_origem_id) not in permitidos:
            raise AppError(
                f"Exame {exame.codigo} não pode ser requisitado por esta unidade.",
                403,
                "exame_nao_permitido_na_unidade",
            )
        planos.append(
            (exame, await _alertas_requisicao(db, tenant_id, cidadao.id, exame, quando, dados))
        )

    req = RequisicaoExame(
        tenant_id=tenant_id,
        protocolo=await _codigo_unico(
            db,
            RequisicaoExame,
            RequisicaoExame.protocolo,
            tenant_id,
            lambda: f"{quando:%y}{secrets.randbelow(10**8):08d}",
        ),
        id_cliente=dados.id_cliente,
        cidadao_id=cidadao.id,
        estabelecimento_origem_id=dados.estabelecimento_origem_id,
        estabelecimento_coleta_id=coleta_id,
        origem="CONTINGENCIA" if dados.contingencia else dados.origem,
        atendimento_id=dados.atendimento_id,
        agendamento_id=dados.agendamento_id,
        profissional_solicitante_id=dados.profissional_solicitante_id,
        solicitante_externo=dados.solicitante_externo,
        urgente=dados.urgente,
        gestante=dados.gestante,
        observacoes=dados.observacoes,
        contingencia=dados.contingencia,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    codigo_acesso = _novo_codigo_acesso()
    req.codigo_acesso_hash = _hash(codigo_acesso)
    db.add(req)
    await db.flush()
    prazo = 0
    for exame, alertas in planos:
        exige = exame.exige_autorizacao or exame.alto_custo
        item = ItemExame(
            tenant_id=tenant_id,
            requisicao_id=req.id,
            cidadao_id=cidadao.id,
            exame_id=exame.id,
            exame_codigo=exame.codigo,
            etiqueta=await _codigo_unico(
                db,
                ItemExame,
                ItemExame.etiqueta,
                tenant_id,
                lambda: f"L{secrets.randbelow(10**10):010d}",
            ),
            situacao="AGUARDANDO_AUTORIZACAO" if exige else "REQUISITADO",
            autorizacao_situacao="PENDENTE" if exige else None,
            sigiloso=exame.sigiloso,
            alertas=alertas or None,
            justificativa=dados.justificativa if alertas else None,
            material=exame.material,
            criado_por_id=ator.id,
            atualizado_por_id=ator.id,
        )
        db.add(item)
        await db.flush()
        prazo = max(prazo, exame.prazo_entrega_dias or 0)
        _ocorrencia(db, item, req, "ETAPA", ator, etapa=item.situacao, ocorrido_em=quando)
    req.previsao_retirada = await _hoje_local(db, tenant_id, quando) + timedelta(days=prazo)
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "requisicao_exame",
        req.id,
        cliente,
        dados_depois={
            "protocolo": req.protocolo,
            "exames": [e.codigo for e, _ in planos],
            "contingencia": req.contingencia,
        },
    )
    if commit:
        await db.commit()
        await db.refresh(req)
    return await requisicao_saida(db, req, ator, codigo_acesso)


async def _alertas_requisicao(db, tenant_id, cidadao_id, exame, quando, dados) -> list[dict]:
    """B.8-005 carência (bloqueia sem justificativa) e B.8-021 exame recente válido (alerta)."""
    alertas = []
    anteriores = (
        await db.scalars(
            select(ItemExame).where(
                ItemExame.tenant_id == tenant_id,
                ItemExame.cidadao_id == cidadao_id,
                ItemExame.exame_codigo == exame.codigo,
                ItemExame.situacao.notin_(["CANCELADO", "NEGADO"]),
            )
        )
    ).all()
    if exame.carencia_dias:
        limite = quando - timedelta(days=exame.carencia_dias)
        recentes = [a for a in anteriores if _utc(a.created_at) >= limite]
        if recentes:
            if not dados.justificativa or len(dados.justificativa.strip()) < JUSTIFICATIVA_MIN:
                raise Conflict(
                    f"Exame {exame.codigo} em carência ({exame.carencia_dias} dias). "
                    "Informe justificativa para requisitar.",
                    code="carencia",
                )
            alertas.append(
                {
                    "codigo": "CARENCIA",
                    "carencia_dias": exame.carencia_dias,
                    "requisitado_em": max(_utc(a.created_at) for a in recentes).isoformat(),
                }
            )
    if exame.validade_resultado_dias:
        validos = [
            a
            for a in anteriores
            if a.liberado_em
            and _utc(a.liberado_em) >= quando - timedelta(days=exame.validade_resultado_dias)
        ]
        if validos:
            ultimo = max(validos, key=lambda a: a.liberado_em)
            alertas.append(
                {
                    "codigo": "EXAME_RECENTE_VALIDO",
                    "item_id": str(ultimo.id),
                    "liberado_em": _utc(ultimo.liberado_em).isoformat(),
                    "valido_ate": (
                        _utc(ultimo.liberado_em) + timedelta(days=exame.validade_resultado_dias)
                    )
                    .date()
                    .isoformat(),
                }
            )
    return alertas


async def obter_requisicao(db, tenant_id, requisicao_id, ator, cliente) -> dict:
    req = await _requisicao(db, tenant_id, requisicao_id, ator)
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "requisicao_exame",
        req.id,
        cliente,
        finalidade="consulta_exame",
    )
    await db.commit()
    return await requisicao_saida(db, req, ator)


async def requisicoes_do_cidadao(db, tenant_id, cidadao_id, ator, cliente) -> list[dict]:
    await _um(db, Cidadao, tenant_id, cidadao_id, "Cidadão não encontrado.")
    reqs = (
        await db.scalars(
            select(RequisicaoExame)
            .where(RequisicaoExame.tenant_id == tenant_id, RequisicaoExame.cidadao_id == cidadao_id)
            .order_by(RequisicaoExame.created_at.desc())
        )
    ).all()
    visiveis = [r for r in reqs if _ve_requisicao(ator, r)]
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "cidadao",
        cidadao_id,
        cliente,
        finalidade="historico_exames",
    )
    await db.commit()
    return [await requisicao_saida(db, r, ator) for r in visiveis]


async def autorizar(db, tenant_id, item_id, autorizado: bool, motivo, ator, cliente) -> dict:
    """B.8-005 — autorização com validade; negativa cancela o item."""
    item, req = await _item(db, tenant_id, item_id, ator)
    if not tem_permissao(ator, Permissao.AUTORIZACAO_GERENCIAR):
        raise PermissionDenied("Sem permissão para autorizar exames.")
    if item.autorizacao_situacao != "PENDENTE":
        raise Conflict("Exame não aguarda autorização.", code="sem_autorizacao_pendente")
    if not autorizado and (not motivo or len(motivo.strip()) < 5):
        raise Unprocessable("Informe o motivo da negativa.", code="motivo_obrigatorio")
    exame = await db.get(ExameLaboratorio, item.exame_id)
    agora = _agora()
    item.autorizacao_situacao = "AUTORIZADO" if autorizado else "NEGADO"
    item.autorizado_por_id = ator.id
    item.autorizado_em = agora
    item.situacao = "REQUISITADO" if autorizado else "NEGADO"
    if autorizado and exame.validade_autorizacao_dias:
        item.autorizacao_valida_ate = await _hoje_local(db, tenant_id, agora) + timedelta(
            days=exame.validade_autorizacao_dias
        )
    item.versao += 1
    _ocorrencia(db, item, req, "AUTORIZACAO", ator, etapa=item.situacao, motivo=motivo)
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "item_exame",
        item.id,
        cliente,
        detalhe="autorizacao",
        dados_depois={"autorizacao": item.autorizacao_situacao},
    )
    await db.commit()
    return item_saida(item, ator, req)


# ── Recepção, etiqueta e coleta (B.8-010/012/013/014) ──────────────────────
async def recepcionar(db, tenant_id, codigo: str, ator, cliente) -> dict:
    """B.8-010 — leitura do protocolo (comprovante/QR) ou de uma etiqueta."""
    req = await db.scalar(
        select(RequisicaoExame).where(
            RequisicaoExame.tenant_id == tenant_id, RequisicaoExame.protocolo == codigo
        )
    )
    if req is None:
        item = await db.scalar(
            select(ItemExame).where(ItemExame.tenant_id == tenant_id, ItemExame.etiqueta == codigo)
        )
        if item is None:
            raise NotFound("Código não encontrado.")
        req = await db.get(RequisicaoExame, item.requisicao_id)
    if not _ve_requisicao(ator, req) or not escopo_permite(
        ator, Permissao.LABORATORIO_COLETAR, estabelecimento_id=req.estabelecimento_coleta_id
    ):
        raise NotFound("Código não encontrado.")
    if req.recebida_em is None:
        req.recebida_em = _agora()
        req.versao += 1
        _ocorrencia(db, None, req, "ETAPA", ator, etapa="RECEBIDO")
        await _auditar(
            db,
            ator,
            tenant_id,
            "ATUALIZAR",
            "requisicao_exame",
            req.id,
            cliente,
            detalhe="recepcao",
        )
        await db.commit()
    return await requisicao_saida(db, req, ator)


async def etiqueta(db, tenant_id, item_id, motivo: str | None, ator, cliente) -> dict:
    """B.8-012 — primeira impressão livre; reimpressão exige motivo e é auditada."""
    item, req = await _item(db, tenant_id, item_id, ator, Permissao.LABORATORIO_COLETAR)
    if item.etiqueta_impressoes and (not motivo or len(motivo.strip()) < 5):
        raise Unprocessable("Reimpressão de etiqueta exige motivo.", code="motivo_reimpressao")
    item.etiqueta_impressoes += 1
    if item.etiqueta_impressoes > 1:
        _ocorrencia(db, item, req, "REIMPRESSAO", ator, motivo=motivo)
    await _auditar(
        db,
        ator,
        tenant_id,
        "IMPRIMIR",
        "etiqueta_exame",
        item.id,
        cliente,
        justificativa=motivo,
        detalhe=f"impressao {item.etiqueta_impressoes}",
    )
    await db.commit()
    cidadao = await db.get(Cidadao, req.cidadao_id)
    from app.services.agenda_comum import abreviar_nome

    return {
        "etiqueta": item.etiqueta,
        "exame": item.exame_codigo,
        "material": item.material,
        "paciente": abreviar_nome(cidadao.nome_social or cidadao.nome),
        "protocolo": req.protocolo,
        "urgente": req.urgente,
        "impressao": item.etiqueta_impressoes,
    }


async def coletar(db, tenant_id, dados: Coleta, ator, cliente) -> dict:
    """B.8-013 — coleta pela leitura da etiqueta, com material, data/hora e coletador."""
    item = await db.scalar(
        select(ItemExame).where(
            ItemExame.tenant_id == tenant_id, ItemExame.etiqueta == dados.etiqueta
        )
    )
    if item is None:
        raise NotFound("Etiqueta não encontrada.")
    item, req = await _item(db, tenant_id, item.id, ator, Permissao.LABORATORIO_COLETAR)
    if item.situacao == "AGUARDANDO_AUTORIZACAO":
        raise Conflict("Exame aguarda autorização.", code="aguardando_autorizacao")
    if item.situacao not in COLETAVEIS:
        raise Conflict(f"Exame em situação {item.situacao}.", code="situacao_invalida")
    if item.autorizacao_valida_ate and item.autorizacao_valida_ate < await _hoje_local(
        db, tenant_id
    ):
        raise Conflict("Autorização vencida.", code="autorizacao_vencida")
    if item.material and item.material.strip().lower() != dados.material.strip().lower():
        raise Unprocessable(
            f"Material divergente: o exame exige {item.material}.", code="material_divergente"
        )
    quando = _utc(dados.coletado_em) if dados.coletado_em else _agora()
    if quando > _agora() + timedelta(minutes=5):
        raise Unprocessable("Data de coleta no futuro.", code="coleta_futura")
    if req.recebida_em is None:
        req.recebida_em = quando
        _ocorrencia(db, None, req, "ETAPA", ator, etapa="RECEBIDO", ocorrido_em=quando)
    item.material = dados.material
    item.coletado_em = quando
    item.coletador_id = ator.id
    item.situacao = "COLETADO"
    item.versao += 1
    _ocorrencia(db, item, req, "ETAPA", ator, etapa="COLETADO", ocorrido_em=quando)
    await _auditar(
        db, ator, tenant_id, "ATUALIZAR", "item_exame", item.id, cliente, detalhe="coleta"
    )
    await db.commit()
    return item_saida(item, ator, req)


async def registrar_problema(db, tenant_id, item_id, dados: Problema, ator, cliente) -> dict:
    """B.8-002 — problema com motivo e responsável; opcionalmente reabre para nova coleta."""
    item, req = await _item(db, tenant_id, item_id, ator, Permissao.LABORATORIO_COLETAR)
    if item.situacao in {"LIBERADO", "ENTREGUE", "CANCELADO", "NEGADO"}:
        raise Conflict(f"Exame em situação {item.situacao}.", code="situacao_invalida")
    _ocorrencia(
        db,
        item,
        req,
        "PROBLEMA",
        ator,
        categoria=dados.categoria,
        motivo=dados.motivo,
        dados={"nova_coleta": dados.nova_coleta, "situacao_anterior": item.situacao},
    )
    if dados.nova_coleta:
        item.situacao = "REQUISITADO"
        item.coletado_em = None
        item.coletador_id = None
        _ocorrencia(db, item, req, "ETAPA", ator, etapa="REQUISITADO", motivo="nova coleta")
    item.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "item_exame",
        item.id,
        cliente,
        detalhe=f"problema {dados.categoria}",
    )
    await db.commit()
    return item_saida(item, ator, req)


async def processar(db, tenant_id, item_id, ator, cliente) -> dict:
    item, req = await _item(db, tenant_id, item_id, ator, Permissao.LABORATORIO_RESULTADO)
    if item.situacao != "COLETADO":
        raise Conflict("Só exame coletado entra em processamento.", code="situacao_invalida")
    item.situacao = "EM_PROCESSAMENTO"
    item.versao += 1
    _ocorrencia(db, item, req, "ETAPA", ator, etapa="EM_PROCESSAMENTO")
    await _auditar(
        db, ator, tenant_id, "ATUALIZAR", "item_exame", item.id, cliente, detalhe="processamento"
    )
    await db.commit()
    return item_saida(item, ator, req)


async def cancelar(db, tenant_id, item_id, motivo, ator, cliente) -> dict:
    item, req = await _item(db, tenant_id, item_id, ator, Permissao.LABORATORIO_COLETAR)
    if item.situacao in {"LIBERADO", "ENTREGUE", "CANCELADO", "NEGADO"}:
        raise Conflict(f"Exame em situação {item.situacao}.", code="situacao_invalida")
    item.situacao = "CANCELADO"
    item.versao += 1
    _ocorrencia(db, item, req, "ETAPA", ator, etapa="CANCELADO", motivo=motivo)
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "item_exame",
        item.id,
        cliente,
        detalhe="cancelamento",
        justificativa=motivo,
    )
    await db.commit()
    return item_saida(item, ator, req)


# ── Resultado, liberação, assinatura e entrega (B.8-017…023, B.8-007) ──────
def avaliar_valores(campos: list[dict], valores: dict, parcial: bool) -> dict:
    """Valida limites e unidades; marca fora de referência e críticos (B.8-017/020)."""
    por_codigo = {c["codigo"]: c for c in campos}
    desconhecidos = set(valores) - set(por_codigo)
    if desconhecidos:
        raise Unprocessable(
            f"Campos inexistentes no exame: {', '.join(sorted(desconhecidos))}.",
            code="campo_desconhecido",
        )
    faltando = [
        c["codigo"] for c in campos if c.get("obrigatorio", True) and c["codigo"] not in valores
    ]
    if faltando and not parcial:
        raise Unprocessable(
            f"Campos obrigatórios sem valor: {', '.join(faltando)}. Use parcial=true.",
            code="campos_obrigatorios",
        )
    avaliacao, fora, critico = [], False, False
    for codigo, valor in valores.items():
        c = por_codigo[codigo]
        linha = {"campo": codigo, "nome": c["nome"], "valor": valor, "unidade": c.get("unidade")}
        if c.get("tipo", "NUMERICO") == "NUMERICO":
            try:
                v = float(valor)
            except (TypeError, ValueError) as exc:
                raise Unprocessable(
                    f"{codigo}: valor numérico inválido.", code="valor_invalido"
                ) from exc
            lmin, lmax = c.get("limite_min"), c.get("limite_max")
            if (lmin is not None and v < lmin) or (lmax is not None and v > lmax):
                raise Unprocessable(
                    f"{codigo}: {v} fora do limite [{lmin}, {lmax}]; verifique a unidade.",
                    code="valor_fora_do_limite",
                )
            rmin, rmax = c.get("referencia_min"), c.get("referencia_max")
            cmin, cmax = c.get("critico_min"), c.get("critico_max")
            linha["referencia"] = [rmin, rmax]
            if (rmin is not None and v < rmin) or (rmax is not None and v > rmax):
                linha["fora_referencia"] = "BAIXO" if rmin is not None and v < rmin else "ALTO"
                fora = True
            if (cmin is not None and v <= cmin) or (cmax is not None and v >= cmax):
                linha["critico"] = True
                critico = True
        elif c.get("tipo") == "OPCAO" and valor not in (c.get("opcoes") or []):
            raise Unprocessable(f"{codigo}: opção inválida.", code="valor_invalido")
        avaliacao.append(linha)
    return {
        "avaliacao": avaliacao,
        "fora_referencia": fora,
        "critico": critico,
        "incompleto": bool(faltando),
        "faltando": faltando,
    }


async def registrar_resultado(
    db, tenant_id, item_id, dados: ResultadoCreate, ator, cliente, *, commit=True
) -> dict:
    item, req = await _item(db, tenant_id, item_id, ator, Permissao.LABORATORIO_RESULTADO)
    if dados.id_cliente and dados.id_cliente == item.id_cliente_resultado:
        return item_saida(item, ator, req)
    if item.situacao in {"LIBERADO", "ENTREGUE"}:
        if not dados.motivo_alteracao or len(dados.motivo_alteracao.strip()) < JUSTIFICATIVA_MIN:
            raise Conflict(
                "Resultado liberado só muda com motivo (nova versão; anterior no histórico).",
                code="resultado_liberado",
            )
    elif item.situacao not in COM_AMOSTRA:
        raise Conflict(f"Exame em situação {item.situacao}.", code="situacao_invalida")
    exame = await db.get(ExameLaboratorio, item.exame_id)
    aval = avaliar_valores(exame.campos or [], dados.valores, dados.parcial)
    if exame.tipo == "RADIOLOGIA" and not dados.texto_livre and not dados.valores:
        raise Unprocessable("Laudo radiológico exige texto.", code="laudo_vazio")
    for anexo_id in dados.anexos or []:
        anexo = await _um(db, AnexoClinico, tenant_id, anexo_id, "Anexo não encontrado.")
        if anexo.cidadao_id != item.cidadao_id:
            raise Unprocessable("Anexo de outro cidadão.", code="anexo_divergente")
    if item.resultado_versao:
        _ocorrencia(
            db,
            item,
            req,
            "ALTERACAO_RESULTADO",
            ator,
            motivo=dados.motivo_alteracao,
            dados={
                "versao": item.resultado_versao,
                "valores": item.valores,
                "texto_livre": item.texto_livre,
                "liberado_em": item.liberado_em.isoformat() if item.liberado_em else None,
                "assinatura_hash": item.assinatura_hash,
            },
        )
    item.valores = dados.valores
    item.texto_livre = dados.texto_livre
    item.anexos = [str(a) for a in dados.anexos] if dados.anexos else None
    item.avaliacao = aval["avaliacao"]
    item.fora_referencia = aval["fora_referencia"]
    item.critico = aval["critico"]
    item.incompleto = aval["incompleto"]
    item.resultado_em = _agora()
    item.resultado_por_id = ator.id
    item.resultado_versao += 1
    item.liberado_em = item.liberado_por_id = item.assinatura_hash = item.assinatura_tipo = None
    item.situacao = "RESULTADO"
    item.id_cliente_resultado = dados.id_cliente
    item.versao += 1
    alertas = [a for a in (item.alertas or []) if a.get("codigo") != "VALOR_CRITICO"]
    if aval["critico"]:
        alertas.append({"codigo": "VALOR_CRITICO", "comunicar_solicitante": True})
    item.alertas = alertas or None
    _ocorrencia(
        db,
        item,
        req,
        "ETAPA",
        ator,
        etapa="RESULTADO",
        dados={
            "versao": item.resultado_versao,
            "incompleto": item.incompleto,
            "critico": item.critico,
        },
    )
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "item_exame",
        item.id,
        cliente,
        detalhe=f"resultado v{item.resultado_versao}",
        justificativa=dados.motivo_alteracao,
    )
    if commit:
        await db.commit()
    return item_saida(item, ator, req)


async def _cbos_do_usuario(db, tenant_id, usuario_id) -> set[str]:
    profs = (
        await db.scalars(
            select(Profissional).where(
                Profissional.tenant_id == tenant_id, Profissional.usuario_id == usuario_id
            )
        )
    ).all()
    cbos = {p.cbo for p in profs if p.cbo}
    if profs:
        cbos |= set(
            (
                await db.scalars(
                    select(VinculoProfissional.cbo).where(
                        VinculoProfissional.tenant_id == tenant_id,
                        VinculoProfissional.profissional_id.in_([p.id for p in profs]),
                    )
                )
            ).all()
        )
    return cbos


def _conteudo_assinado(item: ItemExame, ator: Usuario, quando: datetime) -> str:
    return json.dumps(
        {
            "item": str(item.id),
            "etiqueta": item.etiqueta,
            "versao": item.resultado_versao,
            "valores": item.valores,
            "texto": item.texto_livre,
            "autor": str(ator.id),
            "em": quando.isoformat(),
        },
        sort_keys=True,
        ensure_ascii=False,
    )


async def liberar(db, tenant_id, item_id, tipo_assinatura: str, ator, cliente) -> dict:
    """B.8-022/023 — só profissional habilitado (CBO configurado) libera e assina."""
    item, req = await _item(db, tenant_id, item_id, ator, Permissao.LABORATORIO_LIBERAR)
    if item.situacao != "RESULTADO":
        raise Conflict("Só resultado digitado pode ser liberado.", code="situacao_invalida")
    if item.incompleto:
        raise Conflict("Resultado incompleto não pode ser liberado.", code="resultado_incompleto")
    exame = await db.get(ExameLaboratorio, item.exame_id)
    if exame.cbos_liberacao:
        if not set(exame.cbos_liberacao) & await _cbos_do_usuario(db, tenant_id, ator.id):
            raise AppError(
                "Profissional sem habilitação (CBO) para liberar este exame.",
                403,
                "profissional_nao_habilitado",
            )
    if tipo_assinatura == "DIGITAL":
        raise Unprocessable(
            "Assinatura digital ICP-Brasil depende do provedor de assinatura do município "
            "(pendência oficial). Use ELETRONICA.",
            code="assinatura_digital_indisponivel",
        )
    agora = _agora()
    item.liberado_em = agora
    item.liberado_por_id = ator.id
    item.assinatura_tipo = tipo_assinatura
    item.assinatura_hash = _hash(_conteudo_assinado(item, ator, agora))
    item.situacao = "LIBERADO"
    item.versao += 1
    _ocorrencia(
        db, item, req, "ETAPA", ator, etapa="LIBERADO", dados={"assinatura": item.assinatura_hash}
    )
    await _auditar(db, ator, tenant_id, "ASSINAR", "item_exame", item.id, cliente)
    await db.commit()
    return item_saida(item, ator, req)


async def entregar(db, tenant_id, item_id, dados: Entrega, ator, cliente) -> dict:
    """B.8-007 — entrega com identificação de quem recebeu (documento mascarado)."""
    item, req = await _item(db, tenant_id, item_id, ator)
    if item.situacao != "LIBERADO":
        raise Conflict("Só resultado liberado pode ser entregue.", code="situacao_invalida")
    if item.sigiloso and not _ve_sigilo(ator, req):
        raise PermissionDenied("Exame sigiloso: entrega restrita.")
    item.entregue_em = _agora()
    item.entregue_a = dados.recebedor
    doc = "".join(ch for ch in dados.documento if ch.isalnum())
    item.entregue_documento = "***" + doc[-4:]
    item.entregue_parentesco = dados.parentesco
    item.situacao = "ENTREGUE"
    item.versao += 1
    _ocorrencia(
        db,
        item,
        req,
        "ETAPA",
        ator,
        etapa="ENTREGUE",
        dados={"recebedor": dados.recebedor, "documento": item.entregue_documento},
    )
    await _auditar(
        db, ator, tenant_id, "ATUALIZAR", "item_exame", item.id, cliente, detalhe="entrega"
    )
    await db.commit()
    return item_saida(item, ator, req)


# ── Acompanhamento (B.8-015/016/020/029) ───────────────────────────────────
async def _ocorrencias(db, tenant_id, requisicao_id, item_id=None) -> list[OcorrenciaExame]:
    filtros = [
        OcorrenciaExame.tenant_id == tenant_id,
        OcorrenciaExame.requisicao_id == requisicao_id,
    ]
    if item_id:
        filtros.append(or_(OcorrenciaExame.item_id == item_id, OcorrenciaExame.item_id.is_(None)))
    return list(
        (
            await db.scalars(
                select(OcorrenciaExame)
                .where(*filtros)
                .order_by(OcorrenciaExame.ocorrido_em, OcorrenciaExame.created_at)
            )
        ).all()
    )


async def etapas(db, tenant_id, item_id, ator) -> dict:
    """B.8-016 — linha do processo com o instante de cada etapa e a atual."""
    item, req = await _item(db, tenant_id, item_id, ator)
    ultimo: dict[str, datetime] = {}
    for o in await _ocorrencias(db, tenant_id, req.id, item.id):
        if o.tipo == "ETAPA" and o.etapa:
            ultimo[o.etapa] = o.ocorrido_em
    passos = []
    for etapa in ETAPAS:
        passos.append({"etapa": etapa, "em": ultimo.get(etapa), "concluida": etapa in ultimo})
    passos.insert(
        5, {"etapa": "ASSINATURA", "em": item.liberado_em, "concluida": bool(item.assinatura_hash)}
    )
    return {"item_id": item.id, "situacao": item.situacao, "etapas": passos}


async def historico(db, tenant_id, requisicao_id, ator, cliente) -> list[dict]:
    """B.8-029 — todas as etapas e ocorrências da requisição."""
    req = await _requisicao(db, tenant_id, requisicao_id, ator)
    ve = _ve_sigilo(ator, req)
    sigilosos = set(
        (
            await db.scalars(
                select(ItemExame.id).where(
                    ItemExame.requisicao_id == req.id, ItemExame.sigiloso.is_(True)
                )
            )
        ).all()
    )
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "requisicao_exame",
        req.id,
        cliente,
        finalidade="historico_exame",
    )
    await db.commit()
    saida = []
    for o in await _ocorrencias(db, tenant_id, req.id):
        velar = o.item_id in sigilosos and not ve
        saida.append(
            {
                "id": o.id,
                "item_id": o.item_id,
                "tipo": o.tipo,
                "etapa": o.etapa,
                "categoria": o.categoria,
                "motivo": None if velar else o.motivo,
                "responsavel_id": o.responsavel_id,
                "ocorrido_em": o.ocorrido_em,
                "dados": None if velar else o.dados,
            }
        )
    return saida


async def _itens_da_unidade(db, tenant_id, estabelecimento_id, ator, *filtros):
    if not escopo_permite(ator, Permissao.LABORATORIO_LER, estabelecimento_id=estabelecimento_id):
        raise PermissionDenied("Sem acesso a esta unidade.")
    linhas = (
        await db.execute(
            select(ItemExame, RequisicaoExame)
            .join(RequisicaoExame, RequisicaoExame.id == ItemExame.requisicao_id)
            .where(
                ItemExame.tenant_id == tenant_id,
                RequisicaoExame.estabelecimento_coleta_id == estabelecimento_id,
                *filtros,
            )
            .order_by(RequisicaoExame.urgente.desc(), ItemExame.created_at)
        )
    ).all()
    return linhas


async def mapa_trabalho(
    db,
    tenant_id,
    estabelecimento_id,
    ator,
    *,
    bancada=None,
    urgente=None,
    exame_codigo=None,
    situacao=None,
    profissional_id=None,
) -> list[dict]:
    """B.8-015 — itens por bancada, urgência, profissional, exame e situação."""
    filtros = [
        ItemExame.situacao.in_(
            [situacao] if situacao else ["COLETADO", "EM_PROCESSAMENTO", "RESULTADO"]
        )
    ]
    if urgente is not None:
        filtros.append(RequisicaoExame.urgente.is_(urgente))
    if exame_codigo:
        filtros.append(ItemExame.exame_codigo == exame_codigo)
    if profissional_id:
        filtros.append(RequisicaoExame.profissional_solicitante_id == profissional_id)
    exames = {}
    saida = []
    for item, req in await _itens_da_unidade(db, tenant_id, estabelecimento_id, ator, *filtros):
        if item.exame_id not in exames:
            exames[item.exame_id] = await db.get(ExameLaboratorio, item.exame_id)
        ex = exames[item.exame_id]
        if bancada and (ex.bancada or "") != bancada:
            continue
        saida.append(
            {
                "etiqueta": item.etiqueta,
                "exame": item.exame_codigo,
                "bancada": ex.bancada,
                "material": item.material,
                "urgente": req.urgente,
                "situacao": item.situacao,
                "coletado_em": item.coletado_em,
                "protocolo": req.protocolo,
            }
        )
    return saida


async def pendencias(db, tenant_id, estabelecimento_id, ator) -> dict:
    """B.8-020 — incompletos, pendentes, fora de referência, críticos e atrasados."""
    hoje = await _hoje_local(db, tenant_id)
    saida = defaultdict(list)
    for item, req in await _itens_da_unidade(
        db,
        tenant_id,
        estabelecimento_id,
        ator,
        ItemExame.situacao.notin_(["ENTREGUE", "CANCELADO", "NEGADO"]),
    ):
        base = {
            "item_id": item.id,
            "etiqueta": item.etiqueta,
            "exame": item.exame_codigo,
            "situacao": item.situacao,
            "urgente": req.urgente,
        }
        velado = item.sigiloso and not _ve_sigilo(ator, req)
        if item.incompleto:
            saida["incompletos"].append(base)
        if item.situacao in {
            "AGUARDANDO_AUTORIZACAO",
            "REQUISITADO",
            "COLETADO",
            "EM_PROCESSAMENTO",
        }:
            saida["pendentes_resultado"].append(base)
        if item.situacao == "RESULTADO" and not item.incompleto:
            saida["pendentes_liberacao"].append(base)
        if not velado and item.fora_referencia:
            saida["fora_referencia"].append(base)
        if not velado and item.critico:
            saida["criticos"].append(base)
        if req.previsao_retirada and req.previsao_retirada < hoje and item.situacao != "LIBERADO":
            saida["atrasados"].append({**base, "previsao": req.previsao_retirada})
    return {
        k: saida.get(k, [])
        for k in (
            "incompletos",
            "pendentes_resultado",
            "pendentes_liberacao",
            "fora_referencia",
            "criticos",
            "atrasados",
        )
    }


# ── Documentos (B.8-014/024/026) ───────────────────────────────────────────
async def comprovante(db, tenant_id, requisicao_id, ator, cliente) -> dict:
    """B.8-014 — comprovante com previsão; emite novo código de acesso ao portal."""
    req = await _requisicao(db, tenant_id, requisicao_id, ator)
    codigo = _novo_codigo_acesso()
    req.codigo_acesso_hash = _hash(codigo)
    req.portal_tentativas = 0
    req.portal_bloqueado_ate = None
    req.versao += 1
    await _auditar(db, ator, tenant_id, "IMPRIMIR", "comprovante_exame", req.id, cliente)
    await db.commit()
    cidadao = await db.get(Cidadao, req.cidadao_id)
    itens = (await db.scalars(select(ItemExame).where(ItemExame.requisicao_id == req.id))).all()
    return {
        "protocolo": req.protocolo,
        "paciente": cidadao.nome_social or cidadao.nome,
        "exames": [i.exame_codigo for i in itens if i.situacao not in {"CANCELADO", "NEGADO"}],
        "previsao_retirada": req.previsao_retirada,
        "codigo_acesso": codigo,
        "emitido_em": _agora().replace(microsecond=0),
    }


def _renderizar_layout(layout: str | None, contexto: dict) -> str:
    from jinja2.sandbox import SandboxedEnvironment

    if not layout:
        return ""
    return SandboxedEnvironment(autoescape=True).from_string(layout).render(**contexto)


async def _laudo_html(db, req: RequisicaoExame, itens: list[ItemExame]) -> str:
    from markupsafe import escape

    from app.services.exportacao import html_tabela

    cidadao = await db.get(Cidadao, req.cidadao_id)
    unidade = await db.get(Estabelecimento, req.estabelecimento_coleta_id)
    partes = []
    for item in itens:
        exame = await db.get(ExameLaboratorio, item.exame_id)
        ctx = {
            "paciente": cidadao.nome_social or cidadao.nome,
            "data_nascimento": cidadao.data_nascimento,
            "protocolo": req.protocolo,
            "unidade": unidade.nome if unidade else "",
            "exame": exame.nome,
            "metodo": exame.metodo,
            "material": item.material,
            "valores": item.valores or {},
            "liberado_em": item.liberado_em,
        }
        cabecalho = _renderizar_layout(exame.layout_laudo, ctx)
        linhas = [
            {
                "campo": a["nome"],
                "valor": a["valor"],
                "unidade": a.get("unidade") or "",
                "referencia": " – ".join(
                    "" if x is None else str(x) for x in a.get("referencia") or []
                ),
                "obs": ("CRÍTICO " if a.get("critico") else "") + (a.get("fora_referencia") or ""),
            }
            for a in item.avaliacao or []
        ]
        tabela = html_tabela(
            f"{exame.nome} — {cidadao.nome_social or cidadao.nome}",
            [
                ("campo", "Campo"),
                ("valor", "Resultado"),
                ("unidade", "Unidade"),
                ("referencia", "Referência"),
                ("obs", "Observação"),
            ],
            linhas,
            rodape=(
                f"Protocolo {req.protocolo}. Método: {exame.metodo or '-'}. Liberado em "
                f"{item.liberado_em.isoformat() if item.liberado_em else '-'}; assinatura "
                f"eletrônica {item.assinatura_hash}."
            ),
        )
        texto = f"<p>{escape(item.texto_livre)}</p>" if item.texto_livre else ""
        partes.append(f"<section>{cabecalho}{tabela}{texto}</section>")
    return "".join(partes)


async def laudo(db, tenant_id, requisicao_id, ator, cliente) -> str:
    """B.8-024 — impressão na unidade (escopo); sigilosos só para quem pode ver."""
    req = await _requisicao(db, tenant_id, requisicao_id, ator)
    itens = (
        await db.scalars(
            select(ItemExame).where(
                ItemExame.requisicao_id == req.id, ItemExame.situacao.in_(["LIBERADO", "ENTREGUE"])
            )
        )
    ).all()
    ve = _ve_sigilo(ator, req)
    itens = [i for i in itens if not i.sigiloso or ve]
    if not itens:
        raise NotFound("Não há resultado liberado para impressão.")
    await _auditar(
        db,
        ator,
        tenant_id,
        "IMPRIMIR",
        "laudo_exame",
        req.id,
        cliente,
        detalhe=",".join(i.etiqueta for i in itens),
    )
    await db.commit()
    return await _laudo_html(db, req, list(itens))


async def laudo_portal(db, tenant_id, dados: PortalLaudo, cliente) -> str:
    """B.8-024 — portal do cidadão: protocolo + código + nascimento, tentativas limitadas.

    Exame sigiloso não é exibido no portal (retirada presencial).
    """
    req = await db.scalar(
        select(RequisicaoExame).where(
            RequisicaoExame.tenant_id == tenant_id, RequisicaoExame.protocolo == dados.protocolo
        )
    )
    falha = NotFound("Dados de acesso não conferem.")
    if req is None:
        raise falha
    agora = _agora()
    if req.portal_bloqueado_ate and _utc(req.portal_bloqueado_ate) > agora:
        raise Locked("Acesso bloqueado temporariamente por excesso de tentativas.")
    cidadao = await db.get(Cidadao, req.cidadao_id)
    ok = (
        req.codigo_acesso_hash is not None
        and secrets.compare_digest(
            req.codigo_acesso_hash, _hash(dados.codigo_acesso.strip().upper())
        )
        and cidadao.data_nascimento == dados.data_nascimento
    )
    if not ok:
        req.portal_tentativas += 1
        if req.portal_tentativas >= PORTAL_MAX_TENTATIVAS:
            req.portal_bloqueado_ate = agora + timedelta(minutes=PORTAL_BLOQUEIO_MIN)
            req.portal_tentativas = 0
        await _auditar(
            db,
            None,
            tenant_id,
            "LER",
            "laudo_portal",
            req.id,
            cliente,
            resultado="NEGADO",
            detalhe="credenciais do portal não conferem",
        )
        await db.commit()
        raise falha
    req.portal_tentativas = 0
    itens = (
        await db.scalars(
            select(ItemExame).where(
                ItemExame.requisicao_id == req.id,
                ItemExame.situacao.in_(["LIBERADO", "ENTREGUE"]),
                ItemExame.sigiloso.is_(False),
            )
        )
    ).all()
    await _auditar(
        db,
        None,
        tenant_id,
        "DOWNLOAD",
        "laudo_portal",
        req.id,
        cliente,
        detalhe="portal do cidadão",
    )
    await db.commit()
    if not itens:
        raise NotFound("Não há resultado disponível no portal.")
    return await _laudo_html(db, req, list(itens))


async def declaracao_comparecimento(db, tenant_id, requisicao_id, ator, cliente) -> str:
    """B.8-026 — declaração com data/hora de recepção e coleta, sem dado clínico."""
    from markupsafe import escape

    req = await _requisicao(db, tenant_id, requisicao_id, ator)
    if req.recebida_em is None:
        raise Conflict("Paciente ainda não recepcionado.", code="nao_recepcionado")
    cidadao = await db.get(Cidadao, req.cidadao_id)
    unidade = await db.get(Estabelecimento, req.estabelecimento_coleta_id)
    coletas = [
        i.coletado_em
        for i in (
            await db.scalars(select(ItemExame).where(ItemExame.requisicao_id == req.id))
        ).all()
        if i.coletado_em
    ]
    saida = max(coletas) if coletas else req.recebida_em
    await _auditar(db, ator, tenant_id, "IMPRIMIR", "declaracao_comparecimento", req.id, cliente)
    await db.commit()
    return (
        "<h1>Declaração de comparecimento</h1>"
        f"<p>Declaramos que {escape(cidadao.nome_social or cidadao.nome)} compareceu à unidade "
        f"{escape(unidade.nome if unidade else '')} em {_utc(req.recebida_em):%d/%m/%Y}, "
        f"das {_utc(req.recebida_em):%H:%M} às {_utc(saida):%H:%M} (UTC), para realização de "
        f"exames (protocolo {req.protocolo}).</p>"
    )


# ── Equipamentos (B.8-008/009) ─────────────────────────────────────────────
async def receber_mensagem(db, tenant_id, dados: MensagemEquipamentoIn, ator, cliente) -> dict:
    """Mensagem idempotente por (equipamento, id); falha fica registrada para reprocessar."""
    existente = await db.scalar(
        select(MensagemEquipamento).where(
            MensagemEquipamento.tenant_id == tenant_id,
            MensagemEquipamento.equipamento == dados.equipamento,
            MensagemEquipamento.id_mensagem == dados.id_mensagem,
        )
    )
    if existente and existente.situacao == "PROCESSADA":
        return _msg_saida(existente, duplicada=True)
    msg = existente or MensagemEquipamento(
        tenant_id=tenant_id,
        equipamento=dados.equipamento,
        id_mensagem=dados.id_mensagem,
        etiqueta=dados.etiqueta,
        payload=dados.model_dump(),
        situacao="RECEBIDA",
        criado_por_id=ator.id,
    )
    if existente is None:
        db.add(msg)
    await _processar_mensagem(db, tenant_id, msg, ator, cliente)
    return _msg_saida(msg)


async def _processar_mensagem(db, tenant_id, msg: MensagemEquipamento, ator, cliente) -> None:
    payload = msg.payload or {}
    try:
        item = await db.scalar(
            select(ItemExame).where(
                ItemExame.tenant_id == tenant_id, ItemExame.etiqueta == msg.etiqueta
            )
        )
        if item is None:
            raise Unprocessable("Etiqueta desconhecida.", code="etiqueta_desconhecida")
        exame = await db.get(ExameLaboratorio, item.exame_id)
        if not exame.integrado_equipamento or exame.equipamento_codigo != msg.equipamento:
            raise Unprocessable(
                "Exame não integrado a este equipamento.", code="exame_nao_integrado"
            )
        resultado = ResultadoCreate(valores=payload.get("valores") or {}, parcial=True)
        async with db.begin_nested():
            await registrar_resultado(
                db, tenant_id, item.id, resultado, ator, cliente, commit=False
            )
        msg.item_id = item.id
        msg.situacao = "PROCESSADA"
        msg.erro = None
    except AppError as exc:
        msg.situacao = "ERRO"
        msg.erro = f"{getattr(exc, 'code', '')}: {exc}"[:2000]
    await _auditar(
        db,
        ator,
        tenant_id,
        "INTEGRACAO",
        "mensagem_equipamento",
        None,
        cliente,
        resultado="SUCESSO" if msg.situacao == "PROCESSADA" else "FALHA",
        detalhe=f"{msg.equipamento}/{msg.id_mensagem}: {msg.situacao}",
    )
    await db.commit()
    await db.refresh(msg)


def _msg_saida(msg: MensagemEquipamento, duplicada=False) -> dict:
    return {
        "id": msg.id,
        "equipamento": msg.equipamento,
        "id_mensagem": msg.id_mensagem,
        "etiqueta": msg.etiqueta,
        "situacao": msg.situacao,
        "erro": msg.erro,
        "item_id": msg.item_id,
        "duplicada": duplicada,
    }


async def listar_mensagens(db, tenant_id, situacao=None) -> list[dict]:
    filtros = [MensagemEquipamento.tenant_id == tenant_id]
    if situacao:
        filtros.append(MensagemEquipamento.situacao == situacao)
    return [
        _msg_saida(m)
        for m in (
            await db.scalars(
                select(MensagemEquipamento)
                .where(*filtros)
                .order_by(MensagemEquipamento.created_at.desc())
            )
        ).all()
    ]


async def reprocessar_mensagem(db, tenant_id, mensagem_id, ator, cliente) -> dict:
    msg = await _um(db, MensagemEquipamento, tenant_id, mensagem_id, "Mensagem não encontrada.")
    if msg.situacao == "PROCESSADA":
        raise Conflict("Mensagem já processada.", code="ja_processada")
    await _processar_mensagem(db, tenant_id, msg, ator, cliente)
    return _msg_saida(msg)


# ── Contingência (B.8-034) ─────────────────────────────────────────────────
async def sincronizar_contingencia(
    db, tenant_id, requisicoes: list[RequisicaoCreate], ator, cliente
):
    aceitos, duplicados, rejeitados = [], [], []
    for dados in requisicoes:
        if not dados.id_cliente:
            rejeitados.append({"id_cliente": None, "erro": "id_cliente obrigatório"})
            continue
        try:
            dados = dados.model_copy(update={"contingencia": True})
            async with db.begin_nested():
                saida = await requisitar(db, tenant_id, dados, ator, cliente, commit=False)
            destino = duplicados if saida["duplicada"] else aceitos
            destino.append(
                {
                    "id_cliente": dados.id_cliente,
                    "requisicao_id": saida["id"],
                    "protocolo": saida["protocolo"],
                }
            )
        except AppError as exc:
            rejeitados.append(
                {
                    "id_cliente": dados.id_cliente,
                    "erro": str(exc),
                    "codigo": getattr(exc, "code", None),
                }
            )
    await db.commit()
    return {"aceitos": aceitos, "duplicados": duplicados, "rejeitados": rejeitados}


# ── Faturamento e relatórios (B.8-027/028/030) ─────────────────────────────
async def producao(db, tenant_id, competencia: str, ator, estabelecimento_id=None) -> dict:
    """B.8-027 — produção liberada por procedimento SIGTAP (o arquivo BPA é da Fase 13)."""
    from app.services.relatorios import _intervalo

    try:
        ano, mes = (int(x) for x in competencia.split("-"))
        inicio = date(ano, mes, 1)
    except ValueError as exc:
        raise Unprocessable("Competência no formato AAAA-MM.", code="competencia_invalida") from exc
    fim = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    filtros = [
        ItemExame.tenant_id == tenant_id,
        ItemExame.liberado_em >= ini,
        ItemExame.liberado_em < fim_,
    ]
    if estabelecimento_id:
        filtros.append(RequisicaoExame.estabelecimento_coleta_id == estabelecimento_id)
    linhas = (
        await db.execute(
            select(ItemExame, RequisicaoExame)
            .join(RequisicaoExame, RequisicaoExame.id == ItemExame.requisicao_id)
            .where(*filtros)
        )
    ).all()
    grupos: dict[tuple, dict] = {}
    inconsistencias = []
    for item, req in linhas:
        if not escopo_permite(
            ator, Permissao.FATURAMENTO_LER, estabelecimento_id=req.estabelecimento_coleta_id
        ) and not escopo_permite(
            ator, Permissao.LABORATORIO_LER, estabelecimento_id=req.estabelecimento_coleta_id
        ):
            continue
        exame = await db.get(ExameLaboratorio, item.exame_id)
        if not exame.procedimento_sigtap:
            inconsistencias.append(
                {"item_id": item.id, "exame": item.exame_codigo, "erro": "SEM_PROCEDIMENTO_SIGTAP"}
            )
            continue
        chave = (str(req.estabelecimento_coleta_id), exame.procedimento_sigtap)
        g = grupos.setdefault(
            chave,
            {
                "estabelecimento_id": chave[0],
                "procedimento": chave[1],
                "quantidade": 0,
                "valor": 0.0,
            },
        )
        g["quantidade"] += 1
        g["valor"] = round(g["valor"] + float(exame.valor_unitario or 0), 2)
    return {
        "competencia": competencia,
        "linhas": sorted(
            grupos.values(), key=lambda g: (g["estabelecimento_id"], g["procedimento"])
        ),
        "inconsistencias": inconsistencias,
        "exportacao_bpa": "Fase 13 (regras SIGTAP e layout BPA)",
    }


async def relatorio_exames(
    db, tenant_id, inicio: date, fim: date, *, ator, agrupar_por: str
) -> dict:
    """B.8-028/030 — quantidade, valor, liberados, atrasados e prazo médio (dias)."""
    from app.services.relatorios import _chave_tempo, _intervalo, _linhas

    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    prazos: dict[str, list[float]] = defaultdict(list)
    exames: dict = {}
    for item, req in (
        await db.execute(
            select(ItemExame, RequisicaoExame)
            .join(RequisicaoExame, RequisicaoExame.id == ItemExame.requisicao_id)
            .where(
                ItemExame.tenant_id == tenant_id,
                ItemExame.created_at >= ini,
                ItemExame.created_at < fim_,
            )
        )
    ).all():
        if not _ve_requisicao(ator, req):
            continue
        if item.exame_id not in exames:
            exames[item.exame_id] = await db.get(ExameLaboratorio, item.exame_id)
        ex = exames[item.exame_id]
        if agrupar_por == "exame":
            chave = item.exame_codigo
        elif agrupar_por == "estabelecimento":
            chave = str(req.estabelecimento_coleta_id)
        elif agrupar_por == "profissional":
            chave = str(req.profissional_solicitante_id or "SEM_PROFISSIONAL")
        elif agrupar_por == "situacao":
            chave = item.situacao
        elif agrupar_por == "mapa":
            chave = ex.bancada or "SEM_BANCADA"
        else:
            chave = await _chave_tempo(db, tenant_id, item.created_at)
        a = acumulado[chave]
        a["quantidade"] += 1
        if item.situacao in {"CANCELADO", "NEGADO"}:
            a["cancelados"] += 1
            continue
        a["valor"] += float(ex.valor_unitario or 0)
        if item.liberado_em:
            a["liberados"] += 1
            prazos[chave].append(
                (_utc(item.liberado_em) - _utc(item.created_at)).total_seconds() / 86400
            )
            if req.previsao_retirada and _utc(item.liberado_em).date() > req.previsao_retirada:
                a["fora_do_prazo"] += 1
    for chave, valores in prazos.items():
        acumulado[chave]["prazo_medio_dias"] = sum(valores) / len(valores)
    metricas = [
        "quantidade",
        "valor",
        "liberados",
        "fora_do_prazo",
        "cancelados",
        "prazo_medio_dias",
    ]
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }
