"""Rotas territoriais da Fase 3."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.territorio import (
    AnimalCreate,
    AnimalOut,
    CoberturaOut,
    DomicilioCreate,
    DomicilioOut,
    FamiliaCreate,
    FamiliaMembroCreate,
    FamiliaMembroOut,
    FamiliaOut,
    MetaTerritorialOut,
    TerritorioCreate,
    TerritorioOut,
    VinculoFim,
    VisitaCreate,
    VisitaOut,
)
from app.services import territorios
from app.services.auditoria import dados_do_cliente

router = APIRouter(prefix="/territorios", tags=["Território e Saúde da Família"])


@router.get("", response_model=list[TerritorioOut])
async def listar(
    tipo: str | None = Query(default=None, pattern="^(AREA|MICROAREA)$"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-010 — áreas e microáreas."""
    return await territorios.listar_territorios(db, tenant_id, tipo)


@router.post("", response_model=TerritorioOut, status_code=201)
async def criar(
    corpo: TerritorioCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.TERRITORIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-010 — áreas e microáreas."""
    return await territorios.criar_territorio(db, tenant_id, corpo, ator, dados_do_cliente(request))


@router.get("/domicilios", response_model=list[DomicilioOut])
async def listar_domicilios(
    termo: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-013, B.1-016 — domicílios."""
    return await territorios.listar_domicilios(db, tenant_id, termo)


@router.post("/domicilios", response_model=DomicilioOut, status_code=201)
async def criar_domicilio(
    corpo: DomicilioCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.TERRITORIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-013, B.1-016 — domicílios."""
    return await territorios.criar_domicilio(db, tenant_id, corpo, ator, dados_do_cliente(request))


@router.get("/familias", response_model=list[FamiliaOut])
async def listar_familias(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-005, B.1-013 — famílias."""
    return await territorios.listar_familias(db, tenant_id)


@router.post("/familias", response_model=FamiliaOut, status_code=201)
async def criar_familia(
    corpo: FamiliaCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.TERRITORIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-005, B.1-013 — famílias."""
    return await territorios.criar_familia(db, tenant_id, corpo, ator, dados_do_cliente(request))


@router.post("/familias/{familia_id}/membros", response_model=FamiliaMembroOut, status_code=201)
async def adicionar_membro(
    familia_id: uuid.UUID,
    corpo: FamiliaMembroCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.TERRITORIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-005, B.1-014 — composição familiar."""
    return await territorios.adicionar_membro(
        db, tenant_id, familia_id, corpo, ator, dados_do_cliente(request)
    )


@router.post("/familias/{familia_id}/membros/{membro_id}/encerrar", response_model=FamiliaMembroOut)
async def encerrar_membro(
    familia_id: uuid.UUID,
    membro_id: uuid.UUID,
    corpo: VinculoFim,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.TERRITORIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-005, B.1-014 — composição familiar."""
    return await territorios.encerrar_membro(
        db, tenant_id, familia_id, membro_id, corpo.vigencia_fim, ator, dados_do_cliente(request)
    )


@router.get("/mapa.geojson")
async def mapa(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-028, B.1-042 — GeoJSON sem dado pessoal."""
    return await territorios.geojson(db, tenant_id)


@router.get("/cobertura", response_model=CoberturaOut)
async def cobertura(
    competencia: date,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-018, B.1-024 — cobertura de visitas."""
    return await territorios.cobertura(db, tenant_id, competencia)


@router.get("/metas", response_model=MetaTerritorialOut)
async def metas(
    competencia: date,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-026 — metas."""
    return await territorios.meta(db, tenant_id, competencia)


@router.get("/domicilios/nao-visitados", response_model=list[DomicilioOut])
async def domicilios_nao_visitados(
    competencia: date,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-018 — domicílios não visitados."""
    return await territorios.nao_visitados(db, tenant_id, competencia)


@router.get("/familias/{familia_id}/extrato")
async def extrato_familia(
    familia_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.TERRITORIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-024 — extrato da família."""
    return await territorios.extrato_familia(db, tenant_id, familia_id)


@router.post("/domicilios/{domicilio_id}/animais", response_model=AnimalOut, status_code=201)
async def criar_animal(
    domicilio_id: uuid.UUID,
    corpo: AnimalCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.TERRITORIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-015 — animais do imóvel."""
    return await territorios.criar_animal(
        db, tenant_id, domicilio_id, corpo, ator, dados_do_cliente(request)
    )


@router.get("/visitas", response_model=list[VisitaOut])
async def listar_visitas(
    competencia: date | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.VISITA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-019, B.1-020, B.1-022, B.1-023 — visita domiciliar."""
    return await territorios.listar_visitas(db, tenant_id, competencia)


@router.post("/visitas", response_model=VisitaOut, status_code=201)
async def criar_visita(
    corpo: VisitaCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.VISITA_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-019, B.1-020, B.1-022, B.1-023 — visita domiciliar."""
    return await territorios.criar_visita(db, tenant_id, corpo, ator, dados_do_cliente(request))
