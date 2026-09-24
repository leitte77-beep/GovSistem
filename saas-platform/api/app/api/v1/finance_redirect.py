from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.reports import _compute_finance_dashboard
from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/dashboard")
async def finance_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    return await _compute_finance_dashboard(db)
