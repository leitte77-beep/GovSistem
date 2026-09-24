import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.accounting_period import AccountingPeriod
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.user import User
from app.services.accounting import (
    create_journal_entry,
    post_journal_entry,
    reverse_journal_entry,
)

router = APIRouter(prefix="/journal-entries", tags=["journal-entries"])


class JournalLineCreate(BaseModel):
    account_id: str
    debit_cents: int = 0
    credit_cents: int = 0
    cost_center_id: Optional[str] = None
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    history: Optional[str] = None


class JournalEntryCreate(BaseModel):
    entry_date: str
    competence_date: str
    description: str
    origin: str = "manual"
    origin_id: Optional[str] = None
    lines: list[JournalLineCreate]


class JournalEntryResponse(BaseModel):
    id: uuid.UUID
    entry_number: str
    entry_date: str
    competence_date: str
    description: str
    origin: str
    origin_id: Optional[str] = None
    status: str
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None
    lines: list[dict] = []
    created_at: str

    model_config = {"from_attributes": True}


class PaginatedEntries(BaseModel):
    data: list[JournalEntryResponse]
    total: int
    page: int
    per_page: int


async def _entry_to_response(entry: JournalEntry) -> JournalEntryResponse:
    lines = []
    for line in entry.lines or []:
        lines.append({
            "id": str(line.id),
            "account_id": str(line.account_id),
            "debit_cents": line.debit_cents,
            "credit_cents": line.credit_cents,
            "cost_center_id": str(line.cost_center_id) if line.cost_center_id else None,
            "history": line.history,
        })

    return JournalEntryResponse(
        id=entry.id,
        entry_number=entry.entry_number,
        entry_date=entry.entry_date.isoformat() if entry.entry_date else "",
        competence_date=entry.competence_date.isoformat() if entry.competence_date else "",
        description=entry.description,
        origin=entry.origin,
        origin_id=entry.origin_id,
        status=entry.status,
        posted_at=entry.posted_at.isoformat() if entry.posted_at else None,
        posted_by=str(entry.posted_by) if entry.posted_by else None,
        lines=lines,
        created_at=str(entry.created_at),
    )


@router.get("", response_model=PaginatedEntries)
async def list_entries(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    origin: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(JournalEntry).options(selectinload(JournalEntry.lines))
    count_query = select(func.count(JournalEntry.id))

    if status:
        query = query.where(JournalEntry.status == status)
        count_query = count_query.where(JournalEntry.status == status)
    if origin:
        query = query.where(JournalEntry.origin == origin)
        count_query = count_query.where(JournalEntry.origin == origin)
    if year:
        query = query.where(func.extract("year", JournalEntry.competence_date) == year)
        count_query = count_query.where(func.extract("year", JournalEntry.competence_date) == year)
    if month:
        query = query.where(func.extract("month", JournalEntry.competence_date) == month)
        count_query = count_query.where(func.extract("month", JournalEntry.competence_date) == month)

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(query.order_by(JournalEntry.entry_date.desc()).offset(skip).limit(per_page))
    items = result.scalars().all()

    data = [await _entry_to_response(e) for e in items]
    return PaginatedEntries(data=data, total=total, page=page, per_page=per_page)


@router.get("/{entry_id}", response_model=JournalEntryResponse)
async def get_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(JournalEntry).options(selectinload(JournalEntry.lines)).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Lancamento contabil nao encontrado")
    return await _entry_to_response(entry)


@router.post("", response_model=JournalEntryResponse, status_code=201)
async def create_entry(
    body: JournalEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    period_check = await db.execute(
        select(AccountingPeriod).where(
            AccountingPeriod.organization_id == user.organization_id,
            AccountingPeriod.status == "closed",
            AccountingPeriod.start_date <= body.competence_date,
            AccountingPeriod.end_date >= body.competence_date,
        )
    )
    closed_period = period_check.scalar_one_or_none()
    if closed_period:
        raise HTTPException(
            status_code=400,
            detail=f"Periodo {closed_period.year}/{closed_period.month} esta fechado. Reabra antes de lancar.",
        )

    lines_data = []
    for line in body.lines:
        if line.debit_cents == 0 and line.credit_cents == 0:
            raise HTTPException(status_code=400, detail="Linha sem valor de debito ou credito")
        lines_data.append({
            "account_id": uuid.UUID(line.account_id),
            "debit_cents": line.debit_cents,
            "credit_cents": line.credit_cents,
            "cost_center_id": uuid.UUID(line.cost_center_id) if line.cost_center_id else None,
            "customer_id": uuid.UUID(line.customer_id) if line.customer_id else None,
            "supplier_id": uuid.UUID(line.supplier_id) if line.supplier_id else None,
            "history": line.history,
        })

    try:
        entry = await create_journal_entry(
            db=db,
            organization_id=user.organization_id,
            entry_date=datetime.fromisoformat(body.entry_date) if body.entry_date else datetime.now(timezone.utc),
            competence_date=datetime.fromisoformat(body.competence_date) if body.competence_date else datetime.now(timezone.utc),
            description=body.description,
            origin=body.origin,
            origin_id=body.origin_id,
            created_by=user.id,
            lines=lines_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return await _entry_to_response(entry)


@router.post("/{entry_id}/post", response_model=JournalEntryResponse)
async def post_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    entry = await post_journal_entry(db, entry_id, user.id)
    return await _entry_to_response(entry)


@router.post("/{entry_id}/reverse", response_model=JournalEntryResponse)
async def reverse_entry(
    entry_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    reason = body.get("reason", "Estorno manual")
    entry = await reverse_journal_entry(db, entry_id, user.id, reason)
    return await _entry_to_response(entry)
