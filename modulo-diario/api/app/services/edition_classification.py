"""Deterministic classification/ordering of matters into edition sections.

Diários Oficiais are organized in editorial sections (Atos do Executivo,
Portarias, Licitações, Contratos, ...). This module classifies a matter by its
act type (with a per-act-type override in ``ActType.config["section"]``) and
provides a stable sort key so an edition can be auto-assembled without the
operator dragging each item.
"""

from __future__ import annotations

import unicodedata

SECTION_OTHER = "Outros"

# Ordered editorial sections (also the display order inside an edition).
SECTION_ORDER: list[str] = [
    "Atos do Poder Executivo",
    "Atos do Poder Legislativo",
    "Portarias",
    "Resoluções",
    "Editais",
    "Licitações",
    "Contratos",
    "Atas de Registro de Preços",
    "Relatórios Contábeis",
    SECTION_OTHER,
]

_SECTION_INDEX = {name: index for index, name in enumerate(SECTION_ORDER)}

# Keyword (normalized act-type name) -> section. First matching token wins.
_TYPE_SECTION_MAP: list[tuple[str, str]] = [
    ("decreto", "Atos do Poder Executivo"),
    ("lei", "Atos do Poder Legislativo"),
    ("portaria", "Portarias"),
    ("resolucao", "Resoluções"),
    ("edital", "Editais"),
    ("licitacao", "Licitações"),
    ("pregao", "Licitações"),
    ("aviso", "Licitações"),
    ("contrato", "Contratos"),
    ("extrato", "Contratos"),
    ("ata", "Atas de Registro de Preços"),
    ("relatorio", "Relatórios Contábeis"),
]


def _normalize(value) -> str:
    text = str(value or "").strip().lower()
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _act_number_key(act_number) -> tuple[int, str]:
    raw = str(act_number or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return (int(digits), raw.casefold())
    return (10**9, raw.casefold())


def section_for_matter(matter, act_type=None) -> str:
    """Resolve the editorial section for a matter (deterministic, no AI)."""
    config = getattr(act_type, "config", None) if act_type is not None else None
    if isinstance(config, dict):
        explicit = str(config.get("section") or "").strip()
        if explicit:
            return explicit

    act_type_name = _normalize(getattr(act_type, "name", None))
    for token, section in _TYPE_SECTION_MAP:
        if token in act_type_name:
            return section

    # Fallback: keywords in the title (legacy matters without a typed act type).
    title = _normalize(getattr(matter, "title", None))
    for token, section in _TYPE_SECTION_MAP:
        if token in title:
            return section
    return SECTION_OTHER


def section_rank(section: str) -> int:
    return _SECTION_INDEX.get(section, len(SECTION_ORDER))


def matter_sort_key(matter, act_type=None, org_unit=None) -> tuple:
    """Stable ordering: section -> órgão -> tipo -> número -> título."""
    section = section_for_matter(matter, act_type)
    org_name = _normalize(getattr(org_unit, "name", None)) or _normalize(
        getattr(matter, "org_unit_id", None)
    )
    type_name = _normalize(getattr(act_type, "name", None))
    return (
        section_rank(section),
        org_name,
        type_name,
        _act_number_key(getattr(matter, "act_number", None)),
        _normalize(getattr(matter, "title", None)),
    )
