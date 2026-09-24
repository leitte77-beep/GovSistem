"""Human-readable slugs for published matters.

A citizen should be able to open ``/materias/decreto-214-2026`` instead of an
opaque UUID.

Immutability model
------------------
The slug is generated once and frozen on the *first publication* -- not merely
while the status is ``published``. ``matters.slug_locked_at`` is the permanent
marker: after it is set (retified, superseded, archived, ...) the public URL can
never change again. The application guard here is backed by a PostgreSQL trigger
(see the ``add_matter_slug_immutability`` migration) so even a direct ``UPDATE``
is rejected.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

_SLUG_RE = re.compile(r"^(.+?)-(\d+)(?:-(\d{4}))?$")
_MAX_LEN = 140


class PublishedMatterSlugImmutableError(ValueError):
    """Raised when a change would move the public URL of a published matter.

    Signals to callers (API layers) that the request is invalid: the matter was
    already published at least once and its slug is permanently frozen.
    """


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def is_normalized_slug(value: str | None) -> bool:
    return bool(value) and value == slugify(value)


def _publication_prefix(matter) -> str:
    ptype = getattr(matter, "publication_type", None)
    if ptype == "rectification":
        return "retificacao-"
    if ptype == "republication":
        return "republicacao-"
    return ""


def _computed_base(matter, act_type=None) -> str:
    prefix = _publication_prefix(matter)
    type_name = (
        getattr(act_type, "name", None)
        or getattr(matter, "document_type", None)
        or ""
    )
    number = getattr(matter, "act_number", None)
    year = getattr(matter, "act_year", None)
    if type_name and number:
        slug = slugify(prefix + f"{type_name}-{number}" + (f"-{year}" if year else ""))
        if slug:
            return slug[:_MAX_LEN]
    fallback = slugify(prefix + str(getattr(matter, "title", None) or ""))
    if fallback:
        return fallback[:_MAX_LEN]
    return f"materia-{str(getattr(matter, 'id', '') or uuid.uuid4().hex)[:8]}"


def matter_slug(matter, act_type=None) -> str:
    """Return the stored slug when present, else a deterministic computed one."""
    stored = getattr(matter, "slug", None)
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    return _computed_base(matter, act_type)


async def generate_unique_slug(
    db,
    organization_id: uuid.UUID,
    matter,
    act_type=None,
    *,
    exclude_id: uuid.UUID | None = None,
) -> str:
    """Deterministic, collision-free slug within the organization.

    Uses ``-2``, ``-3`` ... suffixes on collision. The unique constraint is the
    final backstop if two requests race.
    """
    from app.models.matter import Matter

    base = _computed_base(matter, act_type)
    candidate = base
    suffix = 2
    while True:
        query = select(Matter.id).where(
            Matter.organization_id == organization_id,
            Matter.slug == candidate,
        )
        if exclude_id is not None:
            query = query.where(Matter.id != exclude_id)
        if (await db.execute(query.limit(1))).first() is None:
            return candidate
        suffix_text = f"-{suffix}"
        candidate = base[: _MAX_LEN - len(suffix_text)] + suffix_text
        suffix += 1


def slug_change_allowed(matter, new_slug: str | None) -> bool:
    """Whether ``new_slug`` may replace the current one.

    Only matters whose slug was already locked (published at least once) are
    protected; an unpublished matter may still create/correct its slug.
    """
    if getattr(matter, "slug_locked_at", None) is None:
        return True
    current = getattr(matter, "slug", None)
    return (new_slug or None) == (current or None)


def assert_slug_change_allowed(matter, new_slug: str | None) -> None:
    """Raise ``PublishedMatterSlugImmutableError`` if the change is forbidden."""
    if slug_change_allowed(matter, new_slug):
        return
    raise PublishedMatterSlugImmutableError(
        "O slug de uma matéria já publicada é imutável: "
        f"{getattr(matter, 'slug', None)!r} -> {new_slug!r}. "
        "Use alias/redirecionamento (LegacyUrlMap) em vez de reescrever a URL."
    )


def lock_slug(
    matter,
    reason: str = "first_publication",
    *,
    now: datetime | None = None,
) -> None:
    """Freeze the slug permanently (idempotent)."""
    if getattr(matter, "slug_locked_at", None) is not None:
        return
    matter.slug_locked_at = now or datetime.now(timezone.utc)
    matter.slug_locked_reason = reason


def parse_slug(slug: str) -> tuple[str, str, int | None] | None:
    """Split a slug into ``(type_token, number, year)`` (year may be None)."""
    match = _SLUG_RE.match((slug or "").strip().lower())
    if not match:
        return None
    type_token, number, year = match.group(1), match.group(2), match.group(3)
    return type_token, number, int(year) if year else None
