import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def init_sentry() -> None:
    """Initialize Sentry if DSN is configured."""
    dsn = getattr(settings, "SENTRY_DSN", None)
    if not dsn:
        logger.debug("Sentry not configured (SENTRY_DSN not set)")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=settings.ENVIRONMENT or "production",
            release=settings.VERSION,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            integrations=[
                StarletteIntegration(),
                FastApiIntegration(),
            ],
        )
        logger.info("Sentry initialized")
    except ImportError:
        logger.warning("sentry_sdk not installed, skipping Sentry initialization")
    except Exception:
        logger.warning("Sentry initialization failed", exc_info=True)
