"""Rotas servidor-a-servidor da plataforma (X-Internal-Key)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.core.errors import NotFound
from app.schemas.internal import SyncOrganizacaoRequest, SyncResposta, SyncUsuarioRequest
from app.services.autenticacao import obter_tenant
from app.services.idempotencia import buscar, chave_do_header, guardar, hash_requisicao
from app.services.provisionamento import provisionar_organizacao, provisionar_usuario

router = APIRouter(prefix="/internal", tags=["Integração interna"])


def _uuid(valor: str) -> uuid.UUID:
    try:
        return uuid.UUID(valor)
    except (ValueError, TypeError) as exc:
        raise NotFound("Identificador de organização inválido.") from exc


@router.post(
    "/sync-organization",
    response_model=SyncResposta,
    dependencies=[Depends(require_internal_key)],
    summary="Sincronizar organização",
)
async def sync_organization(
    corpo: SyncOrganizacaoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    tenant_id = _uuid(corpo.organization_id)
    chave = chave_do_header(request)
    endpoint = "/internal/sync-organization"
    request_hash = hash_requisicao(corpo.model_dump())
    if chave:
        cache = await buscar(
            db, tenant_id=tenant_id, chave=chave, endpoint=endpoint, request_hash=request_hash
        )
        if cache:
            return JSONResponse(status_code=cache.response_status, content=cache.response_body)
    organizacao = await provisionar_organizacao(
        db,
        organization_id=corpo.organization_id,
        nome=corpo.name,
        slug=corpo.slug,
        tipo=corpo.tipo,
        cnpj=corpo.cnpj,
        uf=corpo.uf,
        municipio_ibge=corpo.municipio_ibge,
        fuso_horario=corpo.fuso_horario,
        ativa=corpo.is_active,
    )
    resposta = SyncResposta(organization_id=organizacao.id)
    if chave:
        await guardar(
            db,
            tenant_id=tenant_id,
            chave=chave,
            endpoint=endpoint,
            request_hash=request_hash,
            status=200,
            body=jsonable_encoder(resposta),
        )
    await db.commit()
    return resposta


@router.post(
    "/sync-user",
    response_model=SyncResposta,
    dependencies=[Depends(require_internal_key)],
    summary="Sincronizar usuário e papéis",
)
async def sync_user(
    corpo: SyncUsuarioRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    tenant = await obter_tenant(db, corpo.organization_id)
    if tenant is None:
        raise NotFound("Organização não encontrada.")
    chave = chave_do_header(request)
    endpoint = "/internal/sync-user"
    request_hash = hash_requisicao(corpo.model_dump())
    if chave:
        cache = await buscar(
            db, tenant_id=tenant.id, chave=chave, endpoint=endpoint, request_hash=request_hash
        )
        if cache:
            return JSONResponse(status_code=cache.response_status, content=cache.response_body)
    usuario = await provisionar_usuario(
        db,
        user_id=corpo.user_id,
        organization_id=corpo.organization_id,
        nome=corpo.name,
        email=str(corpo.email),
        papeis=corpo.roles,
        ativo=corpo.is_active,
    )
    resposta = SyncResposta(user_id=usuario.id, organization_id=tenant.id)
    if chave:
        await guardar(
            db,
            tenant_id=tenant.id,
            chave=chave,
            endpoint=endpoint,
            request_hash=request_hash,
            status=200,
            body=jsonable_encoder(resposta),
        )
    await db.commit()
    return resposta


@router.get("/health", summary="Saúde da integração interna")
async def internal_health(_: None = Depends(require_internal_key)):
    return {"status": "ok", "servico": "govsaude"}
