"""Validação e verificação de arquivos enviados.

Nada aqui confia na extensão informada pelo navegador: o conteúdo é conferido
pela assinatura binária, o nome é sanitizado e o arquivo passa por verificação
antivírus antes de ficar disponível.
"""

import io
import logging
import os
import re
import socket
import unicodedata
import zipfile
from dataclasses import dataclass
from typing import Optional, Tuple

from app.core.config import settings
from app.core.security import hash_bytes

logger = logging.getLogger("govdoc.files")

# Assinaturas binárias reconhecidas (prefixo → famílias de extensão).
MAGIC_SIGNATURES: list[tuple[bytes, set[str], str]] = [
    (b"%PDF-", {".pdf"}, "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", {".png"}, "image/png"),
    (b"\xff\xd8\xff", {".jpg", ".jpeg"}, "image/jpeg"),
    (b"GIF87a", {".gif"}, "image/gif"),
    (b"GIF89a", {".gif"}, "image/gif"),
    (b"BM", {".bmp"}, "image/bmp"),
    (b"II*\x00", {".tiff", ".tif"}, "image/tiff"),
    (b"MM\x00*", {".tiff", ".tif"}, "image/tiff"),
    (b"PK\x03\x04", {".zip", ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"}, None),
    (b"Rar!\x1a\x07", {".rar"}, "application/vnd.rar"),
    (b"7z\xbc\xaf\x27\x1c", {".7z"}, "application/x-7z-compressed"),
    (b"\x1f\x8b", {".gz", ".tgz"}, "application/gzip"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", {".doc", ".xls", ".ppt"}, None),
    (b"ID3", {".mp3"}, "audio/mpeg"),
    (b"OggS", {".ogg"}, "audio/ogg"),
    (b"RIFF", {".wav", ".webp", ".avi"}, None),
    (b"\x1aE\xdf\xa3", {".mkv", ".webm"}, "video/webm"),
    (b"fLaC", {".flac"}, "audio/flac"),
]

# Assinaturas de executável — bloqueio imediato, qualquer que seja a extensão.
EXECUTABLE_SIGNATURES: list[bytes] = [
    b"MZ",              # PE / DOS
    b"\x7fELF",         # ELF
    b"\xca\xfe\xba\xbe",  # Mach-O fat / class Java
    b"\xfe\xed\xfa\xce",  # Mach-O
    b"\xfe\xed\xfa\xcf",
    b"\xcf\xfa\xed\xfe",
    b"#!/",             # script com shebang
]

TEXT_EXTENSIONS = {".txt", ".csv", ".md", ".json", ".xml", ".svg", ".rtf", ".p7s"}

MIME_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".csv": "text/csv",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".rtf": "application/rtf",
    ".xml": "application/xml",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".p7s": "application/pkcs7-signature",
}

MAX_ZIP_RATIO = 120          # proteção contra bomba de compressão
MAX_ZIP_ENTRIES = 5000
MAX_ZIP_UNCOMPRESSED = 5 * 1024 * 1024 * 1024


@dataclass
class ValidationResult:
    ok: bool
    message: str = ""
    extension: str = ""
    mime_type: str = ""
    sha256: str = ""
    size: int = 0
    safe_name: str = ""


def sanitize_filename(name: str) -> str:
    """Remove caminho, acentos problemáticos e caracteres de controle."""
    name = (name or "arquivo").replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFKC", name)
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '<>:"|?*\x00')
    name = re.sub(r"\s+", " ", name).strip(" .")
    name = re.sub(r"\.{2,}", ".", name)
    if not name:
        name = "arquivo"
    return name[:255]


def get_extension(name: str) -> str:
    return os.path.splitext(name)[1].lower()


def _looks_like_text(data: bytes) -> bool:
    sample = data[:4096]
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
        return True
    except UnicodeDecodeError:
        try:
            sample.decode("latin-1")
            return True
        except UnicodeDecodeError:
            return False


def detect_signature(data: bytes) -> Tuple[Optional[set], Optional[str]]:
    for prefix, extensions, mime in MAGIC_SIGNATURES:
        if data.startswith(prefix):
            return extensions, mime
    return None, None


def is_executable(data: bytes) -> bool:
    return any(data.startswith(sig) for sig in EXECUTABLE_SIGNATURES)


def check_archive(data: bytes, extension: str) -> Tuple[bool, str]:
    """Rejeita compactados maliciosos: bomba de compressão, excesso de entradas
    e caminhos que escapam do diretório (zip slip)."""
    if extension not in {".zip", ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"}:
        return True, ""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_ENTRIES:
                return False, "O arquivo compactado possui entradas demais."
            total = sum(entry.file_size for entry in entries)
            if total > MAX_ZIP_UNCOMPRESSED:
                return False, "O conteúdo descompactado excede o limite permitido."
            compressed = sum(entry.compress_size for entry in entries) or 1
            if total / compressed > MAX_ZIP_RATIO:
                return False, (
                    "O arquivo compactado tem taxa de compressão suspeita "
                    "(possível bomba de descompressão)."
                )
            for entry in entries:
                nome = entry.filename.replace("\\", "/")
                if nome.startswith("/") or ".." in nome.split("/"):
                    return False, "O arquivo compactado contém caminhos inválidos."
    except zipfile.BadZipFile:
        if extension == ".zip":
            return False, "O arquivo ZIP está corrompido ou não é um ZIP válido."
    return True, ""


def validate_upload(
    filename: str,
    data: bytes,
    *,
    allowed_extensions: Optional[list] = None,
    max_size_bytes: Optional[int] = None,
) -> ValidationResult:
    """Validação completa: nome, tamanho, extensão, MIME, assinatura e conteúdo."""
    safe_name = sanitize_filename(filename)
    extension = get_extension(safe_name)
    size = len(data)
    limit = max_size_bytes or settings.MAX_FILE_SIZE_BYTES

    if size == 0:
        return ValidationResult(False, "O arquivo enviado está vazio.", safe_name=safe_name)
    if size > limit:
        return ValidationResult(
            False,
            "Não foi possível enviar o arquivo porque ele excede o tamanho máximo de "
            f"{limit // (1024 * 1024)} MB.",
            safe_name=safe_name,
        )
    if not extension:
        return ValidationResult(
            False, "Não foi possível enviar o arquivo porque ele não possui extensão.",
            safe_name=safe_name,
        )
    if extension in {e.lower() for e in settings.BLOCKED_EXTENSIONS}:
        return ValidationResult(
            False,
            f"Não foi possível enviar o arquivo porque o formato {extension} é bloqueado "
            "por política de segurança.",
            safe_name=safe_name,
        )

    permitted = [e.lower() for e in (allowed_extensions or settings.ALLOWED_EXTENSIONS)]
    if extension not in permitted:
        return ValidationResult(
            False,
            f"Não foi possível enviar o arquivo porque o formato {extension} não é permitido.",
            safe_name=safe_name,
        )

    if is_executable(data):
        return ValidationResult(
            False,
            "Não foi possível enviar o arquivo porque o conteúdo é um executável ou script.",
            safe_name=safe_name,
        )

    signature_extensions, signature_mime = detect_signature(data)
    if signature_extensions is not None:
        if extension not in signature_extensions:
            return ValidationResult(
                False,
                "O conteúdo do arquivo não corresponde à extensão informada "
                f"({extension}). O envio foi recusado por segurança.",
                safe_name=safe_name,
            )
    elif extension not in TEXT_EXTENSIONS and extension not in {".mp4", ".m4a", ".tar"}:
        # Sem assinatura conhecida: aceita apenas se for realmente texto.
        if not _looks_like_text(data):
            return ValidationResult(
                False,
                "Não foi possível identificar o conteúdo do arquivo. O envio foi recusado.",
                safe_name=safe_name,
            )

    if extension in TEXT_EXTENSIONS and not _looks_like_text(data):
        return ValidationResult(
            False,
            f"O arquivo informado como {extension} não contém texto válido.",
            safe_name=safe_name,
        )

    if extension == ".svg" and re.search(rb"<script|javascript:|onload\s*=", data[:200000], re.I):
        return ValidationResult(
            False, "O arquivo SVG contém script e foi recusado por segurança.",
            safe_name=safe_name,
        )

    ok, message = check_archive(data, extension)
    if not ok:
        return ValidationResult(False, message, safe_name=safe_name)

    mime = signature_mime or MIME_BY_EXTENSION.get(extension, "application/octet-stream")
    return ValidationResult(
        ok=True,
        extension=extension,
        mime_type=mime,
        sha256=hash_bytes(data),
        size=size,
        safe_name=safe_name,
    )


# ── Antivírus ────────────────────────────────────────────────────────────────

EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR"

SUSPICIOUS_PATTERNS = [
    (re.compile(rb"<script[^>]*>.*?eval\(", re.I | re.S), "script com eval embutido"),
    (re.compile(rb"powershell\s+-e(nc|ncodedcommand)", re.I), "comando PowerShell codificado"),
    (re.compile(rb"/JavaScript\s*<<", re.I), "JavaScript embutido em PDF"),
    (re.compile(rb"/Launch\s*<<", re.I), "ação de execução embutida em PDF"),
]


def scan_bytes(data: bytes) -> Tuple[bool, str]:
    """Retorna (limpo, motivo).

    Usa ClamAV quando `CLAMAV_HOST` está configurado; caso contrário aplica a
    verificação heurística local (assinatura EICAR, executáveis e padrões
    suspeitos). O status do arquivo reflete qual verificação foi feita.
    """
    if not settings.ANTIVIRUS_ENABLED:
        return True, "verificacao_desabilitada"

    if settings.CLAMAV_HOST:
        clean, detail = _clamav_scan(data)
        if detail != "clamav_indisponivel":
            return clean, detail
        logger.warning("ClamAV indisponível — aplicando verificação heurística local")

    if EICAR in data[:1024]:
        return False, "Assinatura de teste EICAR detectada"
    if is_executable(data):
        return False, "Conteúdo executável detectado"
    for pattern, reason in SUSPICIOUS_PATTERNS:
        if pattern.search(data[:2_000_000]):
            return False, f"Conteúdo suspeito: {reason}"
    return True, "heuristica_local"


def _clamav_scan(data: bytes) -> Tuple[bool, str]:
    try:
        with socket.create_connection(
            (settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=30
        ) as sock:
            sock.sendall(b"zINSTREAM\x00")
            view = memoryview(data)
            for start in range(0, len(data), 65536):
                chunk = view[start:start + 65536]
                sock.sendall(len(chunk).to_bytes(4, "big") + bytes(chunk))
            sock.sendall((0).to_bytes(4, "big"))
            response = sock.recv(4096).decode("utf-8", "replace").strip()
        if "OK" in response and "FOUND" not in response:
            return True, "clamav_limpo"
        return False, response[:200] or "ClamAV recusou o arquivo"
    except OSError as exc:
        logger.warning("Falha ao contatar ClamAV: %s", exc)
        return True, "clamav_indisponivel"
