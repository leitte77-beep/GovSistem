"""Painel de backup: agendamentos, execuções, verificação e restauração."""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Pagination, client_info, get_institution, page_payload
from app.core.auth import require_profiles
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.models.enums import AuditAction, BackupStatus, BackupType, Profile, RestoreStatus
from app.models.governance import BackupExecution, BackupJob, IntegrityCheck, RestoreJob
from app.models.organization import Institution
from app.models.user import User
from app.schemas.admin import (
    BackupExecutionOut,
    BackupJobIn,
    BackupJobOut,
    BackupRunRequest,
    IntegrityCheckOut,
    RestoreJobOut,
    RestorePlanRequest,
    RestoreRunRequest,
)
from app.schemas.common import Message
from app.services import audit
from app.services import backup as backup_service

router = APIRouter(prefix="/backups", tags=["Backup"])

backup_admin = require_profiles(Profile.ADMIN_GERAL)


def _job_out(job: BackupJob) -> BackupJobOut:
    return BackupJobOut(
        id=job.id,
        nome=job.name,
        tipo=job.backup_type,
        agendamento_cron=job.schedule_cron,
        destino=job.destination,
        incluir_banco=job.include_database,
        incluir_arquivos=job.include_files,
        retencao_diaria=job.retention_daily,
        retencao_semanal=job.retention_weekly,
        retencao_mensal=job.retention_monthly,
        criptografar=job.encrypt,
        ativo=job.is_active,
        ultima_execucao=job.last_run_at,
        proxima_execucao=job.next_run_at,
        aviso_destino=backup_service.destination_warning(job.destination),
    )


def _execution_out(execution: BackupExecution, job_nome: Optional[str] = None):
    return BackupExecutionOut(
        id=execution.id,
        job_id=execution.job_id,
        job_nome=job_nome,
        tipo=execution.backup_type,
        situacao=execution.status,
        iniciado_em=execution.started_at,
        finalizado_em=execution.finished_at,
        duracao_segundos=execution.duration_seconds,
        destino=execution.destination,
        total_bytes=execution.total_bytes,
        total_arquivos=execution.file_count,
        manifesto_sha256=execution.manifest_sha256,
        mensagem=execution.message,
        verificado_em=execution.verified_at,
        resultado_verificacao=execution.verify_result,
        disparado_por_id=execution.triggered_by_id,
    )


