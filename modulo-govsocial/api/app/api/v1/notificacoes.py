"""Endpoints de notificacoes internas."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.notificacao import FiltroSalvo, Notificacao
from app.models.user import User
from app.models.user_role import UserRole
from app.models.role import Role

router = APIRouter(tags=["notificacoes"])

_ALL = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.RECEPCAO.value,
    RoleName.ADMIN.value,
)
_ADMIN = require_roles(RoleName.ADMIN.value, RoleName.GESTOR_MUNICIPAL.value)


async def _papeis_do_usuario(user_id: uuid.UUID, db: AsyncSession) -> list[str]:
    """Retorna a lista de nomes de papéis (roles) do usuário."""
    resultado = await db.execute(
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id),
    )
    return [r for r in resultado.scalars().all()]


def _filtro_notificacoes(
    stmt,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    papeis: list[str],
):
    """Aplica cláusula WHERE que inclui notificações diretas e por papel."""
    condicoes = [Notificacao.user_id == user_id]
    if papeis:
        condicoes.append(Notificacao.role_alvo.in_(papeis))
    condicoes.append(Notificacao.role_alvo.is_(None))
    return stmt.where(
        Notificacao.tenant_id == tenant_id,
        or_(*condicoes),
    )


# ─── NOTIFICAÇÕES ─────────────────────────────────────

@router.get("/notifications")
async def listar_notificacoes(
    nao_lidas: bool = Query(False),
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    papeis = await _papeis_do_usuario(user.id, db)
    q = _filtro_notificacoes(
        select(Notificacao), tenant_id, user.id, papeis,
    )
    if nao_lidas:
        q = q.where(Notificacao.lida == False)
    q = q.order_by(Notificacao.created_at.desc()).limit(limit)
    return (await db.execute(q)).scalars().all()


@router.get("/notifications/count")
async def contar_nao_lidas(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    from sqlalchemy import func

    papeis = await _papeis_do_usuario(user.id, db)
    q = _filtro_notificacoes(
        select(func.count(Notificacao.id)), tenant_id, user.id, papeis,
    ).where(Notificacao.lida == False)
    total = await db.scalar(q)
    return {"total": total or 0}


@router.post("/notifications/{notif_id}/read")
async def marcar_lida(
    notif_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    notif = (
        await db.execute(
            select(Notificacao).where(
                Notificacao.id == notif_id,
                Notificacao.tenant_id == tenant_id,
                Notificacao.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404)
    notif.lida = True
    await db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
async def marcar_todas_lidas(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    await db.execute(
        update(Notificacao).where(
            Notificacao.tenant_id == tenant_id,
            Notificacao.user_id == user.id,
            Notificacao.lida == False,
        ).values(lida=True)
    )
    await db.commit()
    return {"ok": True}


# ─── FILTROS SALVOS ────────────────────────────────────

from pydantic import BaseModel


class FiltroSalvoCreate(BaseModel):
    entidade: str
    nome: str
    configuracao: dict
    compartilhado: bool = False


class FiltroSalvoOut(BaseModel):
    id: uuid.UUID
    entidade: str
    nome: str
    configuracao: dict
    compartilhado: bool
    created_at: str


@router.get("/saved-filters/{entidade}", response_model=list[FiltroSalvoOut])
async def listar_filtros(
    entidade: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    return (
        await db.execute(
            select(FiltroSalvo).where(
                FiltroSalvo.tenant_id == tenant_id,
                FiltroSalvo.entidade == entidade,
                (FiltroSalvo.user_id == user.id) | (FiltroSalvo.compartilhado == True),
            ).order_by(FiltroSalvo.nome)
        )
    ).scalars().all()


@router.post("/saved-filters/{entidade}", response_model=FiltroSalvoOut)
async def salvar_filtro(
    entidade: str,
    payload: FiltroSalvoCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    f = FiltroSalvo(
        tenant_id=tenant_id,
        user_id=user.id,
        entidade=entidade,
        nome=payload.nome,
        configuracao=payload.configuracao,
        compartilhado=payload.compartilhado,
    )
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return f


@router.delete("/saved-filters/{filtro_id}", status_code=204)
async def deletar_filtro(
    filtro_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ALL),
):
    f = (
        await db.execute(
            select(FiltroSalvo).where(
                FiltroSalvo.id == filtro_id,
                FiltroSalvo.tenant_id == tenant_id,
                FiltroSalvo.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404)
    await db.delete(f)
    await db.commit()
