"""Celery task producer — enqueues tasks to the worker via Redis broker."""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "doe_api_producer",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
)


def enqueue_pdf_generation(edition_id: str) -> None:
    """Enqueue async PDF generation task for a closed edition."""
    celery_app.send_task(
        "generate_edition_pdf",
        args=[edition_id],
        queue="celery",
    )


def enqueue_signing(edition_id: str, signing_credential_id: str | None, pfx_password: str) -> None:
    """Enqueue async signing task for a PDF-generated edition."""
    celery_app.send_task(
        "sign_edition",
        args=[edition_id, signing_credential_id, pfx_password],
        queue="celery",
    )
