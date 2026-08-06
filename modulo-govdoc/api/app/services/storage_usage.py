"""Controle de armazenamento: consumo, cotas e alertas."""

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.document import Document, DocumentVersion
from app.models.governance import Notification, StorageQuota
from app.models.organization import Department, Institution, Secretariat

ALERT_LEVELS = [70, 80, 90, 95, 100]


async def used_bytes(
    db: AsyncSession,
    institution_id: uuid.UUID,
    *,
    secretariat_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    include_trash: bool = True,
) -> int:
    """Soma o tamanho de TODAS as versões (o histórico também ocupa espaço)."""
    stmt = (
        select(func.coalesce(func.sum(DocumentVersion.size_bytes), 0))
        .select_from(DocumentVersion)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(Document.institution_id == institution_id)
    )
    if secretariat_id:
        stmt = stmt.where(Document.secretariat_id == secretariat_id)
    if department_id:
        stmt = stmt.where(Document.department_id == department_id)
    if not include_trash:
        stmt = stmt.where(Document.deleted_at.is_(None))
    return int(await db.scalar(stmt) or 0)


async def effective_limit(
    db: AsyncSession,
    institution: Institution,
    *,
    secretariat_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
) -> Optional[int]:
    """Limite mais restritivo aplicável (setor → secretaria → instituição)."""
    limits = []
    if department_id:
        dept = await db.get(Department, department_id)
        if dept and dept.storage_limit_bytes:
            limits.append(dept.storage_limit_bytes)
    if secretariat_id:
        sec = await db.get(Secretariat, secretariat_id)
        if sec and sec.storage_limit_bytes:
            limits.append(sec.storage_limit_bytes)
    if institution.storage_limit_bytes:
        limits.append(institution.storage_limit_bytes)
    quota = await db.scalar(
        select(StorageQuota).where(
            StorageQuota.institution_id == institution.id,
            StorageQuota.scope_id == (department_id or secretariat_id),
        )
    )
    if quota:
        limits.append(quota.limit_bytes)
    return min(limits) if limits else None


async def ensure_space(
    db: AsyncSession,
    institution: Institution,
    incoming_bytes: int,
    *,
    secretariat_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
) -> None:
    """Bloqueia o envio quando estoura a cota — sempre com mensagem clara."""
    for scope_sec, scope_dep, label in (
        (None, department_id, "do setor"),
        (secretariat_id, None, "da secretaria"),
        (None, None, "da instituição"),
    ):
        if scope_dep is None and scope_sec is None and label != "da instituição":
            continue
        limit = await effective_limit(
            db, institution, secretariat_id=scope_sec, department_id=scope_dep
        )
        if not limit:
            continue
        used = await used_bytes(
            db, institution.id, secretariat_id=scope_sec, department_id=scope_dep
        )
        if used + incoming_bytes > limit:
            disponivel = max(limit - used, 0) / (1024 * 1024)
            raise AppError(
                f"O limite de armazenamento {label} foi atingido. "
                f"Espaço disponível: {disponivel:.1f} MB. "
                "Libere espaço na lixeira ou solicite aumento de cota ao administrador.",
                status_code=413,
                code="cota_excedida",
            )


async def usage_summary(db: AsyncSession, institution: Institution) -> dict:
    total_used = await used_bytes(db, institution.id)
    active_used = await used_bytes(db, institution.id, include_trash=False)
    trash_used = total_used - active_used

    by_secretariat = []
    secretariats = (
        await db.scalars(
            select(Secretariat).where(
                Secretariat.institution_id == institution.id,
                Secretariat.deleted_at.is_(None),
            )
        )
    ).all()
    for sec in secretariats:
        used = await used_bytes(db, institution.id, secretariat_id=sec.id)
        by_secretariat.append(
            {
                "id": str(sec.id),
                "nome": sec.name,
                "sigla": sec.acronym,
                "cor": sec.color,
                "bytes": used,
                "limite_bytes": sec.storage_limit_bytes,
            }
        )

    versions_bytes = int(
        await db.scalar(
            select(func.coalesce(func.sum(DocumentVersion.size_bytes), 0))
            .select_from(DocumentVersion)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(
                Document.institution_id == institution.id,
                DocumentVersion.is_current.is_(False),
            )
        )
        or 0
    )

    limit = institution.storage_limit_bytes
    return {
        "total_bytes": total_used,
        "ativos_bytes": active_used,
        "lixeira_bytes": trash_used,
        "versoes_antigas_bytes": versions_bytes,
        "limite_bytes": limit,
        "disponivel_bytes": (limit - total_used) if limit else None,
        "percentual": round(total_used / limit * 100, 2) if limit else None,
        "por_secretaria": sorted(by_secretariat, key=lambda item: -item["bytes"]),
    }


async def check_alerts(db: AsyncSession, institution: Institution) -> Optional[int]:
    """Retorna o nível de alerta atingido (70/80/90/95/100) ou None."""
    limit = institution.storage_limit_bytes
    if not limit:
        return None
    used = await used_bytes(db, institution.id)
    percent = used / limit * 100
    reached = [level for level in ALERT_LEVELS if percent >= level]
    return reached[-1] if reached else None


async def unread_alert_exists(db: AsyncSession, dedupe_key: str) -> bool:
    return bool(
        await db.scalar(select(Notification.id).where(Notification.dedupe_key == dedupe_key))
    )
