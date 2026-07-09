import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_user
from app.core.br_validators import only_digits
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.enums import AuditAccessType, AuditAction
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.user_role import UserRole
from app.schemas import LoginRequest, LoginResponse, RefreshRequest, UserMeResponse
from app.services.audit import record_audit

router = APIRouter(tags=["auth"])


def _serialize_roles(user: User) -> list[dict]:
    return [
        {"id": str(ur.role.id), "name": ur.role.name, "label": ur.role.label}
        for ur in user.user_roles
    ]


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    login = body.login.strip()
    query = select(User).where(User.deleted_at.is_(None)).options(
        selectinload(User.user_roles).selectinload(UserRole.role)
    )
    if "@" in login:
        query = query.where(User.email == login.lower())
    else:
        query = query.where(User.cpf == only_digits(login))

    user = (await db.execute(query)).scalar_one_or_none()

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
    jti = uuid.uuid4()
    refresh_token_str = create_refresh_token(user.id, jti)
    db.add(
        RefreshToken(
            id=jti,
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )

    if user.organization_id is not None:
        await record_audit(
            db,
            tenant_id=user.organization_id,
            action=AuditAction.LOGIN,
            entity="user",
            entity_id=user.id,
            access_type=AuditAccessType.WRITE,
            actor=user,
            client_info=get_client_info(request),
        )
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "roles": _serialize_roles(user),
            "organization_id": (
                str(user.organization_id) if user.organization_id else None
            ),
        },
    }


@router.post("/auth/refresh")
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Token inválido")

    jti = payload.get("jti")
    rt = (
        await db.execute(select(RefreshToken).where(RefreshToken.id == jti))
    ).scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=401, detail="Refresh token revogado")

    await db.delete(rt)

    user = (
        await db.execute(
            select(User)
            .where(User.id == rt.user_id)
            .options(selectinload(User.user_roles).selectinload(UserRole.role))
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    roles = [ur.role.name for ur in user.user_roles]
    access_token = create_access_token(
        user.id, roles, organization_id=user.organization_id
    )
    new_jti = uuid.uuid4()
    refresh_token_str = create_refresh_token(user.id, new_jti)
    db.add(
        RefreshToken(
            id=new_jti,
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    await db.commit()
    return {"access_token": access_token, "refresh_token": refresh_token_str}


@router.get("/auth/me", response_model=UserMeResponse)
async def me(user: User = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "roles": _serialize_roles(user),
        "organization_id": (
            str(user.organization_id) if user.organization_id else None
        ),
    }
