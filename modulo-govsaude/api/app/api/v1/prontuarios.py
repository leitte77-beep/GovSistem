"""Fase 5 — PEC ambulatorial (B.6-004…058, B.12-013/021…025).

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
    AlergiaCreate,
    AlergiaOut,
    AtendimentoCreate,
    AtendimentoEncerrar,
    AtendimentoOut,
    Encerramento,
    EtapaAvancar,
    PlanoCreate,
    PlanoOut,
    PrescricaoCopiar,
    PrescricaoCreate,
    PrescricaoOut,
    ProblemaCreate,
    ProblemaOut,
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
    """B.6-004, B.6-056 — abre atendimento; retroativo só em contingência autorizada."""
    return await svc.abrir_atendimento(db, t, c, u, dados_do_cliente(r))


@router.get("/atendimentos/{id}", response_model=AtendimentoOut)
async def obter(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-004, B.12-021 — leitura auditada (READ_SENSIVEL)."""
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
    """B.6-006 — campos obrigatórios ainda não preenchidos."""
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
    """B.6-006 — encerra só com os campos obrigatórios do tenant preenchidos."""
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
    """B.6-004 — evolução SOAP cifrada em repouso."""
    return await svc.registrar_soap(db, t, id, c, u, dados_do_cliente(r))


@router.get("/atendimentos/{id}/soap", response_model=list[SOAPOut])
async def listar_soap(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-004, B.6-057 — evoluções do atendimento, inclusive retificações."""
    return await svc.listar_soap(db, t, id, u, dados_do_cliente(r))


@router.post("/evolucoes/{id}/assinar", response_model=SOAPOut)
async def assinar(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_ASSINAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-034 — assinatura da evolução."""
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
    """B.6-010, B.6-011 — sinais e antropometria; IMC classificado pela tabela do tenant."""
    return await svc.registrar_sinais(db, t, id, c, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/sinais-vitais", response_model=list[SinalVitalOut])
async def serie_sinais(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-012 — série histórica."""
    return await svc.serie_sinais(db, t, cidadao_id, u, dados_do_cliente(r))


# ── Problemas e alergias ────────────────────────────────────────────────────
@router.post("/cidadaos/{cidadao_id}/problemas", response_model=ProblemaOut, status_code=201)
async def problema(
    cidadao_id: uuid.UUID,
    c: ProblemaCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-016 — problema CID-10/CIAP-2/CIPE, conferido na base importada."""
    return await svc.registrar_problema(db, t, cidadao_id, c, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/problemas", response_model=list[ProblemaOut])
async def listar_problemas(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-016 — lista de problemas ativos e encerrados."""
    return await svc.listar_problemas(db, t, cidadao_id, u, dados_do_cliente(r))


@router.post("/problemas/{id}/encerrar", response_model=ProblemaOut)
async def encerrar_problema(
    id: uuid.UUID,
    c: Encerramento,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-016 — baixa lógica com motivo."""
    return await svc.encerrar_problema(db, t, id, c.motivo, u, dados_do_cliente(r))


@router.post("/cidadaos/{cidadao_id}/alergias", response_model=AlergiaOut, status_code=201)
async def alergia(
    cidadao_id: uuid.UUID,
    c: AlergiaCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-015 — alergia que alimenta o alerta da prescrição."""
    return await svc.registrar_alergia(db, t, cidadao_id, c, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/alergias", response_model=list[AlergiaOut])
async def listar_alergias(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-015."""
    return await svc.listar_alergias(db, t, cidadao_id, u, dados_do_cliente(r))


@router.post("/alergias/{id}/encerrar", response_model=AlergiaOut)
async def encerrar_alergia(
    id: uuid.UUID,
    c: Encerramento,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-015 — baixa lógica com motivo."""
    return await svc.encerrar_alergia(db, t, id, c.motivo, u, dados_do_cliente(r))


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
    """B.6-017 — plano de cuidados."""
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
    """B.6-019, B.6-033 — prescrição com alertas (alergia/duplicidade) e receituários separados."""
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
    """B.6-019 — cópia assistida de prescrição anterior do mesmo cidadão."""
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
    """B.6-019, B.6-034."""
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
    """B.6-048, B.6-049 — atendimentos e registros; sigilosos velados."""
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
    """B.6-013, B.6-018, B.6-023, B.6-025, B.6-032, B.6-037…039 — exame, encaminhamento,
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
    """B.6-048 — registros visíveis no escopo e no nível de sigilo do usuário."""
    return await svc.listar_registros(db, t, cidadao_id, tipo, u, dados_do_cliente(r))


@router.post("/registros/{id}/assinar", response_model=RegistroAssistencialOut)
async def assinar_registro(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_ASSINAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-032, B.6-034 — documento clínico assinado."""
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
