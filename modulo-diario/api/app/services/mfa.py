"""Multi-factor authentication via TOTP (Time-based One-Time Password)."""

import logging

import pyotp

logger = logging.getLogger(__name__)


def generate_totp_secret() -> str:
    """Generate a new TOTP secret key."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str, issuer: str = "DOE Admin") -> str:
    """Get otpauth:// URI for QR code generation."""
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email, issuer_name=issuer,
    )


def verify_totp(secret: str, token: str) -> bool:
    """Verify a TOTP token. Allows a small window for clock skew."""
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=1)


def is_mfa_required(role_names: list[str]) -> bool:
    """MFA is mandatory for ASSINADOR and ADMIN."""
    return "ASSINADOR" in role_names or "ADMIN" in role_names
