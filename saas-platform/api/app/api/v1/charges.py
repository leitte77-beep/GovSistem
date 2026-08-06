import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.payment_transaction import PaymentTransaction
from app.models.receivable import Receivable
from app.models.user import User
from app.providers.payment import ProviderCustomer
from app.providers import get_payment_provider
from app.providers.asaas import AsaasPaymentProvider

router = APIRouter(prefix="/charges", tags=["charges"])


class CreateChargeRequest(BaseModel):
    billing_type: str
    amount_cents: int
    due_date: str
    description: str
    customer_name: str
    customer_document: str
    customer_email: str
    customer_document_type: str = "cpf"
    customer_phone: Optional[str] = None
    invoice_id: Optional[str] = None
    receivable_id: Optional[str] = None


class ChargeResponse(BaseModel):
    id: str
    billing_type: str
    amount_cents: int
    due_date: str
    status: str
    invoice_url: Optional[str] = None
    bank_slip_url: Optional[str] = None
    boleto_barcode: Optional[str] = None
    boleto_identification_field: Optional[str] = None
    pix_qr_code_base64: Optional[str] = None
    pix_copy_paste: Optional[str] = None
    pix_expiration_date: Optional[str] = None
    external_id: str
    created_at: str


class PixQrCodeResponse(BaseModel):
    encoded_image: Optional[str] = None
    payload: Optional[str] = None
    expiration_date: Optional[str] = None


class ChargeListResponse(BaseModel):
    data: list[ChargeResponse]
    total: int


@router.post("", response_model=ChargeResponse, status_code=201)
async def create_charge(
    body: CreateChargeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    provider: AsaasPaymentProvider = get_payment_provider("asaas")
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    receivable = None
    invoice = None

    if body.invoice_id:
        result = await db.execute(
            select(Invoice).where(Invoice.id == body.invoice_id)
        )
        invoice = result.scalar_one_or_none()

    if body.receivable_id:
        result = await db.execute(
            select(Receivable).where(Receivable.id == body.receivable_id)
        )
        receivable = result.scalar_one_or_none()

    provider_customer = ProviderCustomer(
        external_id="",
        name=body.customer_name,
        email=body.customer_email,
        document=body.customer_document,
        document_type=body.customer_document_type.upper(),
        phone=body.customer_phone,
    )

    customer = await provider.create_customer(provider_customer)

    external_ref = str(body.receivable_id or body.invoice_id or "")

    charge = await provider.create_charge(
        customer_external_id=customer.external_id,
        billing_type=body.billing_type,
        amount_cents=body.amount_cents,
        due_date=body.due_date,
        description=body.description,
        external_reference=external_ref,
    )

    pix_qr = None
    if body.billing_type == "PIX" and charge.external_id:
        try:
            pix_qr = await provider.get_pix_qr_code(charge.external_id)
        except Exception:
            pix_qr = None

    bank_slip_url = None
    boleto_field = None
    boleto_barcode = None
    if body.billing_type == "BOLETO" and charge.external_id:
        try:
            bank_slip_url = await provider.get_boleto_pdf_url(charge.external_id)
            boleto_field = await provider.get_boleto_identification_field(charge.external_id)
        except Exception:
            pass

    payment_tx = PaymentTransaction(
        organization_id=user.organization_id,
        invoice_id=body.invoice_id,
        receivable_id=receivable.id if receivable else None,
        gateway="asaas",
        payment_method=body.billing_type,
        amount_cents=body.amount_cents,
        status=charge.status,
        external_id=charge.external_id,
        extra_data={},
        is_sandbox=settings.ASAAS_ENV != "production",
    )
    db.add(payment_tx)
    await db.flush()

    if invoice and invoice.status not in ("paid", "cancelled", "awaiting_payment"):
        invoice.status = "awaiting_payment"

    if receivable:
        receivable.status = "open"

    await db.commit()

    return ChargeResponse(
        id=str(payment_tx.id),
        billing_type=body.billing_type,
        amount_cents=body.amount_cents,
        due_date=body.due_date,
        status=charge.status,
        invoice_url=charge.invoice_url,
        bank_slip_url=bank_slip_url or charge.bank_slip_url,
        boleto_barcode=boleto_barcode or charge.boleto_barcode,
        boleto_identification_field=boleto_field or charge.boleto_identification_field,
        pix_qr_code_base64=(pix_qr or {}).get("encodedImage") if pix_qr else None,
        pix_copy_paste=(pix_qr or {}).get("payload") if pix_qr else None,
        pix_expiration_date=(pix_qr or {}).get("expirationDate") if pix_qr else None,
        external_id=charge.external_id,
        created_at=str(now),
    )


@router.get("", response_model=ChargeListResponse)
async def list_charges(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    billing_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(PaymentTransaction)
    count_query = select(func.count(PaymentTransaction.id))

    if status:
        query = query.where(PaymentTransaction.status == status)
        count_query = count_query.where(PaymentTransaction.status == status)
    if billing_type:
        query = query.where(PaymentTransaction.payment_method == billing_type)
        count_query = count_query.where(PaymentTransaction.payment_method == billing_type)

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(query.order_by(PaymentTransaction.created_at.desc()).offset(skip).limit(per_page))
    items = result.scalars().all()

    data = []
    for tx in items:
        data.append(ChargeResponse(
            id=str(tx.id),
            billing_type=tx.payment_method or "",
            amount_cents=tx.amount_cents or 0,
            due_date="",
            status=tx.status or "",
            external_id=tx.external_id or "",
            created_at=str(tx.created_at),
        ))

    return ChargeListResponse(data=data, total=total)


@router.get("/{charge_id}/pix-qr", response_model=PixQrCodeResponse)
async def get_charge_pix_qr(
    charge_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.id == charge_id)
    )
    tx = result.scalar_one_or_none()
    if not tx or not tx.external_id:
        raise HTTPException(status_code=404, detail="Cobranca nao encontrada")

    if tx.payment_method != "PIX":
        raise HTTPException(status_code=400, detail="Cobranca nao e Pix")

    provider = get_payment_provider("asaas")
    qr = await provider.get_pix_qr_code(tx.external_id)

    return PixQrCodeResponse(
        encoded_image=qr.get("encodedImage"),
        payload=qr.get("payload"),
        expiration_date=qr.get("expirationDate"),
    )


@router.post("/{charge_id}/cancel", response_model=ChargeResponse)
async def cancel_charge(
    charge_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.id == charge_id)
    )
    tx = result.scalar_one_or_none()
    if not tx or not tx.external_id:
        raise HTTPException(status_code=404, detail="Cobranca nao encontrada")

    provider = get_payment_provider("asaas")
    cancelled = await provider.cancel_charge(tx.external_id)

    tx.status = cancelled.status
    await db.commit()

    return ChargeResponse(
        id=str(tx.id),
        billing_type=tx.payment_method or "",
        amount_cents=tx.amount_cents or 0,
        due_date="",
        status=cancelled.status,
        external_id=cancelled.external_id,
        created_at=str(tx.created_at),
    )
