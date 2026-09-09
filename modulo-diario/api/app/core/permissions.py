"""Granular permission service (RBAC-for-actions).

Roles (AUTOR, REVISOR, DIAGRAMADOR, ASSINADOR, PUBLICADOR, AUDITOR, ADMIN,
SUPER_ADMIN, CONSULTA) aggregate permissions. This service maps the canonical
permission set (see ``ALL_PERMISSIONS``) and resolves whether a user, given
their roles, can perform an action. Controllers should prefer
``require_permission`` over ad-hoc role checks so authorization is data-driven
rather than role-name based.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.models.user import User

# Canonical permissions.
ALL_PERMISSIONS = {
    "matter.create",
    "matter.read",
    "matter.edit_own",
    "matter.edit_any",
    "matter.submit",
    "matter.review",
    "matter.approve",
    "matter.reject",
    "edition.create",
    "edition.edit",
    "edition.compose",
    "edition.review",
    "edition.close",
    "edition.sign",
    "edition.publish",
    "edition.schedule",
    "certificate.read",
    "certificate.manage",
    "audit.read",
    "user.manage",
    "role.manage",
    "settings.manage",
    "integration.matter.create",
    # AI (Diário Oficial) — centralized DeepSeek integration.
    # ``ai.manage``: admin the org AI settings/config (incl. API key).
    # ``ai.run``:   trigger generation/extraction/classification operations.
    # ``ai.audit``: read AI execution & usage logs.
    "ai.manage",
    "ai.run",
    "ai.audit",
    # Document models (modelos documentais).
    # ``document_model.manage``: create/edit/import/version document models.
    # ``document_model.approve``: approve a version (activates, becomes immutable).
    # ``document_model.use``: generate drafts from an approved document model.
    "document_model.manage",
    "document_model.approve",
    "document_model.use",
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "SUPER_ADMIN": set(ALL_PERMISSIONS),
    "ADMIN": set(ALL_PERMISSIONS),
    "AUTOR": {
        "matter.create",
        "matter.read",
        "matter.edit_own",
        "matter.submit",
        "document_model.manage",
        "document_model.use",
    },
    "REVISOR": {
        "matter.read",
        "matter.review",
        "matter.approve",
        "matter.reject",
        "document_model.approve",
    },
    "DIAGRAMADOR": {"edition.create", "edition.edit", "edition.compose", "edition.review"},
    "ASSINADOR": {"certificate.read", "edition.sign"},
    "PUBLICADOR": {"edition.publish", "edition.schedule", "edition.close"},
    "AUDITOR": {"audit.read", "ai.audit", "matter.read"},
    "CONSULTA": {"matter.read"},
}


def permissions_for_roles(role_names: set[str]) -> set[str]:
    """Union of permissions granted by a set of role names."""
    perms: set[str] = set()
    for r in role_names:
        perms |= ROLE_PERMISSIONS.get(r, set())
    return perms


class PermissionService:
    """Resolves a user's effective permissions from their roles."""

    def __init__(self, user: User) -> None:
        self._user = user

    def role_names(self) -> set[str]:
        return {ur.role.name for ur in (self._user.user_roles or [])}

    def has(self, permission: str) -> bool:
        return permission in permissions_for_roles(self.role_names())

    def require(self, permission: str) -> None:
        if not self.has(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permission: {permission}",
            )


def require_permission(*permissions: str):
    """Dependency factory granting access if the user holds ANY given permission."""

    async def _check(user: User = Depends(get_current_user)) -> User:
        svc = PermissionService(user)
        if not any(svc.has(p) for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _check


def require_permission_all(*permissions: str):
    """Dependency factory granting access only if the user holds ALL permissions."""

    async def _check(user: User = Depends(get_current_user)) -> User:
        svc = PermissionService(user)
        if not all(svc.has(p) for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _check
