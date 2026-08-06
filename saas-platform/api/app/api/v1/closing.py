from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.user import User
from app.services.closing import check_closing_readiness

router = APIRouter(prefix="/closing", tags=["closing"])


@router.get("/check-readiness")
async def closing_readiness(
    month: int = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Usuário sem organização")

    result = await check_closing_readiness(
        db=db,
        organization_id=user.organization_id,
        period_month=month,
        period_year=year,
    )
    return result
