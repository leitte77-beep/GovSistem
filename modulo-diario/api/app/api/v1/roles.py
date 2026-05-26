import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.role import Role
from app.models.user import User

router = APIRouter(tags=["roles"])


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    label: str
    description: str | None

    model_config = {"from_attributes": True}


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Role).where(Role.name != "SUPER_ADMIN").order_by(Role.name)
    )
    return result.scalars().all()
