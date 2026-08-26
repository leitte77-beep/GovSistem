"""Fusos horários — o sistema armazena tudo em UTC e apresenta no fuso da
organização (padrão Brasil). Nunca misturar datetime naive e aware.

- `utcnow()` → sempre um datetime aware em UTC (fonte da verdade).
- `now_local(tz)` → conversão para exibição em relatórios.
- `ensure_aware(dt)` → garante que um datetime seja aware (UTC por padrão).
"""

from datetime import datetime, timezone

from zoneinfo import ZoneInfo

from app.core.config import settings


def utcnow() -> datetime:
    """Instante atual sempre aware em UTC."""
    return datetime.now(timezone.utc)


def get_tz() -> ZoneInfo:
    return ZoneInfo(settings.DEFAULT_TIMEZONE)


def now_local(tz: str | None = None) -> datetime:
    """Instante atual no fuso de exibição (aware)."""
    zone = ZoneInfo(tz) if tz else get_tz()
    return datetime.now(zone)


def ensure_aware(dt: datetime | None, default: datetime | None = None) -> datetime:
    """Converte datetime naive em aware (UTC por padrão)."""
    if dt is None:
        return default if default is not None else utcnow()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def to_display(dt: datetime | None, tz: str | None = None) -> datetime | None:
    """Converte um datetime (UTC) para o fuso de exibição da organização."""
    if dt is None:
        return None
    aware = ensure_aware(dt)
    zone = ZoneInfo(tz) if tz else get_tz()
    return aware.astimezone(zone)
