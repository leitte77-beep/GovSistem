import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.busca_ativa import BuscaAtiva, PessoaAbordada
from app.models.enums import AuditAction, RoleName
from app.models.user import User
from app.schemas.busca_ativa import (
    BuscaAtivaCreate,
    BuscaAtivaOut,
    BuscaAtivaResumo,
    BuscaAtivaUpdate,
    PessoaAbordadaOut,
)
from app.services.audit import record_audit

router = APIRouter(tags=["busca-ativa"])

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
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

_FOTO_DIR = "buscas-ativas"


def _busca_ativa_to_out(a: BuscaAtiva) -> dict:
    return {
        "id": a.id,
        "tenant_id": a.tenant_id,
        "professional_id": a.professional_id,
        "data_acao": a.data_acao,
        "local_logradouro": a.local_logradouro,
        "local_bairro": a.local_bairro,
        "local_referencia": a.local_referencia,
        "latitude": a.latitude,
        "longitude": a.longitude,
        "equipe_nomes": a.equipe_nomes,
        "pessoas_abordadas": a.pessoas_abordadas,
        "pessoas_aceitaram_acolhimento": a.pessoas_aceitaram_acolhimento,
        "pessoas_encaminhadas": a.pessoas_encaminhadas,
        "observacoes": a.observacoes,
        "fotos_urls": a.fotos_urls,
        "pessoas": [
            {
                "id": p.id,
                "busca_ativa_id": p.busca_ativa_id,
                "nome": p.nome,
                "nome_social": p.nome_social,
                "idade_estimada": p.idade_estimada,
                "sexo": p.sexo,
                "possui_documento": p.possui_documento,
                "tempo_rua_estimado": p.tempo_rua_estimado,
                "aceitou_acolhimento": p.aceitou_acolhimento,
                "encaminhado_para": p.encaminhado_para,
                "observacoes": p.observacoes,
                "created_at": p.created_at,
            }
            for p in (a.pessoas or [])
        ],
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }


# ═══════════════════════════════════════════════════════════════════════
# CRUD BuscaAtiva
# ═══════════════════════════════════════════════════════════════════════

@router.get("/busca-ativa", response_model=list[BuscaAtivaOut])
async def listar_buscas(
    data_inicio: date | None = Query(None),
    data_fim: date | None = Query(None),
    bairro: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(BuscaAtiva).where(
        BuscaAtiva.tenant_id == tenant_id,
        BuscaAtiva.deleted_at.is_(None),
    )
    if data_inicio:
        q = q.where(BuscaAtiva.data_acao >= data_inicio)
    if data_fim:
        q = q.where(BuscaAtiva.data_acao <= data_fim)
    if bairro:
        q = q.where(BuscaAtiva.local_bairro.ilike(f"%{bairro}%"))
    q = q.order_by(BuscaAtiva.data_acao.desc(), BuscaAtiva.created_at.desc())
    rows = (await db.execute(q)).scalars().all()
    return [_busca_ativa_to_out(a) for a in rows]


@router.post("/busca-ativa", response_model=BuscaAtivaOut, status_code=201)
async def criar_busca(
    body: BuscaAtivaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    ba = BuscaAtiva(
        tenant_id=tenant_id,
        professional_id=body.professional_id,
        data_acao=body.data_acao,
        local_logradouro=body.local_logradouro,
        local_bairro=body.local_bairro,
        local_referencia=body.local_referencia,
        latitude=body.latitude,
        longitude=body.longitude,
        equipe_nomes=body.equipe_nomes,
        pessoas_abordadas=body.pessoas_abordadas,
        pessoas_aceitaram_acolhimento=body.pessoas_aceitaram_acolhimento,
        pessoas_encaminhadas=body.pessoas_encaminhadas,
        observacoes=body.observacoes,
    )
    db.add(ba)
    await db.flush()

    if body.pessoas:
        for pdata in body.pessoas:
            db.add(PessoaAbordada(
                tenant_id=tenant_id,
                busca_ativa_id=ba.id,
                nome=pdata.nome,
                nome_social=pdata.nome_social,
                idade_estimada=pdata.idade_estimada,
                sexo=pdata.sexo,
                possui_documento=pdata.possui_documento,
                tempo_rua_estimado=pdata.tempo_rua_estimado,
                aceitou_acolhimento=pdata.aceitou_acolhimento,
                encaminhado_para=pdata.encaminhado_para,
                observacoes=pdata.observacoes,
            ))

    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="busca_ativa", entity_id=ba.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"data": str(ba.data_acao), "bairro": ba.local_bairro},
    )
    await db.commit()
    ba = (await db.execute(select(BuscaAtiva).where(BuscaAtiva.id == ba.id))).scalar_one()
    return _busca_ativa_to_out(ba)


