import json
import logging
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.services.sanitize import sanitize_payload

logger = logging.getLogger("saas.middleware.sanitize")

SENSITIVE_PATHS = [
    "/api/v1/webhooks/",
    "/api/v1/auth/",
    "/api/v1/users/",
    "/api/v1/organizations/",
    "/api/v1/modules/",
]


class SanitizeLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        needs_sanitize = any(p in request.url.path for p in SENSITIVE_PATHS)

        if needs_sanitize and request.method in ("POST", "PUT", "PATCH"):
            original_body = await request.body()
            if original_body:
                try:
                    payload = json.loads(original_body)
                    sanitized = sanitize_payload(payload)
                    logger.info(
                        "Request to %s: %s",
                        request.url.path,
                        json.dumps(sanitized, default=str),
                    )
                except (json.JSONDecodeError, UnicodeDecodeError):
                    logger.info("Request to %s: <binary payload>", request.url.path)

        response = await call_next(request)
        return response
