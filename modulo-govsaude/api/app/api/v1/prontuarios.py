"""Fase 5 — PEC ambulatorial (B.6-004…058, B.12-013, B.12-021/022).

Rotas finas: regras em ``app/services/prontuario.py``. Cross-tenant, fora do
escopo de estabelecimento ou sigiloso sem permissão respondem 404.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.prontuario import (
    AtendimentoCreate,
    AtendimentoEncerrar,
    AtendimentoOut,
    EtapaAvancar,
    PlanoCreate,
    PlanoOut,
    PrescricaoCopiar,
    PrescricaoCreate,
    PrescricaoOut,
    RegistroAssistencialCreate,
    RegistroAssistencialOut,
    RetificacaoRegistroCreate,
    RetificacaoSOAPCreate,
    SinalVitalCreate,
    SinalVitalOut,
    SOAPCreate,
    SOAPOut,
    ValidadeConsultaOut,
)
from app.services import prontuario as svc
from app.services.auditoria import dados_do_cliente

router = APIRouter(prefix="/prontuarios", tags=["Prontuário eletrônico"])


def _prescricao(p) -> PrescricaoOut:
    out = PrescricaoOut.model_validate(p)
    out.receituarios = svc.receituarios(p.itens)
    return out


# ── Atendimento ─────────────────────────────────────────────────────────────
@router.post("/atendimentos", response_model=AtendimentoOut, status_code=201)
async def abrir(
    c: AtendimentoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-004, B.6-036 — abre atendimento; retroativo só em contingência autorizada."""
    return await svc.abrir_atendimento(db, t, c, u, dados_do_cliente(r))


