"""Campos adicionais configuráveis por tipo de demanda (§205, §206).

O CRUD é administrativo (`admin.config`). A leitura por demanda devolve as
definições aplicáveis e os valores gravados, para a interface montar o
formulário sem conhecer o catálogo de antemão.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.campo_customizado import CampoCustomizado
from app.models.catalogo import TipoDemanda
from app.models.user import User
from app.schemas.gestao_avancada import (
    CampoCustomizadoCreate,
    CampoCustomizadoOut,
    CampoCustomizadoUpdate,
)
from app.services import campos_customizados as svc
from app.services import demandas as svc_demanda

router = APIRouter(prefix="/campos-customizados", tags=["Campos customizados"])

router_demanda = APIRouter(prefix="/demandas", tags=["Campos customizados"])


async def _campo_ou_404(
    db: AsyncSession, campo_id: uuid.UUID, organization_id: uuid.UUID
) -> CampoCustomizado:
    campo = (
        await db.execute(
            select(CampoCustomizado).where(
                CampoCustomizado.id == campo_id,
                CampoCustomizado.organization_id == organization_id,
                CampoCustomizado.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if campo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campo não encontrado")
    return campo


@router.get("", response_model=list[CampoCustomizadoOut])
async def listar_campos(
    tipo_demanda_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    campos = await svc.definicoes(
        db, user.organization_id, tipo_demanda_id, somente_ativos=False
    )
    return [CampoCustomizadoOut.model_validate(c) for c in campos]


@router.post("", response_model=CampoCustomizadoOut, status_code=status.HTTP_201_CREATED)
async def criar_campo(
    payload: CampoCustomizadoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    svc.validar_definicao(
        chave=payload.chave,
        tipo=payload.tipo.value,
        opcoes=payload.opcoes,
        validacao=payload.validacao,
    )
    existente = (
        await db.execute(
            select(CampoCustomizado).where(
                CampoCustomizado.organization_id == user.organization_id,
                CampoCustomizado.chave == payload.chave,
                CampoCustomizado.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Já existe um campo com esta chave")
    if payload.tipo_demanda_id is not None:
        await svc_demanda.resolver_catalogo(
            db, TipoDemanda, payload.tipo_demanda_id, user.organization_id, "Tipo de demanda"
        )
    campo = CampoCustomizado(
        organization_id=user.organization_id, **payload.model_dump()
    )
    db.add(campo)
    await db.commit()
    await db.refresh(campo)
    return CampoCustomizadoOut.model_validate(campo)


@router.patch("/{campo_id}", response_model=CampoCustomizadoOut)
async def atualizar_campo(
    campo_id: uuid.UUID,
    payload: CampoCustomizadoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    campo = await _campo_ou_404(db, campo_id, user.organization_id)
    alteracoes = payload.model_dump(exclude_unset=True)
    svc.validar_definicao(
        chave=campo.chave,
        tipo=campo.tipo,
        opcoes=alteracoes.get("opcoes", campo.opcoes),
        validacao=alteracoes.get("validacao", campo.validacao),
    )
    for chave, valor in alteracoes.items():
        setattr(campo, chave, valor)
    await db.commit()
    await db.refresh(campo)
    return CampoCustomizadoOut.model_validate(campo)


@router.delete("/{campo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_campo(
    campo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    campo = await _campo_ou_404(db, campo_id, user.organization_id)
    campo.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Leitura por demanda ─────────────────────────────────────────────────────

@router_demanda.get("/{demanda_id}/campos-customizados")
async def campos_da_demanda(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Definições aplicáveis + valores gravados, para montar o formulário."""
    demanda = await svc_demanda.get_demanda_ou_404(
        db, demanda_id, user, get_user_permissions(user)
    )
    definicoes = await svc.definicoes(db, user.organization_id, demanda.tipo_id)
    valores = demanda.campos_extras or {}
    return {
        "campos": [
            {
                **CampoCustomizadoOut.model_validate(c).model_dump(mode="json"),
                "valor": valores.get(c.chave),
            }
            for c in definicoes
        ]
    }
