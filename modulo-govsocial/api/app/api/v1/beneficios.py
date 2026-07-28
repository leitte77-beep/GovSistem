import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import decrypt_text, encrypt_text
from app.models.beneficio import ConcessaoBeneficio, EstoqueUnidade
from app.models.domain import BenefitType
from app.models.enums import AuditAction, RoleName
from app.models.family import Family
from app.models.user import User
from app.schemas.beneficios import (
    AprovacaoCreate,
    ConcessaoCreate,
    ConcessaoListItem,
    ConcessaoOut,
    ConcessaoUpdate,
    EntregaCreate,
    EstoqueCreate,
    EstoqueMovement,
    EstoqueOut,
    EstoqueUpdate,
    NegacaoCreate,
    ParecerCreate,
)
from app.services.audit import record_audit

router = APIRouter(tags=["beneficios"])


async def _reload_concessao(db, concessao_id):
    return (
        await db.execute(
            select(ConcessaoBeneficio).where(ConcessaoBeneficio.id == concessao_id)
        )
    ).scalar_one()

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


def _c_out(c: ConcessaoBeneficio) -> dict:
    pp = str(c.person_id) if c.person_id else None
    sp = str(c.solicitado_por_id) if c.solicitado_por_id else None
    an = str(c.analisado_por_id) if c.analisado_por_id else None
    ap = str(c.aprovado_por_id) if c.aprovado_por_id else None
    vt = str(c.valor_total) if c.valor_total else None
    d_an = c.data_analise.isoformat() if c.data_analise else None
    d_ap = c.data_aprovacao.isoformat() if c.data_aprovacao else None
    d_en = c.data_entrega.isoformat() if c.data_entrega else None
    d_as = c.assinatura_data.isoformat() if c.assinatura_data else None
    return {
        "id": str(c.id),
        "family_id": str(c.family_id),
        "person_id": pp,
        "unit_id": str(c.unit_id),
        "benefit_type_code": c.benefit_type_code,
        "quantidade": str(c.quantidade),
        "valor_total": vt,
        "status": c.status,
        "data_solicitacao": c.data_solicitacao.isoformat(),
        "data_analise": d_an,
        "data_aprovacao": d_ap,
        "data_entrega": d_en,
        "solicitado_por_id": sp,
        "analisado_por_id": an,
        "aprovado_por_id": ap,
        "parecer": decrypt_text(c.parecer_enc) if c.parecer_enc else None,
        "parecer_restrito": False,
        "motivo_negacao": c.motivo_negacao,
        "comprovante_gerado": c.comprovante_gerado,
        "assinatura_data": d_as,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════
# Estoque
# ═══════════════════════════════════════════════════════════════════════

@router.get("/stock", response_model=list[EstoqueOut])
async def listar_estoque(
    unit_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(EstoqueUnidade).where(EstoqueUnidade.tenant_id == tenant_id)
    if unit_id:
        q = q.where(EstoqueUnidade.unit_id == unit_id)
    rows = (await db.execute(q.order_by(EstoqueUnidade.benefit_type_code))).scalars().all()
    return rows


@router.post("/stock", response_model=EstoqueOut, status_code=201)
async def criar_estoque(
    body: EstoqueCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    dup = (
        await db.execute(
            select(EstoqueUnidade.id).where(
                EstoqueUnidade.tenant_id == tenant_id,
                EstoqueUnidade.unit_id == body.unit_id,
                EstoqueUnidade.benefit_type_code == body.benefit_type_code,
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="Estoque já existe para unidade/benefício")

    e = EstoqueUnidade(
        tenant_id=tenant_id, unit_id=body.unit_id,
        benefit_type_code=body.benefit_type_code,
        quantidade_atual=body.quantidade_inicial,
        quantidade_minima=body.quantidade_minima,
        unidade_medida=body.unidade_medida,
        valor_unitario_referencia=body.valor_unitario_referencia,
    )
    db.add(e)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="estoque_unidade", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"benefit": e.benefit_type_code, "qtd": str(e.quantidade_atual)},
    )
    await db.commit()
    e = (await db.execute(select(EstoqueUnidade).where(EstoqueUnidade.id == e.id))).scalar_one()
    return e


@router.patch("/stock/{stock_id}", response_model=EstoqueOut)
async def atualizar_estoque(
    stock_id: uuid.UUID,
    body: EstoqueUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(
            select(EstoqueUnidade).where(
                EstoqueUnidade.id == stock_id, EstoqueUnidade.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Estoque não encontrado")
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(e, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="estoque_unidade", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    e = (await db.execute(select(EstoqueUnidade).where(EstoqueUnidade.id == e.id))).scalar_one()
    return e


@router.post("/stock/{stock_id}/movement")
async def movimentar_estoque(
    stock_id: uuid.UUID,
    body: EstoqueMovement,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(
            select(EstoqueUnidade).where(
                EstoqueUnidade.id == stock_id, EstoqueUnidade.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Estoque não encontrado")
    novo = e.quantidade_atual + body.quantidade
    if novo < 0:
        raise HTTPException(status_code=422, detail="Saldo insuficiente")
    e.quantidade_atual = novo
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="estoque_unidade", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"movimento": str(body.quantidade), "novo_saldo": str(novo)},
    )
    await db.commit()
    return {"message": "ok", "novo_saldo": str(novo)}


# ═══════════════════════════════════════════════════════════════════════
# Concessões
# ═══════════════════════════════════════════════════════════════════════

@router.get("/benefit-concessions", response_model=list[ConcessaoListItem])
async def listar_concessoes(
    family_id: uuid.UUID | None = Query(None),
    unit_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(ConcessaoBeneficio).where(ConcessaoBeneficio.tenant_id == tenant_id)
    if family_id:
        q = q.where(ConcessaoBeneficio.family_id == family_id)
    if unit_id:
        q = q.where(ConcessaoBeneficio.unit_id == unit_id)
    if status:
        q = q.where(ConcessaoBeneficio.status == status)
    q = q.order_by(ConcessaoBeneficio.data_solicitacao.desc()).offset(skip).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/benefit-concessions", response_model=ConcessaoOut, status_code=201)
async def criar_concessao(
    body: ConcessaoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    fam = (
        await db.execute(
            select(Family.id).where(
                Family.id == body.family_id,
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not fam:
        raise HTTPException(status_code=422, detail="Família inválida")

    # Antiduplicidade: verifica concessões recentes do mesmo benefício
    bt = (
        await db.execute(
            select(BenefitType).where(
                BenefitType.tenant_id == tenant_id,
                BenefitType.code == body.benefit_type_code,
                BenefitType.ativo.is_(True),
            )
        )
    ).scalar_one_or_none()
    if bt and bt.periodicidade_max_dias:
        recent = (
            await db.execute(
                select(func.count(ConcessaoBeneficio.id)).where(
                    ConcessaoBeneficio.tenant_id == tenant_id,
                    ConcessaoBeneficio.family_id == body.family_id,
                    ConcessaoBeneficio.benefit_type_code == body.benefit_type_code,
                    ConcessaoBeneficio.status.in_(["APROVADO", "ENTREGUE"]),
                )
            )
        ).scalar() or 0
        if recent > 0:
            msg = (
                f"Família já recebeu {body.benefit_type_code} "
                f"dentro do período de antiduplicidade"
            )
            raise HTTPException(status_code=409, detail=msg)

    c = ConcessaoBeneficio(
        tenant_id=tenant_id, family_id=body.family_id,
        person_id=body.person_id, unit_id=body.unit_id,
        benefit_type_code=body.benefit_type_code,
        quantidade=body.quantidade, valor_total=body.valor_total,
        solicitado_por_id=body.solicitado_por_id,
    )
    db.add(c)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"benefit": c.benefit_type_code, "family": str(c.family_id)},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)


@router.get("/benefit-concessions/{concessao_id}", response_model=ConcessaoOut)
async def obter_concessao(
    concessao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    return _c_out(c)


@router.patch("/benefit-concessions/{concessao_id}", response_model=ConcessaoOut)
async def atualizar_concessao(
    concessao_id: uuid.UUID,
    body: ConcessaoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    if c.status not in ("SOLICITADO",):
        raise HTTPException(
            status_code=422,
            detail="Só pode alterar concessão em status SOLICITADO",
        )
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(c, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)


# ── Workflow ───────────────────────────────────────────────────────────

@router.post("/benefit-concessions/{concessao_id}/analyze", response_model=ConcessaoOut)
async def emitir_parecer(
    concessao_id: uuid.UUID,
    body: ParecerCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    if c.status != "SOLICITADO":
        raise HTTPException(status_code=422, detail="Status inválido para análise")

    c.status = "EM_ANALISE"
    c.data_analise = datetime.now(timezone.utc)
    if body.parecer:
        c.parecer_enc = encrypt_text(body.parecer)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "EM_ANALISE"},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)


@router.post("/benefit-concessions/{concessao_id}/approve", response_model=ConcessaoOut)
async def aprovar_concessao(
    concessao_id: uuid.UUID,
    body: AprovacaoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    if c.status not in ("SOLICITADO", "EM_ANALISE"):
        raise HTTPException(status_code=422, detail="Status inválido para aprovação")

    c.status = "APROVADO"
    c.data_aprovacao = datetime.now(timezone.utc)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "APROVADO"},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)


@router.post("/benefit-concessions/{concessao_id}/deny", response_model=ConcessaoOut)
async def negar_concessao(
    concessao_id: uuid.UUID,
    body: NegacaoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    if c.status in ("ENTREGUE", "CANCELADO"):
        raise HTTPException(status_code=422, detail="Não pode negar concessão já finalizada")

    c.status = "NEGADO"
    c.motivo_negacao = body.motivo_negacao
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "NEGADO", "motivo": body.motivo_negacao},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)


@router.post("/benefit-concessions/{concessao_id}/deliver", response_model=ConcessaoOut)
async def entregar_beneficio(
    concessao_id: uuid.UUID,
    body: EntregaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    if c.status != "APROVADO":
        raise HTTPException(status_code=422, detail="Concessão deve estar APROVADA para entrega")

    # Baixa no estoque
    estoque = (
        await db.execute(
            select(EstoqueUnidade).where(
                EstoqueUnidade.tenant_id == tenant_id,
                EstoqueUnidade.unit_id == c.unit_id,
                EstoqueUnidade.benefit_type_code == c.benefit_type_code,
            )
        )
    ).scalar_one_or_none()
    if estoque:
        novo = estoque.quantidade_atual - c.quantidade
        if novo < 0:
            raise HTTPException(status_code=422, detail="Estoque insuficiente para entrega")
        estoque.quantidade_atual = novo

    c.status = "ENTREGUE"
    c.data_entrega = datetime.now(timezone.utc)
    c.comprovante_gerado = True
    c.assinatura_data = datetime.now(timezone.utc)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "ENTREGUE"},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)


@router.post("/benefit-concessions/{concessao_id}/cancel", response_model=ConcessaoOut)
async def cancelar_concessao(
    concessao_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concessão não encontrada")
    if c.status in ("ENTREGUE",):
        raise HTTPException(status_code=422, detail="Não pode cancelar concessão já entregue")

    c.status = "CANCELADO"
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="concessao_beneficio", entity_id=c.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": "CANCELADO"},
    )
    await db.commit()
    c = await _reload_concessao(db, c.id)
    return _c_out(c)
