import asyncio
import json
import logging
from datetime import datetime, timezone

from app.core.database import async_session
from app.models.webhook_event import WebhookEvent
from app.services.accounting import create_journal_entry

logger = logging.getLogger("saas.tasks.webhooks")


async def process_webhook_event(event_id: str) -> dict:
    async with async_session() as db:
        from sqlalchemy import select
        from app.models.payment_transaction import PaymentTransaction
        from app.models.invoice import Invoice
        from app.models.receivable import Receivable
        from app.models.subscription import Subscription
        from app.models.nfse_document import NfseDocument
        from app.models.chart_of_account import ChartOfAccount
        from app.providers import get_fiscal_provider, get_payment_provider
        from app.providers.fiscal import FiscalCompanyData, FiscalCustomerData, NfseData
        from app.api.v1.webhooks import _create_payment_journal_entry, _try_emit_nfse

        import uuid

        result = await db.execute(
            select(WebhookEvent).where(WebhookEvent.id == event_id)
        )
        event = result.scalar_one_or_none()
        if not event:
            return {"status": "error", "message": "Evento não encontrado"}
        if event.processing_status != "received":
            return {"status": "skipped", "message": "Evento já processado"}

        event.processing_status = "processing"
        await db.flush()

        try:
            payload = event.payload_sanitized or {}
            payment_data = payload.get("payment", payload)
            charge_external_id = payment_data.get("id", "")

            if not charge_external_id:
                event.processing_status = "ignored"
                await db.commit()
                return {"status": "ignored"}

            provider = get_payment_provider("asaas")
            provider_charge = await provider.get_charge(charge_external_id)

            tx_result = await db.execute(
                select(PaymentTransaction).where(
                    PaymentTransaction.external_id == charge_external_id
                )
            )
            tx = tx_result.scalar_one_or_none()

            if not tx:
                event.processing_status = "ignored"
                await db.commit()
                return {"status": "ignored", "message": "Transação não encontrada"}

            old_status = tx.status
            tx.status = provider_charge.status
            if provider_charge.fee_amount_cents is not None:
                tx.gateway_fee_cents = provider_charge.fee_amount_cents

            is_paid = provider_charge.status in ("received", "confirmed")
            if is_paid and old_status not in ("received", "confirmed", "paid"):
                tx.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

                invoice_id = tx.invoice_id
                if invoice_id:
                    inv_result = await db.execute(
                        select(Invoice).where(Invoice.id == invoice_id)
                    )
                    inv = inv_result.scalar_one_or_none()
                    if inv and inv.status not in ("paid", "cancelled", "refunded"):
                        inv.status = "paid"
                        inv.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

                    sub_id = None
                    if inv and hasattr(inv, "subscription_id") and inv.subscription_id:
                        sub_id = inv.subscription_id
                    if sub_id:
                        sub_result = await db.execute(
                            select(Subscription).where(Subscription.id == sub_id)
                        )
                        sub = sub_result.scalar_one_or_none()
                        if sub and sub.status == "past_due":
                            sub.status = "active"

                    await db.flush()
                    try:
                        await _try_emit_nfse(invoice_id, db)
                    except Exception as exc:
                        logger.error("NFS-e auto-emission failed: %s", exc)

                    try:
                        org_id = tx.organization_id
                        fee = provider_charge.fee_amount_cents or 0
                        await _create_payment_journal_entry(
                            tx, invoice_id, org_id,
                            provider_charge.amount_cents, fee, db
                        )
                    except Exception as exc:
                        logger.error("Journal entry failed: %s", exc)

            is_overdue = provider_charge.status == "overdue"
            if is_overdue and old_status not in ("overdue",):
                invoice_id = tx.invoice_id
                if invoice_id:
                    inv_result = await db.execute(
                        select(Invoice).where(Invoice.id == invoice_id)
                    )
                    inv = inv_result.scalar_one_or_none()
                    if inv and inv.status not in ("paid", "cancelled", "refunded"):
                        inv.status = "overdue"

            is_refund = provider_charge.status in ("refunded", "partially_refunded")
            if is_refund:
                invoice_id = tx.invoice_id
                if invoice_id:
                    inv_result = await db.execute(
                        select(Invoice).where(Invoice.id == invoice_id)
                    )
                    inv = inv_result.scalar_one_or_none()
                    if inv and inv.status not in ("refunded", "cancelled"):
                        if provider_charge.status == "refunded":
                            inv.status = "refunded"

            event.processing_status = "processed"
            event.processed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"status": "processed"}

        except Exception as exc:
            event.attempts = (event.attempts or 0) + 1
            event.error_message = str(exc)
            event.processing_status = "failed" if event.attempts >= 3 else "retrying"
            await db.commit()
            logger.error("Webhook processing failed: %s", exc)
            return {"status": "error", "message": str(exc)}
