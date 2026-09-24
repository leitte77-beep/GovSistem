"""Privacy helpers for masking personal identifiers in derived text.

Official acts are published in full (they are public records). Masking is only
applied to *derived* surfaces such as search snippets, where exposing a whole
CPF/CNPJ in a preview serves no public interest.
"""

from __future__ import annotations

import re

_CNPJ_RE = re.compile(r"(?<!\d)(\d{2})\.?(\d{3})\.?(\d{3})/?(\d{4})-?(\d{2})(?!\d)")
_CPF_RE = re.compile(r"(?<!\d)(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})(?!\d)")


def _mask_cnpj(match: re.Match[str]) -> str:
    return f"**.***.***/****-{match.group(5)}"


def _mask_cpf(match: re.Match[str]) -> str:
    return f"***.***.***-{match.group(4)}"


def mask_cpf_cnpj(value: str | None) -> str:
    """Mask every CPF/CNPJ found in ``value`` (CNPJ first, it is longer)."""
    if not value:
        return ""
    masked = _CNPJ_RE.sub(_mask_cnpj, value)
    return _CPF_RE.sub(_mask_cpf, masked)
