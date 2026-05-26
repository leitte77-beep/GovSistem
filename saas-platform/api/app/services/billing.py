from datetime import datetime, timedelta
from decimal import Decimal

from app.core.money import cents_from_decimal


def calculate_prorata_credit(
    current_price_cents: int,
    new_price_cents: int,
    days_remaining: int,
    total_days: int,
) -> int:
    if total_days <= 0 or days_remaining <= 0:
        return 0
    daily_rate_current = Decimal(str(current_price_cents)) / Decimal(str(total_days))
    remaining_value_current = int(daily_rate_current * Decimal(str(days_remaining)))
    daily_rate_new = Decimal(str(new_price_cents)) / Decimal(str(total_days))
    remaining_value_new = int(daily_rate_new * Decimal(str(days_remaining)))
    if new_price_cents >= current_price_cents:
        return remaining_value_current
    return remaining_value_current - remaining_value_new


def calculate_prorata_charge(
    current_price_cents: int,
    new_price_cents: int,
    days_remaining: int,
    total_days: int,
) -> int:
    if total_days <= 0 or days_remaining <= 0:
        return 0
    daily_rate_current = Decimal(str(current_price_cents)) / Decimal(str(total_days))
    remaining_value_current = int(daily_rate_current * Decimal(str(days_remaining)))
    daily_rate_new = Decimal(str(new_price_cents)) / Decimal(str(total_days))
    remaining_value_new = int(daily_rate_new * Decimal(str(days_remaining)))
    if new_price_cents <= current_price_cents:
        return 0
    return remaining_value_new - remaining_value_current


def calculate_next_period_days(period_start: datetime, billing_cycle: str) -> int:
    if billing_cycle == "monthly":
        next_month = period_start.month + 1
        year = period_start.year
        if next_month > 12:
            next_month -= 12
            year += 1
        next_date = period_start.replace(year=year, month=next_month)
        return (next_date - period_start).days
    elif billing_cycle == "quarterly":
        return 90
    elif billing_cycle == "semiannual":
        return 180
    elif billing_cycle == "annual":
        return 365
    return 30


def days_remaining_in_period(period_start: datetime, period_end: datetime) -> int:
    now = datetime.now(period_start.tzinfo)
    if now >= period_end:
        return 0
    return (period_end - now).days
