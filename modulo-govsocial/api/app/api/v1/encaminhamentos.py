import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import decrypt_text, encrypt_text
from app.models.encaminhamento import Encaminhamento
from app.models.enums import AuditAction, RoleName
from app.models.user import User
from app.schemas.encaminhamento import (
    AceiteCreate,
    DevolutivaCreate,
    EncaminhamentoCreate,
    EncaminhamentoListItem,
    EncaminhamentoOut,
    EncaminhamentoUpdate,
    RecusaCreate,
)
from app.services.audit import record_audit

router = APIRouter(tags=["encaminhamentos"])

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


def _e_out(e: Encaminhamento) -> dict:
    udp = str(e.unidade_destino_id) if e.unidade_destino_id else None
    pdp = str(e.profissional_destino_id) if e.profissional_destino_id else None
    pop = str(e.profissional_origem_id) if e.profissional_origem_id else None
    cfp = str(e.case_file_id) if e.case_file_id else None
    da = e.data_aceite.isoformat() if e.data_aceite else None
    dd = e.data_devolutiva.isoformat() if e.data_devolutiva else None
    return {
        "id": str(e.id),
        "case_file_id": cfp,
        "unit_id": str(e.unit_id),
        "tipo": e.tipo,
        "unidade_destino_id": udp,
        "profissional_destino_id": pdp,
        "data_aceite": da,
        "data_devolutiva": dd,
        "referral_code": e.referral_code,
        "instituicao_destino": e.instituicao_destino,
        "numero_oficio": e.numero_oficio,
        "profissional_origem_id": pop,
        "data_encaminhamento": e.data_encaminhamento.isoformat(),
        "motivo": e.motivo,
        "descricao": e.descricao,
        "status": e.status,
        "devolutiva": decrypt_text(e.devolutiva_enc) if e.devolutiva_enc else None,
        "motivo_recusa": e.motivo_recusa,
        "oficio_gerado": e.oficio_gerado,
        "created_at": e.created_at.isoformat(),
        "updated_at": e.updated_at.isoformat(),
    }


async def _reload(db, eid):
    return (
        await db.execute(select(Encaminhamento).where(Encaminhamento.id == eid))
    ).scalar_one()


@router.get("/encaminhamentos", response_model=list[EncaminhamentoListItem])
async def listar_encaminhamentos(
    unit_id: uuid.UUID | None = Query(None),
    tipo: str | None = Query(None),
    status: str | None = Query(None),
    destino_id: uuid.UUID | None = Query(None, description="Unidade destino (painel pendentes)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(Encaminhamento).where(
        Encaminhamento.tenant_id == tenant_id,
        Encaminhamento.deleted_at.is_(None),
    )
    if unit_id:
        q = q.where(Encaminhamento.unit_id == unit_id)
    if tipo:
        q = q.where(Encaminhamento.tipo == tipo)
    if status:
        q = q.where(Encaminhamento.status == status)
    if destino_id:
        q = q.where(Encaminhamento.unidade_destino_id == destino_id)
    q = q.order_by(Encaminhamento.data_encaminhamento.desc()).offset(skip).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/encaminhamentos", response_model=EncaminhamentoOut, status_code=201)
async def criar_encaminhamento(
    body: EncaminhamentoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    if body.tipo == "INTERNO" and not body.unidade_destino_id:
        raise HTTPException(
            status_code=422,
            detail="Encaminhamento interno requer unidade de destino",
        )
    if body.tipo == "EXTERNO" and not body.referral_code:
        raise HTTPException(
            status_code=422,
            detail="Encaminhamento externo requer código de referência",
        )

    numero = None
    if body.tipo == "EXTERNO":
        ultimo = (
            await db.execute(
                select(func.max(Encaminhamento.numero_oficio)).where(
                    Encaminhamento.tenant_id == tenant_id,
                    Encaminhamento.unit_id == body.unit_id,
                    Encaminhamento.tipo == "EXTERNO",
                )
            )
        ).scalar()
        numero = (ultimo or 0) + 1

    e = Encaminhamento(
        tenant_id=tenant_id,
        case_file_id=body.case_file_id,
        unit_id=body.unit_id,
        tipo=body.tipo,
        unidade_destino_id=body.unidade_destino_id,
        profissional_destino_id=body.profissional_destino_id,
        referral_code=body.referral_code,
        instituicao_destino=body.instituicao_destino,
        profissional_origem_id=body.profissional_origem_id,
        motivo=body.motivo,
        descricao=body.descricao,
        numero_oficio=numero,
    )
    db.add(e)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"tipo": e.tipo, "status": e.status},
    )
    await db.commit()
    e = await _reload(db, e.id)
    return _e_out(e)


