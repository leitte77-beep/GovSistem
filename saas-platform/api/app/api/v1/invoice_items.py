import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.invoice_item import InvoiceItem
from app.models.user import User

router = APIRouter(prefix="/invoice-items", tags=["invoice-items"])


class InvoiceItemResponse(BaseModel):
    id: str
    invoice_id: str
    plan_id: Optional[str] = None
    description: str
    quantity: int
    unit_amount_cents: int
    total_amount_cents: int
    service_code: Optional[str] = None

    model_config = {"from_attributes": True}


class InvoiceItemCreate(BaseModel):
    invoice_id: str
    description: str
    quantity: int = 1
    unit_amount_cents: int
    service_code: Optional[str] = None


@router.get("", response_model=list[InvoiceItemResponse])
async def list_invoice_items(
    invoice_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(InvoiceItem)
    if invoice_id:
        query = query.where(InvoiceItem.invoice_id == invoice_id)
    result = await db.execute(query.order_by(InvoiceItem.created_at))
    return result.scalars().all()


@router.post("", response_model=InvoiceItemResponse, status_code=201)
async def create_invoice_item(
    body: InvoiceItemCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    inv_result = await db.execute(
        select(Invoice).where(Invoice.id == body.invoice_id)
    )
    if not inv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = InvoiceItem(
        invoice_id=body.invoice_id,
        description=body.description,
        quantity=body.quantity,
        unit_amount_cents=body.unit_amount_cents,
        total_amount_cents=body.unit_amount_cents * body.quantity,
        service_code=body.service_code,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
async def delete_invoice_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(InvoiceItem).where(InvoiceItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
