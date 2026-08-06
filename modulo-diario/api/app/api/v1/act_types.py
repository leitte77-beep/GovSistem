import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.act_type import ActType
from app.models.user import User

router = APIRouter(tags=["act-types"])


class ActTypeOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}


@router.get("/act-types", response_model=list[ActTypeOut])
async def list_act_types(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ActType).where(ActType.is_active == True).order_by(ActType.name)
    )
    return result.scalars().all()
