"""Public endpoints (no auth, scoped by subdomain)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import resolve_secretaria_from_subdomain
from app.core.database import get_db
from app.models.secretaria import Secretaria

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/secretaria")
async def get_public_secretaria(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    secretaria = await resolve_secretaria_from_subdomain(request, db)
    if not secretaria:
        raise HTTPException(status_code=404, detail="Secretaria não encontrada para este domínio")

    return {
        "id": str(secretaria.id),
        "nome": secretaria.nome,
        "slug": secretaria.slug,
        "descricao": secretaria.descricao,
        "ouvidor_responsavel": secretaria.ouvidor_responsavel,
        "config": secretaria.config,
    }


@router.get("/ouvidoria/tipos")
async def get_tipos_manifestacao():
    return {
        "tipos": [
            {"id": "reclamacao", "nome": "Reclamação", "prazo_dias": 30, "prorrogavel": True, "prorrogacao_dias": 30},
            {"id": "denuncia", "nome": "Denúncia", "prazo_dias": 30, "prorrogavel": True, "prorrogacao_dias": 30},
            {"id": "solicitacao", "nome": "Solicitação", "prazo_dias": 30, "prorrogavel": True, "prorrogacao_dias": 30},
            {"id": "elogio", "nome": "Elogio", "prazo_dias": 30, "prorrogavel": True, "prorrogacao_dias": 30},
            {"id": "sugestao", "nome": "Sugestão", "prazo_dias": 30, "prorrogavel": True, "prorrogacao_dias": 30},
            {"id": "lai", "nome": "Pedido de Acesso à Informação (LAI)", "prazo_dias": 20, "prorrogavel": True, "prorrogacao_dias": 10},
        ]
    }


@router.get("/carta-servicos")
async def get_carta_servicos(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    secretaria = await resolve_secretaria_from_subdomain(request, db)
    if not secretaria:
        raise HTTPException(status_code=404, detail="Secretaria não encontrada para este domínio")

    return {
        "secretaria": secretaria.nome,
        "slug": secretaria.slug,
        "servicos": [],
        "canais_atendimento": [],
    }
