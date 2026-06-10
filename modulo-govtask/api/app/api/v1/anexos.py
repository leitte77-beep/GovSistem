import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.anexo import Anexo
from app.models.enums import TipoDocumento, TipoEvento
from app.models.user import User
from app.schemas.anexo import AnexoOut
from app.services.attachments import upload_anexo
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/anexos", tags=["anexos"])


@router.post("", response_model=AnexoOut, status_code=201)
async def criar_anexo(
    convenio_id: uuid.UUID = Query(...),
    file: UploadFile = UploadFile(...),
    tipo_documento: TipoDocumento = TipoDocumento.OUTRO,
    etapa_id: uuid.UUID | None = Query(None),
    tarefa_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome do arquivo é obrigatório")

    anexo = await upload_anexo(
        db=db,
        file=file,
        convenio_id=convenio_id,
        enviado_por_id=user.id,
        tipo_documento=tipo_documento,
        etapa_id=etapa_id,
        tarefa_id=tarefa_id,
    )

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.ANEXO_ADICIONADO,
        ator_id=user.id,
        descricao=f"Anexo '{anexo.nome_arquivo}' adicionado",
        tarefa_id=tarefa_id,
        metadados={
            "tipo_documento": tipo_documento.value,
            "versao": anexo.versao,
            "tamanho_bytes": anexo.tamanho_bytes,
        },
    )
    await db.commit()
    await db.refresh(anexo)
    return anexo


@router.get("/{anexo_id}", response_model=AnexoOut)
async def obter_anexo(
    anexo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Anexo).where(Anexo.id == anexo_id, Anexo.deleted_at.is_(None))
    )
    anexo = result.scalar_one_or_none()
    if not anexo:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    return anexo


@router.delete("/{anexo_id}", status_code=204)
async def excluir_anexo(
    anexo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Anexo).where(Anexo.id == anexo_id, Anexo.deleted_at.is_(None))
    )
    anexo = result.scalar_one_or_none()
    if not anexo:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")

    from datetime import datetime, timezone
    anexo.deleted_at = datetime.now(timezone.utc)
    await db.commit()
