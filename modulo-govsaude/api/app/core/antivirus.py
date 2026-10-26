"""Validação de anexos: tamanho, lista branca, magic number e ClamAV (B.12-054)."""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import PurePath

from app.core.config import settings
from app.core.errors import Unprocessable

MAGIC_NUMBERS = {
    b"%PDF-": "application/pdf",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
    b"PK\x03\x04": "application/zip",  # XLSX é um ZIP OOXML
}


@dataclass(frozen=True)
class ResultadoValidacao:
    mime: str
    tamanho: int
    status_antivirus: str


def _magic(conteudo: bytes) -> str | None:
    for assinatura, mime in MAGIC_NUMBERS.items():
        if conteudo.startswith(assinatura):
            return mime
    return None


def validar_anexo(
    nome: str, conteudo: bytes, mime_declarado: str | None = None
) -> ResultadoValidacao:
    if not conteudo:
        raise Unprocessable("Arquivo vazio.")
    if len(conteudo) > settings.MAX_FILE_SIZE_BYTES:
        raise Unprocessable(
            f"Arquivo excede o limite de {settings.MAX_FILE_SIZE_MB} MB.",
            code="arquivo_grande",
        )
    extensao = PurePath(nome or "").suffix.lower()
    if extensao not in settings.ALLOWED_EXTENSIONS:
        raise Unprocessable(
            "Extensão não permitida.",
            errors=[
                {
                    "campo": "arquivo",
                    "mensagem": (
                        "Extensões permitidas: "
                        f"{', '.join(settings.ALLOWED_EXTENSIONS)}."
                    ),
                    "codigo_regra": "extensao",
                }
            ],
        )
    magic = _magic(conteudo)
    if magic is None:
        raise Unprocessable(
            "O conteúdo do arquivo não corresponde a um formato permitido.",
            code="arquivo_formato",
        )
    if mime_declarado and mime_declarado not in settings.ALLOWED_MIME_TYPES:
        raise Unprocessable("Tipo MIME não permitido.", code="mime")
    if extensao in {".xlsx"} and magic != "application/zip":
        raise Unprocessable("Planilha XLSX inválida.", code="arquivo_formato")
    if extensao in {".jpg", ".jpeg"} and magic != "image/jpeg":
        raise Unprocessable("Imagem JPEG inválida.", code="arquivo_formato")
    if extensao == ".png" and magic != "image/png":
        raise Unprocessable("Imagem PNG inválida.", code="arquivo_formato")
    if extensao == ".pdf" and magic != "application/pdf":
        raise Unprocessable("PDF inválido.", code="arquivo_formato")

    status = "NAO_APLICAVEL"
    if settings.CLAMAV_ENABLED:
        try:
            import clamd
        except ImportError as exc:  # pragma: no cover - dependência opcional no runtime
            raise Unprocessable(
                "Antivírus habilitado, mas o cliente clamd não está instalado.",
                code="antivirus_indisponivel",
            ) from exc
        try:
            cliente = clamd.ClamdNetworkSocket(
                host=settings.CLAMAV_HOST, port=settings.CLAMAV_PORT, timeout=15
            )
            resultado = cliente.instream(io.BytesIO(conteudo))
            if resultado and "FOUND" in str(resultado):
                raise Unprocessable("Arquivo infectado por malware.", code="arquivo_infectado")
            status = "LIMPO"
        except Unprocessable:
            raise
        except Exception as exc:  # noqa: BLE001
            raise Unprocessable(
                "Não foi possível verificar o arquivo no antivírus.",
                code="antivirus_indisponivel",
            ) from exc
    return ResultadoValidacao(mime=magic, tamanho=len(conteudo), status_antivirus=status)
