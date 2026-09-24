import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.invoice import Invoice
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.schemas import InvoiceCreate, InvoiceResponse, PaginatedResponse

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=PaginatedResponse)
async def list_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    subscription_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Invoice)
    count_query = select(func.count(Invoice.id))

    if subscription_id:
        query = query.where(Invoice.subscription_id == subscription_id)
        count_query = count_query.where(Invoice.subscription_id == subscription_id)
    if status_filter:
        query = query.where(Invoice.status == status_filter)
        count_query = count_query.where(Invoice.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    skip = (page - 1) * per_page
    query = query.offset(skip).limit(per_page).order_by(Invoice.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(data=[InvoiceResponse.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    sub_result = await db.execute(select(Subscription).where(Subscription.id == body.subscription_id))
    subscription = sub_result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

    next_number_result = await db.execute(select(func.count(Invoice.id)))
    count = next_number_result.scalar() or 0
    invoice_number = f"INV-{datetime.now(timezone.utc).strftime('%Y%m')}-{count + 1:04d}"

    invoice = Invoice(
        subscription_id=body.subscription_id,
        invoice_number=invoice_number,
        amount_cents=body.amount_cents,
        due_date=body.due_date,
        period_start=body.period_start,
        period_end=body.period_end,
        notes=body.notes,
    )
    db.add(invoice)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=subscription.organization_id,
        action="create",
        resource_type="invoice",
        resource_id=str(invoice.id),
        details={"subscription_id": str(body.subscription_id), "amount_cents": body.amount_cents},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.post("/auto-generate", response_model=list[InvoiceResponse])
async def auto_generate_invoices(
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Subscription)
        .where(Subscription.status.in_(["active", "trial"]))
        .where(Subscription.current_period_end <= now + timedelta(days=1))
        .options(selectinload(Subscription.plan))
    )
    subscriptions = result.scalars().all()
    created = []

    for sub in subscriptions:
        if not sub.plan:
            continue

        period_start = sub.current_period_end
        if sub.plan.billing_cycle == "monthly":
            period_end = period_start + timedelta(days=30)
        elif sub.plan.billing_cycle == "quarterly":
            period_end = period_start + timedelta(days=90)
        elif sub.plan.billing_cycle == "semiannual":
            period_end = period_start + timedelta(days=180)
        else:
            period_end = period_start + timedelta(days=365)

        next_number = await db.execute(select(func.count(Invoice.id)))
        count = next_number.scalar() or 0
        invoice_number = f"INV-{now.strftime('%Y%m')}-{count + len(created) + 1:04d}"

        invoice = Invoice(
            subscription_id=sub.id,
            invoice_number=invoice_number,
            amount_cents=sub.plan.price_cents,
            due_date=period_start + timedelta(days=5),
            period_start=period_start,
            period_end=period_end,
        )
        db.add(invoice)
        created.append(invoice)

        sub.current_period_start = period_start
        sub.current_period_end = period_end

        audit = AuditEvent(
            actor_id=user.id,
            actor_email=user.email,
            organization_id=sub.organization_id,
            action="create",
            resource_type="invoice",
            resource_id=str(invoice.id),
            details={"auto_generated": True, "subscription_id": str(sub.id), "amount_cents": sub.plan.price_cents},
            ip_address=get_client_info(request)["ip_address"],
            user_agent=get_client_info(request)["user_agent"],
        )
        db.add(audit)

    await db.commit()
    for inv in created:
        await db.refresh(inv)

    return created


@router.get("/my", response_model=PaginatedResponse)
async def my_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    subs_result = await db.execute(
        select(Subscription).where(Subscription.organization_id == user.organization_id)
    )
    subs = subs_result.scalars().all()
    if not subs:
        return PaginatedResponse(data=[], total=0, page=page, per_page=per_page)

    sub_ids = [s.id for s in subs]

    count_result = await db.execute(
        select(func.count(Invoice.id)).where(Invoice.subscription_id.in_(sub_ids))
    )
    total = count_result.scalar() or 0

    skip = (page - 1) * per_page
    result = await db.execute(
        select(Invoice)
        .where(Invoice.subscription_id.in_(sub_ids))
        .order_by(Invoice.created_at.desc())
        .offset(skip)
        .limit(per_page)
    )
    items = result.scalars().all()

    return PaginatedResponse(data=[InvoiceResponse.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.subscription))
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    if invoice.subscription and invoice.subscription.organization_id != user.organization_id and not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return invoice


@router.post("/{invoice_id}/mark-paid", response_model=InvoiceResponse)
async def mark_invoice_paid(
    invoice_id: uuid.UUID,
    justification: str = Query("", description="Justificativa obrigatória para baixa manual"),
    request: Request = None,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    if not justification or len(justification) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Justificativa obrigatória (mínimo 10 caracteres) para baixa manual",
        )

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    invoice.status = "paid"
    invoice.paid_at = datetime.now(timezone.utc)
    invoice.paid_amount_cents = invoice.amount_cents

    from app.models.audit_event import AuditEvent
    from app.core.auth import get_client_info
    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="manual_mark_paid",
        resource_type="invoice",
        resource_id=str(invoice.id),
        details={
            "justification": justification,
            "amount_cents": invoice.amount_cents,
            "method": "manual",
        },
        ip_address=client_info.get("ip_address"),
        user_agent=client_info.get("user_agent"),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(invoice)
    return invoice
