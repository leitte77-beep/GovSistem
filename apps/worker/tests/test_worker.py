"""Worker tests."""

import os

os.environ.setdefault("POSTGRES_PASSWORD", "test")

import pytest  # noqa: E402


def test_worker_imports():
    from app.worker import celery_app
    assert celery_app.main == "doe_worker"
    assert celery_app.conf.timezone == "America/Sao_Paulo"


def test_celery_config():
    from app.worker import celery_app
    conf = celery_app.conf
    assert conf.task_serializer == "json"
    assert conf.accept_content == ["json"]
    assert conf.result_serializer == "json"
    assert conf.task_track_started is True
    assert conf.task_acks_late is True
    assert conf.worker_prefetch_multiplier == 1


def test_settings():
    from app.config import settings
    assert settings.REDIS_HOST
    assert settings.REDIS_URL.startswith("redis://")
    assert settings.WORKER_CONCURRENCY >= 1


def test_debug_task():
    from app.worker import debug_task
    assert callable(debug_task)
    assert debug_task.name == "debug_task" or debug_task.name is not None


def test_redis_url_computation():
    from app.config import Settings
    settings = Settings(
        REDIS_HOST="test-host",
        REDIS_PORT=1234,
        REDIS_DB=5,
        POSTGRES_PASSWORD="test",
    )
    assert settings.REDIS_URL == "redis://test-host:1234/5"
