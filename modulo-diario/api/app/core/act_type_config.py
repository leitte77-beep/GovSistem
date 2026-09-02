"""Central rules for per-act-type configuration (admin-friendly, never raw JSON).

A single ActType ``config`` dict holds typed options plus a list of dynamic
(extra) fields. Nothing here executes user-provided templates: title patterns
only allow a fixed allow-list of placeholders, and field values are validated
against declared field types. This module is the single source of truth shared
by the admin endpoint (save/validate) and the matter endpoints (validate values).
"""

from __future__ import annotations

import datetime
import re
from typing import Any

# ── Allow-lists ──────────────────────────────────────────────────────────────
TITLE_PLACEHOLDERS = {"type", "number", "year", "date"}
TITLE_PATTERN_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
ANY_BRACE_RE = re.compile(r"\{([^{}]*)\}")

DYNAMIC_FIELD_TYPES = {
    "text",
    "textarea",
    "number",
    "date",
    "currency",
    "cpf_cnpj",
    "select",
    "boolean",
}

FIELD_KEY_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")

# Defaults used when an ActType has no config yet (fully permissive, matching
# the legacy behaviour where number/year/responsible were optional).
DEFAULT_CONFIG: dict[str, Any] = {
    "number_required": False,
    "year_required": False,
    "date_required": False,
    "responsible_required": False,
    "allow_free_responsible": True,
    "title_pattern": None,
    "title_uppercase": False,
    "dynamic_fields": [],
}


class ActTypeConfigError(ValueError):
    """Raised when a config is structurally invalid (human-facing message)."""


# ── Normalization / validation of the stored config ─────────────────────────


def _bool(v: Any) -> bool:
    return bool(v)


def _normalize_field(field: Any) -> dict:
    if not isinstance(field, dict):
        raise ActTypeConfigError("Cada campo adicional deve ser um objeto.")
    key = (field.get("key") or "").strip()
    label = (field.get("label") or "").strip()
    ftype = (field.get("type") or "").strip()

    if not key:
        raise ActTypeConfigError("Todo campo adicional precisa de uma chave (key).")
    if not FIELD_KEY_RE.match(key):
        raise ActTypeConfigError(
            f"Chave inválida '{key}': use apenas letras, números e sublinhado, "
            "começando por letra (ex.: cnpj_contratado)."
        )
    if not label:
        raise ActTypeConfigError(f"Campo '{key}' precisa de um nome (label).")
    if ftype not in DYNAMIC_FIELD_TYPES:
        raise ActTypeConfigError(
            f"Campo '{key}' tem tipo inválido '{ftype}'. Permitidos: "
            + ", ".join(sorted(DYNAMIC_FIELD_TYPES))
            + "."
        )

    options = field.get("options") or []
    if ftype == "select":
        if not isinstance(options, list) or not options:
            raise ActTypeConfigError(
                f"Campo '{key}' do tipo select precisa de ao menos uma opção."
            )
        options = [str(o).strip() for o in options if str(o).strip()]

    return {
        "key": key,
        "label": label,
        "type": ftype,
        "required": _bool(field.get("required")),
        "placeholder": (field.get("placeholder") or "").strip() or None,
        "help": (field.get("help") or "").strip() or None,
        "options": options,
    }


def normalize_config(raw: dict | None) -> dict:
    """Validate and normalize a user-provided config dict (never raw-JSON free).

    Raises :class:`ActTypeConfigError` on the first structural problem.
    """
    cfg = dict(DEFAULT_CONFIG)
    raw = raw or {}

    cfg["number_required"] = _bool(raw.get("number_required"))
    cfg["year_required"] = _bool(raw.get("year_required"))
    cfg["date_required"] = _bool(raw.get("date_required"))
    cfg["responsible_required"] = _bool(raw.get("responsible_required"))
    cfg["allow_free_responsible"] = _bool(
        raw.get("allow_free_responsible", True)
    )
    cfg["title_uppercase"] = _bool(raw.get("title_uppercase"))

    pattern = raw.get("title_pattern")
    if pattern is not None and str(pattern).strip():
        validate_title_pattern(str(pattern))
        cfg["title_pattern"] = str(pattern).strip()
    else:
        cfg["title_pattern"] = None

    dynamic_raw = raw.get("dynamic_fields") or []
    if not isinstance(dynamic_raw, list):
        raise ActTypeConfigError("Campos adicionais deve ser uma lista.")
    fields: list[dict] = []
    seen_keys: set[str] = set()
    for f in dynamic_raw:
        norm = _normalize_field(f)
        if norm["key"] in seen_keys:
            raise ActTypeConfigError(
                f"Chave de campo duplicada: '{norm['key']}'."
            )
        seen_keys.add(norm["key"])
        fields.append(norm)
    cfg["dynamic_fields"] = fields
    return cfg


