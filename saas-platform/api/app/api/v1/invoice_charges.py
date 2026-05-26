import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.payment_transaction import PaymentTransaction
from app.models.receivable import Receivable
from app.models.user import User
from app.providers import get_payment_provider
from app.providers.payment import ProviderCustomer

router = APIRouter(prefix="/invoices/{invoice_id}/charges", tags=["invoice-charges"])


class ChargePixResponse(BaseModel):
    id: str
    billing_type: str
    amount_cents: int
    status: str
    pix_qr_code_base64: Optional[str] = None
    pix_copy_paste: Optional[str] = None
    pix_expiration_date: Optional[str] = None
    external_id: str
    invoice_url: Optional[str] = None


class ChargeBoletoResponse(BaseModel):
    id: str
    billing_type: str
    amount_cents: int
    status: str
    bank_slip_url: Optional[str] = None
    boleto_identification_field: Optional[str] = None
    boleto_barcode: Optional[str] = None
    external_id: str
    invoice_url: Optional[str] = None


class ChargeCardResponse(BaseModel):
    id: str
    billing_type: str
    amount_cents: int
    status: str
    invoice_url: Optional[str] = None
    external_id: str


async def _validate_and_sync_customer(invoice: Invoice, db: AsyncSession, user: User) -> str:
    customer_result = await db.execute(
        select(Customer).where(Customer.id == invoice.customer_id)
    )
    customer = customer_result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=400, detail="Fatura sem cliente vinculado")
    if not customer.name:
        raise HTTPException(status_code=400, detail="Cliente sem nome")
    if not customer.doc_number:
        raise HTTPException(status_code=400, detail="Cliente sem CPF/CNPJ")
    if not customer.email:
        raise HTTPException(status_code=400, detail="Cliente sem e-mail")

    provider = get_payment_provider("asaas")

    if not customer.external_payment_customer_id:
        prov_customer = ProviderCustomer(
            external_id="",
            name=customer.name,
            email=customer.email,
            document=customer.doc_number,
            document_type=customer.doc_type.upper(),
            phone=customer.phone,
        )
        result = await provider.create_customer(prov_customer)
        customer.external_payment_customer_id = result.external_id
        await db.flush()

    return customer.external_payment_customer_id


