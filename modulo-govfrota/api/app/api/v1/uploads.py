"""Upload e download de arquivos (fotos, notas fiscais, XML, documentos).

Armazenamento via abstração ``STORAGE_BACKEND`` (local ou MinIO). Segurança:
- Nomes gerados no servidor (imprevisíveis) e isolados por organização.
- Validação de extensão, MIME e conteúdo (magic bytes).
- Limite de tamanho.
- Fotos passam por normalização (orientação EXIF + recompressão).
- Download sempre exige autenticação e verificação de tenant.
- Bucket nunca é público; no MinIO o download usa URL temporária (presigned).
"""

import uuid as _uuid
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Security
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.auth import (
    bearer_scheme,
    driver_bearer_scheme,
    get_current_motorista,
    get_current_user,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.storage import build_key, storage
from app.models.anexo import Anexo
from app.services.images import ImageProcessError, detect_image_format, process_image

router = APIRouter(prefix="/uploads", tags=["uploads"])

# Extensões tratadas como imagem
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


async def _get_uploader(
    request: Request,
    db: AsyncSession,
    user_creds: Optional[HTTPAuthorizationCredentials],
    driver_creds: Optional[HTTPAuthorizationCredentials],
) -> tuple[Optional[object], Optional[object]]:
    """Resolve admin ou motorista autenticado. Retorna (user, motorista)."""
    if user_creds:
        try:
            return await get_current_user(request, credentials=user_creds, db=db), None
        except HTTPException:
            pass
    if driver_creds:
        try:
            return None, await get_current_motorista(request, credentials=driver_creds, db=db)
        except HTTPException:
            pass
    raise HTTPException(status_code=401, detail="Não autenticado")


def _validar_extensao(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Extensão não permitida: {ext}")
    return ext


def _validar_conteudo(content: bytes, ext: str, content_type: str | None) -> str:
    """Valida MIME por assinatura de bytes; retorna o MIME efetivo."""
    if ext in _IMAGE_EXTS:
        fmt = detect_image_format(content)
        if fmt is None:
            raise HTTPException(status_code=422, detail="Arquivo de imagem inválido.")
        mime_map = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
        return mime_map[fmt]
    if ext == ".pdf":
        if not content.startswith(b"%PDF"):
            raise HTTPException(status_code=422, detail="Arquivo PDF inválido.")
        return "application/pdf"
    # Demais tipos: aceita se MIME declarado estiver na lista permitida.
    if content_type and content_type not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de arquivo não permitido.")
    return content_type or "application/octet-stream"


def _categoria(ext: str) -> str:
    if ext in _IMAGE_EXTS:
        return "FOTO"
    if ext == ".pdf":
        return "DOCUMENTO"
    if ext == ".xml":
        return "XML"
    return "ARQUIVO"


@router.post("", status_code=201)
async def upload(
    request: Request,
    file: UploadFile = File(...),
    user_creds: Annotated[
        Optional[HTTPAuthorizationCredentials], Security(bearer_scheme)
    ] = None,
    driver_creds: Annotated[
        Optional[HTTPAuthorizationCredentials], Security(driver_bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
):
    """Upload autenticado (admin ou motorista). Retorna {id, url} do anexo.

    A associação ao tenant é resolvida pelo token (nunca pelo frontend).
    """
    user, motorista = await _get_uploader(request, db, user_creds, driver_creds)

    ext = _validar_extensao(file.filename or "arquivo")
    conteudo = await file.read()
    if len(conteudo) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=422, detail="Arquivo excede o tamanho máximo.")

    mime_efetivo = _validar_conteudo(conteudo, ext, file.content_type)

    # Fotos de celular: normaliza orientação EXIF e recompacta (mantém legibilidade).
    if ext in _IMAGE_EXTS:
        try:
            conteudo, mime_efetivo = await run_in_threadpool(process_image, conteudo)
        except ImageProcessError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        if len(conteudo) > settings.IMAGE_MAX_BYTES:
            raise HTTPException(status_code=422, detail="Imagem excede o tamanho permitido.")

    organization_id = user.organization_id if user else motorista.organization_id
    usuario_id = user.id if user else None
    motorista_id = motorista.id if motorista else None
    categoria = _categoria(ext)

    anexo = Anexo(
        organization_id=organization_id,
        nome_arquivo=(file.filename or "arquivo")[:255],
        caminho="",
        mime_type=mime_efetivo,
        tamanho_bytes=len(conteudo),
        tipo=categoria,
        enviado_por_usuario_id=usuario_id,
        enviado_por_motorista_id=motorista_id,
    )
    db.add(anexo)
    await db.flush()
    key = build_key(organization_id, categoria, file.filename or "arquivo", ext)
    await run_in_threadpool(storage.store, key, conteudo, mime_efetivo)
    anexo.caminho = key
    await db.commit()
    return {"id": str(anexo.id), "url": f"/api/govfrota/uploads/{anexo.id}"}


@router.get("/{anexo_id}")
async def download(
    anexo_id: _uuid.UUID,
    request: Request,
    user_creds: Annotated[
        Optional[HTTPAuthorizationCredentials], Security(bearer_scheme)
    ] = None,
    driver_creds: Annotated[
        Optional[HTTPAuthorizationCredentials], Security(driver_bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
):
    """Download autenticado com verificação de tenant.

    No backend MinIO, retorna um redirect para URL temporária (presigned) já
    validada pelo tenant. No backend local, serve o arquivo via API.
    """
    user, motorista = await _get_uploader(request, db, user_creds, driver_creds)

    result = await db.execute(select(Anexo).where(Anexo.id == anexo_id))
    anexo = result.scalar_one_or_none()
    if anexo is None:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")

    org = user.organization_id if user else motorista.organization_id
    if anexo.organization_id != org:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")

    filename = anexo.nome_arquivo or "arquivo"

    if not storage.exists(anexo.caminho):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    # Download SEMPRE pela API autenticada (tamanhos ≤ 20 MB). Evita vazar
    # URLs do MinIO com endpoint interno (minio:9000) que o navegador não
    # consegue resolver e garante isolamento por tenant.
    conteudo = await run_in_threadpool(storage.read, anexo.caminho)
    return Response(
        content=conteudo,
        media_type=anexo.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
