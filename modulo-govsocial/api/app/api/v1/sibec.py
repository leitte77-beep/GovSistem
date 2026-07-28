import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.importacao import ImportJob, ImportLog
from app.models.sibec import SibecData
from app.models.user import User
from app.schemas.importacao import ImportJobOut
from app.schemas.sibec import SibecDataOut, SibecFamilySummary
from app.services.audit import record_audit
from app.services.sibec_import import get_sibec_family_summary, parse_sibec_csv

router = APIRouter(tags=["sibec"])

_MANAGE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


@router.post("/sibec/import", response_model=ImportJobOut)
async def upload_sibec(
    file: UploadFile,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    """Upload e processamento de arquivo CSV do Sibec."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Arquivo CSV obrigatorio")

    content = (await file.read()).decode("utf-8", errors="replace")
    if not content.strip():
        raise HTTPException(status_code=422, detail="Arquivo vazio")

    job = ImportJob(
        tenant_id=tenant_id,
        tipo="SIBEC",
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
        diff_summary={"tipo": "SIBEC", "arquivo": file.filename},
    )

    try:
        await parse_sibec_csv(db, job, content)
    except Exception as e:
        job.status = "ERROR"
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))

    await db.commit()
    job = (
        await db.execute(select(ImportJob).where(ImportJob.id == job.id))
    ).scalar_one()
    return job


@router.get("/sibec/jobs", response_model=list[ImportJobOut])
async def listar_jobs_sibec(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = (
        select(ImportJob)
        .where(ImportJob.tenant_id == tenant_id, ImportJob.tipo == "SIBEC")
        .order_by(ImportJob.created_at.desc())
    )
    return (await db.execute(q)).scalars().all()


@router.get("/sibec/jobs/{job_id}/logs")
async def logs_job_sibec(
    job_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    job = (
        await db.execute(
            select(ImportJob).where(
                ImportJob.id == job_id, ImportJob.tenant_id == tenant_id,
                ImportJob.tipo == "SIBEC",
            )
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job nao encontrado")

    logs = (
        await db.execute(
            select(ImportLog)
            .where(ImportLog.import_job_id == job_id)
            .order_by(ImportLog.linha)
            .limit(limit)
        )
    ).scalars().all()
    return {"job": job, "logs": logs}


@router.get("/sibec/family/{family_id}", response_model=SibecFamilySummary)
async def consultar_sibec_familia(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Consulta os beneficios Sibec de uma familia."""
    return await get_sibec_family_summary(db, tenant_id, family_id)


@router.get("/sibec/{sibec_id}", response_model=SibecDataOut)
async def obter_sibec(
    sibec_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    registro = (
        await db.execute(
            select(SibecData).where(
                SibecData.id == sibec_id, SibecData.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro Sibec nao encontrado")
    return registro
