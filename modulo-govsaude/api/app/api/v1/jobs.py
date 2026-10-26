"""Acompanhamento de tarefas assíncronas."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.core.storage import get_storage
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.schemas.comuns import JobOut
from app.services.auditoria import registrar
from app.services.jobs import listar, obter

router = APIRouter(prefix="/jobs", tags=["Tarefas"])


@router.get("", response_model=list[JobOut], summary="Listar tarefas do tenant")
async def listar_jobs(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.JOB_LER)),
    db: AsyncSession = Depends(get_db),
):
    return [JobOut.model_validate(j) for j in await listar(db, tenant_id)]


@router.get("/{job_id}", response_model=JobOut, summary="Consultar progresso")
async def obter_job(
    job_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.JOB_LER)),
    db: AsyncSession = Depends(get_db),
):
    return JobOut.model_validate(await obter(db, tenant_id, job_id))


@router.get("/{job_id}/resultado", summary="URL temporária do resultado")
async def resultado(
    job_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.JOB_LER)),
    db: AsyncSession = Depends(get_db),
):
    job = await obter(db, tenant_id, job_id)
    if not job.resultado_chave:
        return {"disponivel": False, "mensagem": "A tarefa ainda não produziu resultado."}
    url = await get_storage().url_temporaria(job.resultado_chave)
    await registrar(
        db,
        acao=AcaoAuditoria.DOWNLOAD,
        usuario=usuario,
        recurso="job",
        recurso_id=job.id,
        detalhe="Download de resultado de tarefa.",
    )
    await db.commit()
    return {
        "disponivel": True,
        "url": url,
        "expira_em_segundos": 900 if url else None,
        "resultado_chave": job.resultado_chave if url is None else None,
    }
