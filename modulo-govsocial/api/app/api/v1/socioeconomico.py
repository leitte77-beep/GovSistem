import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.family import Family
from app.models.socioeconomico import (
    CondicoesEducacionais,
    CondicoesSaude,
    ConvivenciaFamiliar,
    DadosRua,
    DespesaFamiliar,
    PotencialidadeFamiliar,
    RendaMembro,
    VulnerabilidadeFamiliar,
)
from app.models.user import User
from app.schemas.socioeconomico import (
    CondicoesEducacionaisCreate,
    CondicoesEducacionaisOut,
    CondicoesSaudeCreate,
    CondicoesSaudeOut,
    ConvivenciaFamiliarCreate,
    ConvivenciaFamiliarOut,
    DadosRuaCreate,
    DadosRuaOut,
    DespesaFamiliarCreate,
    DespesaFamiliarOut,
    PotencialidadeFamiliarCreate,
    PotencialidadeFamiliarOut,
    RendaDemonstrativo,
    RendaMembroCreate,
    RendaMembroOut,
    VulnerabilidadeFamiliarCreate,
    VulnerabilidadeFamiliarOut,
)
from app.services.calculo_renda import atualizar_faixa_renda_familiar, calcular_demonstrativo_renda

router = APIRouter(tags=["socioeconomico"])

_WRITE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


def _verify_family(db, tenant_id, family_id):
    return db.execute(
        select(Family).where(
            Family.id == family_id,
            Family.tenant_id == tenant_id,
            Family.deleted_at.is_(None),
        )
    )


# ─── RENDA ────────────────────────────────────────────────

