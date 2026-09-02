"""Public document integrity helpers (Fase 2).

Deterministic canonical hashing for a published matter and normalization of
public verification codes. These helpers are DB-free and unit-testable.

Important: a matter hash here is an INTEGRITY digest over the frozen canonical
content — it is NOT an independent digital signature. Legally, the signature is
at edition level; the matter digest proves that "this matter integrates the
signed edition X". It must never be described as a per-matter signature.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from typing import Any, Mapping

# ── Public verification code normalization ──────────────────────────────────
# Existing edition codes look like "20260023-296CD414". Input from a citizen
# may carry spaces/lowercase/dash variants, so we normalize before lookup.


def normalize_public_code(raw: str | None) -> str:
    """Uppercase, strip surrounding spaces and squeeze inner whitespace.

    Dashes are preserved (they are part of the public code). A code entered
    without its dash is normalized but MUST still be matched against the
    stored code exactly after this normalization.
    """
    if raw is None:
        return ""
    return re.sub(r"\s+", "", raw).strip().upper()


def codes_match(stored: str | None, input_code: str | None) -> bool:
    if not stored or not input_code:
        return False
    # exact (case-insensitive) OR dash-insensitive (allows typing without '-')
    s = normalize_public_code(stored)
    i = normalize_public_code(input_code)
    if s == i:
        return True
    return s.replace("-", "") == i.replace("-", "")


# ── Canonicalization / integrity hash for a matter ──────────────────────────


def _to_iso(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _clean_text(value: Any) -> str:
    return (value or "").replace("\r\n", "\n").strip()


def canonical_matter_core(matter: Mapping[str, Any]) -> Mapping[str, Any]:
    """Deterministic canonical map describing one published matter.

    Takes a dict-like matter (a frozen snapshot item, or a Matter ORM row via a
    mapping). Only fields that define the act are included. The canonical
    content is the semantic JSON when present, otherwise the HTML; HTML markup
    is not itself normalized here because the frozen snapshot already fixes it.
    """
    semantic = matter.get("semantic")
    if semantic is None and "semantic_content" in matter:
        semantic = matter.get("semantic_content")
    html = _clean_text(matter.get("content_html"))
    content_json = matter.get("content_json")
    summary = _clean_text(matter.get("summary"))

    if semantic is not None:
        canonical_content = {"semantic": semantic}
    elif content_json is not None:
        canonical_content = {"content_json": content_json}
    else:
        canonical_content = {"content_html": html}

    return {
        "matter_id": str(matter.get("id") or matter.get("matter_id") or ""),
        "organization_id": str(matter.get("organization_id") or matter.get("org_id") or ""),
        "act_type": matter.get("act_type_name")
        or matter.get("act_type")
        or str(matter.get("act_type_id") or ""),
        "act_number": matter.get("act_number"),
        "act_year": matter.get("act_year"),
        "act_date": _to_iso(matter.get("act_date")),
        "title": _clean_text(matter.get("title")),
        "summary": summary,
        "content": canonical_content,
    }


def matter_content_hash(matter: Mapping[str, Any]) -> str:
    """SHA-256 over the canonical matter core.

    Deterministic for identical canonical content and stable under tenant: the
    canonical map does not include tenant name/domain, only the organization_id
    (used to keep tenants isolated). Encoding is UTF-8 with stable JSON keys.
    """
    canonical = canonical_matter_core(matter)
    payload = json.dumps(
        canonical,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def one_char_diff_hashes(a: Mapping[str, Any], b: Mapping[str, Any]) -> bool:
    """Convenience: True when two matters hash differently (integrity check)."""
    return matter_content_hash(a) != matter_content_hash(b)
