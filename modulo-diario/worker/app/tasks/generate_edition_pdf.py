"""Async PDF generation task - delegates to the API internal endpoint."""

import httpx

from app.config import settings
from app.worker import celery_app


def _call_api_generate_pdf(edition_id: str) -> dict:
    url = f"{settings.API_URL}/api/v1/internal/editions/{edition_id}/generate-pdf"
    with httpx.Client(timeout=600) as client:
        response = client.post(
            url,
            headers={"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()},
        )
        response.raise_for_status()
        return response.json()


@celery_app.task(bind=True, name="generate_edition_pdf")
def generate_edition_pdf_task(self, edition_id: str, **kwargs):
    return _call_api_generate_pdf(edition_id)
