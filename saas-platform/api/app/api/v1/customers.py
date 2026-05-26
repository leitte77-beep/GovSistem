import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.models.customer import Customer
from app.models.user import User

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    name: str
    doc_type: str = "cpf"
    doc_number: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    legal_name: Optional[str] = None
    billing_email: Optional[str] = None
    payment_preference: Optional[str] = None
    credit_limit_cents: Optional[int] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    doc_type: Optional[str] = None
    doc_number: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    legal_name: Optional[str] = None
    billing_email: Optional[str] = None
    payment_preference: Optional[str] = None
    credit_limit_cents: Optional[int] = None
    notes: Optional[str] = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    name: str
    doc_type: str
    doc_number: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    legal_name: Optional[str] = None
    billing_email: Optional[str] = None
    payment_preference: Optional[str] = None
    credit_limit_cents: Optional[int] = None
    external_payment_customer_id: Optional[str] = None
    internal_notes: Optional[str] = None
    is_active: bool = True
    created_at: str

    model_config = {"from_attributes": True}


class PaginatedCustomers(BaseModel):
    data: list[CustomerResponse]
    total: int
    page: int
    per_page: int


@router.get("", response_model=PaginatedCustomers)
async def list_customers(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(Customer)
    count_query = select(func.count(Customer.id))

    if search:
        pattern = f"%{search}%"
        query = query.where(
            Customer.name.ilike(pattern) | Customer.doc_number.ilike(pattern)
        )
        count_query = count_query.where(
            Customer.name.ilike(pattern) | Customer.doc_number.ilike(pattern)
        )

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(query.offset(skip).limit(per_page))
    items = result.scalars().all()

    return PaginatedCustomers(
        data=[CustomerResponse.model_validate(c) for c in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente nao encontrado")
    return CustomerResponse.model_validate(customer)


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    body: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    customer = Customer(
        organization_id=user.organization_id,
        name=body.name,
        doc_type=body.doc_type,
        doc_number=body.doc_number,
        email=body.email,
        phone=body.phone,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        legal_name=body.legal_name,
        billing_email=body.billing_email,
        payment_preference=body.payment_preference,
        credit_limit_cents=body.credit_limit_cents,
        internal_notes=body.notes,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente nao encontrado")

    update_data = body.model_dump(exclude_unset=True)
    if "notes" in update_data:
        update_data["internal_notes"] = update_data.pop("notes")

    for field, value in update_data.items():
        setattr(customer, field, value)

    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente nao encontrado")
    customer.is_active = False
    await db.commit()
