import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.repasse import GastoFinanceiro, RepasseFinanceiro
from app.models.user import User
from app.schemas.financeiro import (
    DashboardFinanceiro,
    GastoCreate,
    GastoOut,
    GastoUpdate,
    PrestacaoContasItem,
    PrestacaoContasOut,
    RepasseCreate,
    RepasseListItem,
    RepasseOut,
    RepasseUpdate,
    ResumoEsfera,
)
from app.services.audit import record_audit

router = APIRouter(tags=["financeiro"], prefix="/financeiro")

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


def _r_out(r: RepasseFinanceiro) -> dict:
    return {
        "id": str(r.id),
        "tenant_id": str(r.tenant_id),
        "esfera": r.esfera,
        "programa": r.programa,
        "valor_total": str(r.valor_total),
        "valor_utilizado": str(r.valor_utilizado),
        "data_repasse": r.data_repasse.isoformat() if r.data_repasse else None,
        "data_vigencia_inicio": r.data_vigencia_inicio.isoformat() if r.data_vigencia_inicio else None,
        "data_vigencia_fim": r.data_vigencia_fim.isoformat() if r.data_vigencia_fim else None,
        "status": r.status,
        "observacoes": r.observacoes,
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
    }


def _g_out(g: GastoFinanceiro) -> dict:
    return {
        "id": str(g.id),
        "tenant_id": str(g.tenant_id),
        "repasse_id": str(g.repasse_id),
        "categoria": g.categoria,
        "descricao": g.descricao,
        "valor": str(g.valor),
        "data_gasto": g.data_gasto.isoformat() if g.data_gasto else None,
        "comprovante_url": g.comprovante_url,
        "created_at": g.created_at.isoformat(),
        "updated_at": g.updated_at.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════════════════════════════════

@router.get("/dashboard", response_model=DashboardFinanceiro)
async def dashboard_financeiro(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    base = select(
        RepasseFinanceiro.esfera,
        func.coalesce(func.sum(RepasseFinanceiro.valor_total), 0).label("total_repasse"),
        func.coalesce(func.sum(RepasseFinanceiro.valor_utilizado), 0).label("total_utilizado"),
    ).where(
        RepasseFinanceiro.tenant_id == tenant_id,
        RepasseFinanceiro.deleted_at.is_(None),
    ).group_by(RepasseFinanceiro.esfera)

    rows = (await db.execute(base)).all()

    total_rep = Decimal("0")
    total_utl = Decimal("0")
    por_esfera: list[dict] = []

    for esfera, t_rep, t_utl in rows:
        t_rep_d = Decimal(str(t_rep))
        t_utl_d = Decimal(str(t_utl))
        total_rep += t_rep_d
        total_utl += t_utl_d
        saldo = t_rep_d - t_utl_d
        pct = round((t_utl_d / t_rep_d * 100) if t_rep_d > 0 else Decimal("0"), 2)
        por_esfera.append({
            "esfera": esfera,
            "total_repasse": str(t_rep_d),
            "total_utilizado": str(t_utl_d),
            "saldo": str(saldo),
            "percentual_utilizado": str(pct),
        })

    saldo_disp = total_rep - total_utl
    pct_geral = round((total_utl / total_rep * 100) if total_rep > 0 else Decimal("0"), 2)

    return {
        "total_repasse": str(total_rep),
        "total_gasto": str(total_utl),
        "saldo_disponivel": str(saldo_disp),
        "percentual_utilizado_geral": str(pct_geral),
        "por_esfera": por_esfera,
    }


# ═══════════════════════════════════════════════════════════════════════
# Prestação de Contas
# ═══════════════════════════════════════════════════════════════════════

@router.get("/prestacao-contas")
async def prestacao_contas(
    ano: int = Query(...),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Dados consolidados para prestação de contas do ano informado."""
    repasses_q = select(RepasseFinanceiro).where(
        RepasseFinanceiro.tenant_id == tenant_id,
        RepasseFinanceiro.deleted_at.is_(None),
        func.extract("year", RepasseFinanceiro.data_repasse) == ano,
    ).order_by(RepasseFinanceiro.created_at.desc())

    repasses = (await db.execute(repasses_q)).scalars().all()

    itens = []
    for r in repasses:
        gastos_q = select(GastoFinanceiro).where(
            GastoFinanceiro.repasse_id == r.id,
            GastoFinanceiro.deleted_at.is_(None),
        ).order_by(GastoFinanceiro.data_gasto.desc())
        gastos = (await db.execute(gastos_q)).scalars().all()
        gastos_out = [_g_out(g) for g in gastos]

        s = r.valor_total - r.valor_utilizado
        itens.append({
            "repasse_id": str(r.id),
            "esfera": r.esfera,
            "programa": r.programa,
            "valor_total": str(r.valor_total),
            "valor_utilizado": str(r.valor_utilizado),
            "saldo": str(s),
            "total_gastos": len(gastos),
            "gastos": gastos_out,
        })

    total_repasse = sum(Decimal(i["valor_total"]) for i in itens)
    total_gasto = sum(Decimal(i["valor_utilizado"]) for i in itens)

    return {
        "ano": ano,
        "total_repasse": str(total_repasse),
        "total_gasto": str(total_gasto),
        "saldo_geral": str(total_repasse - total_gasto),
        "itens": itens,
    }


# ═══════════════════════════════════════════════════════════════════════
# CRUD Repasses
# ═══════════════════════════════════════════════════════════════════════

@router.get("/repasses", response_model=list[RepasseListItem])
async def listar_repasses(
    esfera: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(RepasseFinanceiro).where(
        RepasseFinanceiro.tenant_id == tenant_id,
        RepasseFinanceiro.deleted_at.is_(None),
    )
    if esfera:
        q = q.where(RepasseFinanceiro.esfera == esfera)
    if status:
        q = q.where(RepasseFinanceiro.status == status)
    q = q.order_by(RepasseFinanceiro.data_repasse.desc()).offset(skip).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/repasses", status_code=201)
async def criar_repasse(
    body: RepasseCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = RepasseFinanceiro(
        tenant_id=tenant_id,
        esfera=body.esfera,
        programa=body.programa,
        valor_total=body.valor_total,
        data_repasse=body.data_repasse,
        data_vigencia_inicio=body.data_vigencia_inicio,
        data_vigencia_fim=body.data_vigencia_fim,
        observacoes=body.observacoes,
    )
    db.add(r)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="repasse_financeiro", entity_id=r.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"esfera": r.esfera, "programa": r.programa, "valor": str(r.valor_total)},
    )
    await db.commit()
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(RepasseFinanceiro.id == r.id)
        )
    ).scalar_one()
    return _r_out(r)


@router.get("/repasses/{repasse_id}")
async def obter_repasse(
    repasse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")
    return _r_out(r)


@router.patch("/repasses/{repasse_id}")
async def atualizar_repasse(
    repasse_id: uuid.UUID,
    body: RepasseUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")
    if r.status != "ATIVO":
        raise HTTPException(status_code=422, detail="Apenas repasses ATIVO podem ser alterados")

    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(r, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="repasse_financeiro", entity_id=r.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(RepasseFinanceiro.id == r.id)
        )
    ).scalar_one()
    return _r_out(r)


@router.delete("/repasses/{repasse_id}", status_code=204)
async def excluir_repasse(
    repasse_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")

    r.deleted_at = datetime.now(timezone.utc)
    # Soft delete gastos vinculados
    gastos = (
        await db.execute(
            select(GastoFinanceiro).where(
                GastoFinanceiro.repasse_id == repasse_id,
                GastoFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    for g in gastos:
        g.deleted_at = datetime.now(timezone.utc)

    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.DELETE,
        entity="repasse_financeiro", entity_id=r.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"programa": r.programa},
    )
    await db.commit()
    return None


@router.post("/repasses/{repasse_id}/encerrar")
async def encerrar_repasse(
    repasse_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")
    if r.status != "ATIVO":
        raise HTTPException(status_code=422, detail="Apenas repasses ATIVO podem ser encerrados")

    r.status = "ENCERRADO"
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="repasse_financeiro", entity_id=r.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "ENCERRADO"},
    )
    await db.commit()
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(RepasseFinanceiro.id == r.id)
        )
    ).scalar_one()
    return _r_out(r)


# ═══════════════════════════════════════════════════════════════════════
# CRUD Gastos (vinculados a repasse)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/repasses/{repasse_id}/gastos", response_model=list[GastoOut])
async def listar_gastos(
    repasse_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = (
        select(GastoFinanceiro)
        .where(
            GastoFinanceiro.tenant_id == tenant_id,
            GastoFinanceiro.repasse_id == repasse_id,
            GastoFinanceiro.deleted_at.is_(None),
        )
        .order_by(GastoFinanceiro.data_gasto.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/repasses/{repasse_id}/gastos", status_code=201)
async def criar_gasto(
    repasse_id: uuid.UUID,
    body: GastoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")
    if r.status != "ATIVO":
        raise HTTPException(status_code=422, detail="Repasse não está ATIVO")

    g = GastoFinanceiro(
        tenant_id=tenant_id,
        repasse_id=repasse_id,
        categoria=body.categoria,
        descricao=body.descricao,
        valor=body.valor,
        data_gasto=body.data_gasto,
        comprovante_url=body.comprovante_url,
    )
    db.add(g)
    r.valor_utilizado += body.valor
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="gasto_financeiro", entity_id=g.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"categoria": g.categoria, "valor": str(g.valor), "repasse_id": str(repasse_id)},
    )
    await db.commit()
    g = (
        await db.execute(
            select(GastoFinanceiro).where(GastoFinanceiro.id == g.id)
        )
    ).scalar_one()
    return _g_out(g)


@router.patch("/repasses/{repasse_id}/gastos/{gasto_id}", response_model=GastoOut)
async def atualizar_gasto(
    repasse_id: uuid.UUID,
    gasto_id: uuid.UUID,
    body: GastoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")
    if r.status != "ATIVO":
        raise HTTPException(status_code=422, detail="Repasse não está ATIVO")

    g = (
        await db.execute(
            select(GastoFinanceiro).where(
                GastoFinanceiro.id == gasto_id,
                GastoFinanceiro.repasse_id == repasse_id,
                GastoFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto não encontrado")

    valor_antigo = g.valor
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(g, f, v)

    if "valor" in changes:
        r.valor_utilizado = r.valor_utilizado - valor_antigo + g.valor

    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="gasto_financeiro", entity_id=g.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    g = (
        await db.execute(
            select(GastoFinanceiro).where(GastoFinanceiro.id == g.id)
        )
    ).scalar_one()
    return _g_out(g)


@router.delete("/repasses/{repasse_id}/gastos/{gasto_id}", status_code=204)
async def excluir_gasto(
    repasse_id: uuid.UUID,
    gasto_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(RepasseFinanceiro).where(
                RepasseFinanceiro.id == repasse_id,
                RepasseFinanceiro.tenant_id == tenant_id,
                RepasseFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Repasse não encontrado")

    g = (
        await db.execute(
            select(GastoFinanceiro).where(
                GastoFinanceiro.id == gasto_id,
                GastoFinanceiro.repasse_id == repasse_id,
                GastoFinanceiro.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto não encontrado")

    r.valor_utilizado -= g.valor
    g.deleted_at = datetime.now(timezone.utc)

    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.DELETE,
        entity="gasto_financeiro", entity_id=g.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"categoria": g.categoria, "valor": str(g.valor)},
    )
    await db.commit()
    return None
