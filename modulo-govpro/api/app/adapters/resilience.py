"""Resiliência de chamadas externas: timeout, retry com backoff e circuit breaker.

Mantido independente de transport específico: o adaptador chama `resilient_call`
passando uma função assíncrona e um fallback. Se todas as tentativas falharem (ou
o circuito estiver aberto), o fallback é retornado — nunca derruba a requisição
principal por causa de um serviço externo indisponível.
"""

import asyncio
import logging
import time
from typing import Awaitable, Callable, Optional, TypeVar

logger = logging.getLogger("govpro.adapters.resilience")

T = TypeVar("T")


class CircuitBreaker:
    """Circuito simples: CLOSED → OPEN (após N falhas) → HALF_OPEN (após cooldown)."""

    def __init__(self, threshold: int = 3, cooldown_s: float = 60.0) -> None:
        self.threshold = max(1, threshold)
        self.cooldown_s = max(0.0, cooldown_s)
        self._failures = 0
        self._opened_at: Optional[float] = None

    @property
    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        if time.monotonic() - self._opened_at >= self.cooldown_s:
            # HALF_OPEN: permite uma tentativa de teste.
            return False
        return True

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.threshold:
            self._opened_at = time.monotonic()
            logger.warning("Circuit breaker ABERTO após %d falhas", self._failures)


async def resilient_call(
    fn: Callable[[], Awaitable[T]],
    *,
    retries: int = 2,
    base_delay_s: float = 0.5,
    breaker: Optional[CircuitBreaker] = None,
    fallback: Optional[Callable[[], T]] = None,
    on_error: Optional[Callable[[Exception, int], None]] = None,
) -> T:
    """Executa `fn` com retry exponencial + circuit breaker, caindo no `fallback`.

    - Se `breaker` estiver aberto, retorna `fallback` imediatamente (sem chamar).
    - Tenta `retries + 1` vezes (a original + `retries` retries) com backoff.
    - A cada falha, registra no breaker e chama `on_error(exc, attempt)`.
    - Se esgotar as tentativas, retorna `fallback` (ou relança a última exceção).
    """
    if breaker is not None and breaker.is_open:
        logger.warning("Circuit breaker aberto — usando fallback")
        if fallback is not None:
            return fallback()
        raise RuntimeError("Circuit breaker aberto e sem fallback")

    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            result = await fn()
            if breaker is not None:
                breaker.record_success()
            return result
        except Exception as exc:  # noqa: BLE001 — adaptador externo: isolar falha.
            last_error = exc
            if breaker is not None:
                breaker.record_failure()
            if on_error is not None:
                on_error(exc, attempt)
            if attempt < retries:
                delay = base_delay_s * (2**attempt)
                logger.warning(
                    "Tentativa %d/%d falhou (%s) — retry em %.2fs",
                    attempt + 1,
                    retries + 1,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)

    if fallback is not None:
        logger.warning("Esgotadas as tentativas — usando fallback")
        return fallback()
    assert last_error is not None
    raise last_error
