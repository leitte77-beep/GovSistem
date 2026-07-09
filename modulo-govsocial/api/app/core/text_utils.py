"""Normalização de texto para busca tolerante a acento e caixa."""

import re
import unicodedata

_SPACES = re.compile(r"\s+")


def strip_accents(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_search(value: str | None) -> str:
    """minúsculas, sem acento, espaços colapsados — para coluna de busca."""
    if not value:
        return ""
    return _SPACES.sub(" ", strip_accents(value).lower()).strip()
