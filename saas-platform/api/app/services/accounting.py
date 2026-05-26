import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chart_of_account import ChartOfAccount
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine


async def create_journal_entry(
    db: AsyncSession,
    organization_id: uuid.UUID,
    entry_date: datetime,
    competence_date: datetime,
    description: str,
    origin: str,
    origin_id: Optional[str] = None,
    created_by: Optional[uuid.UUID] = None,
    lines: Optional[list[dict]] = None,
) -> JournalEntry:
    entry_number = await _next_entry_number(db, organization_id)
    entry = JournalEntry(
        organization_id=organization_id,
        entry_number=entry_number,
        entry_date=entry_date,
        competence_date=competence_date,
        description=description,
        origin=origin,
        origin_id=origin_id,
        status="draft",
        created_by=created_by,
    )
    db.add(entry)
    await db.flush()

    total_debit = 0
    total_credit = 0
    if lines:
        for line_data in lines:
            line = JournalEntryLine(
                entry_id=entry.id,
                account_id=line_data["account_id"],
                debit_cents=line_data.get("debit_cents", 0),
                credit_cents=line_data.get("credit_cents", 0),
                cost_center_id=line_data.get("cost_center_id"),
                customer_id=line_data.get("customer_id"),
                supplier_id=line_data.get("supplier_id"),
                history=line_data.get("history"),
                reference=line_data.get("reference"),
            )
            db.add(line)
            total_debit += line.debit_cents
            total_credit += line.credit_cents

    if total_debit != total_credit:
        raise ValueError(
            f"Journal entry not balanced: debits={total_debit} credits={total_credit}"
        )

    await db.commit()
    await db.refresh(entry)
    return entry


async def post_journal_entry(
    db: AsyncSession,
    entry_id: uuid.UUID,
    posted_by: uuid.UUID,
) -> JournalEntry:
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise ValueError("Entry not found")
    if entry.status != "draft":
        raise ValueError("Only draft entries can be posted")
    entry.status = "posted"
    entry.posted_at = datetime.now()
    entry.posted_by = posted_by
    await db.commit()
    await db.refresh(entry)
    return entry


async def reverse_journal_entry(
    db: AsyncSession,
    entry_id: uuid.UUID,
    reversed_by: uuid.UUID,
    reason: str,
) -> JournalEntry:
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise ValueError("Entry not found")
    if original.status != "posted":
        raise ValueError("Only posted entries can be reversed")

    from sqlalchemy import select as sel
    lines_result = await db.execute(
        sel(JournalEntryLine).where(JournalEntryLine.entry_id == entry_id)
    )
    original_lines = lines_result.scalars().all()

    reversal = JournalEntry(
        organization_id=original.organization_id,
        entry_number=await _next_entry_number(db, original.organization_id),
        entry_date=datetime.now(),
        competence_date=original.competence_date,
        description=f"Reversal: {original.description}",
        origin="reversal",
        origin_id=str(original.id),
        status="posted",
        posted_by=reversed_by,
        posted_at=datetime.now(),
    )
    db.add(reversal)
    await db.flush()

    for ol in original_lines:
        rl = JournalEntryLine(
            entry_id=reversal.id,
            account_id=ol.account_id,
            debit_cents=ol.credit_cents,
            credit_cents=ol.debit_cents,
            cost_center_id=ol.cost_center_id,
            customer_id=ol.customer_id,
            supplier_id=ol.supplier_id,
            history=f"Reversal: {ol.history or ''}",
            reference=ol.reference,
        )
        db.add(rl)

    original.status = "reversed"
    original.reversed_at = datetime.now()
    original.reversed_by = reversed_by
    original.reverse_reason = reason

    await db.commit()
    await db.refresh(reversal)
    return reversal


async def _next_entry_number(db: AsyncSession, organization_id: uuid.UUID) -> str:
    from sqlalchemy import select as sel, func as fn

    result = await db.execute(
        sel(fn.count(JournalEntry.id)).where(
            JournalEntry.organization_id == organization_id
        )
    )
    count = result.scalar() or 0
    now = datetime.now()
    return f"JE-{now.year}{now.month:02d}-{count + 1:05d}"
