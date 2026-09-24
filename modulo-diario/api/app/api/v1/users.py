import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.database import get_db
from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.schemas.auth import UserCreateRequest, UserOut, UserUpdateRequest

router = APIRouter(tags=["users"], dependencies=[Depends(require_roles("ADMIN"))])


def _reject_platform_roles(role_names: list[str] | None) -> None:
    if role_names and "SUPER_ADMIN" in role_names:
        raise HTTPException(
            status_code=403,
            detail="SUPER_ADMIN users must be managed in the SaaS platform",
        )


def _ensure_local_user(user: User) -> None:
    if user.managed_by_saas:
        raise HTTPException(
            status_code=403,
            detail="Users managed by the SaaS platform cannot be changed in this module",
        )


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(User)
        .where(User.organization_id == user.organization_id, User.deleted_at.is_(None))
    )
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    _reject_platform_roles(body.role_names)

    existing = await db.execute(
        select(User).where(User.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        organization_id=body.organization_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    for role_name in body.role_names:
        role_result = await db.execute(
            select(Role).where(Role.name == role_name)
        )
        role = role_result.scalar_one_or_none()
        if role:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    _reject_platform_roles(body.role_names)

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.organization_id == current_user.organization_id,
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _ensure_local_user(user)

    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        user.email = body.email
    if body.is_active is not None:
        user.is_active = body.is_active

    if body.role_names is not None:
        # Remove existing roles
        existing_roles = await db.execute(
            select(UserRole).where(UserRole.user_id == user.id)
        )
        for ur in existing_roles.scalars().all():
            await db.delete(ur)

        for role_name in body.role_names:
            role_result = await db.execute(
                select(Role).where(Role.name == role_name)
            )
            role = role_result.scalar_one_or_none()
            if role:
                db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.organization_id == current_user.organization_id,
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _ensure_local_user(user)
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    from datetime import datetime, timezone
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    await db.commit()
