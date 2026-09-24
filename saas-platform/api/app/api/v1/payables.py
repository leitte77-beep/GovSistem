import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.payable import Payable
from app.models.user import User

router = APIRouter(prefix="/payables", tags=["payables"])


class PayableCreate(BaseModel):
    supplier_name: str
    description: str
    amount_cents: int
    due_date: str
    category: str = "other"
    document_number: Optional[str] = None
    payment_method: Optional[str] = None
    competence_date: Optional[str] = None
    notes: Optional[str] = None


class PayableUpdate(BaseModel):
    supplier_name: Optional[str] = None
    description: Optional[str] = None
    amount_cents: Optional[int] = None
    due_date: Optional[str] = None
    category: Optional[str] = None
    document_number: Optional[str] = None
    payment_method: Optional[str] = None
    competence_date: Optional[str] = None
    notes: Optional[str] = None


class PayableResponse(BaseModel):
    id: uuid.UUID
    supplier_name: str = ""
    description: str
    amount_cents: int
    due_date: str
    status: str
    category: Optional[str] = None
    document_number: Optional[str] = None
    payment_method: Optional[str] = None
    competence_date: Optional[str] = None
    notes: Optional[str] = None
    days_until_due: int = 0
    created_at: str

    model_config = {"from_attributes": True}


class PaginatedPayables(BaseModel):
    data: list[PayableResponse]
    total: int
    page: int
    per_page: int


def _to_response(p: Payable) -> PayableResponse:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    due = p.due_date
    if hasattr(due, "replace"):
        due_naive = due.replace(tzinfo=None) if due.tzinfo else due
    else:
        due_naive = due
    days = (due_naive - now).days if due_naive else 0
    return PayableResponse(
        id=p.id,
        supplier_name=getattr(p, "supplier_name", "") or "",
        description=p.description,
        amount_cents=p.amount_cents,
        due_date=str(p.due_date) if p.due_date else "",
        status=p.status,
        category=p.category,
        document_number=p.document_number,
        payment_method=p.payment_method,
        competence_date=str(p.competence_date) if p.competence_date else None,
        notes=p.notes,
        days_until_due=days,
        created_at=str(p.created_at),
    )


@router.get("", response_model=PaginatedPayables)
async def list_payables(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(Payable)
    count_query = select(func.count(Payable.id))

    if status:
        query = query.where(Payable.status == status)
        count_query = count_query.where(Payable.status == status)
    if category:
        query = query.where(Payable.category == category)
        count_query = count_query.where(Payable.category == category)

    query = query.where(Payable.deleted_at.is_(None))
    count_query = count_query.where(Payable.deleted_at.is_(None))

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(
        query.order_by(Payable.due_date.asc()).offset(skip).limit(per_page)
    )
    items = result.scalars().all()

    return PaginatedPayables(
        data=[_to_response(p) for p in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{payable_id}", response_model=PayableResponse)
async def get_payable(
    payable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Payable).where(Payable.id == payable_id, Payable.deleted_at.is_(None))
    )
    payable = result.scalar_one_or_none()
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar nao encontrada")
    return _to_response(payable)


@router.post("", response_model=PayableResponse, status_code=201)
async def create_payable(
    body: PayableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    payable = Payable(
        organization_id=user.organization_id,
        supplier_name=body.supplier_name,
        description=body.description,
        amount_cents=body.amount_cents,
        due_date=datetime.strptime(body.due_date, "%Y-%m-%d").replace(tzinfo=None)
        if body.due_date else datetime.now(timezone.utc).replace(tzinfo=None),
        category=body.category,
        document_number=body.document_number,
        payment_method=body.payment_method,
        competence_date=datetime.strptime(body.competence_date, "%Y-%m-%d").replace(tzinfo=None)
        if body.competence_date else None,
        notes=body.notes,
        status="pending",
    )
    db.add(payable)
    await db.commit()
    await db.refresh(payable)
    return _to_response(payable)


@router.put("/{payable_id}", response_model=PayableResponse)
async def update_payable(
    payable_id: uuid.UUID,
    body: PayableUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Payable).where(Payable.id == payable_id, Payable.deleted_at.is_(None))
    )
    payable = result.scalar_one_or_none()
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar nao encontrada")

    update_data = body.model_dump(exclude_unset=True)
    if "due_date" in update_data and update_data["due_date"]:
        update_data["due_date"] = datetime.strptime(update_data["due_date"], "%Y-%m-%d").replace(tzinfo=None)
    if "competence_date" in update_data and update_data["competence_date"]:
        update_data["competence_date"] = datetime.strptime(update_data["competence_date"], "%Y-%m-%d").replace(tzinfo=None)

    for field, value in update_data.items():
        setattr(payable, field, value)

    await db.commit()
    await db.refresh(payable)
    return _to_response(payable)


@router.delete("/{payable_id}", status_code=204)
async def delete_payable(
    payable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Payable).where(Payable.id == payable_id, Payable.deleted_at.is_(None))
    )
    payable = result.scalar_one_or_none()
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar nao encontrada")
    payable.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()


@router.post("/{payable_id}/approve", response_model=PayableResponse)
async def approve_payable(
    payable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Payable).where(Payable.id == payable_id, Payable.deleted_at.is_(None))
    )
    payable = result.scalar_one_or_none()
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar nao encontrada")
    if payable.status != "pending":
        raise HTTPException(status_code=400, detail="Apenas contas pendentes podem ser aprovadas")
    payable.status = "approved"
    payable.approved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(payable)
    return _to_response(payable)


@router.post("/{payable_id}/reject", response_model=PayableResponse)
async def reject_payable(
    payable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Payable).where(Payable.id == payable_id, Payable.deleted_at.is_(None))
    )
    payable = result.scalar_one_or_none()
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar nao encontrada")
    if payable.status != "pending":
        raise HTTPException(status_code=400, detail="Apenas contas pendentes podem ser rejeitadas")
    payable.status = "rejected"
    await db.commit()
    await db.refresh(payable)
    return _to_response(payable)


@router.post("/{payable_id}/mark-paid", response_model=PayableResponse)
async def mark_payable_paid(
    payable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Payable).where(Payable.id == payable_id, Payable.deleted_at.is_(None))
    )
    payable = result.scalar_one_or_none()
    if not payable:
        raise HTTPException(status_code=404, detail="Conta a pagar nao encontrada")
    if payable.status != "approved":
        raise HTTPException(status_code=400, detail="Apenas contas aprovadas podem ser pagas")
    payable.status = "paid"
    payable.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(payable)
    return _to_response(payable)
