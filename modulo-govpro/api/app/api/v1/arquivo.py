"""Endpoints de gestão arquivística (Fase 5): TTD, ciclo de vida, eliminação,
integridade, exportação de acervo e dados abertos.
"""

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ARQUIVO,
    PAPEIS_LEITURA,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.user import User
from app.services import arquivo, eliminacao, integridade

router = APIRouter(tags=["arquivo"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


# ── TTD ───────────────────────────────────────────────────────────────────────
class TtdInput(BaseModel):
    classe_id: uuid.UUID
    prazo_corrente_anos: int
    prazo_intermediario_anos: int = 0
    destinacao_final: str = "GUARDA_PERMANENTE"
    observacoes: Optional[str] = None
    fundamento: Optional[str] = None


@router.post("/ttd", status_code=201)
async def criar_ttd(
    payload: TtdInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    ttd = await arquivo.criar_ttd(
        db,
        tenant_id,
        user,
        classe_id=payload.classe_id,
        prazo_corrente_anos=payload.prazo_corrente_anos,
        prazo_intermediario_anos=payload.prazo_intermediario_anos,
        destinacao_final=payload.destinacao_final,
        observacoes=payload.observacoes,
        fundamento=payload.fundamento,
        client=get_client_info(request),
    )
    return {"id": str(ttd.id), "classe_id": str(ttd.classe_id)}


@router.get("/ttd")
async def listar_ttd(
    db: DbDep, tenant_id: TenantDep, user: User = Depends(require_roles(*PAPEIS_LEITURA))
):
    return await arquivo.listar_ttd(db, tenant_id)


# ── Ciclo de vida ─────────────────────────────────────────────────────────────
@router.post("/processos/{processo_id}/transferir")
async def transferir(
    processo_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    ciclo = await arquivo.transferir(
        db, tenant_id, user, processo_id=processo_id, client=get_client_info(request)
    )
    return {"processo_id": str(ciclo.processo_id), "fase": ciclo.fase}


@router.post("/processos/{processo_id}/recolher")
async def recolher(
    processo_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    ciclo = await arquivo.recolher(
        db, tenant_id, user, processo_id=processo_id, client=get_client_info(request)
    )
    return {"processo_id": str(ciclo.processo_id), "fase": ciclo.fase}


@router.get("/processos/{processo_id}/ciclo")
async def ciclo_processo(
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    ciclo = await arquivo.obter_ciclo(db, tenant_id, processo_id)
    return {
        "processo_id": str(ciclo.processo_id),
        "fase": ciclo.fase,
        "data_transferencia": ciclo.data_transferencia.isoformat()
        if ciclo.data_transferencia
        else None,
        "data_recolhimento": ciclo.data_recolhimento.isoformat()
        if ciclo.data_recolhimento
        else None,
        "destinacao_final": ciclo.destinacao_final,
    }


# ── Eliminação ────────────────────────────────────────────────────────────────
class EliminacaoInput(BaseModel):
    titulo: str
    processos: list[dict]


@router.post("/eliminacoes", status_code=201)
async def criar_eliminacao(
    payload: EliminacaoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    e = await eliminacao.criar_eliminacao(
        db,
        tenant_id,
        user,
        titulo=payload.titulo,
        processos=payload.processos,
        client=get_client_info(request),
    )
    return {"id": str(e.id), "status": e.status}


@router.post("/eliminacoes/{eliminacao_id}/aprovar")
async def aprovar_eliminacao(
    eliminacao_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    e = await eliminacao.aprovar(
        db, tenant_id, user, eliminacao_id=eliminacao_id, client=get_client_info(request)
    )
    return {"id": str(e.id), "status": e.status}


@router.post("/eliminacoes/{eliminacao_id}/edital")
async def publicar_edital(
    eliminacao_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
    prazo_dias: int = 30,
):
    edital = await eliminacao.publicar_edital(
        db,
        tenant_id,
        user,
        eliminacao_id=eliminacao_id,
        prazo_dias=prazo_dias,
        client=get_client_info(request),
    )
    return {
        "id": str(edital.id),
        "codigo": edital.codigo,
        "prazo_manifestacao_dias": edital.prazo_manifestacao_dias,
    }


@router.post("/eliminacoes/{eliminacao_id}/termo")
async def registrar_termo(
    eliminacao_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    termo = await eliminacao.registrar_termo(
        db, tenant_id, user, eliminacao_id=eliminacao_id, client=get_client_info(request)
    )
    return {"id": str(termo.id), "codigo": termo.codigo}


@router.post("/eliminacoes/{eliminacao_id}/executar")
async def executar_eliminacao(
    eliminacao_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    return await eliminacao.executar(
        db, tenant_id, user, eliminacao_id=eliminacao_id, client=get_client_info(request)
    )


# ── Integridade / preservação ─────────────────────────────────────────────────
@router.post("/verificar-integridade")
async def verificar_integridade(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    v = await integridade.verificar_integridade(db, tenant_id)
    return {
        "id": str(v.id),
        "total_verificados": v.total_verificados,
        "divergencias": v.divergencias,
    }


# ── Exportação e dados abertos ────────────────────────────────────────────────
@router.get("/exportar-acervo")
async def exportar_acervo(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ARQUIVO)),
):
    return await arquivo.exportar_acervo(db, tenant_id)


@router.get("/dados-abertos")
async def dados_abertos(
    db: DbDep, tenant_id: TenantDep, user: User = Depends(require_roles(*PAPEIS_LEITURA))
):
    return await arquivo.dados_abertos(db, tenant_id)
