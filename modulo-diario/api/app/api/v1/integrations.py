"""External integration API (GovSistem modules push matters).

``POST /api/v1/integrations/matters`` lets an authorized external system
create a matter (as DRAFT/SUBMITTED) that then flows through the human
editorial workflow. An integration can NEVER publish an edition directly.

Idempotency: the caller sends an ``Idempotency-Key`` header. Replaying the
same key with the same body returns the original matter (or 409 if the body
differs), so retries never create duplicates.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.html_sanitizer import extract_plain_text, sanitize_html
from app.core.integration_auth import require_integration_scope
from app.models.act_type import ActType
from app.models.enums import MatterStatus
from app.models.integration_client import IntegrationClient
from app.models.integration_idempotency_key import IntegrationIdempotencyKey
from app.models.matter import Matter
from app.models.org_unit import OrgUnit
from app.models.user import User
from app.schemas.integration import IntegrationMatterCreate

router = APIRouter(tags=["integrations"])


def _body_hash(body: dict) -> str:
    import json

    return hashlib.sha256(
        json.dumps(body, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


@router.post("/integrations/matters", status_code=201)
async def integration_create_matter(
    body: IntegrationMatterCreate,
    request: Request,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    client: IntegrationClient = Depends(
        require_integration_scope("matter:create")
    ),
    db: AsyncSession = Depends(get_db),
):
    # Idempotency gate.
    if idempotency_key:
        existing = await db.execute(
            select(IntegrationIdempotencyKey).where(
                IntegrationIdempotencyKey.integration_client_id == client.id,
                IntegrationIdempotencyKey.idempotency_key == idempotency_key,
            )
        )
        idemp = existing.scalar_one_or_none()
        if idemp is not None:
            req_hash = _body_hash(body.model_dump())
            if idemp.request_hash != req_hash:
                raise HTTPException(
                    409,
                    "Idempotency-Key já usada com um corpo diferente (conflito).",
                )
            return {"id": str(idemp.result_entity_id), "duplicate": True, "recovered": True}

    org_id = client.organization_id

    # Resolve the acting human server that authors the matter in the workflow.
    author = (
        await db.execute(
            select(User).where(
                User.email == body.author_email,
                User.organization_id == org_id,
                User.deleted_at.is_(None),
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if author is None:
        raise HTTPException(
            422,
            f"author_email '{body.author_email}' não é um usuário ativo do órgão.",
        )

    act_type = (await db.execute(
        select(ActType).where(ActType.id == body.act_type_id)
    )).scalar_one_or_none()
    if act_type is None:
        raise HTTPException(422, "ActType não encontrado.")
    if body.org_unit_id:
        ou = (await db.execute(
            select(OrgUnit).where(OrgUnit.id == body.org_unit_id, OrgUnit.organization_id == org_id)
        )).scalar_one_or_none()
        if ou is None:
            raise HTTPException(422, "OrgUnit não encontrado.")

    plain_text = extract_plain_text(body.content_html)
    sanitized = sanitize_html(body.content_html)

    matter = Matter(
        organization_id=org_id,
        org_unit_id=body.org_unit_id,
        act_type_id=body.act_type_id,
        title=body.title.strip(),
        summary=body.summary.strip() if body.summary else None,
        content_html=sanitized,
        content_json=body.content_json,
        content_mode=body.content_mode or "rich_text",
        plain_text=plain_text,
        status=MatterStatus.DRAFT,  # integração não publica; entra no workflow humano
        author_id=author.id,
        act_number=body.act_number.strip() if body.act_number else None,
        act_year=body.act_year,
        act_date=body.act_date,
        metadata_json=body.metadata or {},
        publication_type=body.publication_type or "normal",
        references_matter_id=body.references_matter_id,
    )
    db.add(matter)
    await db.flush()

    # Record the idempotency key so a replay returns the same matter.
    if idempotency_key:
        idemp = IntegrationIdempotencyKey(
            integration_client_id=client.id,
            organization_id=org_id,
            idempotency_key=idempotency_key,
            request_hash=_body_hash(body.model_dump()),
            result_entity_id=matter.id,
        )
        db.add(idemp)

    client.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "id": str(matter.id),
        "title": matter.title,
        "status": matter.status.value,
        "message": "Matéria criada e enfileirada para o workflow editorial.",
    }