@router.get("/families/{family_id}/renda", response_model=RendaDemonstrativo)
async def demonstrativo_renda(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    fam = (await _verify_family(db, tenant_id, family_id)).scalar_one_or_none()
    if not fam:
        raise HTTPException(status_code=404, detail="Familia nao encontrada")
    return await calcular_demonstrativo_renda(db, tenant_id, family_id)


@router.post("/persons/{person_id}/renda", response_model=RendaMembroOut)
async def adicionar_renda(
    person_id: uuid.UUID,
    payload: RendaMembroCreate,
    family_id: uuid.UUID = Query(),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    renda = RendaMembro(
        tenant_id=tenant_id,
        person_id=person_id,
        family_id=family_id,
        **payload.model_dump(),
    )
    db.add(renda)
    await db.commit()
    await db.refresh(renda)
    await atualizar_faixa_renda_familiar(db, tenant_id, family_id)
    return renda


@router.patch("/persons/{person_id}/renda/{renda_id}", response_model=RendaMembroOut)
async def atualizar_renda(
    person_id: uuid.UUID,
    renda_id: uuid.UUID,
    payload: RendaMembroCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    renda = (
        await db.execute(
            select(RendaMembro).where(
                RendaMembro.id == renda_id,
                RendaMembro.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not renda:
        raise HTTPException(status_code=404)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(renda, k, v)
    await db.commit()
    await db.refresh(renda)
    return renda


@router.delete("/persons/{person_id}/renda/{renda_id}", status_code=204)
async def remover_renda(
    person_id: uuid.UUID,
    renda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    renda = (
        await db.execute(
            select(RendaMembro).where(
                RendaMembro.id == renda_id,
                RendaMembro.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not renda:
        raise HTTPException(status_code=404)
    await db.delete(renda)
    await atualizar_faixa_renda_familiar(db, tenant_id, renda.family_id)
    await db.commit()


# ─── DESPESAS ────────────────────────────────────────────

@router.post("/families/{family_id}/despesas", response_model=DespesaFamiliarOut)
async def adicionar_despesa(
    family_id: uuid.UUID,
    payload: DespesaFamiliarCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    d = DespesaFamiliar(tenant_id=tenant_id, family_id=family_id, **payload.model_dump())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


@router.delete("/families/{family_id}/despesas/{despesa_id}", status_code=204)
async def remover_despesa(
    family_id: uuid.UUID,
    despesa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    d = (
        await db.execute(
            select(DespesaFamiliar).where(
                DespesaFamiliar.id == despesa_id,
                DespesaFamiliar.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404)
    await db.delete(d)
    await db.commit()


# ─── SITUAÇÃO DE RUA ────────────────────────────────────

@router.get("/families/{family_id}/situacao-rua", response_model=DadosRuaOut)
async def obter_situacao_rua(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    r = (
        await db.execute(
            select(DadosRua).where(
                DadosRua.tenant_id == tenant_id,
                DadosRua.family_id == family_id,
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Dados de situacao de rua nao encontrados")
    return r


@router.patch("/families/{family_id}/situacao-rua", response_model=DadosRuaOut)
async def atualizar_situacao_rua(
    family_id: uuid.UUID,
    payload: DadosRuaCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    r = (
        await db.execute(
            select(DadosRua).where(
                DadosRua.tenant_id == tenant_id,
                DadosRua.family_id == family_id,
            )
        )
    ).scalar_one_or_none()

    if not r:
        r = DadosRua(tenant_id=tenant_id, family_id=family_id)
        db.add(r)

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)

    await db.commit()
    await db.refresh(r)
    return r


# ─── CONDIÇÕES DE SAÚDE ────────────────────────────────

@router.get("/families/{family_id}/condicoes-saude", response_model=list[CondicoesSaudeOut])
async def listar_condicoes_saude(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return (
        await db.execute(
            select(CondicoesSaude).where(
                CondicoesSaude.tenant_id == tenant_id,
                CondicoesSaude.family_id == family_id,
            ).order_by(CondicoesSaude.data_coleta.desc())
        )
    ).scalars().all()


@router.post("/families/{family_id}/condicoes-saude", response_model=CondicoesSaudeOut)
async def registrar_condicoes_saude(
    family_id: uuid.UUID,
    payload: CondicoesSaudeCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    c = CondicoesSaude(
        tenant_id=tenant_id,
        family_id=family_id,
        profissional_id=user.id,
        **payload.model_dump(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


# ─── CONDIÇÕES EDUCACIONAIS ────────────────────────────

@router.get("/families/{family_id}/condicoes-educacionais", response_model=list[CondicoesEducacionaisOut])
async def listar_condicoes_educacionais(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return (
        await db.execute(
            select(CondicoesEducacionais).where(
                CondicoesEducacionais.tenant_id == tenant_id,
                CondicoesEducacionais.family_id == family_id,
            ).order_by(CondicoesEducacionais.data_coleta.desc())
        )
    ).scalars().all()


@router.post("/families/{family_id}/condicoes-educacionais", response_model=CondicoesEducacionaisOut)
async def registrar_condicoes_educacionais(
    family_id: uuid.UUID,
    payload: CondicoesEducacionaisCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    c = CondicoesEducacionais(
        tenant_id=tenant_id,
        family_id=family_id,
        profissional_id=user.id,
        **payload.model_dump(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


# ─── CONVIVÊNCIA FAMILIAR ──────────────────────────────

@router.get("/families/{family_id}/convivencia", response_model=list[ConvivenciaFamiliarOut])
async def listar_convivencia(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return (
        await db.execute(
            select(ConvivenciaFamiliar).where(
                ConvivenciaFamiliar.tenant_id == tenant_id,
                ConvivenciaFamiliar.family_id == family_id,
            ).order_by(ConvivenciaFamiliar.data_coleta.desc())
        )
    ).scalars().all()


@router.post("/families/{family_id}/convivencia", response_model=ConvivenciaFamiliarOut)
async def registrar_convivencia(
    family_id: uuid.UUID,
    payload: ConvivenciaFamiliarCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    c = ConvivenciaFamiliar(
        tenant_id=tenant_id,
        family_id=family_id,
        profissional_id=user.id,
        **payload.model_dump(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


# ─── VULNERABILIDADES ──────────────────────────────────

@router.get("/families/{family_id}/vulnerabilidades", response_model=list[VulnerabilidadeFamiliarOut])
async def listar_vulnerabilidades(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return (
        await db.execute(
            select(VulnerabilidadeFamiliar).where(
                VulnerabilidadeFamiliar.tenant_id == tenant_id,
                VulnerabilidadeFamiliar.family_id == family_id,
            ).order_by(VulnerabilidadeFamiliar.data_inicio.desc())
        )
    ).scalars().all()


@router.post("/families/{family_id}/vulnerabilidades", response_model=VulnerabilidadeFamiliarOut)
async def adicionar_vulnerabilidade(
    family_id: uuid.UUID,
    payload: VulnerabilidadeFamiliarCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    v = VulnerabilidadeFamiliar(
        tenant_id=tenant_id,
        family_id=family_id,
        profissional_id=user.id,
        **payload.model_dump(),
    )
    db.add(v)

    if payload.tipo in ("POBREZA", "EXTREMA_POBREZA"):
        await atualizar_faixa_renda_familiar(db, tenant_id, family_id)

    await db.commit()
    await db.refresh(v)
    return v


@router.patch("/families/{family_id}/vulnerabilidades/{vuln_id}", response_model=VulnerabilidadeFamiliarOut)
async def encerrar_vulnerabilidade(
    family_id: uuid.UUID,
    vuln_id: uuid.UUID,
    data_saida: date = Query(),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    v = (
        await db.execute(
            select(VulnerabilidadeFamiliar).where(
                VulnerabilidadeFamiliar.id == vuln_id,
                VulnerabilidadeFamiliar.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404)
    v.data_saida = data_saida
    await db.commit()
    await db.refresh(v)
    return v


# ─── POTENCIALIDADES ───────────────────────────────────

@router.get("/families/{family_id}/potencialidades", response_model=list[PotencialidadeFamiliarOut])
async def listar_potencialidades(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return (
        await db.execute(
            select(PotencialidadeFamiliar).where(
                PotencialidadeFamiliar.tenant_id == tenant_id,
                PotencialidadeFamiliar.family_id == family_id,
            ).order_by(PotencialidadeFamiliar.data_identificacao.desc())
        )
    ).scalars().all()


@router.post("/families/{family_id}/potencialidades", response_model=PotencialidadeFamiliarOut)
async def adicionar_potencialidade(
    family_id: uuid.UUID,
    payload: PotencialidadeFamiliarCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    p = PotencialidadeFamiliar(
        tenant_id=tenant_id,
        family_id=family_id,
        profissional_id=user.id,
        **payload.model_dump(),
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p
