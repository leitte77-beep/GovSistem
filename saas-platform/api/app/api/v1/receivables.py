import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.receivable import Receivable
from app.models.user import User

router = APIRouter(prefix="/receivables", tags=["receivables"])


class ReceivableCreate(BaseModel):
    customer_name: str
    description: str
    amount_cents: int
    due_date: str
    category: str = "other"
    document_number: Optional[str] = None
    payment_method: Optional[str] = None
    competence_date: Optional[str] = None
    notes: Optional[str] = None


class ReceivableUpdate(BaseModel):
    customer_name: Optional[str] = None
    description: Optional[str] = None
    amount_cents: Optional[int] = None
    due_date: Optional[str] = None
    category: Optional[str] = None
    document_number: Optional[str] = None
    payment_method: Optional[str] = None
    competence_date: Optional[str] = None
    notes: Optional[str] = None


class ReceivableResponse(BaseModel):
    id: uuid.UUID
    customer_name: str = ""
    description: Optional[str] = None
    amount_cents: int
    open_amount_cents: int
    due_date: str
    status: str
    category: Optional[str] = None
    document_number: Optional[str] = None
    payment_method: Optional[str] = None
    competence_date: Optional[str] = None
    notes: Optional[str] = None
    aging_days: int = 0
    created_at: str

    model_config = {"from_attributes": True}


class PaginatedReceivables(BaseModel):
    data: list[ReceivableResponse]
    total: int
    page: int
    per_page: int


def _to_response(r: Receivable) -> ReceivableResponse:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    due = r.due_date
    if hasattr(due, "replace"):
        due_naive = due.replace(tzinfo=None) if due.tzinfo else due
    else:
        due_naive = due
    aging = (now - due_naive).days if due_naive else 0
    return ReceivableResponse(
        id=r.id,
        customer_name=getattr(r, "customer_name", "") or "",
        description=r.description,
        amount_cents=r.original_amount_cents,
        open_amount_cents=r.open_amount_cents,
        due_date=str(r.due_date) if r.due_date else "",
        status=r.status,
        category=getattr(r, "category", None),
        document_number=r.document_number,
        payment_method=r.payment_method,
        competence_date=str(r.competence_date) if r.competence_date else None,
        notes=r.notes,
        aging_days=aging,
        created_at=str(r.created_at),
    )


@router.get("", response_model=PaginatedReceivables)
async def list_receivables(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(Receivable)
    count_query = select(func.count(Receivable.id))

    query = query.where(Receivable.deleted_at.is_(None))
    count_query = count_query.where(Receivable.deleted_at.is_(None))

    if status:
        query = query.where(Receivable.status == status)
        count_query = count_query.where(Receivable.status == status)
    if category:
        query = query.where(Receivable.category == category)
        count_query = count_query.where(Receivable.category == category)
    if search:
        pattern = f"%{search}%"
        query = query.where(Receivable.customer_name.ilike(pattern))
        count_query = count_query.where(Receivable.customer_name.ilike(pattern))
    if date_from:
        dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=None)
        query = query.where(Receivable.due_date >= dt_from)
        count_query = count_query.where(Receivable.due_date >= dt_from)
    if date_to:
        dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=None)
        query = query.where(Receivable.due_date <= dt_to)
        count_query = count_query.where(Receivable.due_date <= dt_to)

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(
        query.order_by(Receivable.due_date.desc()).offset(skip).limit(per_page)
    )
    items = result.scalars().all()

    return PaginatedReceivables(
        data=[_to_response(r) for r in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{receivable_id}", response_model=ReceivableResponse)
async def get_receivable(
    receivable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == receivable_id, Receivable.deleted_at.is_(None)
        )
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber nao encontrada")
    return _to_response(receivable)


@router.post("", response_model=ReceivableResponse, status_code=201)
async def create_receivable(
    body: ReceivableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    receivable = Receivable(
        organization_id=user.organization_id,
        customer_name=body.customer_name,
        description=body.description,
        original_amount_cents=body.amount_cents,
        open_amount_cents=body.amount_cents,
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
    db.add(receivable)
    await db.commit()
    await db.refresh(receivable)
    return _to_response(receivable)


@router.put("/{receivable_id}", response_model=ReceivableResponse)
async def update_receivable(
    receivable_id: uuid.UUID,
    body: ReceivableUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == receivable_id, Receivable.deleted_at.is_(None)
        )
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber nao encontrada")

    update_data = body.model_dump(exclude_unset=True)
    amount_updated = "amount_cents" in update_data

    if "due_date" in update_data and update_data["due_date"]:
        update_data["due_date"] = datetime.strptime(update_data["due_date"], "%Y-%m-%d").replace(tzinfo=None)
    if "competence_date" in update_data and update_data["competence_date"]:
        update_data["competence_date"] = datetime.strptime(update_data["competence_date"], "%Y-%m-%d").replace(tzinfo=None)

    for field, value in update_data.items():
        setattr(receivable, field, value)

    if amount_updated:
        receivable.original_amount_cents = update_data["amount_cents"]
        if receivable.status in ("pending", "open", "overdue"):
            receivable.open_amount_cents = update_data["amount_cents"] - (receivable.received_amount_cents or 0)

    await db.commit()
    await db.refresh(receivable)
    return _to_response(receivable)


@router.delete("/{receivable_id}", status_code=204)
async def delete_receivable(
    receivable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == receivable_id, Receivable.deleted_at.is_(None)
        )
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber nao encontrada")
    receivable.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()


@router.post("/{receivable_id}/mark-paid", response_model=ReceivableResponse)
async def mark_receivable_paid(
    receivable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == receivable_id, Receivable.deleted_at.is_(None)
        )
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber nao encontrada")
    if receivable.status not in ("pending", "open", "overdue"):
        raise HTTPException(status_code=400, detail="Conta nao pode ser paga no status atual")

    receivable.status = "paid"
    receivable.received_amount_cents = receivable.open_amount_cents
    receivable.open_amount_cents = 0
    receivable.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
    receivable.settled_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.commit()
    await db.refresh(receivable)
    return _to_response(receivable)


@router.post("/{receivable_id}/write-off", response_model=ReceivableResponse)
async def write_off_receivable(
    receivable_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == receivable_id, Receivable.deleted_at.is_(None)
        )
    )
    receivable = result.scalar_one_or_none()
    if not receivable:
        raise HTTPException(status_code=404, detail="Conta a receber nao encontrada")
    if receivable.status not in ("pending", "open", "overdue"):
        raise HTTPException(status_code=400, detail="Conta nao pode ser baixada no status atual")

    receivable.status = "written_off"
    receivable.open_amount_cents = 0
    receivable.settled_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.commit()
    await db.refresh(receivable)
    return _to_response(receivable)
