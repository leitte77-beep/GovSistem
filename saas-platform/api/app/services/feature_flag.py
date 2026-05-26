import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feature_flag import FeatureFlag


async def is_feature_enabled(
    db: AsyncSession,
    key: str,
    company_id: Optional[uuid.UUID] = None,
) -> bool:
    result = await db.execute(
        select(FeatureFlag).where(
            FeatureFlag.key == key,
            FeatureFlag.enabled.is_(True),
        )
    )
    flags = result.scalars().all()
    if not flags:
        return False
    for flag in flags:
        if flag.company_id is None or (company_id and flag.company_id == company_id):
            return True
    return False


async def require_feature(
    db: AsyncSession,
    key: str,
    company_id: Optional[uuid.UUID] = None,
) -> bool:
    return await is_feature_enabled(db, key, company_id)
