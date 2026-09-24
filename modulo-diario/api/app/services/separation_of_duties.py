"""Central segregation-of-duties (four-eyes) enforcement.

One entry point so every critical action uses the same policy instead of
re-implementing the admin-bypass logic endpoint by endpoint. The rules live in
``four_eyes.FOUR_EYES_RULES``; this module resolves the tenant policy and
applies it.
"""

from __future__ import annotations

import uuid

from app.core.permissions import PermissionService
from app.services.four_eyes import FOUR_EYES_RULES, FourEyesService

__all__ = ["enforce", "enforce_all", "rules"]


def _is_privileged(user) -> bool:
    return bool(PermissionService(user).role_names() & {"SUPER_ADMIN", "ADMIN"})


def enforce(user, *, other_id: uuid.UUID | None, rule: str) -> None:
    """Raise 403 when the same actor would perform both halves of ``rule``.

    Honors the administrative exemption (``four_eyes_admin_bypass``) exactly
    like the matter-approval flow.
    """
    service = FourEyesService()
    if _is_privileged(user) and service.config_allows_admin_bypass():
        return
    service.check(user.id, other_id, rule)


def enforce_all(user, *, other_id: uuid.UUID | None, rules: list[str]) -> None:
    for rule in rules:
        enforce(user, other_id=other_id, rule=rule)


def rules() -> dict[str, dict[str, str]]:
    return dict(FOUR_EYES_RULES)
