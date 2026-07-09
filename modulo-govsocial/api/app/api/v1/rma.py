import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.rma import RmaAjuste, RmaFechamento
from app.models.user import User
from app.schemas.rma import (
    RmaAjusteCreate,
    RmaAjusteOut,
    RmaFechamentoListItem,
    RmaFechamentoOut,
    RmaReaberturaCreate,
)
from app.services.audit import record_audit
from app.services.rma_engine import calcular_rma

router = APIRouter(tags=["rma"])

_READ = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


def _f_out(f: RmaFechamento) -> dict:
    return {
        "id": str(f.id), "unit_id": str(f.unit_id),
        "ano": f.ano, "mes": f.mes, "status": f.status,
        "fechado_por_id": str(f.fechado_por_id) if f.fechado_por_id else None,
        "fechado_em": f.fechado_em.isoformat() if f.fechado_em else None,
        "reaberto_por_id": str(f.reaberto_por_id) if f.reaberto_por_id else None,
        "reaberto_em": f.reaberto_em.isoformat() if f.reaberto_em else None,
        "motivo_reabertura": f.motivo_reabertura,
        "dados_calculados": f.dados_calculados,
        "calculado_em": f.calculado_em.isoformat() if f.calculado_em else None,
        "ajustes": [],
        "created_at": f.created_at.isoformat(),
        "updated_at": f.updated_at.isoformat(),
    }


@router.get("/rma", response_model=list[RmaFechamentoListItem])
async def listar_fechamentos(
    unit_id: uuid.UUID | None = Query(None),
    ano: int | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(RmaFechamento).where(RmaFechamento.tenant_id == tenant_id)
    if unit_id:
        q = q.where(RmaFechamento.unit_id == unit_id)
    if ano:
        q = q.where(RmaFechamento.ano == ano)
    if status:
        q = q.where(RmaFechamento.status == status)
    q = q.order_by(RmaFechamento.ano.desc(), RmaFechamento.mes.desc())
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/rma/calculate", response_model=RmaFechamentoOut)
async def calcular_ou_obter_rma(
    unit_id: uuid.UUID = Query(...),
    ano: int = Query(...),
    mes: int = Query(..., ge=1, le=12),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    f = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.tenant_id == tenant_id,
                RmaFechamento.unit_id == unit_id,
                RmaFechamento.ano == ano,
                RmaFechamento.mes == mes,
            )
        )
    ).scalar_one_or_none()

    if f and f.dados_calculados:
        return _f_out(f)

    if not f:
        f = RmaFechamento(
            tenant_id=tenant_id, unit_id=unit_id, ano=ano, mes=mes, status="ABERTO",
        )
        db.add(f)
        await db.flush()

    dados = await calcular_rma(db, tenant_id, unit_id, ano, mes)
    f.dados_calculados = dados
    f.calculado_em = datetime.now(timezone.utc)

    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="rma_fechamento", entity_id=f.id, actor=user,
        client_info=get_client_info(request) if request else {},
        diff_summary={"ano": ano, "mes": mes, "unidade": str(unit_id)},
    )
    await db.commit()
    f = (
        await db.execute(select(RmaFechamento).where(RmaFechamento.id == f.id))
    ).scalar_one()
    return _f_out(f)


