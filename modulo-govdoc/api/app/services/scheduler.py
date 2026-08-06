"""Tarefas automáticas do módulo.

Todas são idempotentes e protegidas por trava (`_RUNNING`) para não rodarem
duas vezes em paralelo. O laço interno roda dentro da própria API; em produção
com várias réplicas, deixe `SCHEDULER_ENABLED=true` em apenas uma delas.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session
from app.core.timeutils import aware
from app.models.document import Document, DocumentLock
from app.models.enums import (
    BackupStatus,
    IndexStatus,
    NotificationType,
)
from app.models.governance import BackupExecution, BackupJob, Notification
from app.models.organization import Institution
from app.models.sharing import ExternalLink, ExternalUploadRequest
from app.models.user import User
from app.services import backup as backup_service
from app.services import documents as document_service
from app.services import notifications, storage_usage

logger = logging.getLogger("govdoc.tarefas")

_RUNNING: set = set()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _guard(name: str, coro_factory):
    if name in _RUNNING:
        logger.info("Tarefa %s já em execução — ignorando disparo duplicado", name)
        return None
    _RUNNING.add(name)
    try:
        return await coro_factory()
    except Exception:
        logger.exception("Falha na tarefa %s", name)
        return None
    finally:
        _RUNNING.discard(name)


# ── Tarefas ──────────────────────────────────────────────────────────────────


async def expire_links(db: AsyncSession) -> int:
    """Notifica responsáveis sobre links prestes a expirar."""
    now = _now()
    soon = now + timedelta(days=3)
    links = (
        await db.scalars(
            select(ExternalLink).where(
                ExternalLink.revoked_at.is_(None),
                ExternalLink.expires_at.is_not(None),
                ExternalLink.expires_at > now,
                ExternalLink.expires_at <= soon,
            )
        )
    ).all()
    count = 0
    for link in links:
        if not link.created_by_id:
            continue
        created = await notifications.notify(
            db,
            user_id=link.created_by_id,
            type_=NotificationType.LINK_EXPIRANDO,
            title=f"O link “{link.name}” expira em breve",
            body=f"Expira em {aware(link.expires_at).strftime('%d/%m/%Y às %H:%M')}.",
            resource_type="external_link",
            resource_id=link.id,
            dedupe_key=f"link_expirando:{link.id}",
        )
        count += 1 if created else 0
    return count


async def expiry_alerts(db: AsyncSession) -> int:
    """Alerta responsáveis por documentos vencendo/vencidos."""
    hoje = date.today()
    created = 0
    for dias in sorted(settings.EXPIRY_ALERT_DAYS, reverse=True):
        alvo = hoje + timedelta(days=dias)
        docs = (
            await db.scalars(
                select(Document).where(
                    Document.deleted_at.is_(None),
                    Document.expires_on == alvo,
                )
            )
        ).all()
        for doc in docs:
            if not doc.owner_user_id:
                continue
            note = await notifications.notify(
                db,
                user_id=doc.owner_user_id,
                type_=NotificationType.DOCUMENTO_VENCENDO,
                title=f"{doc.display_name} vence em {dias} dia(s)",
                body=f"Vencimento em {alvo.strftime('%d/%m/%Y')} — código {doc.code}.",
                resource_type="document",
                resource_id=doc.id,
                dedupe_key=f"vencendo:{doc.id}:{dias}",
            )
            created += 1 if note else 0

    vencidos = (
        await db.scalars(
            select(Document).where(
                Document.deleted_at.is_(None),
                Document.expires_on.is_not(None),
                Document.expires_on < hoje,
            )
        )
    ).all()
    for doc in vencidos:
        if not doc.owner_user_id:
            continue
        note = await notifications.notify(
            db,
            user_id=doc.owner_user_id,
            type_=NotificationType.DOCUMENTO_VENCIDO,
            title=f"{doc.display_name} está vencido",
            body=f"Venceu em {doc.expires_on.strftime('%d/%m/%Y')} — código {doc.code}.",
            resource_type="document",
            resource_id=doc.id,
            dedupe_key=f"vencido:{doc.id}:{doc.expires_on.isoformat()}",
        )
        created += 1 if note else 0
    return created


async def purge_trash(db: AsyncSession) -> int:
    """Remove definitivamente o que passou do prazo da lixeira — respeitando
    bloqueio legal e política de retenção."""
    limite = _now() - timedelta(days=settings.TRASH_RETENTION_DAYS)
    docs = (
        await db.scalars(
            select(Document).where(
                Document.deleted_at.is_not(None),
                Document.deleted_at < limite,
                Document.legal_hold.is_(False),
            )
        )
    ).all()
    removidos = 0
    for doc in docs:
        if doc.retention_policy_id:
            continue  # documento sob retenção só sai por decisão administrativa
        await document_service.purge_document(db, document=doc)
        removidos += 1
    return removidos


async def clean_locks(db: AsyncSession) -> int:
    locks = (
        await db.scalars(select(DocumentLock).where(DocumentLock.expires_at < _now()))
    ).all()
    for lock in locks:
        await db.delete(lock)
    return len(locks)


async def process_pending_index(db: AsyncSession, limit: int = 20) -> int:
    docs = (
        await db.scalars(
            select(Document)
            .where(
                Document.deleted_at.is_(None),
                Document.index_status == IndexStatus.PENDENTE.value,
            )
            .limit(limit)
        )
    ).all()
    for doc in docs:
        await document_service.index_document(db, doc)
    return len(docs)


async def storage_alerts(db: AsyncSession) -> int:
    institutions = (
        await db.scalars(select(Institution).where(Institution.deleted_at.is_(None)))
    ).all()
    count = 0
    for institution in institutions:
        level = await storage_usage.check_alerts(db, institution)
        if not level:
            continue
        admins = (
            await db.scalars(
                select(User.id).where(
                    User.institution_id == institution.id,
                    User.profile == "admin_geral",
                    User.is_active.is_(True),
                )
            )
        ).all()
        await notifications.notify_many(
            db,
            user_ids=admins,
            type_=NotificationType.ARMAZENAMENTO_LIMITE,
            title=f"Armazenamento em {level}% da capacidade",
            body="Revise a lixeira, versões antigas e cotas por secretaria.",
            resource_type="institution",
            resource_id=institution.id,
            dedupe_key=f"armazenamento:{institution.id}:{level}",
        )
        count += 1
    return count


async def close_expired_requests(db: AsyncSession) -> int:
    requests = (
        await db.scalars(
            select(ExternalUploadRequest).where(
                ExternalUploadRequest.revoked_at.is_(None),
                ExternalUploadRequest.deadline.is_not(None),
                ExternalUploadRequest.deadline < _now(),
            )
        )
    ).all()
    for request in requests:
        request.revoked_at = _now()
    return len(requests)


def _cron_due(expression: str, reference: datetime, last_run: Optional[datetime]) -> bool:
    """Avaliação simples de cron (minuto hora * * *) — suficiente para o agendamento
    diário/semanal do backup."""
    parts = (expression or "").split()
    if len(parts) != 5:
        return False
    minute, hour, day, month, weekday = parts

    def matches(value: int, field: str) -> bool:
        if field == "*":
            return True
        for piece in field.split(","):
            if piece.startswith("*/"):
                step = int(piece[2:])
                if value % step == 0:
                    return True
            elif "-" in piece:
                start, end = piece.split("-")
                if int(start) <= value <= int(end):
                    return True
            elif piece.isdigit() and int(piece) == value:
                return True
        return False

    if not (
        matches(reference.hour, hour)
        and matches(reference.day, day)
        and matches(reference.month, month)
        and matches(reference.isoweekday() % 7, weekday)
    ):
        return False
    if minute != "*":
        # Tolerância de uma janela do agendador.
        window = settings.SCHEDULER_INTERVAL_SECONDS // 60 + 1
        target_minutes = [int(p) for p in minute.split(",") if p.isdigit()]
        if not any(abs(reference.minute - t) <= window for t in target_minutes):
            return False
    if last_run and (reference - last_run) < timedelta(hours=1):
        return False
    return True


async def scheduled_backups(db: AsyncSession) -> int:
    if not settings.BACKUP_ENABLED:
        return 0
    jobs = (
        await db.scalars(
            select(BackupJob).where(
                BackupJob.is_active.is_(True), BackupJob.schedule_cron.is_not(None)
            )
        )
    ).all()
    executados = 0
    now = _now()
    for job in jobs:
        if not _cron_due(job.schedule_cron, now, job.last_run_at):
            continue
        execution = await backup_service.run_backup(db, job=job)
        if settings.BACKUP_VERIFY_AFTER_RUN and execution.status in {
            BackupStatus.CONCLUIDO.value,
            BackupStatus.CONCLUIDO_COM_ALERTA.value,
        }:
            await backup_service.verify_execution(db, execution=execution)
        if execution.status == BackupStatus.FALHOU.value:
            admins = (
                await db.scalars(
                    select(User.id).where(
                        User.institution_id == job.institution_id,
                        User.profile == "admin_geral",
                    )
                )
            ).all()
            await notifications.notify_many(
                db,
                user_ids=admins,
                type_=NotificationType.BACKUP_FALHOU,
                title="Falha na execução do backup",
                body=execution.message,
                resource_type="backup_execution",
                resource_id=execution.id,
                dedupe_key=f"backup_falhou:{execution.id}",
            )
        await backup_service.apply_retention(db, job)
        executados += 1
    return executados


async def verify_untested_backups(db: AsyncSession) -> int:
    """Backup nunca testado é backup não confiável — testa o mais antigo pendente."""
    limite = _now() - timedelta(days=7)
    executions = (
        await db.scalars(
            select(BackupExecution)
            .where(
                BackupExecution.status.in_(
                    [BackupStatus.CONCLUIDO.value, BackupStatus.CONCLUIDO_COM_ALERTA.value]
                ),
                (BackupExecution.verified_at.is_(None))
                | (BackupExecution.verified_at < limite),
            )
            .order_by(BackupExecution.started_at.desc())
            .limit(3)
        )
    ).all()
    for execution in executions:
        await backup_service.verify_execution(db, execution=execution)
    return len(executions)


async def cleanup_notifications(db: AsyncSession) -> int:
    limite = _now() - timedelta(days=180)
    old = (
        await db.scalars(
            select(Notification).where(
                Notification.created_at < limite,
                Notification.state != "nao_lida",
            )
        )
    ).all()
    for item in old:
        await db.delete(item)
    return len(old)


TASKS = [
    ("expiracao_links", expire_links),
    ("alertas_vencimento", expiry_alerts),
    ("limpeza_lixeira", purge_trash),
    ("limpeza_bloqueios", clean_locks),
    ("indexacao_texto", process_pending_index),
    ("alertas_armazenamento", storage_alerts),
    ("encerrar_solicitacoes", close_expired_requests),
    ("backup_agendado", scheduled_backups),
    ("verificacao_backup", verify_untested_backups),
    ("limpeza_notificacoes", cleanup_notifications),
]


async def run_all(only: Optional[str] = None) -> dict:
    """Executa as rotinas uma vez e devolve o resumo."""
    resultado = {}
    async with async_session() as db:
        for name, task in TASKS:
            if only and only != name:
                continue
            valor = await _guard(name, lambda t=task: t(db))
            resultado[name] = valor
            await db.commit()
    return resultado


async def loop() -> None:  # pragma: no cover - laço de longa duração
    logger.info(
        "Agendador iniciado (intervalo de %ss)", settings.SCHEDULER_INTERVAL_SECONDS
    )
    while True:
        try:
            await run_all()
        except Exception:
            logger.exception("Falha no ciclo do agendador")
        await asyncio.sleep(settings.SCHEDULER_INTERVAL_SECONDS)
