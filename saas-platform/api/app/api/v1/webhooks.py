import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.models.chart_of_account import ChartOfAccount
from app.models.invoice import Invoice
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.fiscal_profile import FiscalProfile
from app.models.nfse_document import NfseDocument
from app.models.payment_transaction import PaymentTransaction
from app.models.receivable import Receivable
from app.models.webhook_event import WebhookEvent
from app.models.subscription import Subscription
from app.providers import get_fiscal_provider, get_payment_provider
from app.providers.asaas import AsaasPaymentProvider
from app.providers.fiscal import FiscalCompanyData, FiscalCustomerData, NfseData
from app.services.accounting import create_journal_entry

logger = logging.getLogger("saas.webhooks.payments")

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _compute_idempotency_key(payload: dict) -> str:
    event = payload.get("event", "")
    payment = payload.get("payment", {})
    payment_id = payment.get("id", "")
    return f"asaas:{event}:{payment_id}"


async def _try_emit_nfse(invoice_id: uuid.UUID, db: AsyncSession):
    inv_result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.subscription).selectinload(Subscription.organization))
        .where(Invoice.id == invoice_id)
    )
    invoice = inv_result.scalar_one_or_none()
    if not invoice or not invoice.subscription:
        return

    organization = invoice.subscription.organization
    if not organization:
        return

    existing = await db.execute(
        select(NfseDocument).where(
            NfseDocument.invoice_id == invoice_id,
            NfseDocument.status.in_(["authorized", "issued", "pending"]),
        )
    )
    if existing.scalar_one_or_none():
        logger.info("NFS-e already exists for invoice %s, skipping", invoice_id)
        return

    fiscal_profile_result = await db.execute(
        select(FiscalProfile).where(
            FiscalProfile.organization_id == organization.id,
            FiscalProfile.is_active == True,
        )
    )
    fiscal_profile = fiscal_profile_result.scalar_one_or_none()
    emission_policy = "on_payment_received"
    if fiscal_profile and hasattr(fiscal_profile, "nfse_emission_policy") and fiscal_profile.nfse_emission_policy:
        emission_policy = fiscal_profile.nfse_emission_policy

    if emission_policy not in ("on_payment_received", "on_payment_confirmed", "on_invoice_creation"):
        logger.info("NFS-e emission policy is '%s', skipping auto-emission for invoice %s", emission_policy, invoice_id)
        return

    provider = get_fiscal_provider()

    company = FiscalCompanyData(
        legal_name=organization.name or "Empresa",
        cnpj=re.sub(r"\D", "", organization.cnpj or "00000000000000"),
        city=getattr(organization, "city", None),
        state=getattr(organization, "state", None),
    )

    customer = FiscalCustomerData(
        name=organization.name or "Cliente",
        doc_type="cnpj",
        doc_number=re.sub(r"\D", "", organization.cnpj or "00000000000000"),
    )

    nfse_data = NfseData(
        rps_number=f"AUTO-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}",
        service_code="01.01",
        service_description=f"Assinatura - Fatura {invoice.invoice_number}",
        amount_cents=invoice.amount_cents,
    )

    doc = NfseDocument(
        organization_id=organization.id,
        invoice_id=invoice.id,
        provider=settings.FISCAL_PROVIDER,
        environment=settings.ASAAS_ENV,
        status="pending",
        rps_number=nfse_data.rps_number,
        service_code="01.01",
        service_description=nfse_data.service_description,
        gross_amount_cents=invoice.amount_cents,
        net_amount_cents=invoice.amount_cents,
        provider_payload={"auto_emitted": True, "source": "webhook"},
    )
    db.add(doc)
    await db.flush()

    result = await provider.issue_nfse(company=company, customer=customer, nfse=nfse_data, external_reference=str(doc.id))

    if result.success:
        doc.status = result.status
        doc.nfse_number = result.nfse_number
        doc.verification_code = result.verification_code
        doc.access_key = result.access_key
        doc.issue_date = datetime.fromisoformat(result.issue_date) if result.issue_date else None
        doc.xml_content = result.xml_content
        doc.pdf_content_base64 = result.pdf_content_base64
        doc.protocol = result.protocol
        doc.provider_response = result.provider_response
        logger.info("NFS-e auto-emitted: %s for invoice %s", result.nfse_number, invoice_id)
    else:
        doc.status = result.status
        doc.rejection_reason = result.rejection_reason
        doc.provider_response = result.provider_response
        logger.warning("NFS-e auto-emission failed for invoice %s: %s", invoice_id, result.rejection_reason)


