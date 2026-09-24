"""Feature flags for the semantic document engine (Fase 16).

Each flag can be enabled/disabled per tenant via ``system_settings`` (key prefix
``feature.``); the global key acts as the default for every tenant. The mature
engine flags (semantic document engine, public edition page) default to ON;
newer/experimental ones default to OFF. Disabling a flag fully restores the
legacy behavior; rollback never requires removing data.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import SystemSetting

DEFAULT_FLAGS = {
    # The deterministic semantic engine is production-ready: matter-as-blocks,
    # deterministic parsing, validation and integrity hashing.
    "semantic_document_engine_enabled": True,
    "public_edition_page_enabled": False,
    "template_builder_enabled": False,
    "ai_classification_enabled": False,
}


def flag_key(name: str, organization_id=None) -> str:
    key = f"feature.{name}"
    if organization_id is not None:
        key = f"feature.{name}.{organization_id}"
    return key


async def _read_bool(db: AsyncSession, key: str, default: bool) -> bool:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None or setting.value is None:
        return default
    return str(setting.value).strip().lower() in ("true", "1", "yes", "on")


async def is_feature_enabled(
    db: AsyncSession,
    name: str,
    organization_id=None,
    *,
    env_override: bool | None = None,
) -> bool:
    """Resolve a feature flag.

    Precedence (highest first):
      1. Explicit ``env_override`` (e.g. from app settings/environment).
      2. Per-tenant setting ``feature.<name>.<org_id>``.
      3. Global setting ``feature.<name>``.
      4. Default (OFF).
    """
    default = DEFAULT_FLAGS.get(name, False)

    if env_override is not None:
        return env_override

    if organization_id is not None:
        tenant_val = await _read_bool(
            db, flag_key(name, organization_id), default
        )
        # If tenant explicitly configured, honor it (even if false).
        result = await db.execute(
            select(SystemSetting).where(
                SystemSetting.key == flag_key(name, organization_id)
            )
        )
        if result.scalar_one_or_none() is not None:
            return tenant_val

    return await _read_bool(db, flag_key(name), default)


async def set_feature_enabled(
    db: AsyncSession,
    name: str,
    enabled: bool,
    organization_id=None,
) -> None:
    key = flag_key(name, organization_id)
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        setting = SystemSetting(key=key, value="true" if enabled else "false")
        db.add(setting)
    else:
        setting.value = "true" if enabled else "false"
    await db.commit()


def all_flags() -> dict[str, bool]:
    return dict(DEFAULT_FLAGS)
