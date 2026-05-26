import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.approval import ApprovalDecision, ApprovalRequest, ApprovalStep, ApprovalWorkflow
from app.models.audit_event import AuditEvent
from app.models.user import User

router = APIRouter(prefix="/approval-workflows", tags=["approval-workflows"])


class WorkflowResponse(BaseModel):
    id: str
    name: str
    entity_type: str
    min_amount_cents: Optional[int] = None
    max_amount_cents: Optional[int] = None
    requires_approval: bool
    is_active: bool


class WorkflowCreate(BaseModel):
    name: str
    entity_type: str
    min_amount_cents: Optional[int] = None
    max_amount_cents: Optional[int] = None
    requires_approval: bool = True


class RequestResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    status: str
    current_step: int
    requested_at: str


class DecisionCreate(BaseModel):
    decision: str
    reason: Optional[str] = None


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    query = select(ApprovalWorkflow)
    if user.organization_id:
        query = query.where(ApprovalWorkflow.organization_id == user.organization_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    body: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Sem organização")
    wf = ApprovalWorkflow(
        organization_id=user.organization_id,
        name=body.name,
        entity_type=body.entity_type,
        min_amount_cents=body.min_amount_cents,
        max_amount_cents=body.max_amount_cents,
        requires_approval=body.requires_approval,
    )
    db.add(wf)
    AuditEvent(
        actor_id=user.id, actor_email=user.email, organization_id=user.organization_id,
        action="create_approval_workflow", resource_type="approval_workflow",
    )
    await db.commit()
    await db.refresh(wf)
    return wf


@router.get("/requests", response_model=list[RequestResponse])
async def list_requests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    query = select(ApprovalRequest)
    if user.organization_id:
        query = query.where(ApprovalRequest.organization_id == user.organization_id)
    result = await db.execute(query.order_by(ApprovalRequest.requested_at.desc()))
    return result.scalars().all()


@router.get("/requests/pending", response_model=list[RequestResponse])
async def pending_requests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    query = select(ApprovalRequest).where(ApprovalRequest.status == "pending")
    if user.organization_id:
        query = query.where(ApprovalRequest.organization_id == user.organization_id)
    result = await db.execute(query.order_by(ApprovalRequest.requested_at.desc()))
    return result.scalars().all()


@router.post("/requests/{request_id}/decide")
async def decide_request(
    request_id: uuid.UUID,
    body: DecisionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(ApprovalRequest).where(ApprovalRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Solicitação já decidida")

    decision = ApprovalDecision(
        request_id=req.id,
        step=req.current_step,
        approver_id=user.id,
        decision=body.decision,
        reason=body.reason,
        decided_at=datetime.now(timezone.utc),
    )
    db.add(decision)

    if body.decision == "approved":
        req.current_step += 1
        req.status = "approved"
    else:
        req.status = "rejected"

    req.decided_at = datetime.now(timezone.utc)
    req.decision_reason = body.reason

    AuditEvent(
        actor_id=user.id, actor_email=user.email, organization_id=user.organization_id,
        action="approval_decision", resource_type="approval_request",
        resource_id=str(req.id), details={"decision": body.decision},
    )
    await db.commit()
    return {"message": f"Solicitação {body.decision}"}
