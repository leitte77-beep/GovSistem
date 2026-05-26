import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.boleto_charge import BoletoCharge
from app.models.customer import Customer
from app.models.user import User

router = APIRouter(prefix="/boletos", tags=["boletos"])

STATUS_MAP = {
    "created": "pending",
    "registered": "pending",
    "registration_failed": "pending",
    "issued": "generated",
    "paid": "paid",
    "expired": "overdue",
    "written_off": "canceled",
    "cancelled": "canceled",
    "protest_requested": "overdue",
    "error": "pending",
}

REVERSE_STATUS_MAP = {
    "pending": ["created", "registered", "registration_failed", "error"],
    "generated": ["issued"],
    "paid": ["paid"],
    "overdue": ["expired", "protest_requested"],
    "canceled": ["written_off", "cancelled"],
}


class BoletoResponse(BaseModel):
    id: uuid.UUID
    customer_name: str
    our_number: Optional[str] = None
    amount_cents: int
    due_date: str
    status: str
    pdf_url: Optional[str] = None

    model_config = {"from_attributes": True}


class StatusCounts(BaseModel):
    pending: int = 0
    generated: int = 0
    paid: int = 0
    overdue: int = 0
    canceled: int = 0


class PaginatedBoletos(BaseModel):
    data: list[BoletoResponse]
    total: int
    page: int
    per_page: int
    counts: StatusCounts


def to_frontend_status(db_status: str) -> str:
    return STATUS_MAP.get(db_status, "pending")


@router.get("", response_model=PaginatedBoletos)
async def list_boletos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    base_query = select(BoletoCharge)
    count_query = select(func.count(BoletoCharge.id))

    if status and status in REVERSE_STATUS_MAP:
        db_statuses = REVERSE_STATUS_MAP[status]
        base_query = base_query.where(BoletoCharge.status.in_(db_statuses))
        count_query = count_query.where(BoletoCharge.status.in_(db_statuses))

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(
        base_query.order_by(BoletoCharge.due_date.desc())
        .offset(skip)
        .limit(per_page)
    )
    items = result.scalars().all()

    customer_ids = [b.customer_id for b in items if b.customer_id]
    customer_map = {}
    if customer_ids:
        c_result = await db.execute(
            select(Customer).where(Customer.id.in_(customer_ids))
        )
        customer_map = {c.id: c.name for c in c_result.scalars().all()}

    def to_response(b: BoletoCharge) -> BoletoResponse:
        return BoletoResponse(
            id=b.id,
            customer_name=customer_map.get(b.customer_id, "") if b.customer_id else "",
            our_number=b.our_number,
            amount_cents=b.amount_cents,
            due_date=str(b.due_date) if b.due_date else "",
            status=to_frontend_status(b.status),
            pdf_url=b.pdf_url,
        )

    count_cases = []
    for fe_status, db_statuses in REVERSE_STATUS_MAP.items():
        count_cases.append(
            (fe_status, func.count(case((BoletoCharge.status.in_(db_statuses), 1))))
        )

    counts = StatusCounts()
    for fe_status, _ in REVERSE_STATUS_MAP.items():
        subq = select(func.count(BoletoCharge.id)).where(
            BoletoCharge.status.in_(REVERSE_STATUS_MAP[fe_status])
        )
        val = await db.scalar(subq) or 0
        setattr(counts, fe_status, val)

    return PaginatedBoletos(
        data=[to_response(b) for b in items],
        total=total,
        page=page,
        per_page=per_page,
        counts=counts,
    )


@router.post("/{boleto_id}/cancel", status_code=200)
async def cancel_boleto(
    boleto_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BoletoCharge).where(BoletoCharge.id == boleto_id)
    )
    boleto = result.scalar_one_or_none()
    if not boleto:
        raise HTTPException(status_code=404, detail="Boleto not found")
    if boleto.status in ("paid", "cancelled", "written_off"):
        raise HTTPException(status_code=400, detail="Boleto cannot be cancelled")
    boleto.status = "cancelled"
    await db.commit()
    return {"message": "Boleto cancelled"}


@router.post("/{boleto_id}/reissue", status_code=200)
async def reissue_boleto(
    boleto_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BoletoCharge).where(BoletoCharge.id == boleto_id)
    )
    boleto = result.scalar_one_or_none()
    if not boleto:
        raise HTTPException(status_code=404, detail="Boleto not found")
    boleto.status = "created"
    boleto.registered_at = None
    boleto.paid_at = None
    boleto.expired_at = None
    await db.commit()
    return {"message": "Boleto reissued"}
