"""Horário oficial (Brasília) para protocolo, prazos e numeração.

Tudo é gravado em UTC (ISO 8601), mas a referência de "hoje" para prazos e o
ano de numeração usam o fuso oficial configurado no ente.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

DEFAULT_TZ = "America/Sao_Paulo"


def agora_brasilia(fuso: str = DEFAULT_TZ) -> datetime:
    return datetime.now(ZoneInfo(fuso))


def ano_brasilia(fuso: str = DEFAULT_TZ) -> int:
    return agora_brasilia(fuso).year


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)
