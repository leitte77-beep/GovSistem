import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import decrypt_text, encrypt_text
from app.models.acompanhamento import Acompanhamento
from app.models.case_file import CaseFile
from app.models.enums import AuditAction, RoleName
from app.models.plano_acompanhamento import (
    AcaoPlano,
    AvaliacaoPlano,
    PlanoAcompanhamento,
)
from app.models.professional import Professional
from app.models.user import User
from app.schemas.acompanhamento import (
    AcaoPlanoCreate,
    AcaoPlanoOut,
    AcaoPlanoUpdate,
    AcompanhamentoCreate,
    AcompanhamentoOut,
    AcompanhamentoUpdate,
    AvaliacaoPlanoCreate,
    AvaliacaoPlanoOut,
    PlanoCreate,
    PlanoOut,
    PlanoUpdate,
)
from app.services.audit import record_audit
from app.services.scoping import can_access_unit

router = APIRouter(prefix="/case-files/{case_file_id}", tags=["acompanhamentos"])

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


async def _load_case_file(db, tenant_id, case_file_id) -> CaseFile:
    cf = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.id == case_file_id,
                CaseFile.tenant_id == tenant_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")
    return cf


def _a_out(ac: Acompanhamento) -> dict:
    di = ac.data_inicio.isoformat() if hasattr(ac.data_inicio, "isoformat") else str(ac.data_inicio)
    df = ac.data_fim.isoformat() if ac.data_fim else None
    pid = str(ac.profissional_responsavel_id) if ac.profissional_responsavel_id else None
    return {
        "id": str(ac.id),
        "case_file_id": str(ac.case_file_id),
        "tipo": ac.tipo,
        "data_inicio": di,
        "data_fim": df,
        "motivo_desligamento": ac.motivo_desligamento,
        "situacao": ac.situacao,
        "observacoes": ac.observacoes,
        "profissional_responsavel_id": pid,
        "created_at": ac.created_at.isoformat(),
        "updated_at": ac.updated_at.isoformat(),
    }


