import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.importacao import ImportJob, ImportLog
from app.models.user import User
from app.schemas.importacao import ImportJobOut, ImportResultOut
from app.services.audit import record_audit
from app.services.cadunico_import import parse_cadunico_csv

router = APIRouter(tags=["importacao"])

_MANAGE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


@router.get("/import-jobs", response_model=list[ImportJobOut])
async def listar_importacoes(
    tipo: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(ImportJob).where(ImportJob.tenant_id == tenant_id)
    if tipo:
        q = q.where(ImportJob.tipo == tipo)
    q = q.order_by(ImportJob.created_at.desc())
    return (await db.execute(q)).scalars().all()


@router.post("/import-jobs/cadunico/upload", response_model=ImportResultOut)
async def upload_cadunico(
    file: UploadFile,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Arquivo CSV obrigatório")

    content = (await file.read()).decode("utf-8", errors="replace")
    if not content.strip():
        raise HTTPException(status_code=422, detail="Arquivo vazio")

    job = ImportJob(
        tenant_id=tenant_id,
        tipo="CADUNICO",
        nome_arquivo=file.filename,
        criado_por_id=user.id,
    )
    db.add(job)
    await db.flush()
    await db.commit()

    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="import_job", entity_id=job.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"tipo": "CADUNICO", "arquivo": file.filename},
    )

    try:
        resultados = await parse_cadunico_csv(db, job, content)
    except Exception as e:
        job.status = "ERROR"
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))

    await db.commit()
    job = (
        await db.execute(select(ImportJob).where(ImportJob.id == job.id))
    ).scalar_one()

    logs = (
        await db.execute(
            select(ImportLog).where(ImportLog.import_job_id == job.id)
            .order_by(ImportLog.linha)
        )
    ).scalars().all()

    return {
        "job": job,
        "summary": resultados,
        "logs": logs,
    }


@router.get("/import-jobs/{job_id}", response_model=ImportResultOut)
async def detalhe_importacao(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    job = (
        await db.execute(
            select(ImportJob).where(
                ImportJob.id == job_id, ImportJob.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Importação não encontrada")

    logs = (
        await db.execute(
            select(ImportLog).where(ImportLog.import_job_id == job_id)
            .order_by(ImportLog.linha)
        )
    ).scalars().all()

    return {
        "job": job,
        "summary": {
            "novos": job.novos or 0,
            "atualizados": job.atualizados or 0,
            "conflitos": job.conflitos or 0,
            "erros": job.erros or 0,
        },
        "logs": logs,
    }
