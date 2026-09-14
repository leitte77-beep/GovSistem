"""Thin Celery client used by the API to enqueue background jobs.

Only used when ``PDF_GENERATION_ASYNC`` is enabled. Celery is imported lazily
so the API can start (and the synchronous path keep working) even when the
optional dependency is not installed.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger("doe")

_TASK_NAME = "generate_edition_pdf"


def enqueue_generate_edition_pdf(edition_id: str) -> bool:
    """Enqueue PDF generation; return False when the broker is unavailable."""
    if not settings.PDF_GENERATION_ASYNC:
        return False
    try:
        from celery import Celery

        client = Celery(broker=settings.REDIS_URL, backend=settings.REDIS_URL)
        client.send_task(_TASK_NAME, args=[edition_id])
        logger.info("Enqueued PDF generation for edition %s", edition_id)
        return True
    except Exception as exc:  # noqa: BLE001 - fall back to sync generation
        logger.warning(
            "Could not enqueue PDF generation for edition %s (%s); "
            "falling back to synchronous generation",
            edition_id,
            exc,
        )
        return False
