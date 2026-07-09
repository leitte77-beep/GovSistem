import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.case_file import CaseFile
from app.models.case_file_attachment import CaseFileAttachment
from app.models.enums import AuditAccessType, AuditAction, RoleName
from app.models.user import User
from app.schemas.prontuario import AttachmentOut
from app.services.attachments import get_attachment_bytes, upload_case_file_attachment
from app.services.audit import record_audit
from app.services.scoping import can_access_unit

router = APIRouter(prefix="/case-files/{case_file_id}/attachments", tags=["attachments"])

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


async def _load_case_file(db, tenant_id, case_file_id) -> CaseFile:
    cf = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.id == case_file_id,
                CaseFile.tenant_id == tenant_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")
    return cf


def _to_out(a: CaseFileAttachment) -> dict:
    return {
        "id": a.id,
        "case_file_id": a.case_file_id,
        "attendance_id": a.attendance_id,
        "nome_arquivo": a.nome_arquivo,
        "tipo_documento": a.tipo_documento,
        "content_type": a.content_type,
        "tamanho_bytes": a.tamanho_bytes,
        "versao": a.versao,
        "enviado_por_id": a.enviado_por_id,
        "created_at": a.created_at,
    }


@router.get("", response_model=list[AttachmentOut])
async def listar_anexos(
    case_file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    rows = (
        await db.execute(
            select(CaseFileAttachment)
            .where(
                CaseFileAttachment.tenant_id == tenant_id,
                CaseFileAttachment.case_file_id == case_file_id,
                CaseFileAttachment.deleted_at.is_(None),
            )
            .order_by(CaseFileAttachment.created_at.desc())
        )
    ).scalars().all()
    return [_to_out(a) for a in rows]


@router.post("", response_model=AttachmentOut, status_code=201)
async def enviar_anexo(
    case_file_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    tipo_documento: str = Query("OUTRO"),
    attendance_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")

    attachment = await upload_case_file_attachment(
        db,
        tenant_id=tenant_id,
        case_file_id=cf.id,
        file=file,
        tipo_documento=tipo_documento,
        enviado_por_id=user.id,
        attendance_id=attendance_id,
    )
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="case_file_attachment",
        entity_id=attachment.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"nome": attachment.nome_arquivo, "tipo": tipo_documento},
    )
    await db.commit()
    await db.refresh(attachment)
    return _to_out(attachment)


@router.get("/{attachment_id}/download")
async def baixar_anexo(
    case_file_id: uuid.UUID,
    attachment_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    a = (
        await db.execute(
            select(CaseFileAttachment).where(
                CaseFileAttachment.id == attachment_id,
                CaseFileAttachment.case_file_id == case_file_id,
                CaseFileAttachment.tenant_id == tenant_id,
                CaseFileAttachment.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")

    content = await get_attachment_bytes(a)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="case_file_attachment",
        entity_id=a.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return Response(
        content=content,
        media_type=a.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{a.nome_arquivo}"'},
    )


@router.delete("/{attachment_id}", status_code=204)
async def excluir_anexo(
    case_file_id: uuid.UUID,
    attachment_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    a = (
        await db.execute(
            select(CaseFileAttachment).where(
                CaseFileAttachment.id == attachment_id,
                CaseFileAttachment.case_file_id == case_file_id,
                CaseFileAttachment.tenant_id == tenant_id,
                CaseFileAttachment.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    a.deleted_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="case_file_attachment",
        entity_id=a.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None
