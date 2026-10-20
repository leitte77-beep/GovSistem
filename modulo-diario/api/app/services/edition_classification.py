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


# Separador entre a entidade e a seção ("Câmara Municipal — Portarias").
ENTITY_SEPARATOR = " — "

_LEGISLATIVE_TOKENS = ("camara", "legislativ")


def entity_rank(org_unit=None) -> int:
    """0 = Poder Executivo (Prefeitura), 1 = Poder Legislativo (Câmara).

    A edição traz primeiro tudo da Prefeitura e depois tudo da Câmara.
    """
    name = _normalize(getattr(org_unit, "name", None))
    return 1 if any(token in name for token in _LEGISLATIVE_TOKENS) else 0


def section_for_matter(matter, act_type=None, org_unit=None) -> str:
    """Resolve the editorial section for a matter (deterministic, no AI).

    Matérias da Câmara ganham o nome da unidade como prefixo, para que suas
    seções não se fundam com as da Prefeitura no PDF (que agrupa por título).
    """
    section = _base_section(matter, act_type)
    if org_unit is not None and entity_rank(org_unit) == 1:
        return f"{org_unit.name}{ENTITY_SEPARATOR}{section}"
    return section


def _base_section(matter, act_type=None) -> str:
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
    entity, sep, base = (section or "").partition(ENTITY_SEPARATOR)
    if sep and any(token in _normalize(entity) for token in _LEGISLATIVE_TOKENS):
        return len(SECTION_ORDER) + 1 + _SECTION_INDEX.get(base, len(SECTION_ORDER))
    return _SECTION_INDEX.get(section, len(SECTION_ORDER))


def matter_sort_key(matter, act_type=None, org_unit=None) -> tuple:
    """Stable ordering: entidade -> section -> órgão -> tipo -> número -> título."""
    section = section_for_matter(matter, act_type, org_unit)
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
