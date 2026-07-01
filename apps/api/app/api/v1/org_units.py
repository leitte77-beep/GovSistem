import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.org_unit import OrgUnit
from app.models.user import User

router = APIRouter(tags=["org-units"])


class OrgUnitOut(BaseModel):
    id: uuid.UUID
    name: str
    abbreviation: str | None

    model_config = {"from_attributes": True}


DEFAULT_ORG_UNITS = [
    {"name": "Prefeitura Municipal", "abbreviation": "PM"},
    {"name": "Câmara Municipal", "abbreviation": "CM"},
]


@router.get("/org-units", response_model=list[OrgUnitOut])
async def list_org_units(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OrgUnit)
        .where(OrgUnit.organization_id == user.organization_id)
        .order_by(OrgUnit.name)
    )
    units = result.scalars().all()
    if not units:
        for data in DEFAULT_ORG_UNITS:
            unit = OrgUnit(organization_id=user.organization_id, **data)
            db.add(unit)
        await db.commit()
        result = await db.execute(
            select(OrgUnit)
            .where(OrgUnit.organization_id == user.organization_id)
            .order_by(OrgUnit.name)
        )
        units = result.scalars().all()
    return units