def _p_out(p: PlanoAcompanhamento, acoes: list, avaliacoes: list) -> dict:
    dpa = p.data_proxima_avaliacao.isoformat() if p.data_proxima_avaliacao else None
    return {
        "id": str(p.id),
        "acompanhamento_id": str(p.acompanhamento_id),
        "case_file_id": str(p.case_file_id),
        "diagnostico": p.diagnostico,
        "vulnerabilidades": p.vulnerabilidades,
        "potencialidades": p.potencialidades,
        "objetivos": p.objetivos,
        "data_proxima_avaliacao": dpa,
        "acoes": acoes,
        "avaliacoes": avaliacoes,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def _acao_out(a: AcaoPlano) -> dict:
    return {
        "id": str(a.id),
        "plano_id": str(a.plano_id),
        "descricao": a.descricao,
        "responsavel_id": str(a.responsavel_id) if a.responsavel_id else None,
        "prazo": a.prazo.isoformat() if a.prazo else None,
        "status": a.status,
        "data_conclusao": a.data_conclusao.isoformat() if a.data_conclusao else None,
        "created_at": a.created_at.isoformat(),
    }


def _av_out(av: AvaliacaoPlano) -> dict:
    nda = av.nova_data_avaliacao.isoformat() if av.nova_data_avaliacao else None
    return {
        "id": str(av.id),
        "plano_id": str(av.plano_id),
        "data_avaliacao": av.data_avaliacao.isoformat(),
        "avaliador_id": str(av.avaliador_id) if av.avaliador_id else None,
        "resultado": av.resultado,
        "nova_data_avaliacao": nda,
        "evolucao": decrypt_text(av.evolucao_enc) if av.evolucao_enc else None,
        "evolucao_restrita": False,
        "created_at": av.created_at.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════
# Acompanhamentos
# ═══════════════════════════════════════════════════════════════════════

@router.get("/accompaniments", response_model=list[AcompanhamentoOut])
async def listar_acompanhamentos(
    case_file_id: uuid.UUID,
    situacao: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    q = select(Acompanhamento).where(
        Acompanhamento.tenant_id == tenant_id,
        Acompanhamento.case_file_id == case_file_id,
        Acompanhamento.deleted_at.is_(None),
    )
    if situacao:
        q = q.where(Acompanhamento.situacao == situacao)
    q = q.order_by(Acompanhamento.data_inicio.desc())
    rows = (await db.execute(q)).scalars().all()
    return [_a_out(r) for r in rows]


@router.post("/accompaniments", response_model=AcompanhamentoOut, status_code=201)
async def criar_acompanhamento(
    case_file_id: uuid.UUID,
    body: AcompanhamentoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    if body.profissional_responsavel_id:
        prof = (
            await db.execute(
                select(Professional.id).where(
                    Professional.id == body.profissional_responsavel_id,
                    Professional.tenant_id == tenant_id,
                    Professional.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not prof:
            raise HTTPException(status_code=422, detail="Profissional inválido")

    ac = Acompanhamento(
        tenant_id=tenant_id, case_file_id=case_file_id,
        tipo=body.tipo, data_inicio=body.data_inicio,
        profissional_responsavel_id=body.profissional_responsavel_id,
        observacoes=body.observacoes,
    )
    db.add(ac)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="acompanhamento", entity_id=ac.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"tipo": ac.tipo, "situacao": ac.situacao},
    )
    await db.commit()
    ac = (
        await db.execute(select(Acompanhamento).where(Acompanhamento.id == ac.id))
    ).scalar_one()
    return _a_out(ac)


@router.get("/accompaniments/{acompanhamento_id}", response_model=AcompanhamentoOut)
async def obter_acompanhamento(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    ac = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.id == acompanhamento_id,
                Acompanhamento.case_file_id == case_file_id,
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not ac:
        raise HTTPException(status_code=404, detail="Acompanhamento não encontrado")
    return _a_out(ac)


@router.patch("/accompaniments/{acompanhamento_id}", response_model=AcompanhamentoOut)
async def atualizar_acompanhamento(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    body: AcompanhamentoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    ac = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.id == acompanhamento_id,
                Acompanhamento.case_file_id == case_file_id,
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not ac:
        raise HTTPException(status_code=404, detail="Acompanhamento não encontrado")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(ac, field, value)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="acompanhamento", entity_id=ac.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    ac = (
        await db.execute(select(Acompanhamento).where(Acompanhamento.id == ac.id))
    ).scalar_one()
    return _a_out(ac)


# ═══════════════════════════════════════════════════════════════════════
# Plano de Acompanhamento
# ═══════════════════════════════════════════════════════════════════════


@router.get("/accompaniments/{acompanhamento_id}/plan", response_model=PlanoOut)
async def obter_plano(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    plano = (
        await db.execute(
            select(PlanoAcompanhamento).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    acoes = (await db.execute(
        select(AcaoPlano).where(AcaoPlano.plano_id == plano.id, AcaoPlano.tenant_id == tenant_id)
        .order_by(AcaoPlano.created_at)
    )).scalars().all()
    avaliacoes = (await db.execute(
        select(AvaliacaoPlano).where(
            AvaliacaoPlano.plano_id == plano.id,
            AvaliacaoPlano.tenant_id == tenant_id,
        ).order_by(AvaliacaoPlano.data_avaliacao.desc())
    )).scalars().all()
    return _p_out(plano, [_acao_out(a) for a in acoes], [_av_out(a) for a in avaliacoes])


@router.post("/accompaniments/{acompanhamento_id}/plan", response_model=PlanoOut, status_code=201)
async def criar_plano(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    body: PlanoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    ac = (
        await db.execute(
            select(Acompanhamento.id).where(
                Acompanhamento.id == acompanhamento_id,
                Acompanhamento.case_file_id == case_file_id,
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not ac:
        raise HTTPException(status_code=404, detail="Acompanhamento não encontrado")
    dup = (
        await db.execute(
            select(PlanoAcompanhamento.id).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="Já existe plano para este acompanhamento")

    plano = PlanoAcompanhamento(
        tenant_id=tenant_id, acompanhamento_id=acompanhamento_id,
        case_file_id=case_file_id, **body.model_dump(),
    )
    db.add(plano)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="plano_acompanhamento", entity_id=plano.id, actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    plano = (
        await db.execute(select(PlanoAcompanhamento).where(PlanoAcompanhamento.id == plano.id))
    ).scalar_one()
    return _p_out(plano, [], [])


@router.patch("/accompaniments/{acompanhamento_id}/plan", response_model=PlanoOut)
async def atualizar_plano(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    body: PlanoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    plano = (
        await db.execute(
            select(PlanoAcompanhamento).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(plano, field, value)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="plano_acompanhamento", entity_id=plano.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    plano = (
        await db.execute(select(PlanoAcompanhamento).where(PlanoAcompanhamento.id == plano.id))
    ).scalar_one()
    acoes = (await db.execute(
        select(AcaoPlano).where(AcaoPlano.plano_id == plano.id, AcaoPlano.tenant_id == tenant_id)
        .order_by(AcaoPlano.created_at)
    )).scalars().all()
    avaliacoes = (await db.execute(
        select(AvaliacaoPlano).where(
            AvaliacaoPlano.plano_id == plano.id,
            AvaliacaoPlano.tenant_id == tenant_id,
        ).order_by(AvaliacaoPlano.data_avaliacao.desc())
    )).scalars().all()
    return _p_out(plano, [_acao_out(a) for a in acoes], [_av_out(a) for a in avaliacoes])


# ═══════════════════════════════════════════════════════════════════════
# Ações do Plano
# ═══════════════════════════════════════════════════════════════════════

@router.get("/accompaniments/{acompanhamento_id}/plan/actions", response_model=list[AcaoPlanoOut])
async def listar_acoes(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    plano_id = (
        await db.execute(
            select(PlanoAcompanhamento.id).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not plano_id:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    rows = (
        await db.execute(
            select(AcaoPlano).where(
                AcaoPlano.plano_id == plano_id, AcaoPlano.tenant_id == tenant_id,
            ).order_by(AcaoPlano.created_at)
        )
    ).scalars().all()
    return [_acao_out(r) for r in rows]


@router.post(
    "/accompaniments/{acompanhamento_id}/plan/actions",
    response_model=AcaoPlanoOut,
    status_code=201,
)
async def criar_acao(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    body: AcaoPlanoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    plano = (
        await db.execute(
            select(PlanoAcompanhamento).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    acao = AcaoPlano(tenant_id=tenant_id, plano_id=plano.id, **body.model_dump())
    db.add(acao)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="acao_plano", entity_id=acao.id, actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    acao = (
        await db.execute(select(AcaoPlano).where(AcaoPlano.id == acao.id))
    ).scalar_one()
    return _acao_out(acao)


@router.patch(
    "/accompaniments/{acompanhamento_id}/plan/actions/{acao_id}",
    response_model=AcaoPlanoOut,
)
async def atualizar_acao(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    acao_id: uuid.UUID,
    body: AcaoPlanoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    acao = (
        await db.execute(
            select(AcaoPlano).where(AcaoPlano.id == acao_id, AcaoPlano.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not acao:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    changes = body.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] == "CONCLUIDA" and not acao.data_conclusao:
        acao.data_conclusao = date.today()
    for field, value in changes.items():
        setattr(acao, field, value)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="acao_plano", entity_id=acao.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    acao = (
        await db.execute(select(AcaoPlano).where(AcaoPlano.id == acao.id))
    ).scalar_one()
    return _acao_out(acao)


@router.delete("/accompaniments/{acompanhamento_id}/plan/actions/{acao_id}", status_code=204)
async def excluir_acao(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    acao_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    acao = (
        await db.execute(
            select(AcaoPlano).where(AcaoPlano.id == acao_id, AcaoPlano.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not acao:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    await db.delete(acao)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.DELETE,
        entity="acao_plano", entity_id=acao.id, actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════
# Avaliações do Plano
# ═══════════════════════════════════════════════════════════════════════

@router.get(
    "/accompaniments/{acompanhamento_id}/plan/evaluations",
    response_model=list[AvaliacaoPlanoOut],
)
async def listar_avaliacoes(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    plano_id = (
        await db.execute(
            select(PlanoAcompanhamento.id).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not plano_id:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    rows = (
        await db.execute(
            select(AvaliacaoPlano).where(
                AvaliacaoPlano.plano_id == plano_id, AvaliacaoPlano.tenant_id == tenant_id,
            ).order_by(AvaliacaoPlano.data_avaliacao.desc())
        )
    ).scalars().all()
    return [_av_out(r) for r in rows]


@router.post(
    "/accompaniments/{acompanhamento_id}/plan/evaluations",
    response_model=AvaliacaoPlanoOut,
    status_code=201,
)
async def criar_avaliacao(
    case_file_id: uuid.UUID,
    acompanhamento_id: uuid.UUID,
    body: AvaliacaoPlanoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    plano = (
        await db.execute(
            select(PlanoAcompanhamento).where(
                PlanoAcompanhamento.acompanhamento_id == acompanhamento_id,
                PlanoAcompanhamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano não encontrado")

    av = AvaliacaoPlano(
        tenant_id=tenant_id, plano_id=plano.id,
        data_avaliacao=body.data_avaliacao,
        avaliador_id=body.avaliador_id,
        evolucao_enc=encrypt_text(body.evolucao) if body.evolucao else None,
        resultado=body.resultado or "PARCIAL",
        nova_data_avaliacao=body.nova_data_avaliacao,
    )
    db.add(av)
    if body.nova_data_avaliacao:
        plano.data_proxima_avaliacao = body.nova_data_avaliacao
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="avaliacao_plano", entity_id=av.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"resultado": av.resultado},
    )
    await db.commit()
    av = (
        await db.execute(select(AvaliacaoPlano).where(AvaliacaoPlano.id == av.id))
    ).scalar_one()
    return _av_out(av)
