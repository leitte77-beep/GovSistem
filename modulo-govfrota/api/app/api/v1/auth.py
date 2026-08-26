from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, get_user_permissions
from app.core.database import get_db
from app.models.auth_models import User

router = APIRouter(tags=["auth"])


@router.get("/auth/me")
async def me(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "organization_id": str(user.organization_id),
        "roles": [
            {"id": str(ur.role.id), "name": ur.role.name, "label": ur.role.label}
            for ur in user.user_roles
        ],
        "permissions": sorted(get_user_permissions(user)),
    }
