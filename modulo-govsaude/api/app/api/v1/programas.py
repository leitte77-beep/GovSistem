"""Programas, linhas de cuidado, elegibilidade, indicadores e demanda (Fase 6).

Requisitos atendidos: B.2-001, B.2-002, B.2-004, B.2-005, B.2-008, B.2-009,
B.2-011, B.2-013, B.2-014, B.2-015.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.programa_helpers import programa_out
from app.api.v1.rede_helpers import (
    cache_idempotencia,
    gravar_idempotencia,
    resposta_cache,
)
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.errors import NotFound
from app.core.permissoes import Permissao
from app.models.cidadao import Cidadao
from app.models.nucleo import Usuario
from app.schemas.comuns import Pagina
from app.schemas.programa import (
    CriteriosElegibilidade,
    DemandaFuturaOut,
    ElegibilidadeOut,
    GerarProgramacoes,
    GerarProgramacoesOut,
    LinhaCuidadoOut,
    ListaNominalOut,
    ProgramaCreate,
    ProgramaItemCreate,
    ProgramaItemOut,
    ProgramaItemUpdate,
    ProgramaNovaVersao,
    ProgramaOut,
    ProgramaUpdate,
    ResumoProgramaOut,
)
from app.services import programas
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/programas", tags=["Programas e linhas de cuidado"])


@router.get("", response_model=Pagina[ProgramaOut])
async def listar_programas(
    codigo: str | None = None,
    tipo: str | None = Query(default=None, pattern="^(PROGRAMA|LINHA_CUIDADO)$"),
    linha_cuidado: str | None = None,
    ativo: bool | None = None,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    itens, proximo, total = await programas.listar_programas(
        db,
        tenant_id,
        usuario,
        codigo=codigo,
        tipo=tipo,
        linha_cuidado=linha_cuidado,
        ativo=ativo,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[ProgramaOut](
        itens=[programa_out(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=ProgramaOut, status_code=201)
async def criar_programa(
    corpo: ProgramaCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await programas.criar_programa(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = programa_out(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db,
        tenant_id,
        chave,
        request,
        request_hash,
        201,
        jsonable_encoder(saida),
        ator,
    )
    return saida


@router.get("/linhas-cuidado", response_model=list[LinhaCuidadoOut])
async def listar_linhas_cuidado(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    agrupados = await programas.listar_linhas_cuidado(db, tenant_id)
    return [
        LinhaCuidadoOut(
            linha_cuidado=codigo,
            programas=[programa_out(item) for item in itens],
        )
        for codigo, itens in sorted(agrupados.items())
    ]


@router.get("/{programa_id}", response_model=ProgramaOut)
async def detalhar_programa(
    programa_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    registro = await programas.obter_programa(db, tenant_id, programa_id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return programa_out(registro)


@router.patch("/{programa_id}", response_model=ProgramaOut)
async def atualizar_programa(
    programa_id: uuid.UUID,
    corpo: ProgramaUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    registro = await programas.atualizar_programa(
        db,
        tenant_id=tenant_id,
        programa_id=programa_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return programa_out(registro)


@router.post("/{programa_id}/nova-versao", response_model=ProgramaOut, status_code=201)
async def nova_versao_programa(
    programa_id: uuid.UUID,
    corpo: ProgramaNovaVersao,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    registro = await programas.nova_versao_programa(
        db,
        tenant_id=tenant_id,
        programa_id=programa_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return programa_out(registro)


@router.get("/{programa_id}/itens", response_model=list[ProgramaItemOut])
async def listar_itens(
    programa_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    return await programas.listar_itens(db, tenant_id, programa_id)


@router.post("/{programa_id}/itens", response_model=ProgramaItemOut, status_code=201)
async def criar_item(
    programa_id: uuid.UUID,
    corpo: ProgramaItemCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    return await programas.criar_item(
        db,
        tenant_id=tenant_id,
        programa_id=programa_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )


@router.patch("/{programa_id}/itens/{item_id}", response_model=ProgramaItemOut)
async def atualizar_item(
    programa_id: uuid.UUID,
    item_id: uuid.UUID,
    corpo: ProgramaItemUpdate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-001, B.2-015 — programas parametrizáveis."""
    return await programas.atualizar_item(
        db,
        tenant_id=tenant_id,
        programa_id=programa_id,
        item_id=item_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )


@router.get("/{programa_id}/elegibilidade", response_model=ElegibilidadeOut)
async def avaliar_elegibilidade(
    programa_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    gestante: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-003 — elegibilidade."""
    programa = await programas.obter_programa(db, tenant_id, programa_id)
    cidadao = await db.scalar(
        select(Cidadao).where(
            Cidadao.id == cidadao_id,
            Cidadao.tenant_id == tenant_id,
            Cidadao.baixa_em.is_(None),
        )
    )
    if cidadao is None:
        raise NotFound("Cidadão não encontrado.")
    elegivel, motivos = await programas.avaliar_elegibilidade(
        db, tenant_id, programa, cidadao, gestante=gestante
    )
    return ElegibilidadeOut(
        programa_id=programa.id,
        cidadao_id=cidadao.id,
        elegivel=elegivel,
        motivos=motivos,
        criterios=CriteriosElegibilidade(**(programa.criterios_elegibilidade or {})),
    )


@router.post(
    "/{programa_id}/gerar-programacoes",
    response_model=GerarProgramacoesOut,
)
async def gerar_programacoes(
    programa_id: uuid.UUID,
    corpo: GerarProgramacoes,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-002 — programação."""
    return await programas.gerar_programacoes_programa(
        db,
        tenant_id=tenant_id,
        programa_id=programa_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )


@router.get("/{programa_id}/resumo", response_model=ResumoProgramaOut)
async def resumo_programa(
    programa_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-012 — resumo do programa."""
    return await programas.resumo_programa(db, tenant_id, programa_id)


@router.get("/{programa_id}/lista-nominal", response_model=ListaNominalOut)
async def lista_nominal(
    programa_id: uuid.UUID,
    somente_atrasadas: bool = True,
    limite: int = Query(200, ge=1, le=1000),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_BUSCA_ATIVA)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-011 — lista nominal para busca ativa."""
    return await programas.lista_nominal(
        db,
        tenant_id,
        programa_id,
        usuario,
        somente_atrasadas=somente_atrasadas,
        limite=limite,
    )


@router.get("/{programa_id}/estimativa-demanda", response_model=DemandaFuturaOut)
async def estimativa_demanda(
    programa_id: uuid.UUID,
    horizonte_meses: int = Query(3, ge=1, le=36),
    data_base: date | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-014 — demanda futura."""
    return await programas.estimativa_demanda(
        db,
        tenant_id,
        programa_id,
        horizonte_meses=horizonte_meses,
        data_base=data_base,
    )
