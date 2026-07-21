import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.panic_button import PanicButton

logger = logging.getLogger("govsocial.panic_button")


async def activate(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    person_id: uuid.UUID,
    lat: float | None = None,
    lng: float | None = None,
    address: str | None = None,
    family_id: uuid.UUID | None = None,
) -> PanicButton:
    panic = PanicButton(
        tenant_id=tenant_id,
        person_id=person_id,
        family_id=family_id,
        activated_at=datetime.now(timezone.utc),
        location_lat=lat,
        location_lng=lng,
        location_address=address,
        status="ATIVO",
    )
    db.add(panic)
    await db.flush()
    await db.refresh(panic)
    logger.info(
        "PanicButton ativado: id=%s person=%s tenant=%s lat=%s lng=%s",
        panic.id, person_id, tenant_id, lat, lng,
    )
    await notify_authorities(db, panic)
    return panic


async def attend(
    db: AsyncSession,
    panic_id: uuid.UUID,
    user_id: uuid.UUID,
) -> PanicButton | None:
    panic = await _get_panic(db, panic_id)
    if not panic or panic.status != "ATIVO":
        return None
    panic.status = "ATENDIDO"
    panic.attended_by = user_id
    panic.attended_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(panic)
    logger.info("PanicButton atendido: id=%s user=%s", panic_id, user_id)
    return panic


async def resolve(
    db: AsyncSession,
    panic_id: uuid.UUID,
    status: str,
    notes: str | None = None,
    medida_protetiva_numero: str | None = None,
    medida_protetiva_validade: str | None = None,
) -> PanicButton | None:
    panic = await _get_panic(db, panic_id)
    if not panic:
        return None
    panic.status = status
    if notes:
        panic.notes = notes
    if medida_protetiva_numero:
        panic.medida_protetiva_numero = medida_protetiva_numero
    if medida_protetiva_validade:
        panic.medida_protetiva_validade = medida_protetiva_validade
    await db.flush()
    await db.refresh(panic)
    logger.info("PanicButton resolvido: id=%s status=%s", panic_id, status)
    return panic


async def list_active(db: AsyncSession, tenant_id: uuid.UUID) -> list[PanicButton]:
    result = await db.execute(
        select(PanicButton)
        .where(
            PanicButton.tenant_id == tenant_id,
            PanicButton.status == "ATIVO",
            PanicButton.deleted_at.is_(None),
        )
        .order_by(PanicButton.activated_at.desc())
    )
    return list(result.scalars().all())


async def list_history(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list[PanicButton]:
    result = await db.execute(
        select(PanicButton)
        .where(
            PanicButton.tenant_id == tenant_id,
            PanicButton.deleted_at.is_(None),
        )
        .order_by(PanicButton.activated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


async def _get_panic(db: AsyncSession, panic_id: uuid.UUID) -> PanicButton | None:
    result = await db.execute(
        select(PanicButton).where(
            PanicButton.id == panic_id,
            PanicButton.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def notify_authorities(db: AsyncSession, panic: PanicButton) -> None:
    logger.info(
        "NOTIFICACAO_AUTORIDADES: PanicButton %s ativado. "
        "Person=%s Tenant=%s Lat=%s Lng=%s Address=%s",
        panic.id, panic.person_id, panic.tenant_id,
        panic.location_lat, panic.location_lng, panic.location_address,
    )
