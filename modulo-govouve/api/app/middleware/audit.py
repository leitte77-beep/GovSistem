import logging
import time

from fastapi import Request

logger = logging.getLogger("govouve.audit")


async def audit_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    logger.info(
        "%s %s %s %.3fs",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response