async def _get_or_create_receivable(invoice: Invoice, db: AsyncSession) -> Receivable:
    result = await db.execute(
        select(Receivable).where(Receivable.invoice_id == invoice.id)
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        receivable = Receivable(
            organization_id=uuid.uuid4(),
            invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            original_amount_cents=invoice.amount_cents,
            open_amount_cents=invoice.amount_cents,
            due_date=invoice.due_date,
            status="open",
        )
        db.add(receivable)
        await db.flush()
    return receivable


@router.post("/pix", response_model=ChargePixResponse, status_code=201)
async def create_pix_charge(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    if invoice.status in ("paid", "cancelled", "refunded"):
        raise HTTPException(status_code=400, detail=f"Fatura está {invoice.status}")

    existing = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.invoice_id == invoice_id,
            PaymentTransaction.payment_method == "PIX",
            PaymentTransaction.status.in_(["pending", "created"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Já existe Pix ativo para esta fatura")

    external_customer_id = await _validate_and_sync_customer(invoice, db, user)
    receivable = await _get_or_create_receivable(invoice, db)

    from app.models.subscription import Subscription
    org_id = user.organization_id
    if invoice.subscription_id:
        sub_result = await db.execute(select(Subscription).where(Subscription.id == invoice.subscription_id))
        sub = sub_result.scalar_one_or_none()
        if sub:
            org_id = sub.organization_id

    provider = get_payment_provider("asaas")
    charge = await provider.create_charge(
        customer_external_id=external_customer_id,
        billing_type="PIX",
        amount_cents=invoice.amount_cents,
        due_date=invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        description=f"Fatura {invoice.invoice_number}",
        external_reference=str(invoice.id),
    )

    pix_qr = None
    if charge.external_id:
        try:
            pix_qr = await provider.get_pix_qr_code(charge.external_id)
        except Exception:
            pass

    tx = PaymentTransaction(
        organization_id=org_id or uuid.uuid4(),
        invoice_id=invoice.id,
        receivable_id=receivable.id,
        gateway="asaas",
        payment_method="PIX",
        amount_cents=invoice.amount_cents,
        status=charge.status,
        external_id=charge.external_id,
        is_sandbox=settings.ASAAS_ENV != "production",
    )
    db.add(tx)
    invoice.status = "awaiting_payment"
    await db.commit()
    await db.refresh(tx)

    return ChargePixResponse(
        id=str(tx.id),
        billing_type="PIX",
        amount_cents=tx.amount_cents,
        status=tx.status,
        pix_qr_code_base64=pix_qr.get("encodedImage") if pix_qr else None,
        pix_copy_paste=pix_qr.get("payload") if pix_qr else None,
        pix_expiration_date=pix_qr.get("expirationDate") if pix_qr else None,
        external_id=tx.external_id or "",
        invoice_url=charge.invoice_url,
    )


@router.post("/boleto", response_model=ChargeBoletoResponse, status_code=201)
async def create_boleto_charge(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    if invoice.status in ("paid", "cancelled", "refunded"):
        raise HTTPException(status_code=400, detail=f"Fatura está {invoice.status}")

    existing = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.invoice_id == invoice_id,
            PaymentTransaction.payment_method == "BOLETO",
            PaymentTransaction.status.in_(["pending", "created"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Já existe boleto ativo para esta fatura")

    external_customer_id = await _validate_and_sync_customer(invoice, db, user)
    receivable = await _get_or_create_receivable(invoice, db)

    provider = get_payment_provider("asaas")
    charge = await provider.create_charge(
        customer_external_id=external_customer_id,
        billing_type="BOLETO",
        amount_cents=invoice.amount_cents,
        due_date=invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        description=f"Fatura {invoice.invoice_number}",
        external_reference=str(invoice.id),
    )

    bank_slip_url = None
    boleto_field = None
    boleto_barcode = None
    if charge.external_id:
        try:
            bank_slip_url = await provider.get_boleto_pdf_url(charge.external_id)
            boleto_field = await provider.get_boleto_identification_field(charge.external_id)
        except Exception:
            pass

    from app.models.subscription import Subscription
    org_id = user.organization_id
    if invoice.subscription_id:
        sub_result = await db.execute(select(Subscription).where(Subscription.id == invoice.subscription_id))
        sub = sub_result.scalar_one_or_none()
        if sub:
            org_id = sub.organization_id

    tx = PaymentTransaction(
        organization_id=org_id or uuid.uuid4(),
        invoice_id=invoice.id,
        receivable_id=receivable.id,
        gateway="asaas",
        payment_method="BOLETO",
        amount_cents=invoice.amount_cents,
        status=charge.status,
        external_id=charge.external_id,
        is_sandbox=settings.ASAAS_ENV != "production",
    )
    db.add(tx)
    invoice.status = "awaiting_payment"
    await db.commit()
    await db.refresh(tx)

    return ChargeBoletoResponse(
        id=str(tx.id),
        billing_type="BOLETO",
        amount_cents=tx.amount_cents,
        status=tx.status,
        bank_slip_url=bank_slip_url or charge.bank_slip_url,
        boleto_identification_field=boleto_field or charge.boleto_identification_field,
        boleto_barcode=charge.boleto_barcode,
        external_id=tx.external_id or "",
        invoice_url=charge.invoice_url,
    )


@router.post("/card-link", response_model=ChargeCardResponse, status_code=201)
async def create_card_charge(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    if invoice.status in ("paid", "cancelled", "refunded"):
        raise HTTPException(status_code=400, detail=f"Fatura está {invoice.status}")

    external_customer_id = await _validate_and_sync_customer(invoice, db, user)
    receivable = await _get_or_create_receivable(invoice, db)

    provider = get_payment_provider("asaas")
    charge = await provider.create_charge(
        customer_external_id=external_customer_id,
        billing_type="CREDIT_CARD",
        amount_cents=invoice.amount_cents,
        due_date=invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        description=f"Fatura {invoice.invoice_number}",
        external_reference=str(invoice.id),
    )

    from app.models.subscription import Subscription
    org_id = user.organization_id
    if invoice.subscription_id:
        sub_result = await db.execute(select(Subscription).where(Subscription.id == invoice.subscription_id))
        sub = sub_result.scalar_one_or_none()
        if sub:
            org_id = sub.organization_id

    tx = PaymentTransaction(
        organization_id=org_id or uuid.uuid4(),
        invoice_id=invoice.id,
        receivable_id=receivable.id,
        gateway="asaas",
        payment_method="CREDIT_CARD",
        amount_cents=invoice.amount_cents,
        status=charge.status,
        external_id=charge.external_id,
        is_sandbox=settings.ASAAS_ENV != "production",
    )
    db.add(tx)
    invoice.status = "awaiting_payment"
    await db.commit()
    await db.refresh(tx)

    return ChargeCardResponse(
        id=str(tx.id),
        billing_type="CREDIT_CARD",
        amount_cents=tx.amount_cents,
        status=tx.status,
        invoice_url=charge.invoice_url,
        external_id=tx.external_id or "",
    )
