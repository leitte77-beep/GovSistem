import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.enums import SituacaoProcesso
from app.models.processo_status import ProcessoStatus
from app.models.user import User
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin/status-processo", tags=["admin"])


class StatusCreate(BaseModel):
    chave: str = Field(..., max_length=50)
    rotulo: str = Field(..., max_length=100)
    ordem: int = 0
    cor: str | None = Field(None, max_length=30)
    is_final: bool = False


class StatusUpdate(BaseModel):
    rotulo: str | None = None
    ordem: int | None = None
    cor: str | None = None
    is_final: bool | None = None


async def _seed_status_padrao(db, organization_id):
    """Garante os status padrão do sistema para o tenant."""
    existente = (await db.execute(
        select(ProcessoStatus).where(
            ProcessoStatus.organization_id == organization_id
        )
    )).scalar_one_or_none()
    if existente:
        return

    for i, chave in enumerate(SituacaoProcesso.default_flow()):
        db.add(ProcessoStatus(
            organization_id=organization_id,
            chave=chave,
            rotulo=SituacaoProcesso(chave).value.replace("_", " ").title(),
            ordem=i,
            is_final=chave in ("CONCLUIDO", "CANCELADO"),
        ))
    await db.flush()


@router.get("")
async def listar_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _seed_status_padrao(db, user.organization_id)
    await db.commit()
    result = await db.execute(
        select(ProcessoStatus).where(
            or_(
                ProcessoStatus.organization_id == user.organization_id,
                ProcessoStatus.organization_id.is_(None),
            ),
            ProcessoStatus.deleted_at.is_(None),
        ).order_by(ProcessoStatus.ordem)
    )
    return [
        {
            "id": str(s.id), "chave": s.chave, "rotulo": s.rotulo, "ordem": s.ordem,
            "cor": s.cor, "is_final": s.is_final, "is_system": s.is_system,
            "global": s.organization_id is None,
        }
        for s in result.scalars().all()
    ]


@router.post("", status_code=201)
async def criar_status(
    body: StatusCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    await _seed_status_padrao(db, user.organization_id)
    s = ProcessoStatus(
        organization_id=user.organization_id,
        chave=body.chave,
        rotulo=body.rotulo,
        ordem=body.ordem,
        cor=body.cor,
        is_final=body.is_final,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"id": str(s.id), "chave": s.chave, "rotulo": s.rotulo, "ordem": s.ordem, "cor": s.cor, "is_final": s.is_final}


@router.patch("/{status_id}")
async def atualizar_status(
    status_id: uuid.UUID,
    body: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    result = await db.execute(
        select(ProcessoStatus).where(
            ProcessoStatus.id == status_id,
            ProcessoStatus.organization_id == user.organization_id,
            ProcessoStatus.deleted_at.is_(None),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Status não encontrado")
    if s.is_system:
        raise HTTPException(status_code=403, detail="Status de sistema não pode ser alterado")

    if body.rotulo is not None:
        s.rotulo = body.rotulo
    if body.ordem is not None:
        s.ordem = body.ordem
    if body.cor is not None:
        s.cor = body.cor
    if body.is_final is not None:
        s.is_final = body.is_final
    await db.commit()
    return {"id": str(s.id), "chave": s.chave, "rotulo": s.rotulo, "ordem": s.ordem, "cor": s.cor, "is_final": s.is_final}


@router.delete("/{status_id}", status_code=204)
async def excluir_status(
    status_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    result = await db.execute(
        select(ProcessoStatus).where(
            ProcessoStatus.id == status_id,
            ProcessoStatus.organization_id == user.organization_id,
            ProcessoStatus.deleted_at.is_(None),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Status não encontrado")
    if s.is_system:
        raise HTTPException(status_code=403, detail="Status de sistema não pode ser excluído")
    s.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