@router.get("/rma/{fechamento_id}", response_model=RmaFechamentoOut)
async def obter_fechamento(
    fechamento_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    f = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.id == fechamento_id,
                RmaFechamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fechamento não encontrado")
    ajustes = (
        await db.execute(
            select(RmaAjuste).where(RmaAjuste.fechamento_id == f.id)
        )
    ).scalars().all()
    out = _f_out(f)
    out["ajustes"] = [
        {
            "id": str(a.id), "bloco": a.bloco, "campo": a.campo,
            "valor_calculado": a.valor_calculado,
            "valor_ajustado": a.valor_ajustado,
            "justificativa": a.justificativa,
            "ajustado_por_id": str(a.ajustado_por_id) if a.ajustado_por_id else None,
            "created_at": a.created_at.isoformat(),
        }
        for a in ajustes
    ]
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.READ,
        access_type="READ_SENSIVEL", entity="rma_fechamento",
        entity_id=f.id, actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return out


@router.post("/rma/{fechamento_id}/adjust", response_model=RmaAjusteOut, status_code=201)
async def ajustar_rma(
    fechamento_id: uuid.UUID,
    body: RmaAjusteCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    f = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.id == fechamento_id,
                RmaFechamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fechamento não encontrado")
    if f.status == "FECHADO":
        raise HTTPException(status_code=422, detail="RMA já fechado; reabra para ajustar")

    # Atualiza o valor ajustado nos dados calculados
    if f.dados_calculados and body.bloco in f.dados_calculados:
        dados = dict(f.dados_calculados)
        dados[body.bloco][body.campo] = body.valor_ajustado
        f.dados_calculados = dados

    a = RmaAjuste(
        tenant_id=tenant_id, fechamento_id=f.id,
        bloco=body.bloco, campo=body.campo,
        valor_calculado=body.valor_calculado,
        valor_ajustado=body.valor_ajustado,
        justificativa=body.justificativa,
        ajustado_por_id=user.id,
    )
    db.add(a)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="rma_ajuste", entity_id=a.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={
            "bloco": body.bloco, "campo": body.campo,
            "de": body.valor_calculado, "para": body.valor_ajustado,
        },
    )
    await db.commit()
    return a


@router.post("/rma/{fechamento_id}/close", response_model=RmaFechamentoOut)
async def fechar_rma(
    fechamento_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    f = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.id == fechamento_id,
                RmaFechamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fechamento não encontrado")
    if f.status == "FECHADO":
        raise HTTPException(status_code=422, detail="RMA já está fechado")
    f.status = "FECHADO"
    f.fechado_por_id = user.id
    f.fechado_em = datetime.now(timezone.utc)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="rma_fechamento", entity_id=f.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "FECHADO"},
    )
    await db.commit()
    f = (
        await db.execute(select(RmaFechamento).where(RmaFechamento.id == f.id))
    ).scalar_one()
    return _f_out(f)


@router.post("/rma/{fechamento_id}/reopen", response_model=RmaFechamentoOut)
async def reabrir_rma(
    fechamento_id: uuid.UUID,
    body: RmaReaberturaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    f = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.id == fechamento_id,
                RmaFechamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fechamento não encontrado")
    if f.status != "FECHADO":
        raise HTTPException(status_code=422, detail="Apenas RMA fechado pode ser reaberto")
    f.status = "REABERTO"
    f.reaberto_por_id = user.id
    f.reaberto_em = datetime.now(timezone.utc)
    f.motivo_reabertura = body.motivo_reabertura
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="rma_fechamento", entity_id=f.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={
            "novo_status": "REABERTO",
            "motivo": body.motivo_reabertura,
        },
    )
    await db.commit()
    f = (
        await db.execute(select(RmaFechamento).where(RmaFechamento.id == f.id))
    ).scalar_one()
    return _f_out(f)


@router.get("/rma/{fechamento_id}/export")
async def exportar_rma_csv(
    fechamento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Exporta os dados do RMA como CSV."""
    from fastapi.responses import Response

    f = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.id == fechamento_id,
                RmaFechamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not f or not f.dados_calculados:
        raise HTTPException(status_code=404, detail="RMA não encontrado ou não calculado")

    linhas = ["Bloco;Campo;Valor"]
    for bloco_nome, campos in f.dados_calculados.items():
        if bloco_nome.startswith("_"):
            continue
        for campo, valor in campos.items():
            linhas.append(f"{bloco_nome};{campo};{valor}")

    return Response(
        content="\n".join(linhas),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f"attachment; filename=rma_{f.ano}_{f.mes:02d}.csv"
            ),
        },
    )
