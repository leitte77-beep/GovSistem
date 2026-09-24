import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_period import AccountingPeriod
from app.models.invoice import Invoice
from app.models.journal_entry import JournalEntry
from app.models.nfse_document import NfseDocument
from app.models.receivable import Receivable


async def check_closing_readiness(
    db: AsyncSession,
    organization_id: uuid.UUID,
    period_month: int,
    period_year: int,
) -> dict:
    pending_invoices = await db.scalar(
        select(func.count(Invoice.id)).where(
            Invoice.subscription_id.isnot(None),
            func.extract("year", Invoice.created_at) == period_year,
            func.extract("month", Invoice.created_at) == period_month,
            Invoice.status.in_(["open", "awaiting_payment"]),
        )
    ) or 0

    overdue_receivables = await db.scalar(
        select(func.count(Receivable.id)).where(
            Receivable.organization_id == organization_id,
            func.extract("year", Receivable.due_date) == period_year,
            func.extract("month", Receivable.due_date) == period_month,
            Receivable.status.in_(["open", "overdue"]),
        )
    ) or 0

    unbalanced_entries = 0
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.organization_id == organization_id,
            JournalEntry.status == "postado",
            func.extract("year", JournalEntry.competence_date) == period_year,
            func.extract("month", JournalEntry.competence_date) == period_month,
        )
    )
    entries = result.scalars().all()
    for entry in entries:
        from sqlalchemy import select as sel
        from app.models.journal_entry_line import JournalEntryLine
        lines_result = await db.execute(
            sel(
                func.coalesce(func.sum(JournalEntryLine.debit_cents), 0),
                func.coalesce(func.sum(JournalEntryLine.credit_cents), 0),
            ).where(JournalEntryLine.entry_id == entry.id)
        )
        debits, credits = lines_result.one()
        if debits != credits:
            unbalanced_entries += 1

    pending_nfse = await db.scalar(
        select(func.count(NfseDocument.id)).where(
            NfseDocument.organization_id == organization_id,
            NfseDocument.status.in_(["pending", "processing"]),
        )
    ) or 0

    completed = (
        pending_invoices == 0
        and overdue_receivables == 0
        and unbalanced_entries == 0
        and pending_nfse == 0
    )

    return {
        "period_month": period_month,
        "period_year": period_year,
        "ready_for_closing": completed,
        "pending_invoices": pending_invoices,
        "overdue_receivables": overdue_receivables,
        "unbalanced_entries": unbalanced_entries,
        "pending_nfse": pending_nfse,
    }
