"""Rede de atenção e cadastros-base da Fase 1.

Rotas finas: toda regra está em ``services/``. Cada POST de criação/importação
aceita ``Idempotency-Key``; cada PATCH aceita ``If-Match`` com a ``versao``.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.rede_helpers import (
    cache_idempotencia,
    gravar_idempotencia,
    resposta_cache,
)
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.errors import PermissionDenied
from app.core.permissoes import Permissao
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.models.rede import Escala, Plantao
from app.schemas.comuns import Pagina
from app.schemas.rede import (
    BaixaRequest,
    BuscaProfissionalRequest,
    EnteConsorciadoCreate,
    EnteConsorciadoOut,
    EnteConsorciadoUpdate,
    EquipeCreate,
    EquipeOut,
    EquipeUpdate,
    EscalaCreate,
    EstabelecimentoCreate,
    EstabelecimentoOut,
    EstabelecimentoUpdate,
    HorarioFuncionamentoCreate,
    HorarioFuncionamentoOut,
    HorarioFuncionamentoUpdate,
    PlantaoCreate,
    PrioridadeCreate,
    PrioridadeOut,
    PrioridadeUpdate,
    ProcedimentoAutorizadoCreate,
    ProcedimentoAutorizadoOut,
    ProcedimentoAutorizadoUpdate,
    ProfissionalCreate,
    ProfissionalEspecialidadeCreate,
    ProfissionalEspecialidadeOut,
    ProfissionalOut,
    ProfissionalUpdate,
    RestricaoHorarioCreate,
    RestricaoHorarioOut,
    RestricaoHorarioUpdate,
    ServicoClassificacaoCreate,
    ServicoClassificacaoOut,
    ServicoClassificacaoUpdate,
    SetorCreate,
    SetorOut,
    SetorUpdate,
    TurnoCancelamento,
    TurnoOut,
    TurnoUpdate,
    VinculoEquipeCreate,
    VinculoProfissionalCreate,
    VinculoProfissionalOut,
)
from app.services import (
    cadastros_rede,
    entes,
    equipes,
    estabelecimentos,
    prioridades,
    profissionais,
    restricoes,
    turnos,
)
from app.services.auditoria import dados_do_cliente, registrar
from app.services.rede_comum import escopos_estabelecimento

router = APIRouter(tags=["Rede de atenção"])


# ── Estabelecimentos ────────────────────────────────────────────────────────


@router.get("/estabelecimentos", response_model=Pagina[EstabelecimentoOut])
async def listar_estabelecimentos(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
    municipio_ibge: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens, proximo, total = await estabelecimentos.listar(
        db,
        tenant_id,
        usuario,
        limite=limite,
        cursor=cursor,
        busca=busca,
        ativo=ativo,
        municipio_ibge=municipio_ibge,
    )
    fuso = await estabelecimentos.fuso_do_tenant(db, tenant_id)
    return Pagina[EstabelecimentoOut](
        itens=[estabelecimentos.para_saida(item, fuso) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/estabelecimentos", response_model=EstabelecimentoOut, status_code=201
)
async def criar_estabelecimento(
    corpo: EstabelecimentoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    if escopos_estabelecimento(ator, Permissao.ESTABELECIMENTO_GERENCIAR) is not None:
        raise PermissionDenied(
            "Somente perfis com escopo municipal podem criar estabelecimentos."
        )
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await estabelecimentos.criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    fuso = await estabelecimentos.fuso_do_tenant(db, tenant_id)
    saida = estabelecimentos.para_saida(registro, fuso)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201, saida, ator
    )
    return saida


@router.get("/estabelecimentos/{estabelecimento_id}", response_model=EstabelecimentoOut)
async def detalhar_estabelecimento(
    estabelecimento_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    registro = await estabelecimentos.obter_com_escopo(
        db, tenant_id, usuario, estabelecimento_id
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return estabelecimentos.para_saida(
        registro, await estabelecimentos.fuso_do_tenant(db, tenant_id)
    )


@router.patch("/estabelecimentos/{estabelecimento_id}", response_model=EstabelecimentoOut)
async def atualizar_estabelecimento(
    estabelecimento_id: uuid.UUID,
    corpo: EstabelecimentoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    from app.services.rede_comum import exigir_versao

    versao = exigir_versao(if_match)
    registro = await estabelecimentos.atualizar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        dados=corpo,
        versao=versao,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return estabelecimentos.para_saida(
        registro, await estabelecimentos.fuso_do_tenant(db, tenant_id)
    )


@router.post(
    "/estabelecimentos/{estabelecimento_id}/baixar",
    response_model=EstabelecimentoOut,
)
async def baixar_estabelecimento(
    estabelecimento_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    registro = await estabelecimentos.baixar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return estabelecimentos.para_saida(
        registro, await estabelecimentos.fuso_do_tenant(db, tenant_id)
    )


# ── Setores ─────────────────────────────────────────────────────────────────


@router.get(
    "/estabelecimentos/{estabelecimento_id}/setores", response_model=Pagina[SetorOut]
)
async def listar_setores(
    estabelecimento_id: uuid.UUID,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens, proximo, total = await estabelecimentos.listar_setores(
        db, tenant_id, usuario, estabelecimento_id, limite=limite, cursor=cursor
    )
    return Pagina[SetorOut](
        itens=[SetorOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/estabelecimentos/{estabelecimento_id}/setores",
    response_model=SetorOut,
    status_code=201,
)
async def criar_setor(
    estabelecimento_id: uuid.UUID,
    corpo: SetorCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await estabelecimentos.criar_setor(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = SetorOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch(
    "/estabelecimentos/{estabelecimento_id}/setores/{setor_id}",
    response_model=SetorOut,
)
async def atualizar_setor(
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID,
    corpo: SetorUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    from app.services.rede_comum import exigir_versao

    registro = await estabelecimentos.atualizar_setor(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        setor_id=setor_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return SetorOut.model_validate(registro)


# ── Serviços / classificações ───────────────────────────────────────────────


@router.get(
    "/estabelecimentos/{estabelecimento_id}/servicos",
    response_model=Pagina[ServicoClassificacaoOut],
)
async def listar_servicos(
    estabelecimento_id: uuid.UUID,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tipo: str | None = None,
    ativo: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens, proximo, total = await cadastros_rede.listar_servicos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        limite=limite,
        cursor=cursor,
        tipo=tipo,
        ativo=ativo,
    )
    return Pagina[ServicoClassificacaoOut](
        itens=[ServicoClassificacaoOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/estabelecimentos/{estabelecimento_id}/servicos",
    response_model=ServicoClassificacaoOut,
    status_code=201,
)
async def criar_servico(
    estabelecimento_id: uuid.UUID,
    corpo: ServicoClassificacaoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cadastros_rede.criar_servico(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = ServicoClassificacaoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch(
    "/estabelecimentos/{estabelecimento_id}/servicos/{servico_id}",
    response_model=ServicoClassificacaoOut,
)
async def atualizar_servico(
    estabelecimento_id: uuid.UUID,
    servico_id: uuid.UUID,
    corpo: ServicoClassificacaoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    from app.services.rede_comum import exigir_versao

    registro = await cadastros_rede.atualizar_servico(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        servico_id=servico_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return ServicoClassificacaoOut.model_validate(registro)


@router.post(
    "/estabelecimentos/{estabelecimento_id}/servicos/{servico_id}/baixar",
    response_model=ServicoClassificacaoOut,
)
async def baixar_servico(
    estabelecimento_id: uuid.UUID,
    servico_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    registro = await cadastros_rede.baixar_servico(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        servico_id=servico_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return ServicoClassificacaoOut.model_validate(registro)


# ── Horários ────────────────────────────────────────────────────────────────


@router.get(
    "/estabelecimentos/{estabelecimento_id}/horarios",
    response_model=Pagina[HorarioFuncionamentoOut],
)
async def listar_horarios(
    estabelecimento_id: uuid.UUID,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    setor_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens, proximo, total = await cadastros_rede.listar_horarios(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        limite=limite,
        cursor=cursor,
        setor_id=setor_id,
    )
    return Pagina[HorarioFuncionamentoOut](
        itens=[HorarioFuncionamentoOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/estabelecimentos/{estabelecimento_id}/horarios",
    response_model=HorarioFuncionamentoOut,
    status_code=201,
)
async def criar_horario(
    estabelecimento_id: uuid.UUID,
    corpo: HorarioFuncionamentoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cadastros_rede.criar_horario(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = HorarioFuncionamentoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch(
    "/estabelecimentos/{estabelecimento_id}/horarios/{horario_id}",
    response_model=HorarioFuncionamentoOut,
)
async def atualizar_horario(
    estabelecimento_id: uuid.UUID,
    horario_id: uuid.UUID,
    corpo: HorarioFuncionamentoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    from app.services.rede_comum import exigir_versao

    registro = await cadastros_rede.atualizar_horario(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        horario_id=horario_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return HorarioFuncionamentoOut.model_validate(registro)


@router.post(
    "/estabelecimentos/{estabelecimento_id}/horarios/{horario_id}/baixar",
    response_model=HorarioFuncionamentoOut,
)
async def baixar_horario(
    estabelecimento_id: uuid.UUID,
    horario_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    registro = await cadastros_rede.baixar_horario(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        estabelecimento_id=estabelecimento_id,
        horario_id=horario_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return HorarioFuncionamentoOut.model_validate(registro)


# ── Equipes ─────────────────────────────────────────────────────────────────


@router.get(
    "/estabelecimentos/{estabelecimento_id}/equipes", response_model=Pagina[EquipeOut]
)
async def listar_equipes_da_unidade(
    estabelecimento_id: uuid.UUID,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.EQUIPE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    itens, proximo, total = await estabelecimentos.listar_equipes_da_unidade(
        db, tenant_id, usuario, estabelecimento_id, limite=limite, cursor=cursor
    )
    return Pagina[EquipeOut](
        itens=[EquipeOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.get("/equipes", response_model=Pagina[EquipeOut])
async def listar_equipes(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.EQUIPE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    itens, proximo, total = await equipes.listar(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        limite=limite,
        cursor=cursor,
        busca=busca,
        ativo=ativo,
    )
    return Pagina[EquipeOut](
        itens=[EquipeOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("/equipes", response_model=EquipeOut, status_code=201)
async def criar_equipe(
    corpo: EquipeCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.EQUIPE_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await equipes.criar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = EquipeOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get("/equipes/{equipe_id}", response_model=EquipeOut)
async def detalhar_equipe(
    equipe_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.EQUIPE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    registro = await equipes.obter_com_escopo(db, tenant_id, usuario, equipe_id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return EquipeOut.model_validate(registro)


@router.patch("/equipes/{equipe_id}", response_model=EquipeOut)
async def atualizar_equipe(
    equipe_id: uuid.UUID,
    corpo: EquipeUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.EQUIPE_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    from app.services.rede_comum import exigir_versao

    registro = await equipes.atualizar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        equipe_id=equipe_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return EquipeOut.model_validate(registro)


@router.post("/equipes/{equipe_id}/baixar", response_model=EquipeOut)
async def baixar_equipe(
    equipe_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.EQUIPE_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    registro = await equipes.baixar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        equipe_id=equipe_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return EquipeOut.model_validate(registro)


@router.get(
    "/equipes/{equipe_id}/profissionais",
    response_model=Pagina[VinculoProfissionalOut],
)
async def listar_profissionais_da_equipe(
    equipe_id: uuid.UUID,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.EQUIPE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    itens, proximo, total = await profissionais.listar_vinculos_por_equipe(
        db, tenant_id, usuario, equipe_id, limite=limite, cursor=cursor
    )
    return Pagina[VinculoProfissionalOut](
        itens=[VinculoProfissionalOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/equipes/{equipe_id}/profissionais",
    response_model=VinculoProfissionalOut,
    status_code=201,
)
async def adicionar_profissional_equipe(
    equipe_id: uuid.UUID,
    corpo: VinculoEquipeCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006, B.1-010 — equipes."""
    from app.schemas.rede import VinculoProfissionalCreate

    equipe = await equipes.obter_com_escopo(
        db, tenant_id, ator, equipe_id, Permissao.PROFISSIONAL_GERENCIAR
    )
    dados = VinculoProfissionalCreate(
        estabelecimento_id=equipe.estabelecimento_id,
        equipe_id=equipe.id,
        cbo=corpo.cbo,
        carga_horaria_semanal=corpo.carga_horaria_semanal,
        vigencia_inicio=corpo.vigencia_inicio,
        vigencia_fim=corpo.vigencia_fim,
        observacoes=corpo.observacoes,
    )
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await profissionais.criar_vinculo(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        profissional_id=corpo.profissional_id,
        dados=dados,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = VinculoProfissionalOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


# ── Profissionais ───────────────────────────────────────────────────────────


async def _auditar_profissional(
    db: AsyncSession, request: Request, usuario: Usuario, recurso_id: uuid.UUID | None
) -> None:
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=usuario,
        recurso="profissional",
        recurso_id=recurso_id,
        finalidade="gestão da rede de atenção",
        cliente=dados_do_cliente(request),
    )
    await db.commit()


