"""Cliente do serviço de assinatura digital do GovSistem (§78).

O GovTask não assina: ele aciona o assinador (`apps/signer`), que detém o
certificado A1 e devolve o PDF assinado com o hash e os dados do certificado.
Esta camada é a única ponte entre os dois.

Se a URL ou o certificado não estiverem configurados, `assinar_pdf` levanta
`AssinaturaNaoConfigurada` e a rota responde 503 — é a diferença entre uma
integração real e uma assinatura de mentira.
"""

import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("govtask.assinador")


class AssinaturaNaoConfigurada(RuntimeError):
    """Faltam URL, certificado ou chave interna do assinador."""


class AssinaturaFalhou(RuntimeError):
    """O assinador recusou ou não respondeu como esperado."""


def configurada() -> bool:
    return bool(
        settings.SIGNER_ENABLED
        and settings.SIGNER_URL
        and settings.SIGNER_CERT_PFX_BASE64.get_secret_value()
        and settings.SIGNER_CERT_PFX_PASSWORD.get_secret_value()
    )


def _chave_interna() -> str:
    return (
        settings.SIGNER_INTERNAL_API_KEY.get_secret_value()
        or settings.INTERNAL_API_KEY.get_secret_value()
    )


async def assinar_pdf(
    pdf_bytes: bytes,
    *,
    referencia: str,
    reason: str | None = None,
    location: str = "",
    visible: bool = False,
) -> dict:
    """Envia o PDF ao assinador e devolve a resposta com o arquivo assinado.

    `referencia` identifica a demanda/grupo na trilha do assinador; é o que
    liga a evidência devolvida ao documento do GovTask.
    """
    if not configurada():
        raise AssinaturaNaoConfigurada("Assinatura digital não configurada neste ambiente")

    payload = {
        "edition_id": referencia,
        "unsigned_pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
        "pfx_base64": settings.SIGNER_CERT_PFX_BASE64.get_secret_value(),
        "pfx_password": settings.SIGNER_CERT_PFX_PASSWORD.get_secret_value(),
        "reason": reason or settings.SIGNER_REASON_PADRAO,
        "location": location,
        "visible": visible,
    }
    url = f"{settings.SIGNER_URL.rstrip('/')}/internal/sign-pdf"
    # O serviço aceita o cabeçalho no formato canônico do FastAPI
    # (`x-internal-api-key`); enviamos também o alias para compatibilidade.
    headers = {
        "x-internal-api-key": _chave_interna(),
        "X-Internal-Key": _chave_interna(),
    }
    try:
        async with httpx.AsyncClient(timeout=settings.SIGNER_TIMEOUT_SEGUNDOS) as cliente:
            resposta = await cliente.post(url, json=payload, headers=headers)
            resposta.raise_for_status()
            dados = resposta.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("assinador recusou a assinatura: %s", exc.response.status_code)
        detalhe = ""
        try:
            detalhe = exc.response.json().get("detail", "")
        except Exception:
            detalhe = exc.response.text[:200]
        raise AssinaturaFalhou(f"Assinador recusou a assinatura: {detalhe}") from exc
    except Exception as exc:  # rede, timeout, JSON inválido
        logger.warning("falha ao acionar o assinador", exc_info=True)
        raise AssinaturaFalhou("O assinador não respondeu como esperado") from exc

    if not dados.get("signed_pdf_base64") or not dados.get("sha256_signed"):
        raise AssinaturaFalhou("Resposta do assinador sem PDF ou hash de assinatura")
    return dados
