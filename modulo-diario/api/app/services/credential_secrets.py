"""Decrypt stored signing-credential secrets (PFX + password).

Centralises the error handling so a mismatch between the encryption key used
at registration time and the current ``SECRET_KEY`` / ``ENC_KEY_V*`` yields a
precise, user-facing diagnosis instead of a bare 500 (and never leaks
ciphertext, DER or internal details).
"""

from __future__ import annotations

import logging

from cryptography.fernet import InvalidToken
from fastapi import HTTPException

from app.models.signing_credential import SigningCredential
from app.services.encryption import decrypt, decrypt_bytes

logger = logging.getLogger(__name__)


def decrypt_credential_secrets(credential: SigningCredential) -> tuple[bytes, str]:
    """Return ``(pfx_bytes, pfx_password)`` or raise a descriptive HTTPException.

    Raises:
        HTTPException 422: no stored PFX / config missing.
        HTTPException 500: decryption failed (likely key rotation) or other error.
    """
    config = credential.config or {}
    pfx_encrypted = config.get("pfx_encrypted", "")
    password_encrypted = config.get("password_encrypted", "")

    if not pfx_encrypted:
        raise HTTPException(
            422,
            "Certificado sem PFX armazenado. Reenvie o certificado ao editar a credencial.",
        )

    try:
        pfx_bytes = decrypt_bytes(pfx_encrypted.encode("utf-8"))
        pfx_password = decrypt(password_encrypted) if password_encrypted else ""
    except InvalidToken as exc:
        logger.error(
            "Falha ao descriptografar PFX da credencial %s "
            "(provavel rotacao/alteracao de SECRET_KEY ou ENC_KEY_V*): %s",
            credential.id, exc,
        )
        raise HTTPException(
            500,
            "Não foi possível descriptografar o certificado. A chave de criptografia "
            "(SECRET_KEY / ENC_KEY_V*) foi alterada após o cadastro da credencial. "
            "Reenvie o certificado com a chave atual.",
        ) from exc
    except Exception as exc:
        logger.exception(
            "Erro inesperado ao descriptografar a credencial %s", credential.id
        )
        raise HTTPException(500, "Erro interno ao descriptografar o certificado.") from exc

    return pfx_bytes, pfx_password
