"""Recepção por agendamento, demanda espontânea e cartão (B.6-005)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agenda_helpers import fila_out
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.agenda import (
    CartaoCidadaoOut,
    CartaoCidadaoRequest,
    CheckInOut,
    CheckInRequest,
    DemandaEspontaneaRequest,
    FilaOut,
)
from app.services import recepcao
from app.services.auditoria import dados_do_cliente

router = APIRouter(prefix="/recepcao", tags=["Recepção"])


@router.post("/check-in", response_model=CheckInOut)
async def check_in(
    corpo: CheckInRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    return await recepcao.check_in(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )


@router.post("/demanda-espontanea", response_model=FilaOut, status_code=201)
async def demanda_espontanea(
    corpo: DemandaEspontaneaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await recepcao.demanda_espontanea(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro)


@router.post("/cartao", response_model=CartaoCidadaoOut)
async def emitir_cartao(
    corpo: CartaoCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    return await recepcao.cartao(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        cidadao_id=corpo.cidadao_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
