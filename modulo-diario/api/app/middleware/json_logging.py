"""JSON structured logging middleware."""

import json
import logging
import time
from datetime import datetime, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class JSONLogMiddleware(BaseHTTPMiddleware):
    """Logs every request as a JSON line."""

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response: Response = await call_next(request)
        duration = time.time() - start

        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(duration * 1000, 2),
            "ip": request.client.host if request.client else "unknown",
        }

        logger = logging.getLogger("access")
        logger.info(json.dumps(log_data, ensure_ascii=False))

        return response
