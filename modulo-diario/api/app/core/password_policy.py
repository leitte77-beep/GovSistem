"""Password policy validation."""

from datetime import datetime, timedelta, timezone

from app.core.config import settings


class PasswordPolicyError(ValueError):
    pass


def validate_password(password: str) -> None:
    """Validate password against configured policy."""
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise PasswordPolicyError(
            f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters"
        )
    if settings.PASSWORD_MIN_UPPERCASE > 0:
        if sum(1 for c in password if c.isupper()) < settings.PASSWORD_MIN_UPPERCASE:
            raise PasswordPolicyError(
                f"Password must contain at least {settings.PASSWORD_MIN_UPPERCASE} uppercase letter(s)"
            )
    if settings.PASSWORD_MIN_LOWERCASE > 0:
        if sum(1 for c in password if c.islower()) < settings.PASSWORD_MIN_LOWERCASE:
            raise PasswordPolicyError(
                f"Password must contain at least {settings.PASSWORD_MIN_LOWERCASE} lowercase letter(s)"
            )
    if settings.PASSWORD_MIN_DIGITS > 0:
        if sum(1 for c in password if c.isdigit()) < settings.PASSWORD_MIN_DIGITS:
            raise PasswordPolicyError(
                f"Password must contain at least {settings.PASSWORD_MIN_DIGITS} digit(s)"
            )
    if settings.PASSWORD_MIN_SYMBOLS > 0:
        symbols = set("!@#$%^&*()_+-=[]{}|;':\",./<>?`~")
        if sum(1 for c in password if c in symbols) < settings.PASSWORD_MIN_SYMBOLS:
            raise PasswordPolicyError(
                f"Password must contain at least {settings.PASSWORD_MIN_SYMBOLS} symbol(s)"
            )


def is_password_expired(password_changed_at: datetime | None) -> bool:
    """Check if password is older than configured expiration."""
    if password_changed_at is None:
        return True
    return datetime.now(timezone.utc) - password_changed_at > timedelta(
        days=settings.PASSWORD_EXPIRE_DAYS
    )


def is_account_locked(lockout_until: datetime | None) -> bool:
    """Check if account is temporarily locked."""
    if lockout_until is None:
        return False
    return datetime.now(timezone.utc) < lockout_until