@router.get("/painel", summary="Situação geral do backup")
async def backup_panel(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    jobs = (
        await db.scalars(
            select(BackupJob).where(BackupJob.institution_id == institution.id)
        )
    ).all()
    execucoes = (
        await db.scalars(
            select(BackupExecution)
            .order_by(BackupExecution.started_at.desc().nullslast())
            .limit(10)
        )
    ).all()
    ultimo = execucoes[0] if execucoes else None
    ultimo_valido = next(
        (
            e
            for e in execucoes
            if e.verified_at is not None
            and e.verify_result
            and "divergência" not in (e.verify_result or "")
            and "ausentes" not in (e.verify_result or "")
        ),
        None,
    )
    ultimo_teste = next((e for e in execucoes if e.verified_at is not None), None)

    def indicador(execution) -> str:
        if execution is None:
            return "cinza"
        return {
            BackupStatus.CONCLUIDO.value: "verde",
            BackupStatus.CONCLUIDO_COM_ALERTA.value: "amarelo",
            BackupStatus.FALHOU.value: "vermelho",
            BackupStatus.EM_EXECUCAO.value: "azul",
        }.get(execution.status, "cinza")

    return {
        "backup_habilitado": settings.BACKUP_ENABLED,
        "destino_padrao": settings.BACKUP_DESTINATION or None,
        "aviso_destino": (
            backup_service.destination_warning(settings.BACKUP_DESTINATION)
            if settings.BACKUP_DESTINATION
            else "Nenhum destino de backup configurado (BACKUP_DESTINATION)."
        ),
        "indicador": indicador(ultimo),
        "ultimo_backup": _execution_out(ultimo) if ultimo else None,
        "ultimo_backup_valido": _execution_out(ultimo_valido) if ultimo_valido else None,
        "ultimo_teste_restauracao": (
            {"execucao_id": str(ultimo_teste.id), "quando": ultimo_teste.verified_at}
            if ultimo_teste
            else None
        ),
        "agendamentos": [_job_out(job) for job in jobs],
        "historico": [_execution_out(e) for e in execucoes],
        "falhas": [
            _execution_out(e) for e in execucoes if e.status == BackupStatus.FALHOU.value
        ],
    }


@router.get("/agendamentos", response_model=List[BackupJobOut], summary="Listar agendamentos")
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    jobs = (
        await db.scalars(
            select(BackupJob)
            .where(BackupJob.institution_id == institution.id)
            .order_by(BackupJob.created_at)
        )
    ).all()
    return [_job_out(job) for job in jobs]


@router.post(
    "/agendamentos", response_model=BackupJobOut, status_code=201, summary="Criar agendamento"
)
async def create_job(
    payload: BackupJobIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    job = BackupJob(
        institution_id=institution.id,
        name=payload.nome,
        backup_type=payload.tipo.value,
        schedule_cron=payload.agendamento_cron,
        destination=payload.destino,
        include_database=payload.incluir_banco,
        include_files=payload.incluir_arquivos,
        retention_daily=payload.retencao_diaria,
        retention_weekly=payload.retencao_semanal,
        retention_monthly=payload.retencao_mensal,
        encrypt=payload.criptografar,
        is_active=payload.ativo,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(job)
    await db.flush()
    await audit.record(
        db,
        action=AuditAction.CONFIG_CHANGE,
        user=user,
        resource_type="backup_job",
        resource_id=job.id,
        resource_name=job.name,
        detail="Agendamento de backup criado",
        client=client_info(request),
    )
    await db.commit()
    return _job_out(job)


@router.put("/agendamentos/{job_id}", response_model=BackupJobOut, summary="Editar agendamento")
async def update_job(
    job_id: uuid.UUID,
    payload: BackupJobIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    job = await db.get(BackupJob, job_id)
    if job is None or job.institution_id != institution.id:
        raise NotFound("Agendamento não encontrado.")
    job.name = payload.nome
    job.backup_type = payload.tipo.value
    job.schedule_cron = payload.agendamento_cron
    job.destination = payload.destino
    job.include_database = payload.incluir_banco
    job.include_files = payload.incluir_arquivos
    job.retention_daily = payload.retencao_diaria
    job.retention_weekly = payload.retencao_semanal
    job.retention_monthly = payload.retencao_mensal
    job.encrypt = payload.criptografar
    job.is_active = payload.ativo
    job.updated_by_id = user.id
    await db.commit()
    return _job_out(job)


@router.post("/agendamentos/{job_id}/executar", summary="Executar backup agora")
async def run_now(
    job_id: uuid.UUID,
    payload: BackupRunRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    job = await db.get(BackupJob, job_id)
    if job is None or job.institution_id != institution.id:
        raise NotFound("Agendamento não encontrado.")

    execution = await backup_service.run_backup(
        db,
        job=job,
        user=user,
        backup_type=(payload.tipo.value if payload.tipo else BackupType.MANUAL.value),
    )
    if settings.BACKUP_VERIFY_AFTER_RUN and execution.status in {
        BackupStatus.CONCLUIDO.value,
        BackupStatus.CONCLUIDO_COM_ALERTA.value,
    }:
        await backup_service.verify_execution(db, execution=execution, user=user)

    await audit.record(
        db,
        action=AuditAction.BACKUP_RUN,
        user=user,
        resource_type="backup_execution",
        resource_id=execution.id,
        resource_name=job.name,
        detail=f"{execution.status} — {execution.file_count} arquivo(s)",
        client=client_info(request),
    )
    await db.commit()
    return {
        "execucao": _execution_out(execution, job.name),
        "mensagem": (
            "Backup concluído."
            if execution.status == BackupStatus.CONCLUIDO.value
            else execution.message or "Backup finalizado com alertas."
        ),
    }


@router.get("/execucoes", summary="Histórico de execuções")
async def list_executions(
    situacao: Optional[str] = Query(None),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    stmt = (
        select(BackupExecution)
        .join(BackupJob, BackupJob.id == BackupExecution.job_id)
        .where(BackupJob.institution_id == institution.id)
    )
    if situacao:
        stmt = stmt.where(BackupExecution.status == situacao)
    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = (
        await db.scalars(
            stmt.order_by(BackupExecution.started_at.desc().nullslast())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).all()
    return page_payload([_execution_out(row) for row in rows], total, paginacao)


@router.post("/execucoes/{execution_id}/verificar", summary="Verificar integridade do backup")
async def verify(
    execution_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
):
    execution = await db.get(BackupExecution, execution_id)
    if execution is None:
        raise NotFound("Execução não encontrada.")
    check = await backup_service.verify_execution(db, execution=execution, user=user)
    await audit.record(
        db,
        action=AuditAction.BACKUP_VERIFY,
        user=user,
        resource_type="backup_execution",
        resource_id=execution.id,
        detail=execution.verify_result,
        client=client_info(request),
    )
    await db.commit()
    return {
        "verificacao": IntegrityCheckOut(
            id=check.id,
            escopo=check.scope,
            execucao_id=check.execution_id,
            verificados=check.checked_count,
            ok=check.ok_count,
            falhas=check.failed_count,
            ausentes=check.missing_count,
            detalhes=check.details,
            criado_em=check.created_at,
        ),
        "resultado": execution.verify_result,
        "valido": check.failed_count == 0 and check.missing_count == 0,
    }


@router.post("/execucoes/{execution_id}/plano-restauracao", summary="Planejar restauração")
async def plan_restore(
    execution_id: uuid.UUID,
    payload: RestorePlanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
):
    execution = await db.get(BackupExecution, execution_id)
    if execution is None:
        raise NotFound("Execução não encontrada.")
    plano = await backup_service.plan_restore(
        db,
        execution=execution,
        scope=payload.escopo,
        scope_id=payload.escopo_id,
        conflict_strategy=payload.estrategia_conflito.value,
    )
    return {
        "plano": plano,
        "aviso": (
            "Confira os itens em conflito antes de confirmar. "
            "A restauração gera registro de auditoria."
        ),
    }


@router.post("/execucoes/{execution_id}/restaurar", summary="Executar restauração")
async def run_restore(
    execution_id: uuid.UUID,
    payload: RestoreRunRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(backup_admin),
    institution: Institution = Depends(get_institution),
):
    if not payload.confirmar:
        raise AppError(
            "Confirme a restauração para prosseguir. Ela substitui ou recria dados.",
            400,
            "confirmacao_necessaria",
        )
    execution = await db.get(BackupExecution, execution_id)
    if execution is None:
        raise NotFound("Execução não encontrada.")

    plano = await backup_service.plan_restore(
        db,
        execution=execution,
        scope=payload.escopo,
        scope_id=payload.escopo_id,
        conflict_strategy=payload.estrategia_conflito.value,
    )

    ponto_seguranca = None
    if payload.gerar_ponto_seguranca:
        job = await db.scalar(
            select(BackupJob).where(BackupJob.institution_id == institution.id).limit(1)
        )
        if job is not None:
            seguranca = await backup_service.run_backup(
                db, job=job, user=user, backup_type=BackupType.MANUAL.value
            )
            ponto_seguranca = seguranca.destination

    restore_job = RestoreJob(
        execution_id=execution.id,
        scope=payload.escopo,
        scope_id=payload.escopo_id,
        conflict_strategy=payload.estrategia_conflito.value,
        status=RestoreStatus.PLANEJADO.value,
        plan=plano,
        safety_point=ponto_seguranca,
        requested_by_id=user.id,
    )
    db.add(restore_job)
    await db.flush()

    await backup_service.run_restore(db, execution=execution, job=restore_job, user=user)
    await audit.record(
        db,
        action=AuditAction.RESTORE_RUN,
        user=user,
        resource_type="restore_job",
        resource_id=restore_job.id,
        detail=restore_job.message,
        data_after={"escopo": payload.escopo, "restaurados": restore_job.restored_count},
        client=client_info(request),
    )
    await db.commit()
    return RestoreJobOut(
        id=restore_job.id,
        execucao_id=restore_job.execution_id,
        escopo=restore_job.scope,
        escopo_id=restore_job.scope_id,
        estrategia_conflito=restore_job.conflict_strategy,
        situacao=restore_job.status,
        plano=restore_job.plan,
        ponto_seguranca=restore_job.safety_point,
        mensagem=restore_job.message,
        total_restaurado=restore_job.restored_count,
        iniciado_em=restore_job.started_at,
        finalizado_em=restore_job.finished_at,
    )


@router.get("/restauracoes", response_model=List[RestoreJobOut], summary="Restaurações realizadas")
async def list_restores(
    db: AsyncSession = Depends(get_db), user: User = Depends(backup_admin)
):
    rows = (
        await db.scalars(select(RestoreJob).order_by(RestoreJob.created_at.desc()).limit(100))
    ).all()
    return [
        RestoreJobOut(
            id=row.id,
            execucao_id=row.execution_id,
            escopo=row.scope,
            escopo_id=row.scope_id,
            estrategia_conflito=row.conflict_strategy,
            situacao=row.status,
            plano=row.plan,
            ponto_seguranca=row.safety_point,
            mensagem=row.message,
            total_restaurado=row.restored_count,
            iniciado_em=row.started_at,
            finalizado_em=row.finished_at,
        )
        for row in rows
    ]


@router.get(
    "/verificacoes", response_model=List[IntegrityCheckOut], summary="Verificações de integridade"
)
async def list_checks(
    db: AsyncSession = Depends(get_db), user: User = Depends(backup_admin)
):
    rows = (
        await db.scalars(
            select(IntegrityCheck).order_by(IntegrityCheck.created_at.desc()).limit(100)
        )
    ).all()
    return [
        IntegrityCheckOut(
            id=row.id,
            escopo=row.scope,
            execucao_id=row.execution_id,
            verificados=row.checked_count,
            ok=row.ok_count,
            falhas=row.failed_count,
            ausentes=row.missing_count,
            detalhes=row.details,
            criado_em=row.created_at,
        )
        for row in rows
    ]


@router.post("/tarefas/executar", response_model=Message, summary="Rodar tarefas automáticas")
async def run_tasks(
    tarefa: Optional[str] = Query(None),
    user: User = Depends(backup_admin),
):
    from app.services import scheduler

    resultado = await scheduler.run_all(only=tarefa)
    resumo = ", ".join(f"{nome}: {valor}" for nome, valor in resultado.items())
    return Message(mensagem="Tarefas executadas.", detalhe=resumo)
