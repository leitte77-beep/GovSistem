"""Tests for the 4 metrics/operations endpoints."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.main import app
from app.core.auth import get_current_user
from app.core.database import get_db


@pytest.fixture(autouse=True)
def override_auth_and_db():
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.organization_id = uuid.uuid4()
    mock_user.email = "admin@test.com"
    mock_user.name = "Admin"
    mock_user.is_active = True
    mock_role = MagicMock()
    mock_role.name = "ADMIN"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session
    app.dependency_overrides.clear()


# ── Prometheus Metrics ────────────────────────────────────────────────────────


@patch("app.api.v1.metrics.METRICS_TEXT", "# no metrics\n")
@pytest.mark.anyio
async def test_prometheus_metrics(client):
    response = await client.get("/api/v1/metrics")
    assert response.status_code == 200


# ── Health ────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_operations_health(client, override_auth_and_db):
    mock_db = override_auth_and_db
    r1 = MagicMock()
    r1.scalar.return_value = "2026-01-01T00:00:00"
    r2 = MagicMock()
    r2.scalar.return_value = 5
    mock_db.execute.side_effect = [r1, r2]

    response = await client.get("/api/v1/operations/health")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "doe-api"
    assert "checks" in data
    assert data["checks"]["database"]["status"] == "ok"
    assert data["checks"]["editions_published"] == 5


@pytest.mark.anyio
async def test_operations_health_db_error(client, override_auth_and_db):
    mock_db = override_auth_and_db
    mock_db.execute.side_effect = Exception("DB down")

    response = await client.get("/api/v1/operations/health")
    assert response.status_code == 200
    data = response.json()
    assert data["checks"]["database"]["status"] == "error"


# ── Dashboard ─────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_operations_dashboard(client, override_auth_and_db):
    mock_db = override_auth_and_db
    results = []
    for i in range(10):
        r = MagicMock()
        r.scalar.return_value = 2
        results.append(r)
    mock_db.execute.side_effect = results

    response = await client.get("/api/v1/operations/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "editions" in data
    assert "matters" in data
    assert data["editions"]["total"] == 2


# ── Queue Status ──────────────────────────────────────────────────────────────


@patch("redis.Redis")
@pytest.mark.anyio
async def test_queue_status(mock_redis_class, client):
    mock_r = MagicMock()
    mock_r.llen.return_value = 5
    mock_r.exists.return_value = True
    mock_r.keys.return_value = [b"active1", b"reserved1"]
    mock_redis_class.return_value = mock_r

    response = await client.get("/api/v1/operations/queue-status")
    assert response.status_code == 200
    data = response.json()
    assert data["queue_length"] == 5
    assert data["status"] == "ok"


@patch("redis.Redis", side_effect=Exception("Redis unavailable"))
@pytest.mark.anyio
async def test_queue_status_error(mock_redis_class, client):
    response = await client.get("/api/v1/operations/queue-status")
    assert response.status_code == 200
    data = response.json()
    assert data["queue_length"] == -1
    assert data["status"] == "error"
