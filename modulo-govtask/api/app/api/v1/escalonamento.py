"""Configuração de escalonamento de atrasos por organização."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.escalonamento import EscalonamentoConfig
from app.models.user import User
from app.services.notifications import verificar_prazos

router = APIRouter(prefix="/admin/escalonamento", tags=["admin"])


class EscalonamentoConfigIn(BaseModel):
    ativo: bool = True
    dia_responsavel: int = Field(1, ge=0, le=365)
    dia_coordenador: int = Field(3, ge=0, le=365)
    dia_gestor: int = Field(5, ge=0, le=365)


class EscalonamentoConfigOut(BaseModel):
    ativo: bool
    dia_responsavel: int
    dia_coordenador: int
    dia_gestor: int

    model_config = {"from_attributes": True}


async def _get_cfg(db: AsyncSession, organization_id: uuid.UUID) -> EscalonamentoConfig:
    cfg = await db.scalar(
        select(EscalonamentoConfig).where(
            EscalonamentoConfig.organization_id == organization_id,
            EscalonamentoConfig.deleted_at.is_(None),
        )
    )
    if cfg is None:
        cfg = EscalonamentoConfig(organization_id=organization_id)
        db.add(cfg)
        await db.flush()
        await db.commit()
    return cfg


@router.get("", response_model=EscalonamentoConfigOut)
async def obter_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await _get_cfg(db, user.organization_id)
    return cfg


@router.put("", response_model=EscalonamentoConfigOut)
async def atualizar_config(
    body: EscalonamentoConfigIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="Usuário sem organização")
    cfg = await _get_cfg(db, user.organization_id)
    cfg.ativo = body.ativo
    cfg.dia_responsavel = body.dia_responsavel
    cfg.dia_coordenador = body.dia_coordenador
    cfg.dia_gestor = body.dia_gestor
    await db.commit()
    await db.refresh(cfg)
    return cfg


@router.post("/verificar")
async def verificar_agora(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG, Perm.TASK_APPROVE)),
):
    """Executa a verificação de prazos/escalonamento imediatamente."""
    resultado = await verificar_prazos(db, user.organization_id)
    return resultado
