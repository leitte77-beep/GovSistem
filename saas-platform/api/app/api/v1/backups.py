import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.backup_config import BackupConfig
from app.models.backup_log import BackupLog
from app.models.user import User
from app.schemas.schemas import (
    BackupConfigCreate,
    BackupConfigResponse,
    BackupConfigUpdate,
    BackupLogResponse,
)

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("/configs", response_model=list[BackupConfigResponse])
async def list_backup_configs(
    organization_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(BackupConfig)
    if organization_id:
        query = query.where(BackupConfig.organization_id == organization_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/configs/my", response_model=list[BackupConfigResponse])
async def my_backup_configs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    result = await db.execute(
        select(BackupConfig).where(BackupConfig.organization_id == user.organization_id)
    )
    return result.scalars().all()


@router.post("/configs", response_model=BackupConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_backup_config(
    body: BackupConfigCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    config = BackupConfig(**body.model_dump())
    db.add(config)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=body.organization_id,
        action="create",
        resource_type="backup_config",
        resource_id=str(config.id),
        details={"name": config.name},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/configs/{config_id}", response_model=BackupConfigResponse)
async def update_backup_config(
    config_id: uuid.UUID,
    body: BackupConfigUpdate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BackupConfig).where(BackupConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup config not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=config.organization_id,
        action="update",
        resource_type="backup_config",
        resource_id=str(config.id),
        details=update_data,
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_backup_config(
    config_id: uuid.UUID,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BackupConfig).where(BackupConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup config not found")

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=config.organization_id,
        action="delete",
        resource_type="backup_config",
        resource_id=str(config.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.delete(config)
    await db.commit()


@router.post("/configs/{config_id}/run", response_model=BackupLogResponse)
async def trigger_backup(
    config_id: uuid.UUID,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BackupConfig).where(BackupConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup config not found")

    now = datetime.now(timezone.utc)
    log = BackupLog(
        config_id=config.id,
        backup_type="manual",
        status="running",
        started_at=now,
        triggered_by=user.email,
    )
    db.add(log)

    config.last_run_at = now

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=config.organization_id,
        action="backup_start",
        resource_type="backup_log",
        resource_id=str(log.id),
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(log)

    return log


@router.get("/logs", response_model=list[BackupLogResponse])
async def list_backup_logs(
    config_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(BackupLog)
    if config_id:
        query = query.where(BackupLog.config_id == config_id)
    query = query.order_by(BackupLog.created_at.desc()).limit(100)
    result = await db.execute(query)
    return result.scalars().all()
