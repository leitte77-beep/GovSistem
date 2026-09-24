"""Recent strong-authentication (MFA) proof for critical operations.

Critical actions (sign, publish, manage certificate, change permissions,
disable MFA, change four-eyes policy) must not rely on an access_token that
may be old. This issues a short-lived signed assertion (``recent_auth``) —
a JWT-like HMAC token — proving the user completed a strong (MFA) login within
the configured TTL (``RECENT_AUTH_TTL_MINUTES``, default 5). It is separate
from the bearer access token and validated independently.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid

from fastapi import Depends, HTTPException, Request, status

from app.core.auth import get_current_user
from app.core.config import settings
from app.models.user import User


def _sign(payload: bytes) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.get_secret_value().encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return digest


def issue_recent_auth(user_id: uuid.UUID, ttl_seconds: int | None = None) -> str:
    """Return a signed recent-auth token valid for the configured TTL."""
    ttl = ttl_seconds or settings.RECENT_AUTH_TTL_MINUTES * 60
    payload = json.dumps(
        {
            "sub": str(user_id),
            "type": "recent_auth",
            "iat": int(time.time()),
            "exp": int(time.time()) + ttl,
        },
        sort_keys=True,
    ).encode("utf-8")
    b64 = base64.urlsafe_b64encode(payload).decode("ascii")
    return f"ra1.{b64}.{_sign(b64.encode('utf-8'))}"


def validate_recent_auth(token: str | None, user_id: uuid.UUID | None = None) -> bool:
    """Validate a recent-auth token (signature + expiry), optionally for a user."""
    if not token:
        return False
    try:
        _, b64, sig = token.split(".", 2)
        if not hmac.compare_digest(_sign(b64.encode("utf-8")), sig):
            return False
        payload = json.loads(base64.urlsafe_b64decode(b64.encode("ascii")))
        if payload.get("type") != "recent_auth":
            return False
        if int(payload.get("exp", 0)) < int(time.time()):
            return False
        if user_id is not None and str(user_id) != payload.get("sub"):
            return False
        return True
    except Exception:
        return False


async def require_recent_auth(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    """Dependency: require a valid recent strong-auth token in a header."""
    token = request.headers.get("X-Recent-Auth")
    if not token or not validate_recent_auth(token, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reautenticação forte (MFA) recente é obrigatória para esta operação.",
        )
    return user
