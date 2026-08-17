from fastapi import APIRouter, Depends

from app.core.auth import get_current_user, user_role_names
from app.models.user import User

router = APIRouter(tags=["auth"])


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "organization_id": str(user.organization_id) if user.organization_id else None,
        "roles": sorted(user_role_names(user)),
    }
