"""Authentication and authorization for external GovSistem integrations.

External systems authenticate with a scoped API key (``X-Integration-Key``),
resolved against ``integration_clients`` by SHA-256 hash. A client may only
exercise the scopes it was granted; it can NEVER publish an edition directly.
"""

from __future__ import annotations

import hashlib
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.integration_client import IntegrationClient

# Scopes an integration may hold. Publication is deliberately excluded.
ALLOWED_SCOPES = {
    "matter:create",
    "matter:read",
    "matter:submit",
}

FORBIDDEN_SCOPES = {"edition:publish", "edition:sign", "certificate:manage"}


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def get_integration_client(
    x_integration_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> IntegrationClient:
    if not x_integration_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta a chave de integração (X-Integration-Key).",
        )
    result = await db.execute(
        select(IntegrationClient).where(
            IntegrationClient.hashed_api_key == hash_api_key(x_integration_key),
            IntegrationClient.status == "active",
        )
    )
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cliente de integração inválido ou inativo.",
        )
    return client


def require_integration_scope(scope: str):
    async def _check(
        client: IntegrationClient = Depends(get_integration_client),
    ) -> IntegrationClient:
        if scope in FORBIDDEN_SCOPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Escopo '{scope}' não é permitido para integrações.",
            )
        if not client.has_scope(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cliente sem permissão para o escopo '{scope}'.",
            )
        return client

    return _check
