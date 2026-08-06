import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.user_role import UserRole

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


class UserMeResponse(BaseModel):
    id: str
    email: str
    name: str
    roles: list[dict]
    organization_id: str | None

    model_config = {"from_attributes": True}


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .where(User.email == body.email, User.deleted_at.is_(None))
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    roles = [ur.role.name for ur in user.user_roles]
    access_token = create_access_token(
        user.id, roles, organization_id=user.organization_id
    )
    refresh_token_jti = uuid.uuid4()
    refresh_token_str = create_refresh_token(user.id, refresh_token_jti)

    # Store refresh token
    rt = RefreshToken(
        id=refresh_token_jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(rt)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "roles": [{"id": str(ur.role.id), "name": ur.role.name, "label": ur.role.label} for ur in user.user_roles],
        },
    }


@router.post("/auth/refresh")
async def refresh_token(body: dict, db: AsyncSession = Depends(get_db)):
    from app.core.security import decode_token
    try:
        payload = decode_token(body["refresh_token"])
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Token inválido")

    jti = payload.get("jti")
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.id == jti)
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=401, detail="Refresh token revogado")

    # Delete old refresh token (rotation)
    await db.delete(rt)

    # Issue new tokens
    user_result = await db.execute(
        select(User)
        .where(User.id == rt.user_id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    roles = [ur.role.name for ur in user.user_roles]
    access_token = create_access_token(user.id, roles, organization_id=user.organization_id)
    new_jti = uuid.uuid4()
    refresh_token_str = create_refresh_token(user.id, new_jti)

    new_rt = RefreshToken(
        id=new_jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(new_rt)
    await db.commit()

    return {"access_token": access_token, "refresh_token": refresh_token_str}


@router.get("/auth/me", response_model=UserMeResponse)
async def me(user: User = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "roles": [
            {"id": str(ur.role.id), "name": ur.role.name, "label": ur.role.label}
            for ur in user.user_roles
        ],
        "organization_id": str(user.organization_id) if user.organization_id else None,
    }