async def _create_payment_journal_entry(
    tx: PaymentTransaction,
    invoice_id: uuid.UUID,
    organization_id: uuid.UUID,
    amount_cents: int,
    fee_cents: int,
    db: AsyncSession,
):
    result = await db.execute(
        select(ChartOfAccount).where(
            ChartOfAccount.organization_id == organization_id,
            ChartOfAccount.is_system == True,
            ChartOfAccount.code.in_(["1.1.3", "1.1.4", "3.1", "5.1.1"]),
        )
    )
    accounts = result.scalars().all()
    acc_map = {a.code: a.id for a in accounts}

    now = datetime.now(timezone.utc)
    lines = []

    if fee_cents > 0:
        net_amount = amount_cents - fee_cents
        lines.append({"account_id": acc_map.get("1.1.3"), "debit_cents": net_amount, "credit_cents": 0, "history": "Recebimento fatura"})
        lines.append({"account_id": acc_map.get("1.1.4"), "credit_cents": net_amount, "debit_cents": 0, "history": "Baixa contas a receber"})
        lines.append({"account_id": acc_map.get("5.1.1"), "debit_cents": fee_cents, "credit_cents": 0, "history": "Taxa do gateway"})
        lines.append({"account_id": acc_map.get("1.1.3"), "credit_cents": fee_cents, "debit_cents": 0, "history": "Taxa do gateway"})
    else:
        lines.append({"account_id": acc_map.get("1.1.3"), "debit_cents": amount_cents, "credit_cents": 0, "history": "Recebimento fatura"})
        lines.append({"account_id": acc_map.get("1.1.4"), "credit_cents": amount_cents, "debit_cents": 0, "history": "Baixa contas a receber"})

    try:
        await create_journal_entry(
            db=db,
            organization_id=organization_id,
            entry_date=now,
            competence_date=now,
            description=f"Recebimento fatura via {tx.gateway}/{tx.payment_method}",
            origin="payment",
            origin_id=str(tx.id),
            lines=lines,
        )
        logger.info("Journal entry created for payment tx %s", tx.id)
    except ValueError as e:
        logger.warning("Failed to create journal entry for tx %s: %s", tx.id, e)


webhook_limiter = Limiter(key_func=get_remote_address)