def validate_title_pattern(pattern: str) -> None:
    """Validate a title template: only allow-list placeholders, nothing else.

    Disallows arbitrary placeholders and anything that could look like code.
    Every ``{...}`` group must contain exactly one allowed token and braces must
    be balanced (e.g. ``PORTARIA Nº {number}/{year}``).
    """
    if pattern.count("{") != pattern.count("}"):
        raise ActTypeConfigError(
            "Padrão de título tem chaves desbalanceadas."
        )
    for content in ANY_BRACE_RE.findall(pattern):
        if content.strip() not in TITLE_PLACEHOLDERS:
            raise ActTypeConfigError(
                f"Placeholder inválido '{{{content}}}' no padrão de título. "
                f"Permitidos: {', '.join('{' + t + '}' for t in sorted(TITLE_PLACEHOLDERS))}."
            )


def format_act_title(
    pattern: str | None,
    *,
    type_name: str,
    number: str | int | None,
    year: int | None,
    act_date: datetime.date | None,
) -> str | None:
    """Render a title from a validated pattern (only known placeholders)."""
    if not pattern or not str(pattern).strip():
        return None
    tokens = TITLE_PATTERN_RE.findall(pattern)
    for token in tokens:
        if token not in TITLE_PLACEHOLDERS:
            # Defensive: normalized config never stores unknown tokens.
            raise ActTypeConfigError(
                f"Padrão de título contém placeholder desconhecido '{{{token}}}'."
            )

    def _safe(text: str) -> str:
        return re.sub(r"[\r\n]", " ", text)

    value_map: dict[str, str] = {
        "type": _safe(type_name or ""),
        "number": str(number) if number is not None and str(number).strip() else "",
        "year": str(year) if year is not None else "",
        "date": act_date.isoformat() if act_date else "",
    }
    title = pattern
    for token, value in value_map.items():
        title = title.replace("{" + token + "}", value)
    return title


# ── Helpers to read a stored config ─────────────────────────────────────────


def config_flag(config: dict | None, name: str, default: bool = False) -> bool:
    return bool((config or {}).get(name, default))


def config_dynamic_fields(config: dict | None) -> list[dict]:
    fields = (config or {}).get("dynamic_fields")
    return fields if isinstance(fields, list) else []


# ── Validation of dynamic field values against the config ───────────────────


def validate_dynamic_values(
    config: dict | None,
    values: dict | None,
) -> list[dict[str, str]]:
    """Validate submitted per-type field values.

    Returns a list of structured errors ``[{"field", "message"}]``. Empty list
    means valid. Unknown keys are tolerated (never silently dropped as errors
    here) but only configured fields are validated.
    """
    errors: list[dict[str, str]] = []
    fields = config_dynamic_fields(config)
    values = values or {}

    for field in fields:
        key = field["key"]
        present = key in values and values[key] is not None and values[key] != ""
        if field.get("required") and not present:
            errors.append(
                {"field": key, "message": f"Campo obrigatório '{field['label']}' não preenchido."}
            )
            continue
        if not present:
            continue

        value = values[key]
        ftype = field["type"]
        message = _check_field_value(ftype, value, field)
        if message:
            errors.append({"field": key, "message": message})

    return errors


def _check_field_value(ftype: str, value: Any, field: dict) -> str | None:
    label = field.get("label", field.get("key", "campo"))
    if ftype in ("number", "currency"):
        if isinstance(value, bool) or not _is_number(value):
            return f"Campo '{label}' deve ser numérico."
        if ftype == "currency" and float(value) < 0:
            return f"Campo '{label}' não pode ser negativo."
        return None
    if ftype == "date":
        if not _is_iso_date(value):
            return f"Campo '{label}' deve ser uma data válida (AAAA-MM-DD)."
        return None
    if ftype == "boolean":
        if not isinstance(value, bool) and value not in (0, 1, "true", "false", "True", "False"):
            return f"Campo '{label}' deve ser verdadeiro ou falso."
        return None
    if ftype == "cpf_cnpj":
        cleaned = str(value).replace(".", "").replace("/", "").replace("-", "").replace(" ", "")
        if not cleaned.isdigit() or len(cleaned) not in (11, 14):
            return f"Campo '{label}' deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)."
        return None
    if ftype == "select":
        options = field.get("options") or []
        if str(value) not in [str(o) for o in options]:
            return f"Campo '{label}' tem opção inválida."
        return None
    # text / textarea: no extra checks (server already truncates/validates length)
    return None


def _is_number(value: Any) -> bool:
    if isinstance(value, (int, float)):
        return not isinstance(value, bool)
    if isinstance(value, str):
        try:
            float(value.replace(",", "."))
            return True
        except ValueError:
            return False
    return False


def _is_iso_date(value: Any) -> bool:
    if isinstance(value, datetime.date) and not isinstance(value, datetime.datetime):
        return True
    if isinstance(value, str):
        try:
            datetime.date.fromisoformat(value)
            return True
        except ValueError:
            return False
    return False
