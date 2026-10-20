import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.authority import Authority
from app.models.org_unit import OrgUnit
from app.models.user import User
from app.schemas.authority import AuthorityCreate, AuthorityOut, AuthorityUpdate

router = APIRouter(tags=["authorities"])


async def _get_authority_or_404(
    authority_id: uuid.UUID, db: AsyncSession, org_id: uuid.UUID
) -> Authority:
    result = await db.execute(
        select(Authority)
        .where(
            Authority.id == authority_id,
            Authority.organization_id == org_id,
            Authority.deleted_at.is_(None),
        )
        .options(selectinload(Authority.org_unit))
    )
    authority = result.scalar_one_or_none()
    if authority is None:
        raise HTTPException(404, "Authority not found")
    return authority


async def _reload_with_unit(db: AsyncSession, authority_id: uuid.UUID) -> Authority:
    """Recarrega a autoridade com a unidade já carregada.

    Ler ``authority.org_unit`` depois do commit dispara carga preguiçosa, que
    a sessão assíncrona não permite (MissingGreenlet → 500). O registro era
    gravado mas a tela recebia erro — e quem tentava de novo duplicava.
    """
    result = await db.execute(
        select(Authority)
        .where(Authority.id == authority_id)
        .options(selectinload(Authority.org_unit))
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


def _to_out(a: Authority) -> AuthorityOut:
    return AuthorityOut(
        id=a.id,
        name=a.name,
        role=a.role,
        org_unit_id=a.org_unit_id,
        org_unit_name=a.org_unit.name if a.org_unit else None,
        is_active=a.is_active,
        valid_from=a.valid_from,
        valid_until=a.valid_until,
        notes=a.notes,
        created_at=getattr(a, "created_at", None),
    )


@router.get("/authorities", response_model=list[AuthorityOut])
async def list_authorities(
    active_only: bool = False,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Authorities of the current organization.

    ``active_only`` (default False) returns every non-deleted authority. Authors
    pick an active authority; pass ``active_only=true`` from the selector.
    """
    q = select(Authority).where(
        Authority.organization_id == user.organization_id,
        Authority.deleted_at.is_(None),
    )
    if active_only:
        q = q.where(Authority.is_active == True)  # noqa: E712
    if search:
        like = f"%{search}%"
        q = q.where(Authority.name.ilike(like) | Authority.role.ilike(like))
    q = q.order_by(Authority.name)
    result = await db.execute(q.options(selectinload(Authority.org_unit)))
    return [_to_out(a) for a in result.scalars().all()]


@router.post("/authorities", response_model=AuthorityOut, status_code=201)
async def create_authority(
    body: AuthorityCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    if body.org_unit_id:
        result = await db.execute(
            select(OrgUnit).where(
                OrgUnit.id == body.org_unit_id,
                OrgUnit.organization_id == user.organization_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(404, "OrgUnit not found")

    authority = Authority(
        organization_id=user.organization_id,
        name=body.name,
        role=body.role,
        org_unit_id=body.org_unit_id,
        is_active=body.is_active,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        notes=body.notes,
    )
    db.add(authority)
    await db.commit()
    return _to_out(await _reload_with_unit(db, authority.id))


@router.patch("/authorities/{authority_id}", response_model=AuthorityOut)
async def update_authority(
    authority_id: uuid.UUID,
    body: AuthorityUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    authority = await _get_authority_or_404(authority_id, db, user.organization_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(422, "Name cannot be empty")
        authority.name = name
    if body.role is not None:
        authority.role = body.role
    if body.org_unit_id is not None:
        result = await db.execute(
            select(OrgUnit).where(
                OrgUnit.id == body.org_unit_id,
                OrgUnit.organization_id == user.organization_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(404, "OrgUnit not found")
        authority.org_unit_id = body.org_unit_id
    if body.is_active is not None:
        authority.is_active = body.is_active
    if body.valid_from is not None:
        authority.valid_from = body.valid_from
    if body.valid_until is not None:
        authority.valid_until = body.valid_until
    if body.notes is not None:
        authority.notes = body.notes

    await db.commit()
    return _to_out(await _reload_with_unit(db, authority_id))


@router.delete("/authorities/{authority_id}", status_code=204)
async def delete_authority(
    authority_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    from datetime import datetime, timezone

    authority = await _get_authority_or_404(authority_id, db, user.organization_id)
    authority.is_active = False
    authority.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
