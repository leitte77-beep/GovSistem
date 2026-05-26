from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.nfse_document import NfseDocument
from app.models.payment_transaction import PaymentTransaction
from app.models.receivable import Receivable
from app.models.user import User

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/finance")
async def finance_metrics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    payments_received = await db.scalar(
        select(func.count(PaymentTransaction.id)).where(
            PaymentTransaction.status.in_(["received", "confirmed"]),
            PaymentTransaction.updated_at >= month_start,
        )
    ) or 0

    payments_pending = await db.scalar(
        select(func.count(PaymentTransaction.id)).where(
            PaymentTransaction.status.in_(["pending", "created"]),
        )
    ) or 0

    invoices_paid = await db.scalar(
        select(func.count(Invoice.id)).where(
            Invoice.status == "paid",
            Invoice.paid_at >= month_start,
        )
    ) or 0

    invoices_overdue = await db.scalar(
        select(func.count(Invoice.id)).where(Invoice.status == "overdue")
    ) or 0

    nfse_authorized = await db.scalar(
        select(func.count(NfseDocument.id)).where(
            NfseDocument.status == "authorized",
            NfseDocument.created_at >= month_start,
        )
    ) or 0

    nfse_rejected = await db.scalar(
        select(func.count(NfseDocument.id)).where(
            NfseDocument.status == "rejected",
            NfseDocument.created_at >= month_start,
        )
    ) or 0

    receivable_pending = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status.in_(["open", "overdue"]),
        )
    ) or 0

    return {
        "payments_received_month": payments_received,
        "payments_pending": payments_pending,
        "invoices_paid_month": invoices_paid,
        "invoices_overdue": invoices_overdue,
        "nfse_authorized_month": nfse_authorized,
        "nfse_rejected_month": nfse_rejected,
        "receivable_pending_cents": receivable_pending,
        "timestamp": now.isoformat(),
    }
