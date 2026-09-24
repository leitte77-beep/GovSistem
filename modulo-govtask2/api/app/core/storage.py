"""Armazenamento de anexos em disco, dentro do volume do container.

Dois cuidados que valem o arquivo inteiro: o nome vindo do cliente nunca
vira caminho (ele é guardado só para exibir), e o caminho final é conferido
contra a raiz antes de qualquer leitura — nome de arquivo é entrada hostil.
"""

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

RAIZ = Path(settings.UPLOAD_DIR).resolve()
_SEGURO = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitizar(nome: str) -> str:
    base = os.path.basename(nome or "arquivo")
    limpo = _SEGURO.sub("-", base).strip("-.") or "arquivo"
    return limpo[:120]


def verificar() -> bool:
    try:
        RAIZ.mkdir(parents=True, exist_ok=True)
        teste = RAIZ / ".health"
        teste.write_text("ok", encoding="utf-8")
        teste.unlink(missing_ok=True)
        return True
    except Exception:
        return False


async def salvar(arquivo: UploadFile, organization_id: uuid.UUID, pedido_id: uuid.UUID) -> tuple[str, int]:
    """Grava o upload e devolve (caminho relativo, tamanho em bytes)."""
    nome = _sanitizar(arquivo.filename or "arquivo")
    extensao = Path(nome).suffix.lower()
    if extensao not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de arquivo não permitido ({extensao or 'sem extensão'}).",
        )

    conteudo = await arquivo.read()
    if len(conteudo) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Arquivo vazio."
        )
    if len(conteudo) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo acima de {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    hoje = datetime.now(timezone.utc)
    relativo = Path(str(organization_id)) / f"{hoje:%Y/%m}" / str(pedido_id)
    destino_dir = RAIZ / relativo
    destino_dir.mkdir(parents=True, exist_ok=True)

    final = destino_dir / f"{uuid.uuid4().hex}{extensao}"
    final.write_bytes(conteudo)
    return str((relativo / final.name).as_posix()), len(conteudo)


def caminho_absoluto(relativo: str) -> Path:
    """Resolve um caminho guardado no banco, recusando escapar da raiz."""
    alvo = (RAIZ / relativo).resolve()
    if not alvo.is_relative_to(RAIZ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Caminho inválido."
        )
    if not alvo.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não encontrado."
        )
    return alvo


def remover(relativo: str) -> None:
    try:
        caminho_absoluto(relativo).unlink(missing_ok=True)
    except HTTPException:
        pass