@router.get("/profissionais", response_model=Pagina[ProfissionalOut])
async def listar_profissionais(
    request: Request,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    ativo: bool | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROFISSIONAL_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens, proximo, total = await profissionais.listar(
        db,
        tenant_id,
        usuario,
        limite=limite,
        cursor=cursor,
        ativo=ativo,
        estabelecimento_id=estabelecimento_id,
    )
    await _auditar_profissional(db, request, usuario, None)
    return Pagina[ProfissionalOut](
        itens=[ProfissionalOut(**profissionais.para_saida(item)) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/profissionais/busca",
    response_model=Pagina[ProfissionalOut],
    summary="Busca por nome sem expor o termo na URL",
)
async def buscar_profissionais(
    corpo: BuscaProfissionalRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROFISSIONAL_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens, proximo, total = await profissionais.listar(
        db,
        tenant_id,
        usuario,
        limite=corpo.limite,
        cursor=corpo.cursor,
        busca=corpo.termo,
        ativo=corpo.ativo,
        estabelecimento_id=corpo.estabelecimento_id,
    )
    await _auditar_profissional(db, request, usuario, None)
    return Pagina[ProfissionalOut](
        itens=[ProfissionalOut(**profissionais.para_saida(item)) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("/profissionais", response_model=ProfissionalOut, status_code=201)
async def criar_profissional(
    corpo: ProfissionalCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await profissionais.criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = ProfissionalOut(**profissionais.para_saida(registro))
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get("/profissionais/{profissional_id}", response_model=ProfissionalOut)
async def detalhar_profissional(
    profissional_id: uuid.UUID,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROFISSIONAL_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    registro = await profissionais.obter_com_escopo(
        db, tenant_id, usuario, profissional_id
    )
    await _auditar_profissional(db, request, usuario, registro.id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return ProfissionalOut(**profissionais.para_saida(registro))


@router.patch("/profissionais/{profissional_id}", response_model=ProfissionalOut)
async def atualizar_profissional(
    profissional_id: uuid.UUID,
    corpo: ProfissionalUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    from app.services.rede_comum import exigir_versao

    registro = await profissionais.atualizar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        profissional_id=profissional_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return ProfissionalOut(**profissionais.para_saida(registro))


@router.post("/profissionais/{profissional_id}/baixar", response_model=ProfissionalOut)
async def baixar_profissional(
    profissional_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    registro = await profissionais.baixar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        profissional_id=profissional_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return ProfissionalOut(**profissionais.para_saida(registro))


@router.get(
    "/profissionais/{profissional_id}/vinculos",
    response_model=Pagina[VinculoProfissionalOut],
)
async def listar_vinculos(
    profissional_id: uuid.UUID,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    incluir_encerrados: bool = True,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROFISSIONAL_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-011 — vínculos com vigência."""
    itens, proximo, total = await profissionais.listar_vinculos(
        db,
        tenant_id,
        usuario,
        profissional_id,
        limite=limite,
        cursor=cursor,
        incluir_encerrados=incluir_encerrados,
    )
    return Pagina[VinculoProfissionalOut](
        itens=[VinculoProfissionalOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/profissionais/{profissional_id}/vinculos",
    response_model=VinculoProfissionalOut,
    status_code=201,
)
async def criar_vinculo(
    profissional_id: uuid.UUID,
    corpo: VinculoProfissionalCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-011 — vínculos com vigência."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await profissionais.criar_vinculo(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        profissional_id=profissional_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = VinculoProfissionalOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get(
    "/profissionais/{profissional_id}/especialidades",
    response_model=list[ProfissionalEspecialidadeOut],
)
async def listar_especialidades_profissional(
    profissional_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROFISSIONAL_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    itens = await profissionais.listar_especialidades(
        db, tenant_id, usuario, profissional_id
    )
    return [ProfissionalEspecialidadeOut.model_validate(item) for item in itens]


@router.post(
    "/profissionais/{profissional_id}/especialidades",
    response_model=ProfissionalEspecialidadeOut,
    status_code=201,
)
async def adicionar_especialidade_profissional(
    profissional_id: uuid.UUID,
    corpo: ProfissionalEspecialidadeCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await profissionais.adicionar_especialidade(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        profissional_id=profissional_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = ProfissionalEspecialidadeOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


# ── Escalas / plantões ──────────────────────────────────────────────────────


async def _listar_turnos(
    modelo,
    request: Request,
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    limite: int,
    cursor: str | None,
    estabelecimento_id: uuid.UUID | None,
    profissional_id: uuid.UUID | None,
    equipe_id: uuid.UUID | None,
    data_inicio,
    data_fim,
):
    itens, proximo, total = await turnos.listar(
        db,
        modelo=modelo,
        tenant_id=tenant_id,
        usuario=usuario,
        estabelecimento_id=estabelecimento_id,
        profissional_id=profissional_id,
        equipe_id=equipe_id,
        data_inicio=data_inicio,
        data_fim=data_fim,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[TurnoOut](
        itens=[TurnoOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.get("/escalas", response_model=Pagina[TurnoOut])
async def listar_escalas(
    request: Request,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    equipe_id: uuid.UUID | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    return await _listar_turnos(
        Escala,
        request,
        db,
        tenant_id,
        usuario,
        limite=limite,
        cursor=cursor,
        estabelecimento_id=estabelecimento_id,
        profissional_id=profissional_id,
        equipe_id=equipe_id,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )


@router.post("/escalas", response_model=TurnoOut, status_code=201)
async def criar_escala(
    corpo: EscalaCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await turnos.criar(
        db,
        modelo=Escala,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = TurnoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch("/escalas/{escala_id}", response_model=TurnoOut)
async def atualizar_escala(
    escala_id: uuid.UUID,
    corpo: TurnoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    from app.services.rede_comum import exigir_versao

    registro = await turnos.atualizar(
        db,
        modelo=Escala,
        tenant_id=tenant_id,
        usuario=ator,
        turno_id=escala_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return TurnoOut.model_validate(registro)


@router.post("/escalas/{escala_id}/cancelar", response_model=TurnoOut)
async def cancelar_escala(
    escala_id: uuid.UUID,
    corpo: TurnoCancelamento,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    registro = await turnos.cancelar(
        db,
        modelo=Escala,
        tenant_id=tenant_id,
        usuario=ator,
        turno_id=escala_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return TurnoOut.model_validate(registro)


@router.get("/plantoes", response_model=Pagina[TurnoOut])
async def listar_plantoes(
    request: Request,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    equipe_id: uuid.UUID | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — rede de atenção."""
    return await _listar_turnos(
        Plantao,
        request,
        db,
        tenant_id,
        usuario,
        limite=limite,
        cursor=cursor,
        estabelecimento_id=estabelecimento_id,
        profissional_id=profissional_id,
        equipe_id=equipe_id,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )


@router.post("/plantoes", response_model=TurnoOut, status_code=201)
async def criar_plantao(
    corpo: PlantaoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await turnos.criar(
        db,
        modelo=Plantao,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = TurnoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch("/plantoes/{plantao_id}", response_model=TurnoOut)
async def atualizar_plantao(
    plantao_id: uuid.UUID,
    corpo: TurnoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    from app.services.rede_comum import exigir_versao

    registro = await turnos.atualizar(
        db,
        modelo=Plantao,
        tenant_id=tenant_id,
        usuario=ator,
        turno_id=plantao_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return TurnoOut.model_validate(registro)


@router.post("/plantoes/{plantao_id}/cancelar", response_model=TurnoOut)
async def cancelar_plantao(
    plantao_id: uuid.UUID,
    corpo: TurnoCancelamento,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012 — escalas e plantões."""
    registro = await turnos.cancelar(
        db,
        modelo=Plantao,
        tenant_id=tenant_id,
        usuario=ator,
        turno_id=plantao_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return TurnoOut.model_validate(registro)


# ── Procedimentos autorizados ───────────────────────────────────────────────


@router.get(
    "/procedimentos-autorizados", response_model=Pagina[ProcedimentoAutorizadoOut]
)
async def listar_procedimentos(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    especialidade_id: uuid.UUID | None = None,
    ativo: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROFISSIONAL_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-007, B.12-015 — procedimentos autorizados."""
    itens, proximo, total = await cadastros_rede.listar_procedimentos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        profissional_id=profissional_id,
        especialidade_id=especialidade_id,
        limite=limite,
        cursor=cursor,
        ativo=ativo,
    )
    return Pagina[ProcedimentoAutorizadoOut](
        itens=[ProcedimentoAutorizadoOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/procedimentos-autorizados",
    response_model=ProcedimentoAutorizadoOut,
    status_code=201,
)
async def criar_procedimento(
    corpo: ProcedimentoAutorizadoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-007, B.12-015 — procedimentos autorizados."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cadastros_rede.criar_procedimento(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = ProcedimentoAutorizadoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch(
    "/procedimentos-autorizados/{procedimento_id}",
    response_model=ProcedimentoAutorizadoOut,
)
async def atualizar_procedimento(
    procedimento_id: uuid.UUID,
    corpo: ProcedimentoAutorizadoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-007, B.12-015 — procedimentos autorizados."""
    from app.services.rede_comum import exigir_versao

    registro = await cadastros_rede.atualizar_procedimento(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        procedimento_id=procedimento_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return ProcedimentoAutorizadoOut.model_validate(registro)


@router.post(
    "/procedimentos-autorizados/{procedimento_id}/baixar",
    response_model=ProcedimentoAutorizadoOut,
)
async def baixar_procedimento(
    procedimento_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROFISSIONAL_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-007, B.12-015 — procedimentos autorizados."""
    registro = await cadastros_rede.baixar_procedimento(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        procedimento_id=procedimento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return ProcedimentoAutorizadoOut.model_validate(registro)


# ── Prioridades ─────────────────────────────────────────────────────────────


@router.get("/prioridades", response_model=Pagina[PrioridadeOut])
async def listar_prioridades(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    ativo: bool | None = None,
    prioridade_legal: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.CONFIGURACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-016 — prioridades legal/clínica."""
    itens, proximo, total = await prioridades.listar(
        db,
        tenant_id,
        limite=limite,
        cursor=cursor,
        ativo=ativo,
        prioridade_legal=prioridade_legal,
    )
    return Pagina[PrioridadeOut](
        itens=[PrioridadeOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("/prioridades", response_model=PrioridadeOut, status_code=201)
async def criar_prioridade(
    corpo: PrioridadeCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CONFIGURACAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-016 — prioridades legal/clínica."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await prioridades.criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = PrioridadeOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch("/prioridades/{prioridade_id}", response_model=PrioridadeOut)
async def atualizar_prioridade(
    prioridade_id: uuid.UUID,
    corpo: PrioridadeUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CONFIGURACAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-016 — prioridades legal/clínica."""
    from app.services.rede_comum import exigir_versao

    registro = await prioridades.atualizar(
        db,
        tenant_id=tenant_id,
        prioridade_id=prioridade_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return PrioridadeOut.model_validate(registro)


@router.post("/prioridades/{prioridade_id}/baixar", response_model=PrioridadeOut)
async def baixar_prioridade(
    prioridade_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CONFIGURACAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-016 — prioridades legal/clínica."""
    registro = await prioridades.baixar(
        db,
        tenant_id=tenant_id,
        prioridade_id=prioridade_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return PrioridadeOut.model_validate(registro)


# ── Consórcio / entes ───────────────────────────────────────────────────────


@router.get("/consorcios/entes", response_model=Pagina[EnteConsorciadoOut])
async def listar_entes(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    situacao: str | None = None,
    municipio_ibge: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — entes do consórcio."""
    itens, proximo, total = await entes.listar(
        db,
        tenant_id,
        limite=limite,
        cursor=cursor,
        situacao=situacao,
        municipio_ibge=municipio_ibge,
    )
    return Pagina[EnteConsorciadoOut](
        itens=[EnteConsorciadoOut(**entes.serializar_ente(item)) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("/consorcios/entes", response_model=EnteConsorciadoOut, status_code=201)
async def criar_ente(
    corpo: EnteConsorciadoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — entes do consórcio."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await entes.criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = EnteConsorciadoOut(**entes.serializar_ente(registro))
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get("/consorcios/entes/{ente_id}", response_model=EnteConsorciadoOut)
async def detalhar_ente(
    ente_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — entes do consórcio."""
    registro = await entes.obter(db, tenant_id, ente_id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return EnteConsorciadoOut(**entes.serializar_ente(registro))


@router.patch("/consorcios/entes/{ente_id}", response_model=EnteConsorciadoOut)
async def atualizar_ente(
    ente_id: uuid.UUID,
    corpo: EnteConsorciadoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — entes do consórcio."""
    from app.services.rede_comum import exigir_versao

    registro = await entes.atualizar(
        db,
        tenant_id=tenant_id,
        ente_id=ente_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return EnteConsorciadoOut(**entes.serializar_ente(registro))


@router.post("/consorcios/entes/{ente_id}/encerrar", response_model=EnteConsorciadoOut)
async def encerrar_ente(
    ente_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.ESTABELECIMENTO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-006 — entes do consórcio."""
    registro = await entes.encerrar(
        db,
        tenant_id=tenant_id,
        ente_id=ente_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return EnteConsorciadoOut(**entes.serializar_ente(registro))


# ── Restrições de horário ───────────────────────────────────────────────────


@router.get("/restricoes-horario", response_model=Pagina[RestricaoHorarioOut])
async def listar_restricoes(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    usuario_id: uuid.UUID | None = None,
    grupo_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.USUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012, B.12-049 — restrição de horário."""
    itens, proximo, total = await restricoes.listar(
        db,
        tenant_id,
        limite=limite,
        cursor=cursor,
        usuario_id=usuario_id,
        grupo_id=grupo_id,
    )
    return Pagina[RestricaoHorarioOut](
        itens=[RestricaoHorarioOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post(
    "/restricoes-horario", response_model=RestricaoHorarioOut, status_code=201
)
async def criar_restricao(
    corpo: RestricaoHorarioCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012, B.12-049 — restrição de horário."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await restricoes.criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = RestricaoHorarioOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.patch(
    "/restricoes-horario/{restricao_id}", response_model=RestricaoHorarioOut
)
async def atualizar_restricao(
    restricao_id: uuid.UUID,
    corpo: RestricaoHorarioUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012, B.12-049 — restrição de horário."""
    from app.services.rede_comum import exigir_versao

    registro = await restricoes.atualizar(
        db,
        tenant_id=tenant_id,
        restricao_id=restricao_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return RestricaoHorarioOut.model_validate(registro)


@router.post(
    "/restricoes-horario/{restricao_id}/baixar",
    response_model=RestricaoHorarioOut,
)
async def baixar_restricao(
    restricao_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-012, B.12-049 — restrição de horário."""
    registro = await restricoes.baixar(
        db,
        tenant_id=tenant_id,
        restricao_id=restricao_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return RestricaoHorarioOut.model_validate(registro)
