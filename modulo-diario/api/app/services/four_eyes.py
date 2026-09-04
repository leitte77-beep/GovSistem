"""Configurable four-eyes (segregation of duties) policy.

When ``four_eyes_required`` is enabled, the same user cannot perform both
halves of a critical pair (e.g. create+approve, approve+publish, sign+create).
Rules are data-driven (``FOUR_EYES_RULES``) rather than hardcoded by role name.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# Canonical rules: keyed by a label; each rule defines an actor field and a
# forbidden-same-actor field controller must pass as "current actor".
FOUR_EYES_RULES: dict[str, dict[str, str]] = {
    "CREATE_APPROVE": {
        "label": "Quem cria a matéria não pode aprová-la",
        "actor": "creator", "other": "approver",
    },
    "APPROVE_PUBLISH": {
        "label": "Quem aprova a matéria não pode publicar a edição",
        "actor": "approver", "other": "publisher",
    },
    "SIGN_CREATE": {
        "label": "Quem cria a edição não pode assiná-la",
        "actor": "creator", "other": "signer",
    },
    "SIGN_PUBLISH": {
        "label": "Quem assina a edição não pode publicá-la",
        "actor": "signer", "other": "publisher",
    },
}


class FourEyesService:
    """Evaluates segregation-of-duties rules for an operation."""

    def __init__(self, config: dict | None = None) -> None:
        self._config = config or {}

    @property
    def enabled(self) -> bool:
        return bool(self._config.get("four_eyes_required", settings.FOUR_EYES_REQUIRED))

    def config_allows_admin_bypass(self) -> bool:
        """Express administrative exemption: admins may run a single-user flow."""
        return bool(self._config.get("four_eyes_admin_bypass", True))

    def check(self, actor_id: uuid.UUID, other_id: uuid.UUID | None, rule: str) -> None:
        """Raise 403 if the same user would perform both halves of ``rule``."""
        if not self.enabled or not other_id:
            return
        if actor_id == other_id:
            label = FOUR_EYES_RULES.get(rule, {}).get("label", rule)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Segregação de funções (four eyes): {label}.",
            )

    def check_pair(self, actor_id: uuid.UUID, other_id: uuid.UUID | None, rules: list[str]) -> None:
        for rule in rules:
            self.check(actor_id, other_id, rule)
