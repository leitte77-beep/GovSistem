"""Geocodificação de endereços de famílias (fila assíncrona).

FASE 2: enfileira apenas. A implementação real (ViaCEP + provider de geocode) e
o worker Celery entram nas fases de integração; aqui isolamos atrás desta
interface para não acoplar o cadastro ao provedor.
"""

import logging
import uuid

logger = logging.getLogger("govsocial.geocode")


async def enqueue_family_geocode(tenant_id: uuid.UUID, family_id: uuid.UUID) -> None:
    """Marca a família para geocodificação assíncrona.

    Stub: registra a intenção. Será substituído por task Celery
    (geocode_family.delay(...)) sem alterar os chamadores.
    """
    logger.info(
        "geocode enqueued tenant=%s family=%s", tenant_id, family_id
    )
