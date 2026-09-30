"""Perfis e escopo por secretaria dos usuários do GovFrota.

Os usuários chegam pelo SSO da plataforma; aqui o administrador define o
perfil dentro do módulo (substitui o papel vindo da plataforma) e as
secretarias que o usuário pode ver. O escopo é aplicado no backend.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import PERFIS_ATRIBUIVEIS, PERFIS_COM_ESCOPO, Perm
from app.models.auth_models import Role, User, UserRole, UsuarioAcesso, UsuarioUnidade
from app.models.unidade import Unidade
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/acessos", tags=["acessos"])


class AcessoUpdate(BaseModel):
    # None = volta a usar o papel vindo da plataforma.
    perfil: str | None = None
    cargo: str | None = Field(default=None, max_length=150)
    unidade_ids: list[uuid.UUID] = []


def _rotulo(perfil: str) -> str:
    return PERFIS_ATRIBUIVEIS.get(perfil, perfil.replace("_", " ").title())


@router.get("/perfis")
async def listar_perfis(user: User = Depends(require_permission(Perm.CONFIG_MANAGE))):
    return [
        {"name": k, "label": v, "restrito_a_secretaria": k in PERFIS_COM_ESCOPO}
        for k, v in PERFIS_ATRIBUIVEIS.items()
    ]


async def _montar(db: AsyncSession, org: uuid.UUID, usuarios: list[User]) -> list[dict]:
    ids = [u.id for u in usuarios]
    acessos = {
        a.user_id: a
        for a in (
            await db.execute(select(UsuarioAcesso).where(UsuarioAcesso.organization_id == org, UsuarioAcesso.user_id.in_(ids)))
        ).scalars()
    } if ids else {}
    vinculos: dict[uuid.UUID, list[dict]] = {i: [] for i in ids}
    if ids:
        for uid, un_id, nome in (
            await db.execute(
                select(UsuarioUnidade.user_id, Unidade.id, Unidade.nome)
                .join(Unidade, Unidade.id == UsuarioUnidade.unidade_id)
                .where(UsuarioUnidade.organization_id == org, UsuarioUnidade.user_id.in_(ids))
                .order_by(Unidade.nome)
            )
        ).all():
            vinculos[uid].append({"id": str(un_id), "nome": nome})
    resposta = []
    for u in usuarios:
        acesso = acessos.get(u.id)
        plataforma = sorted({ur.role.name for ur in u.user_roles})
        efetivos = [acesso.perfil] if acesso and acesso.perfil else plataforma
        restrito = bool(vinculos[u.id]) or bool(set(efetivos) & PERFIS_COM_ESCOPO)
        resposta.append(
            {
                "id": str(u.id),
                "nome": u.name,
                "email": u.email,
                "ativo": u.is_active,
                "perfis_plataforma": [{"name": p, "label": _rotulo(p)} for p in plataforma],
                "perfil_local": acesso.perfil if acesso else None,
                "perfis_efetivos": [{"name": p, "label": _rotulo(p)} for p in efetivos],
                "cargo": acesso.cargo if acesso else None,
                "secretarias": vinculos[u.id],
                "restrito": restrito,
            }
        )
    return resposta


def _consulta_usuarios(org: uuid.UUID):
    return (
        select(User)
        .where(User.organization_id == org, User.deleted_at.is_(None))
        .options(selectinload(User.user_roles).selectinload(UserRole.role).selectinload(Role.permissions))
    )


@router.get("/usuarios")
async def listar_usuarios(
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    usuarios = (await db.execute(_consulta_usuarios(user.organization_id).order_by(User.name))).scalars().all()
    return await _montar(db, user.organization_id, list(usuarios))


@router.put("/usuarios/{usuario_id}")
async def atualizar_acesso(
    usuario_id: uuid.UUID,
    body: AcessoUpdate,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    org = user.organization_id
    alvo = (
        await db.execute(_consulta_usuarios(org).where(User.id == usuario_id))
    ).scalar_one_or_none()
    if alvo is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if body.perfil is not None and body.perfil not in PERFIS_ATRIBUIVEIS:
        raise HTTPException(status_code=422, detail="Perfil inválido.")
    if alvo.id == user.id:
        # Evita que o administrador tire o próprio acesso sem querer.
        raise HTTPException(
            status_code=403, detail="Seu próprio acesso deve ser alterado por outro administrador."
        )
    unidade_ids = set(body.unidade_ids)
    if unidade_ids:
        validas = set(
            (
                await db.execute(
                    select(Unidade.id).where(
                        Unidade.organization_id == org,
                        Unidade.deleted_at.is_(None),
                        Unidade.id.in_(unidade_ids),
                    )
                )
            ).scalars()
        )
        if validas != unidade_ids:
            raise HTTPException(status_code=422, detail="Secretaria inválida.")
    if body.perfil in PERFIS_COM_ESCOPO and not unidade_ids:
        raise HTTPException(status_code=422, detail="Vincule ao menos uma secretaria a este perfil.")

    antes = (await _montar(db, org, [alvo]))[0]
    acesso = await db.scalar(
        select(UsuarioAcesso).where(UsuarioAcesso.user_id == alvo.id, UsuarioAcesso.organization_id == org)
    )
    if acesso is None:
        acesso = UsuarioAcesso(organization_id=org, user_id=alvo.id)
        db.add(acesso)
    acesso.perfil = body.perfil
    acesso.cargo = (body.cargo or "").strip() or None
    acesso.atualizado_por_id = user.id
    await db.execute(
        delete(UsuarioUnidade).where(UsuarioUnidade.user_id == alvo.id, UsuarioUnidade.organization_id == org)
    )
    for un_id in unidade_ids:
        db.add(UsuarioUnidade(organization_id=org, user_id=alvo.id, unidade_id=un_id))
    await db.flush()
    depois = (await _montar(db, org, [alvo]))[0]
    await registrar_auditoria(
        db,
        organization_id=org,
        acao="acesso.atualizar",
        entidade="usuario",
        entidade_id=alvo.id,
        usuario_id=user.id,
        dados_anteriores={k: antes[k] for k in ("perfil_local", "cargo", "secretarias")},
        dados_novos={k: depois[k] for k in ("perfil_local", "cargo", "secretarias")},
    )
    await db.commit()
    return depois
