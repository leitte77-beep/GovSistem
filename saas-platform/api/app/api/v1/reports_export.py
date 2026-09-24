import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.receivable import Receivable
from app.models.subscription import Subscription
from app.models.plan import Plan
from app.models.user import User

router = APIRouter(prefix="/exports", tags=["exports"])


def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}.csv"},
    )


@router.get("/invoices")
async def export_invoices(
    year: int = Query(None),
    month: int = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    ref = datetime.now(timezone.utc)
    year = year or ref.year
    month = month or ref.month

    result = await db.execute(
        select(Invoice, Subscription, Plan)
        .select_from(Invoice)
        .join(Subscription, Invoice.subscription_id == Subscription.id, isouter=True)
        .join(Plan, Subscription.plan_id == Plan.id, isouter=True)
        .where(
            func.extract("year", Invoice.created_at) == year,
            func.extract("month", Invoice.created_at) == month,
        )
    )
    rows = [["Número", "Status", "Valor", "Vencimento", "Plano", "Pagamento"]]
    for inv, sub, plan in result.all():
        rows.append([
            inv.invoice_number or "",
            inv.status or "",
            str(inv.amount_cents or 0),
            str(inv.due_date or ""),
            plan.name if plan else "",
            str(inv.paid_at or ""),
        ])
    return _csv_response(rows, f"faturas_{year}_{month:02d}")


@router.get("/journal-entries")
async def export_journal_entries(
    year: int = Query(None),
    month: int = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    ref = datetime.now(timezone.utc)
    year = year or ref.year
    month = month or ref.month

    result = await db.execute(
        select(JournalEntry, JournalEntryLine)
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == "posted",
            func.extract("year", JournalEntry.competence_date) == year,
            func.extract("month", JournalEntry.competence_date) == month,
        )
        .order_by(JournalEntry.entry_number, JournalEntryLine.id)
    )
    rows = [["Lançamento", "Data", "Conta", "Débito", "Crédito", "Histórico"]]
    for entry, line in result.all():
        rows.append([
            entry.entry_number or "",
            str(entry.entry_date or ""),
            str(line.account_id or ""),
            str(line.debit_cents or 0),
            str(line.credit_cents or 0),
            line.history or "",
        ])
    return _csv_response(rows, f"lancamentos_{year}_{month:02d}")


@router.get("/receivables")
async def export_receivables(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Receivable).order_by(Receivable.due_date)
    )
    recs = result.scalars().all()
    rows = [["Cliente", "Valor Original", "Saldo", "Vencimento", "Status", "Pagamento"]]
    for r in recs:
        rows.append([
            r.customer_name or "",
            str(r.original_amount_cents),
            str(r.open_amount_cents),
            str(r.due_date or ""),
            r.status or "",
            str(r.paid_at or ""),
        ])
    return _csv_response(rows, f"receivables_{datetime.now().strftime('%Y%m%d')}")
