"""Gestão de usuários e grupos.

Os usuários chegam da plataforma SaaS (login único) — aqui o administrador
apenas ajusta o que é local: perfil fino, secretaria, setor, cargo e situação.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Pagination, client_info, get_institution, page_payload
from app.core.auth import get_current_user, require_profiles
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.models.enums import AuditAction, Profile
from app.models.organization import Institution
from app.models.user import Group, User, UserGroup
from app.schemas.auth import GroupCreate, GroupOut, UserOut, UserUpdate
from app.schemas.common import Message
from app.services import audit

router = APIRouter(tags=["Usuários"])

admin_only = require_profiles(Profile.ADMIN_GERAL)
admin_or_secretariat = require_profiles(Profile.ADMIN_GERAL, Profile.ADMIN_SECRETARIA)


@router.get("/usuarios", summary="Listar usuários")
async def list_users(
    termo: Optional[str] = Query(None),
    perfil: Optional[Profile] = Query(None),
    secretaria_id: Optional[uuid.UUID] = Query(None),
    setor_id: Optional[uuid.UUID] = Query(None),
    ativos: Optional[bool] = Query(None),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(User).where(
        User.institution_id == institution.id, User.deleted_at.is_(None)
    )
    if termo:
        like = f"%{termo.lower()}%"
        stmt = stmt.where(
            or_(func.lower(User.name).like(like), func.lower(User.email).like(like))
        )
    if perfil:
        stmt = stmt.where(User.profile == perfil.value)
    if secretaria_id:
        stmt = stmt.where(User.secretariat_id == secretaria_id)
    if setor_id:
        stmt = stmt.where(User.department_id == setor_id)
    if ativos is not None:
        stmt = stmt.where(User.is_active.is_(ativos))
    if user.profile == Profile.ADMIN_SECRETARIA.value and user.secretariat_id:
        stmt = stmt.where(User.secretariat_id == user.secretariat_id)

    total = int(
        await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    )
    rows = (
        await db.scalars(
            stmt.order_by(User.name).offset(paginacao.offset).limit(paginacao.por_pagina)
        )
    ).all()
    return page_payload([UserOut.build(row) for row in rows], total, paginacao)


@router.put("/usuarios/{user_id}", response_model=UserOut, summary="Editar usuário")
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    alvo = await db.get(User, user_id)
    if alvo is None or alvo.deleted_at is not None or alvo.institution_id != institution.id:
        raise NotFound("Usuário não encontrado.")
    if (
        user.profile == Profile.ADMIN_SECRETARIA.value
        and alvo.secretariat_id != user.secretariat_id
    ):
        raise AppError("Você só pode editar usuários da sua secretaria.", 403, "fora_do_escopo")

    before = {"perfil": alvo.profile, "ativo": alvo.is_active}
    data = payload.model_dump(exclude_unset=True)
    if "perfil" in data and data["perfil"]:
        if (
            data["perfil"] == Profile.ADMIN_GERAL
            and user.profile != Profile.ADMIN_GERAL.value
        ):
            raise AppError(
                "Apenas o administrador geral pode conceder este perfil.", 403, "fora_do_escopo"
            )
        alvo.profile = data["perfil"].value
    mapping = {
        "nome": "name",
        "secretaria_id": "secretariat_id",
        "setor_id": "department_id",
        "cargo": "job_title",
        "telefone": "phone",
        "ativo": "is_active",
    }
    for field, value in data.items():
        if field in mapping:
            setattr(alvo, mapping[field], value)

    await audit.record(
        db,
        action=AuditAction.USER_UPDATE,
        user=user,
        resource_type="user",
        resource_id=alvo.id,
        resource_name=alvo.name,
        data_before=before,
        data_after={"perfil": alvo.profile, "ativo": alvo.is_active},
        client=client_info(request),
    )
    await db.commit()
    return UserOut.build(alvo)


@router.get("/grupos", response_model=List[GroupOut], summary="Listar grupos")
async def list_groups(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    groups = (
        await db.scalars(
            select(Group)
            .where(Group.institution_id == institution.id, Group.deleted_at.is_(None))
            .order_by(Group.name)
        )
    ).all()
    result = []
    for group in groups:
        members = (
            await db.scalars(
                select(User)
                .join(UserGroup, UserGroup.user_id == User.id)
                .where(UserGroup.group_id == group.id)
            )
        ).all()
        result.append(
            GroupOut(
                id=group.id,
                nome=group.name,
                descricao=group.description,
                membros=[UserOut.build(m) for m in members],
            )
        )
    return result


@router.post("/grupos", response_model=GroupOut, status_code=201, summary="Criar grupo")
async def create_group(
    payload: GroupCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    group = Group(
        institution_id=institution.id,
        name=payload.nome,
        description=payload.descricao,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(group)
    await db.flush()
    membros = []
    for member_id in payload.membros:
        member = await db.get(User, member_id)
        if member is None or member.institution_id != institution.id:
            continue
        db.add(UserGroup(user_id=member.id, group_id=group.id))
        membros.append(member)
    await db.commit()
    return GroupOut(
        id=group.id,
        nome=group.name,
        descricao=group.description,
        membros=[UserOut.build(m) for m in membros],
    )


@router.put("/grupos/{group_id}/membros", response_model=Message, summary="Definir membros")
async def set_members(
    group_id: uuid.UUID,
    membros: List[uuid.UUID],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    group = await db.get(Group, group_id)
    if group is None or group.institution_id != institution.id:
        raise NotFound("Grupo não encontrado.")
    atuais = (
        await db.scalars(select(UserGroup).where(UserGroup.group_id == group.id))
    ).all()
    for item in atuais:
        await db.delete(item)
    for member_id in membros:
        member = await db.get(User, member_id)
        if member is None or member.institution_id != institution.id:
            continue
        db.add(UserGroup(user_id=member.id, group_id=group.id))
    await db.commit()
    return Message(mensagem=f"{len(membros)} membro(s) definidos para o grupo.")