@router.post("/payments/asaas")
@webhook_limiter.limit("20/minute")
async def asaas_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    provider: AsaasPaymentProvider = get_payment_provider("asaas")

    body_bytes = await request.body()
    signature = request.headers.get("asaas-signature", "")
    payload = json.loads(body_bytes)

    idempotency_key = _compute_idempotency_key(payload)

    signature_valid = provider.verify_webhook(body_bytes, signature)
    if not signature_valid:
        logger.warning("Asaas webhook signature invalid")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event = provider.parse_webhook(payload, dict(request.headers))
    if not event:
        logger.warning("Unknown webhook event: %s", payload.get("event"))
        return {"status": "ignored"}

    logger.info("Webhook: event=%s external_id=%s", event.event_type, event.external_id)

    payment = payload.get("payment", {})
    import hashlib
    import json as _json
    payload_hash = hashlib.sha256(body_bytes).hexdigest()
    webhook_event = WebhookEvent(
        provider="asaas",
        environment=settings.ASAAS_ENV,
        external_event_id=payload.get("id", payment.get("id", "")),
        event_type=event.event_type,
        external_object_id=event.external_id,
        payload_hash=payload_hash,
        payload_sanitized=_json.loads(_json.dumps(payload, default=str)),
        signature_valid=signature_valid,
        processing_status="received",
        received_at=datetime.now(timezone.utc),
        idempotency_key=idempotency_key,
    )
    db.add(webhook_event)
    await db.flush()

    charge_external_id = payment.get("id", "")
    if not charge_external_id:
        return {"status": "ignored"}

    try:
        provider_charge = await provider.get_charge(charge_external_id)
    except Exception as exc:
        logger.error("Failed to fetch charge %s: %s", charge_external_id, exc)
        return {"status": "error", "error": str(exc)}

    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.external_id == charge_external_id)
    )
    tx = result.scalar_one_or_none()

    if not tx:
        if event.event_type in ("payment.created", "payment.pending"):
            invoice_id = None
            ref = payment.get("externalReference", "")
            if len(ref) >= 36:
                try:
                    invoice_id = uuid.UUID(ref[:36])
                except ValueError:
                    pass

            tx = PaymentTransaction(
                organization_id=invoice_id or uuid.uuid4(),
                invoice_id=invoice_id,
                gateway="asaas",
                payment_method=payment.get("billingType", "UNDEFINED"),
                amount_cents=provider_charge.amount_cents,
                status=provider_charge.status,
                external_id=charge_external_id,
                is_sandbox=settings.ASAAS_ENV != "production",
                extra_data={"idempotency_key": idempotency_key},
            )
            db.add(tx)
            await db.commit()
            await db.refresh(tx)
            logger.info("Charge %s created new tx", charge_external_id)
        return {"status": "created"}

    if tx.status == provider_charge.status and tx.status in ("received", "confirmed", "paid"):
        logger.info("Charge %s already processed, skipping", charge_external_id)
        return {"status": "duplicate"}

    old_status = tx.status
    tx.status = provider_charge.status
    if provider_charge.fee_amount_cents is not None:
        tx.gateway_fee_cents = provider_charge.fee_amount_cents
    extra = tx.extra_data or {}
    extra["idempotency_key"] = idempotency_key
    extra["gateway_response"] = {k: v for k, v in payment.items() if k not in ("creditCard",)}
    tx.extra_data = extra

    is_paid = provider_charge.status in ("received", "confirmed")
    if is_paid and old_status not in ("received", "confirmed", "paid"):
        if provider_charge.amount_cents != tx.amount_cents:
            logger.warning(
                "Value mismatch for charge %s: tx=%d provider=%d",
                charge_external_id, tx.amount_cents, provider_charge.amount_cents,
            )
            extra["value_divergence"] = {
                "expected_cents": tx.amount_cents,
                "received_cents": provider_charge.amount_cents,
            }
            tx.status = "divergent"
            await db.commit()
            return {"status": "divergent", "detail": "Valor divergente"}

        tx.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

        invoice_id = tx.invoice_id
        if invoice_id:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv and inv.status not in ("paid", "cancelled", "refunded"):
                inv.status = "paid"
                inv.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

            sub_id = None
            if inv and hasattr(inv, "subscription_id") and inv.subscription_id:
                sub_id = inv.subscription_id
            if sub_id:
                sub_result = await db.execute(select(Subscription).where(Subscription.id == sub_id))
                sub = sub_result.scalar_one_or_none()
                if sub and sub.status == "past_due":
                    sub.status = "active"

            await db.flush()
            try:
                await _try_emit_nfse(invoice_id, db)
            except Exception as exc:
                logger.error("Failed to auto-emit NFS-e for invoice %s: %s", invoice_id, exc)

            try:
                org_id = tx.organization_id
                fee = provider_charge.fee_amount_cents or 0
                await _create_payment_journal_entry(tx, invoice_id, org_id, provider_charge.amount_cents, fee, db)
            except Exception as exc:
                logger.error("Failed to create journal entry for tx %s: %s", tx.id, exc)

    is_overdue = provider_charge.status == "overdue"
    if is_overdue and old_status not in ("overdue",):
        invoice_id = tx.invoice_id
        if invoice_id:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv and inv.status not in ("paid", "cancelled", "refunded"):
                inv.status = "overdue"

            rec_result = await db.execute(
                select(Receivable).where(Receivable.invoice_id == invoice_id)
            )
            for rec in rec_result.scalars().all():
                if rec.status not in ("paid", "cancelled"):
                    rec.status = "overdue"

    is_refund = provider_charge.status in ("refunded", "partially_refunded")
    if is_refund:
        invoice_id = tx.invoice_id
        if invoice_id:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv and inv.status not in ("refunded", "cancelled"):
                if provider_charge.status == "refunded":
                    inv.status = "refunded"

            await db.flush()
            try:
                org_id = tx.organization_id
                lines = [
                    {"account_id": None, "debit_cents": provider_charge.amount_cents, "credit_cents": 0, "history": f"Estorno recebimento - tx {tx.id}"},
                    {"account_id": None, "credit_cents": provider_charge.amount_cents, "debit_cents": 0, "history": f"Baixa de recebivel estornado - tx {tx.id}"},
                ]
                await create_journal_entry(
                    db=db,
                    organization_id=org_id,
                    entry_date=datetime.now(timezone.utc),
                    competence_date=datetime.now(timezone.utc),
                    description=f"Estorno de pagamento - {tx.gateway}/{tx.payment_method}",
                    origin="refund",
                    origin_id=str(tx.id),
                    lines=lines,
                )
            except Exception as exc:
                logger.error("Failed to create refund journal entry for tx %s: %s", tx.id, exc)

    is_chargeback = "chargeback" in provider_charge.status
    if is_chargeback:
        invoice_id = tx.invoice_id
        if invoice_id:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.status = "chargeback"

            await db.flush()
            try:
                org_id = tx.organization_id
                lines = [
                    {"account_id": None, "debit_cents": provider_charge.amount_cents, "credit_cents": 0, "history": f"Chargeback - tx {tx.id}"},
                    {"account_id": None, "credit_cents": provider_charge.amount_cents, "debit_cents": 0, "history": f"Perda por chargeback - tx {tx.id}"},
                ]
                await create_journal_entry(
                    db=db,
                    organization_id=org_id,
                    entry_date=datetime.now(timezone.utc),
                    competence_date=datetime.now(timezone.utc),
                    description=f"Chargeback - {tx.gateway}/{tx.payment_method}",
                    origin="chargeback",
                    origin_id=str(tx.id),
                    lines=lines,
                )
            except Exception as exc:
                logger.error("Failed to create chargeback journal entry for tx %s: %s", tx.id, exc)

    await db.commit()
    logger.info("Charge %s updated: %s -> %s", charge_external_id, old_status, provider_charge.status)
    return {"status": "processed"}