@router.get("/atendimentos/{id}", response_model=AtendimentoOut)
async def obter(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-004, B.6-015, B.6-056 — leitura auditada; traz as alergias ativas do cidadão."""
    return await svc.obter_atendimento(db, t, id, u, dados_do_cliente(r))


@router.post("/atendimentos/{id}/etapa", response_model=AtendimentoOut)
async def etapa(
    id: uuid.UUID,
    c: EtapaAvancar,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-004 — avança nas etapas configuradas (`prontuario.etapas`)."""
    return await svc.avancar_etapa(db, t, id, c.etapa, u, dados_do_cliente(r))


@router.get("/atendimentos/{id}/pendencias")
async def pendencias(
    id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-014 — campos obrigatórios ainda não preenchidos."""
    item = await svc.atendimento(db, t, id, u, Permissao.PRONTUARIO_LER)
    return {
        "atendimento_id": str(item.id),
        "campos_pendentes": await svc.campos_pendentes(db, t, item),
    }


@router.post("/atendimentos/{id}/encerrar", response_model=AtendimentoOut)
async def encerrar(
    id: uuid.UUID,
    c: AtendimentoEncerrar,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-014 — encerra só com os campos obrigatórios do tenant preenchidos."""
    return await svc.encerrar_atendimento(db, t, id, c.finalizado_em, u, dados_do_cliente(r))


# ── SOAP ────────────────────────────────────────────────────────────────────
@router.post("/atendimentos/{id}/soap", response_model=SOAPOut, status_code=201)
async def soap(
    id: uuid.UUID,
    c: SOAPCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-004, B.6-027 — evolução SOAP (anamnese, exame, avaliação, conduta) cifrada."""
    return await svc.registrar_soap(db, t, id, c, u, dados_do_cliente(r))


@router.get("/atendimentos/{id}/soap", response_model=list[SOAPOut])
async def listar_soap(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-026, B.6-057 — evoluções do atendimento, inclusive retificações."""
    return await svc.listar_soap(db, t, id, u, dados_do_cliente(r))


@router.post("/evolucoes/{id}/assinar", response_model=SOAPOut)
async def assinar(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_ASSINAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-056 — assinatura da evolução (auditada)."""
    return await svc.assinar_soap(db, t, id, u, dados_do_cliente(r))


@router.post("/evolucoes/{id}/retificar", response_model=SOAPOut, status_code=201)
async def retificar(
    id: uuid.UUID,
    c: RetificacaoSOAPCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_RETIFICAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-057 — retificação com nova versão e justificativa."""
    return await svc.retificar_soap(db, t, id, c, u, dados_do_cliente(r))


# ── Sinais vitais ───────────────────────────────────────────────────────────
@router.post("/atendimentos/{id}/sinais-vitais", response_model=SinalVitalOut, status_code=201)
async def sinais(
    id: uuid.UUID,
    c: SinalVitalCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-010, B.6-012 — sinais e antropometria; IMC classificado pela tabela do tenant."""
    return await svc.registrar_sinais(db, t, id, c, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/sinais-vitais", response_model=list[SinalVitalOut])
async def serie_sinais(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-011 — evolução de peso, IMC, pressão e demais medidas."""
    return await svc.serie_sinais(db, t, cidadao_id, u, dados_do_cliente(r))


# ── Plano de cuidados e prescrição ──────────────────────────────────────────
@router.post("/atendimentos/{id}/planos-cuidado", response_model=PlanoOut, status_code=201)
async def plano(
    id: uuid.UUID,
    c: PlanoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-017 — plano de cuidados com vigência."""
    return await svc.registrar_plano(db, t, id, c, u, dados_do_cliente(r))


@router.post("/atendimentos/{id}/prescricoes", response_model=PrescricaoOut, status_code=201)
async def prescrever(
    id: uuid.UUID,
    c: PrescricaoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRESCRICAO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-019, B.6-020, B.6-033 — prescrição com disponibilidade, alertas e receituários."""
    return _prescricao(await svc.prescrever(db, t, id, c, u, dados_do_cliente(r)))


@router.post("/atendimentos/{id}/prescricoes/copiar", response_model=PrescricaoOut, status_code=201)
async def copiar(
    id: uuid.UUID,
    c: PrescricaoCopiar,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRESCRICAO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-021 — cópia assistida de prescrição anterior do mesmo cidadão."""
    return _prescricao(await svc.copiar_prescricao(db, t, id, c, u, dados_do_cliente(r)))


@router.get("/cidadaos/{cidadao_id}/prescricoes", response_model=list[PrescricaoOut])
async def listar_prescricoes(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-019."""
    return [
        _prescricao(p)
        for p in await svc.listar_prescricoes(db, t, cidadao_id, u, dados_do_cliente(r))
    ]


@router.post("/prescricoes/{id}/assinar", response_model=PrescricaoOut)
async def assinar_prescricao(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_ASSINAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-034, B.6-056 — assinatura da prescrição."""
    return _prescricao(await svc.assinar_prescricao(db, t, id, u, dados_do_cliente(r)))


# ── Validade e linha do tempo ───────────────────────────────────────────────
@router.get("/cidadaos/{cidadao_id}/validade-consulta", response_model=ValidadeConsultaOut)
async def validade(
    cidadao_id: uuid.UUID,
    tipo: str,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-041 — validade de consulta/reconsulta configurada por tipo."""
    return await svc.validade_consulta(db, t, cidadao_id, tipo)


@router.get("/cidadaos/{cidadao_id}/linha-do-tempo")
async def linha_do_tempo(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-026, B.6-006, B.6-035 — linha do tempo; sigilosos velados."""
    return await svc.linha_do_tempo(db, t, cidadao_id, u, dados_do_cliente(r))


# ── Registros assistenciais configuráveis ───────────────────────────────────
@router.post("/registros", response_model=RegistroAssistencialOut, status_code=201)
async def criar_registro(
    c: RegistroAssistencialCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-013, B.6-018, B.6-022…025, B.6-030…032, B.6-037…039 — exame, encaminhamento,
    documento, notificação, ficha, escala, atenção domiciliar/psicossocial, atividade coletiva.

    ``tipo`` e o formulário de validação vêm de ``prontuario.tipos_registro``.
    """
    return await svc.criar_registro(db, t, c, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/registros", response_model=list[RegistroAssistencialOut])
async def listar_registros(
    cidadao_id: uuid.UUID,
    r: Request,
    tipo: str | None = None,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-006, B.6-026 — registros visíveis no escopo e no sigilo do usuário."""
    return await svc.listar_registros(db, t, cidadao_id, tipo, u, dados_do_cliente(r))


@router.post("/registros/{id}/assinar", response_model=RegistroAssistencialOut)
async def assinar_registro(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_ASSINAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-032, B.6-056 — documento clínico assinado."""
    return await svc.assinar_registro(db, t, id, u, dados_do_cliente(r))


@router.post("/registros/{id}/retificar", response_model=RegistroAssistencialOut, status_code=201)
async def retificar_registro(
    id: uuid.UUID,
    c: RetificacaoRegistroCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_RETIFICAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-057 — retificação com versão e justificativa."""
    return await svc.retificar_registro(db, t, id, c, u, dados_do_cliente(r))