@router.get("/encaminhamentos/{enc_id}", response_model=EncaminhamentoOut)
async def obter_encaminhamento(
    enc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento não encontrado")
    return _e_out(e)


@router.patch("/encaminhamentos/{enc_id}", response_model=EncaminhamentoOut)
async def atualizar_encaminhamento(
    enc_id: uuid.UUID,
    body: EncaminhamentoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento não encontrado")
    if e.status not in ("PENDENTE",):
        raise HTTPException(status_code=422, detail="Só pode alterar encaminhamento pendente")
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(e, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    e = await _reload(db, e.id)
    return _e_out(e)


# ── Workflow ───────────────────────────────────────────────────────────

@router.post("/encaminhamentos/{enc_id}/accept", response_model=EncaminhamentoOut)
async def aceitar_encaminhamento(
    enc_id: uuid.UUID,
    body: AceiteCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.tipo == "INTERNO",
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento interno não encontrado")
    if e.status != "PENDENTE":
        raise HTTPException(status_code=422, detail="Status inválido para aceite")
    e.status = "ACEITO"
    e.data_aceite = datetime.now(timezone.utc)
    if body.profissional_destino_id:
        e.profissional_destino_id = body.profissional_destino_id
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "ACEITO"},
    )
    await db.commit()
    e = await _reload(db, e.id)
    return _e_out(e)


@router.post("/encaminhamentos/{enc_id}/reject", response_model=EncaminhamentoOut)
async def recusar_encaminhamento(
    enc_id: uuid.UUID,
    body: RecusaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento não encontrado")
    if e.status != "PENDENTE":
        raise HTTPException(status_code=422, detail="Status inválido para recusa")
    e.status = "RECUSADO"
    e.motivo_recusa = body.motivo_recusa
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "RECUSADO"},
    )
    await db.commit()
    e = await _reload(db, e.id)
    return _e_out(e)


@router.post("/encaminhamentos/{enc_id}/return", response_model=EncaminhamentoOut)
async def devolver_encaminhamento(
    enc_id: uuid.UUID,
    body: DevolutivaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    """Contrarreferência: unidade destino devolve com devolutiva."""
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.tipo == "INTERNO",
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento interno não encontrado")
    if e.status != "ACEITO":
        raise HTTPException(
            status_code=422,
            detail="Status inválido para devolutiva (precisa estar ACEITO)",
        )
    e.status = "DEVOLVIDO"
    e.data_devolutiva = datetime.now(timezone.utc)
    if body.devolutiva:
        e.devolutiva_enc = encrypt_text(body.devolutiva)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "DEVOLVIDO"},
    )
    await db.commit()
    e = await _reload(db, e.id)
    return _e_out(e)


@router.post("/encaminhamentos/{enc_id}/generate-office")
async def gerar_oficio(
    enc_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    """Marca encaminhamento externo como ofício gerado (PDF)."""
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.tipo == "EXTERNO",
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento externo não encontrado")
    e.oficio_gerado = True
    e.status = "OFICIO_GERADO"
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"oficio_numero": e.numero_oficio},
    )
    await db.commit()
    return {"message": "ok", "numero_oficio": e.numero_oficio, "status": e.status}


@router.post("/encaminhamentos/{enc_id}/cancel", response_model=EncaminhamentoOut)
async def cancelar_encaminhamento(
    enc_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(select(Encaminhamento).where(
            Encaminhamento.id == enc_id, Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento não encontrado")
    if e.status in ("DEVOLVIDO", "CANCELADO"):
        raise HTTPException(status_code=422, detail="Não pode cancelar encaminhamento finalizado")
    e.status = "CANCELADO"
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="encaminhamento", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "CANCELADO"},
    )
    await db.commit()
    e = await _reload(db, e.id)
    return _e_out(e)


# ═══════════════════════════════════════════════════════════════════════
# Painel de encaminhamentos pendentes por unidade
# ═══════════════════════════════════════════════════════════════════════

@router.get("/encaminhamentos-pendentes", response_model=list[EncaminhamentoListItem])
async def painel_pendentes(
    unit_id: uuid.UUID = Query(..., description="Unidade para a qual listar pendentes"),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    rows = (
        await db.execute(
            select(Encaminhamento).where(
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.unidade_destino_id == unit_id,
                Encaminhamento.status == "PENDENTE",
                Encaminhamento.tipo == "INTERNO",
                Encaminhamento.deleted_at.is_(None),
            ).order_by(Encaminhamento.data_encaminhamento.desc())
        )
    ).scalars().all()
    return rows
