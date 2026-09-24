"""Tratamento de imagens de fotos (abastecimento, painel/odômetro, bomba).

Objetivo: fotos de celulares costumam ter vários megabytes e orientação EXIF
incorreta. Normalizamos mantendo legibilidade suficiente para comprovação
(painel, hodômetro, bomba e comprovante), sem processamento pesado no
frontend.

- Corrige orientação EXIF (ImageOps.exif_transpose).
- Reduz dimensões acima de IMAGE_MAX_DIMENSION mantendo proporção.
- Recompacta em IMAGE_FORMAT_OUTPUT (JPEG) com qualidade IMAGE_QUALITY.
- Valida formato real pelo conteúdo, não pelo header do cliente.
"""

import io
import logging

from app.core.config import settings
from app.core.storage import build_key

logger = logging.getLogger(__name__)

_FORMAT_TO_EXT = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class ImageProcessError(Exception):
    pass


def detect_image_format(content: bytes) -> str | None:
    """Detecta o formato real pela assinatura (magic bytes)."""
    if content[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "PNG"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "WEBP"
    return None


def process_image(
    content: bytes,
    *,
    max_dimension: int | None = None,
    quality: int | None = None,
    output_format: str | None = None,
) -> tuple[bytes, str]:
    """Processa a imagem e retorna (bytes, mime_type).

    Nunca compromete a legibilidade: apenas reduz dimensão e recompacta.
    """
    from PIL import Image, ImageOps

    fmt = detect_image_format(content)
    if fmt is None:
        raise ImageProcessError("Formato de imagem não reconhecido.")
    if fmt not in settings.IMAGE_FORMATS:
        raise ImageProcessError(f"Formato de imagem não permitido: {fmt}")

    max_dim = max_dimension or settings.IMAGE_MAX_DIMENSION
    out_fmt = (output_format or settings.IMAGE_FORMAT_OUTPUT).upper()
    q = quality or settings.IMAGE_QUALITY

    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)
        img.thumbnail((max_dim, max_dim))
        if img.mode in ("RGBA", "P", "LA") and out_fmt == "JPEG":
            img = img.convert("RGB")

        buf = io.BytesIO()
        save_kwargs = {"format": out_fmt}
        if out_fmt == "JPEG":
            save_kwargs["quality"] = q
            save_kwargs["optimize"] = True
        img.save(buf, **save_kwargs)
        processed = buf.getvalue()
    except ImageProcessError:
        raise
    except Exception as exc:  # imagem corrompida
        raise ImageProcessError("Falha ao processar a imagem.") from exc

    return processed, _MIME[out_fmt]


def process_image_bytes(content: bytes) -> tuple[bytes, str]:
    """Interface de alto nível para o fluxo de upload de foto."""
    return process_image(content)
