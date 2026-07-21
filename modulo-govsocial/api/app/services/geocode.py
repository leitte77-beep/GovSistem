"""Geocodificação de endereços de famílias via Celery + Nominatim."""

import logging
import uuid

logger = logging.getLogger("govsocial.geocode")


async def enqueue_family_geocode(tenant_id: uuid.UUID, family_id: uuid.UUID) -> None:
    """Dispara geocodificação assíncrona via Celery."""
    try:
        from app.tasks import geocode_family
        geocode_family.delay(str(tenant_id), str(family_id))
        logger.info("geocode enqueued tenant=%s family=%s", tenant_id, family_id)
    except Exception:
        logger.exception(
            "geocode enqueue failed tenant=%s family=%s", tenant_id, family_id
        )
