from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.enums import MatterRelationType, MatterStatus
from app.models.matter import Matter
from app.models.matter_relation import MatterRelation
from app.models.user import User
from app.services.matter_relations import (
    RelationError,
    create_relation,
    delete_relation,
    legal_status_flags,
    list_relations,
    list_relations_for_matter,
    relation_public,
)

router = APIRouter(tags=["matter-relations"])


class RelationCreate(BaseModel):
    source_matter_id: uuid.UUID
    target_matter_id: uuid.UUID
    relation_type: str
    notes: Optional[str] = None


class RelationIn(BaseModel):
    id: uuid.UUID
    source_matter_id: uuid.UUID
    target_matter_id: uuid.UUID
    source_title: Optional[str] = None
    target_title: Optional[str] = None
    relation_type: str
    label: str
    notes: Optional[str]
    created_at: Optional[str]


class LegalStatusOut(BaseModel):
    flags: dict[str, RelationIn | None]


def _relation_to_in(rel: MatterRelation) -> RelationIn:
    return RelationIn(**relation_public(rel))


def _org_required(user: User) -> uuid.UUID:
    if user.organization_id is None:
        raise HTTPException(400, "Usuário sem organização associada")
    return user.organization_id


@router.get("/matter-relations")
async def api_list_relations(
    matter_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    org_id = _org_required(user)
    if matter_id:
        rels = await list_relations_for_matter(db, org_id, matter_id)
        return {
            "outgoing": [_relation_to_in(r) for r in rels["outgoing"]],
            "incoming": [_relation_to_in(r) for r in rels["incoming"]],
        }
    return [_relation_to_in(r) for r in await list_relations(db, org_id)]


@router.get("/matter-relations/{matter_id}/legal-status")
async def api_matter_legal_status(
    matter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    org_id = _org_required(user)
    rels = await list_relations_for_matter(db, org_id, matter_id)
    flags = legal_status_flags(rels["incoming"])
    return {
        "flags": {
            key: (_relation_to_in(value) if value else None)
            for key, value in flags.items()
        }
    }


@router.get("/matter-relations/search-matters", response_model=list[dict])
async def search_published_matters(
    q: str = Query("", min_length=1),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search published matters of the tenant to pick relation endpoints."""
    org_id = _org_required(user)
    like = f"%{q}%"
    stmt = (
        select(Matter)
        .where(
            Matter.organization_id == org_id,
            Matter.status == MatterStatus.PUBLISHED.value,
            or_(
                Matter.title.ilike(like),
                Matter.summary.ilike(like),
                Matter.plain_text.ilike(like),
                Matter.act_number.ilike(like),
            ),
        )
        .order_by(Matter.published_at.desc())
        .limit(25)
    )
    result = await db.execute(stmt)
    return [
        {
            "id": str(m.id),
            "title": m.title,
            "summary": m.summary,
            "act_number": m.act_number,
            "act_year": m.act_year,
            "published_at": m.published_at.isoformat() if m.published_at else None,
        }
        for m in result.scalars().all()
    ]


@router.post("/matter-relations", response_model=RelationIn, status_code=201)
async def api_create_relation(
    body: RelationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    org_id = _org_required(user)
    try:
        rel_type = MatterRelationType(body.relation_type.lower())
    except ValueError:
        raise HTTPException(422, "relation_type inválido")

    # only published matters may be related
    ids = [body.source_matter_id, body.target_matter_id]
    result = await db.execute(
        select(Matter).where(
            Matter.id.in_(ids),
            Matter.organization_id == org_id,
            Matter.status == MatterStatus.PUBLISHED.value,
        )
    )
    found = {str(m.id) for m in result.scalars().all()}
    if len(found) != 2:
        raise HTTPException(
            422,
            "Ambas as publicações precisam existir e estar publicadas "
            "nesta organização.",
        )

    try:
        rel = await create_relation(
            db,
            organization_id=org_id,
            source_matter_id=body.source_matter_id,
            target_matter_id=body.target_matter_id,
            relation_type=rel_type,
            actor_id=user.id,
            notes=body.notes,
        )
    except RelationError as exc:
        raise HTTPException(422, str(exc))
    return _relation_to_in(rel)


@router.delete("/matter-relations/{relation_id}", status_code=204)
async def api_delete_relation(
    relation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    org_id = _org_required(user)
    try:
        await delete_relation(db, relation_id=relation_id, organization_id=org_id, actor_id=user.id)
    except RelationError as exc:
        raise HTTPException(404, str(exc))
