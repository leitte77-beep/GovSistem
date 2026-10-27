"""Transporte HTTP dos sistemas oficiais (B.7-016, B.12-061).

A credencial nunca fica no banco: ``credenciais_ref`` aponta para onde ela
está — ``arquivo:/run/secrets/rnds`` (diretório com ``cert.pem`` e
``key.pem``) ou ``env:NOME`` (variável com esse diretório). A autenticação
mútua usa o certificado do ente. Os testes injetam um ``httpx`` transport
falso por ``definir_transporte_teste``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.core.config import settings

_TRANSPORTE_TESTE: httpx.AsyncBaseTransport | None = None


def definir_transporte_teste(transporte: httpx.AsyncBaseTransport | None) -> None:
    global _TRANSPORTE_TESTE
    _TRANSPORTE_TESTE = transporte


class CredencialAusenteError(RuntimeError):
    pass


@dataclass
class Resposta:
    status: int
    corpo: dict | None
    texto: str


def resolver_credencial(ref: str | None) -> tuple[str, str] | None:
    """Retorna (cert, key) do certificado do ente, ou erro se a referência não resolve."""
    if not ref:
        raise CredencialAusenteError("credenciais_ref não configurada")
    if ref.startswith("env:"):
        caminho = os.environ.get(ref[4:], "")
    elif ref.startswith("arquivo:"):
        caminho = ref[8:]
    else:
        raise CredencialAusenteError("credenciais_ref deve começar por env: ou arquivo:")
    if _TRANSPORTE_TESTE is not None:
        return None
    base = Path(caminho)
    cert, key = base / "cert.pem", base / "key.pem"
    if not caminho or not cert.is_file() or not key.is_file():
        raise CredencialAusenteError("certificado do ente não encontrado no volume de segredos")
    return str(cert), str(key)


async def enviar_http(
    url: str, metodo: str, corpo: bytes, *, credencial: tuple[str, str] | None, chave: str
) -> Resposta:
    kwargs: dict = {"timeout": settings.INTEGRACOES_TIMEOUT_SEGUNDOS}
    if _TRANSPORTE_TESTE is not None:
        kwargs["transport"] = _TRANSPORTE_TESTE
    elif credencial:
        kwargs["cert"] = credencial
    async with httpx.AsyncClient(**kwargs) as cliente:
        r = await cliente.request(
            metodo,
            url,
            content=corpo,
            headers={"Content-Type": "application/json", "Idempotency-Key": chave},
        )
    try:
        dados = r.json()
    except ValueError:
        dados = None
    return Resposta(
        status=r.status_code, corpo=dados if isinstance(dados, dict) else None, texto=r.text[:2000]
    )
