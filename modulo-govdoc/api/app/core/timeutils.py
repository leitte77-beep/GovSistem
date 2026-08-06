"""Utilidades de data/hora.

O PostgreSQL devolve `timestamptz` com fuso; o SQLite (usado nos testes) devolve
o mesmo valor sem fuso. Comparar os dois estoura `TypeError`, então toda
comparação com "agora" passa por `aware()`.
"""

from datetime import datetime, timezone
from typing import Optional


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: Optional[datetime]) -> Optional[datetime]:
    """Garante que a data tenha fuso (assume UTC quando vier sem)."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def is_past(value: Optional[datetime], reference: Optional[datetime] = None) -> bool:
    value = aware(value)
    if value is None:
        return False
    return value <= (reference or now())


def is_future(value: Optional[datetime], reference: Optional[datetime] = None) -> bool:
    value = aware(value)
    if value is None:
        return False
    return value > (reference or now())