@router.get("/busca-ativa/{ba_id}", response_model=BuscaAtivaOut)
async def obter_busca(
    ba_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    ba = (
        await db.execute(select(BuscaAtiva).where(
            BuscaAtiva.id == ba_id, BuscaAtiva.tenant_id == tenant_id,
            BuscaAtiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not ba:
        raise HTTPException(status_code=404, detail="Busca ativa não encontrada")
    return _busca_ativa_to_out(ba)


@router.patch("/busca-ativa/{ba_id}", response_model=BuscaAtivaOut)
async def atualizar_busca(
    ba_id: uuid.UUID,
    body: BuscaAtivaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    ba = (
        await db.execute(select(BuscaAtiva).where(
            BuscaAtiva.id == ba_id, BuscaAtiva.tenant_id == tenant_id,
            BuscaAtiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not ba:
        raise HTTPException(status_code=404, detail="Busca ativa não encontrada")
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(ba, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="busca_ativa", entity_id=ba.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    ba = (await db.execute(select(BuscaAtiva).where(BuscaAtiva.id == ba.id))).scalar_one()
    return _busca_ativa_to_out(ba)


@router.delete("/busca-ativa/{ba_id}", status_code=204)
async def excluir_busca(
    ba_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    ba = (
        await db.execute(select(BuscaAtiva).where(
            BuscaAtiva.id == ba_id, BuscaAtiva.tenant_id == tenant_id,
            BuscaAtiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not ba:
        raise HTTPException(status_code=404, detail="Busca ativa não encontrada")
    ba.deleted_at = func.now()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.DELETE,
        entity="busca_ativa", entity_id=ba.id, actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()


# ═══════════════════════════════════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════════════════════════════════

@router.get("/busca-ativa/dashboard", response_model=BuscaAtivaResumo)
async def dashboard_busca_ativa(
    data_inicio: date | None = Query(None),
    data_fim: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    conditions = [
        BuscaAtiva.tenant_id == tenant_id,
        BuscaAtiva.deleted_at.is_(None),
    ]
    if data_inicio:
        conditions.append(BuscaAtiva.data_acao >= data_inicio)
    if data_fim:
        conditions.append(BuscaAtiva.data_acao <= data_fim)

    q = select(
        func.count(BuscaAtiva.id).label("total"),
        func.coalesce(func.sum(BuscaAtiva.pessoas_aceitaram_acolhimento), 0).label("aceitas"),
        func.coalesce(func.sum(BuscaAtiva.pessoas_encaminhadas), 0).label("encaminhadas"),
        func.coalesce(func.sum(BuscaAtiva.pessoas_abordadas), 0).label("pessoas"),
    ).where(*conditions)
    row = (await db.execute(q)).one_or_none()
    return BuscaAtivaResumo(
        total_abordagens=row.total or 0 if row else 0,
        total_aceitaram_acolhimento=row.aceitas or 0 if row else 0,
        total_encaminhados=row.encaminhadas or 0 if row else 0,
        total_pessoas_abordadas=row.pessoas or 0 if row else 0,
    )


# ═══════════════════════════════════════════════════════════════════════
# Fotos
# ═══════════════════════════════════════════════════════════════════════

@router.post("/busca-ativa/{ba_id}/fotos")
async def upload_fotos(
    ba_id: uuid.UUID,
    fotos: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    ba = (
        await db.execute(select(BuscaAtiva).where(
            BuscaAtiva.id == ba_id, BuscaAtiva.tenant_id == tenant_id,
            BuscaAtiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not ba:
        raise HTTPException(status_code=404, detail="Busca ativa não encontrada")

    urls: list[str] = []
    for foto in fotos:
        conteudo = await foto.read()
        ext = foto.filename.rsplit(".", 1)[-1] if foto.filename and "." in foto.filename else "jpg"
        nome = f"{_FOTO_DIR}/{tenant_id}/{ba_id}/{uuid.uuid4().hex}.{ext}"

        try:
            from app.services.storage import upload_file
            url = await upload_file(nome, conteudo, foto.content_type or "image/jpeg")
        except Exception:
            url = nome

        urls.append(url)

    existentes = ba.fotos_urls or []
    ba.fotos_urls = existentes + urls
    await db.commit()
    return {"fotos_urls": ba.fotos_urls}
