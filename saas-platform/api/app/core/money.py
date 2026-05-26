from decimal import Decimal
from typing import Any


def cents_from_decimal(value: Decimal) -> int:
    return int(value * 100)


def cents_from_brl(value: str) -> int:
    cleaned = value.replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
    return int(Decimal(cleaned) * 100)


def cents_to_decimal(cents: int) -> Decimal:
    return Decimal(str(cents)) / Decimal("100")


def cents_to_brl(cents: int) -> str:
    d = cents_to_decimal(cents)
    return f"R$ {d:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def money_validator(v: Any) -> int:
    if isinstance(v, int):
        return v
    if isinstance(v, Decimal):
        return cents_from_decimal(v)
    if isinstance(v, str):
        return cents_from_brl(v)
    if isinstance(v, float):
        return int(round(v * 100))
    raise ValueError(f"Invalid money value: {v}")
