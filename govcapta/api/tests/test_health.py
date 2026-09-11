import os
import asyncio

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://unused")
os.environ.setdefault("REDIS_URL", "redis://unused")
os.environ.setdefault("SECRET_KEY", "a" * 32)

from app.api.v1.health import health
from app.main import create_app


def test_health_is_public_and_versioned():
    app = create_app()

    assert "/api/v1/health" in {route.path for route in app.routes}
    assert asyncio.run(health()) == {"status": "ok"}
