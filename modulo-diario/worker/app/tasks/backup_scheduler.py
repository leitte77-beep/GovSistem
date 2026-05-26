"""Backup scheduler task - checks if it's time to run automatic backup."""

import logging
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.worker import celery_app

logger = logging.getLogger(__name__)

API_URL = settings.API_URL
API_KEY = settings.INTERNAL_API_KEY.get_secret_value()

HEADERS = {
    "X-Internal-Key": API_KEY,
    "Content-Type": "application/json",
}

TIMEZONE_OFFSET = -3  # America/Sao_Paulo


def _now_sao_paulo() -> datetime:
    return datetime.now(timezone.utc).utcnow()


@celery_app.task(name="backup.scheduler")
def backup_scheduler():
    logger.info("Backup scheduler: checking if backup should run...")

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"{API_URL}/api/v1/internal/settings",
                headers=HEADERS,
            )
            resp.raise_for_status()
            s = resp.json()
    except Exception as e:
        logger.error("Backup scheduler: failed to fetch settings: %s", e)
        return {"status": "error", "message": str(e)}

    if s.get("backup.enabled") != "true":
        logger.info("Backup scheduler: automatic backup is disabled")
        return {"status": "skipped", "reason": "disabled"}

    now = _now_sao_paulo()
    current_day = now.weekday()
    current_time = now.strftime("%H:%M")

    scheduled_day = s.get("backup.day", "*")
    scheduled_time = s.get("backup.time", "03:00")

    if scheduled_day != "*":
        try:
            if current_day != int(scheduled_day):
                logger.info("Backup scheduler: wrong day (today=%s, scheduled=%s)", current_day, scheduled_day)
                return {"status": "skipped", "reason": "wrong_day"}
        except ValueError:
            pass

    if current_time != scheduled_time:
        logger.info("Backup scheduler: wrong time (now=%s, scheduled=%s)", current_time, scheduled_time)
        return {"status": "skipped", "reason": "wrong_time"}

    logger.info("Backup scheduler: triggering backup now...")
    try:
        with httpx.Client(timeout=600) as client:
            resp = client.post(
                f"{API_URL}/api/v1/internal/backup",
                headers=HEADERS,
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info("Backup scheduler: backup created successfully: %s", result.get("filename"))
            return {"status": "success", "backup": result}
    except Exception as e:
        logger.error("Backup scheduler: backup failed: %s", e)
        return {"status": "error", "message": str(e)}
