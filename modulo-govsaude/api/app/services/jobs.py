"""Tarefas assíncronas (202 + job_id)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.core.security import agora
from app.models.enums import StatusJob
from app.models.nucleo import Job, Usuario


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    tipo: str,
    parametros: dict | None = None,
    usuario: Usuario | None = None,
) -> Job:
    job = Job(
        tenant_id=tenant_id,
        tipo=tipo,
        status=StatusJob.PENDENTE.value,
        parametros=parametros,
        criado_por_id=usuario.id if usuario else None,
    )
    db.add(job)
    await db.flush()
    return job


async def obter(db: AsyncSession, tenant_id: uuid.UUID, job_id: uuid.UUID) -> Job:
    job = await db.scalar(select(Job).where(Job.id == job_id, Job.tenant_id == tenant_id))
    if job is None:
        raise NotFound("Tarefa não encontrada.")
    return job


async def listar(db: AsyncSession, tenant_id: uuid.UUID, limite: int = 50) -> list[Job]:
    return list(
        (
            await db.execute(
                select(Job)
                .where(Job.tenant_id == tenant_id)
                .order_by(Job.created_at.desc())
                .limit(min(limite, 100))
            )
        )
        .scalars()
        .all()
    )


async def marcar_executando(db: AsyncSession, job: Job) -> None:
    job.status = StatusJob.EXECUTANDO.value
    job.iniciado_em = agora()
    job.progresso = 1
    await db.commit()


async def marcar_concluido(db: AsyncSession, job: Job, chave: str | None = None) -> None:
    job.status = StatusJob.CONCLUIDO.value
    job.progresso = 100
    job.resultado_chave = chave
    job.concluido_em = agora()
    await db.commit()


async def marcar_falha(db: AsyncSession, job: Job, erro: str) -> None:
    job.status = StatusJob.FALHOU.value
    job.erro = erro[:2000]
    job.concluido_em = agora()
    await db.commit()
