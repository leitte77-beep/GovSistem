import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware


class JSONLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start

        log_data = {
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "elapsed_ms": round(elapsed * 1000, 2),
            "client": request.client.host if request.client else "unknown",
        }
        logging.getLogger("govouve.access").info(json.dumps(log_data))
        return response
