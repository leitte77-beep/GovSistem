"""Rotas públicas (sem login) — validação de autenticidade e catálogos do portal.

- Validação pública de autenticidade (Lei 14.129/2021).
- Lista de órgãos/entes (seletor do portal do cidadão).
- Tipos de processo com peticionamento externo habilitado.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.dominio import TipoProcesso
from app.models.organization import Organization
from app.services import validacao

router = APIRouter(tags=["publico"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/public/validar")
async def validar(
    db: DbDep,
    codigo: str = Query(min_length=5, max_length=20),
    crc: str = Query(min_length=4, max_length=16),
):
    resultado = await validacao.validar_por_codigo(db, codigo, crc)
    if resultado is None:
        return {"valido": False, "codigo_verificador": codigo, "motivo": "documento não encontrado"}
    return resultado


@router.get("/public/organizacoes")
async def listar_organizacoes(db: DbDep):
    """Órgãos/entes disponíveis no portal (seletor). Apenas ativos, sem dados sensíveis."""
    result = await db.execute(
        select(Organization)
        .where(Organization.is_active.is_(True), Organization.deleted_at.is_(None))
        .order_by(Organization.name)
    )
    return [{"slug": o.slug, "nome": o.name} for o in result.scalars()]


@router.get("/public/tipos-processo")
async def tipos_processo_publicos(
    db: DbDep,
    org_slug: str = Query(...),
):
    """Tipos de processo disponíveis para peticionamento pelo cidadão (publico_externo)."""
    result = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Órgão não encontrado"
        )

    result = await db.execute(
        select(TipoProcesso)
        .where(
            TipoProcesso.tenant_id == org.id,
            TipoProcesso.publico_externo.is_(True),
            TipoProcesso.deleted_at.is_(None),
        )
        .order_by(TipoProcesso.nome)
    )
    return [
        {
            "id": str(t.id),
            "codigo": t.codigo,
            "nome": t.nome,
            "descricao": t.descricao,
            "prazo_legal_dias": t.prazo_legal_dias,
        }
        for t in result.scalars()
    ]
