"""Extração de texto para a pesquisa por conteúdo.

Formatos de texto e OOXML (docx/xlsx/pptx) são lidos sem dependência externa.
PDF textual é extraído de forma simples; para PDF digitalizado e imagens usa-se
Tesseract quando `OCR_ENABLED` estiver ligado e o binário existir.
O processamento é assíncrono: nunca bloqueia o upload.
"""

import io
import logging
import re
import subprocess
import tempfile
import zipfile
import zlib
from typing import Optional, Tuple

from app.core.config import settings
from app.models.enums import IndexStatus

logger = logging.getLogger("govdoc.texto")

MAX_TEXT_CHARS = 400_000

OOXML_PARTS = {
    ".docx": ("word/document.xml",),
    ".pptx": None,   # todos os slides
    ".xlsx": ("xl/sharedStrings.xml",),
    ".odt": ("content.xml",),
    ".ods": ("content.xml",),
    ".odp": ("content.xml",),
}

TAG_RE = re.compile(rb"<[^>]+>")


def _strip_xml(raw: bytes) -> str:
    text = TAG_RE.sub(b" ", raw).decode("utf-8", "replace")
    return re.sub(r"\s+", " ", text).strip()


def _from_ooxml(data: bytes, extension: str) -> str:
    parts = OOXML_PARTS.get(extension)
    chunks = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        if parts is None:
            names = [n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml")]
        else:
            names = [n for n in parts if n in names]
        for name in names[:200]:
            chunks.append(_strip_xml(archive.read(name)))
    return " ".join(chunks)


def _from_pdf(data: bytes) -> str:
    """Extrai texto de PDF com streams FlateDecode — cobre PDFs textuais comuns."""
    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        raw = match.group(1)
        try:
            decoded = zlib.decompress(raw)
        except zlib.error:
            decoded = raw
        for text_match in re.finditer(rb"\((?:\\.|[^\\()])*\)", decoded):
            piece = text_match.group(0)[1:-1]
            chunks.append(piece.decode("latin-1", "replace"))
        if sum(len(c) for c in chunks) > MAX_TEXT_CHARS:
            break
    text = re.sub(r"\s+", " ", " ".join(chunks)).strip()
    return text


def _ocr(data: bytes, extension: str) -> str:
    if not settings.OCR_ENABLED:
        return ""
    try:
        with tempfile.NamedTemporaryFile(suffix=extension, delete=True) as tmp:
            tmp.write(data)
            tmp.flush()
            result = subprocess.run(
                [settings.TESSERACT_PATH, tmp.name, "stdout", "-l", settings.TESSERACT_LANG],
                capture_output=True,
                timeout=180,
            )
        if result.returncode == 0:
            return result.stdout.decode("utf-8", "replace")
        logger.warning("Tesseract retornou código %s", result.returncode)
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("OCR indisponível: %s", exc)
    return ""


def extract_text(data: bytes, extension: str, mime: Optional[str] = None) -> Tuple[str, str]:
    """Retorna (texto, status de indexação)."""
    if not settings.TEXT_EXTRACTION_ENABLED:
        return "", IndexStatus.NAO_SUPORTADO.value

    extension = (extension or "").lower()
    try:
        if extension in {".txt", ".csv", ".md", ".json", ".xml", ".svg"}:
            text = data.decode("utf-8", "replace")
        elif extension in OOXML_PARTS:
            text = _from_ooxml(data, extension)
        elif extension == ".pdf":
            text = _from_pdf(data)
            if len(text) < 40:
                text = _ocr(data, extension) or text
        elif extension in {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}:
            text = _ocr(data, extension)
            if not text:
                return "", IndexStatus.NAO_SUPORTADO.value
        else:
            return "", IndexStatus.NAO_SUPORTADO.value
    except Exception as exc:  # pragma: no cover - arquivo corrompido
        logger.warning("Falha ao extrair texto (%s): %s", extension, exc)
        return "", IndexStatus.FALHOU.value

    text = re.sub(r"\s+", " ", text).strip()[:MAX_TEXT_CHARS]
    if not text:
        return "", IndexStatus.NAO_SUPORTADO.value
    return text, IndexStatus.INDEXADO.value
