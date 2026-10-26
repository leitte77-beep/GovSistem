"""Criptografia de coluna e pseudonimização (LGPD art. 11).

Formato do ciphertext: ``enc:v1:<token Fernet>``. A rotação de chave é feita
com ``MultiFernet`` (chave atual + chave anterior por ``key_id`` lógico v1).
CPF/CNS têm valor normalizado, hash HMAC para busca exata e ciphertext para
recuperação autorizada.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import String, Text
from sqlalchemy.types import TypeDecorator

from app.core.config import settings
from app.core.security import hmac_hex

_PREFIXO = "enc:v1:"


def _fernet() -> MultiFernet:
    chaves = [Fernet(settings.field_encryption_key)]
    if settings.field_encryption_key_old:
        chaves.append(Fernet(settings.field_encryption_key_old))
    return MultiFernet(chaves)


def criptografar(texto: str | None) -> str | None:
    if texto is None or texto == "":
        return texto
    token = _fernet().encrypt(texto.encode("utf-8")).decode("ascii")
    return f"{_PREFIXO}{token}"


def descriptografar(valor: str | None) -> str | None:
    if valor is None or valor == "":
        return valor
    if not valor.startswith(_PREFIXO):
        # Dado legado em claro: devolve como está, mas a migração deve cifrá-lo.
        return valor
    token = valor[len(_PREFIXO) :]
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Não foi possível descriptografar o campo.") from exc


def rotacionar(valor: str | None) -> str | None:
    """Reencripta com a chave atual (usado por tarefa de rotação)."""
    return criptografar(descriptografar(valor))


@dataclass(frozen=True)
class DocumentoProtegido:
    normalizado: str
    hash_busca: str
    cifrado: str
    final: str


def proteger_documento(valor: str) -> DocumentoProtegido:
    normalizado = "".join(ch for ch in valor if ch.isdigit())
    return DocumentoProtegido(
        normalizado=normalizado,
        hash_busca=hmac_hex(normalizado),
        cifrado=criptografar(normalizado) or "",
        final=normalizado[-4:] if normalizado else "",
    )


def hash_documento(valor: str) -> str:
    return hmac_hex("".join(ch for ch in valor if ch.isalnum()))


class CampoProtegido(TypeDecorator):
    """TypeDecorator para colunas sensíveis.

    O valor em repouso é sempre ciphertext Fernet; o Python enxerga texto claro.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> str | None:
        if value is None:
            return None
        return criptografar(str(value))

    def process_result_value(self, value: Any, dialect) -> str | None:
        if value is None:
            return None
        return descriptografar(str(value))


class DocumentoProtegidoType(TypeDecorator):
    """Armazena apenas o ciphertext com prefixo; nunca o documento em claro."""

    impl = String(512)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> str | None:
        if value is None:
            return None
        return criptografar(str(value))

    def process_result_value(self, value: Any, dialect) -> str | None:
        if value is None:
            return None
        return descriptografar(str(value))
