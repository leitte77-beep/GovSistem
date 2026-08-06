import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.payment_transaction import PaymentTransaction
from app.models.user import User
from app.providers import get_payment_provider

router = APIRouter(prefix="/payment-charges", tags=["payment-charges"])


class PixDetailResponse(BaseModel):
    id: str
    billing_type: str
    amount_cents: int
    status: str
    external_id: str
    pix_qr_code_base64: Optional[str] = None
    pix_copy_paste: Optional[str] = None
    pix_expiration_date: Optional[str] = None
    invoice_url: Optional[str] = None


@router.get("/{charge_id}/pix", response_model=PixDetailResponse)
async def get_pix_detail(
    charge_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.id == charge_id)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Cobrança não encontrada")
    if tx.payment_method != "PIX":
        raise HTTPException(status_code=400, detail="Cobrança não é PIX")

    provider = get_payment_provider("asaas")
    qr = await provider.get_pix_qr_code(tx.external_id)

    return PixDetailResponse(
        id=str(tx.id),
        billing_type="PIX",
        amount_cents=tx.amount_cents,
        status=tx.status,
        external_id=tx.external_id or "",
        pix_qr_code_base64=qr.get("encodedImage"),
        pix_copy_paste=qr.get("payload"),
        pix_expiration_date=qr.get("expirationDate"),
    )


@router.post("/{charge_id}/refresh-pix", response_model=PixDetailResponse)
async def refresh_pix_qr(
    charge_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.id == charge_id)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Cobrança não encontrada")
    if tx.payment_method != "PIX":
        raise HTTPException(status_code=400, detail="Cobrança não é PIX")

    provider = get_payment_provider("asaas")
    qr = await provider.get_pix_qr_code(tx.external_id)

    return PixDetailResponse(
        id=str(tx.id),
        billing_type="PIX",
        amount_cents=tx.amount_cents,
        status=tx.status,
        external_id=tx.external_id or "",
        pix_qr_code_base64=qr.get("encodedImage"),
        pix_copy_paste=qr.get("payload"),
        pix_expiration_date=qr.get("expirationDate"),
    )
