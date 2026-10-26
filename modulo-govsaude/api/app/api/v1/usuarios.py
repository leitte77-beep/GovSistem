"""Usuários, grupos, permissões e escopos (B.12-048…053)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.errors import AppError
from app.core.permissoes import ALL_PERMISSIONS, GRUPOS_NACIONAIS, Permissao
from app.models.nucleo import Grupo, Usuario, UsuarioGrupo
from app.schemas.comuns import Pagina
from app.schemas.nucleo import (
    GrupoOut,
    UsuarioCreate,
    UsuarioOut,
    UsuarioUpdate,
    VinculoCreate,
    VinculoGrupoOut,
)
from app.services.auditoria import dados_do_cliente
from app.services.idempotencia import buscar, chave_do_header, guardar, hash_requisicao
from app.services.usuarios import (
    adicionar_vinculo,
    atualizar,
    criar,
    listar,
    obter,
    revogar_sessoes,
    revogar_vinculo,
)

router = APIRouter(tags=["Usuários e acesso"])


@router.get("/usuarios", response_model=Pagina[UsuarioOut], summary="Listar usuários do tenant")
async def listar_usuarios(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.USUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, proximo, total = await listar(
        db, tenant_id, limite=limite, cursor=cursor, busca=busca, ativo=ativo
    )
    return Pagina[UsuarioOut](
        itens=[UsuarioOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("/usuarios", response_model=UsuarioOut, status_code=201, summary="Criar usuário local")
async def criar_usuario(
    corpo: UsuarioCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    chave = chave_do_header(request)
    endpoint = "/usuarios"
    request_hash = hash_requisicao(corpo.model_dump(mode="json"))
    if chave:
        cache = await buscar(
            db, tenant_id=tenant_id, chave=chave, endpoint=endpoint, request_hash=request_hash
        )
        if cache:
            return JSONResponse(status_code=cache.response_status, content=cache.response_body)
    if corpo.grupo not in GRUPOS_NACIONAIS:
        raise AppError("Grupo inválido.", 422, "grupo_invalido")
    usuario = await criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = UsuarioOut.model_validate(usuario)
    response.headers["ETag"] = f'"{usuario.versao}"'
    if chave:
        await guardar(
            db,
            tenant_id=tenant_id,
            chave=chave,
            endpoint=endpoint,
            request_hash=request_hash,
            status=201,
            body=jsonable_encoder(saida),
            usuario=ator,
        )
        await db.commit()
    return saida


@router.get("/usuarios/{usuario_id}", response_model=UsuarioOut, summary="Detalhar usuário")
async def detalhar_usuario(
    usuario_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.USUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    alvo = await obter(db, tenant_id, usuario_id)
    response.headers["ETag"] = f'"{alvo.versao}"'
    return UsuarioOut.model_validate(alvo)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioOut, summary="Atualizar usuário")
async def atualizar_usuario(
    usuario_id: uuid.UUID,
    corpo: UsuarioUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    if if_match is None:
        raise AppError(
            "Envie o cabeçalho If-Match com a versão atual do usuário.",
            428,
            "if_match_obrigatorio",
        )
    alvo = await obter(db, tenant_id, usuario_id)
    try:
        versao = int(if_match.strip().strip('"'))
    except ValueError as exc:
        raise AppError("If-Match inválido.", 400, "if_match_invalido") from exc
    atualizado = await atualizar(
        db,
        usuario=alvo,
        dados=corpo,
        ator=ator,
        if_match=versao,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{atualizado.versao}"'
    return UsuarioOut.model_validate(atualizado)


@router.get(
    "/usuarios/{usuario_id}/grupos",
    response_model=list[VinculoGrupoOut],
    summary="Vínculos de grupo e escopo do usuário",
)
async def grupos_do_usuario(
    usuario_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.USUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    alvo = await obter(db, tenant_id, usuario_id)
    vinculos = (
        await db.execute(
            select(UsuarioGrupo)
            .where(UsuarioGrupo.usuario_id == alvo.id)
            .options(selectinload(UsuarioGrupo.grupo))
            .order_by(UsuarioGrupo.created_at.desc())
        )
    ).scalars().all()
    return [VinculoGrupoOut.model_validate(v) for v in vinculos]


@router.post(
    "/usuarios/{usuario_id}/grupos",
    response_model=VinculoGrupoOut,
    status_code=201,
    summary="Adicionar vínculo de grupo com escopo",
)
async def adicionar_grupo(
    usuario_id: uuid.UUID,
    corpo: VinculoCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    alvo = await obter(db, tenant_id, usuario_id)
    vinculo = await adicionar_vinculo(
        db,
        usuario=alvo,
        codigo_grupo=corpo.grupo,
        estabelecimento_id=corpo.estabelecimento_id,
        equipe_id=corpo.equipe_id,
        especialidade_id=corpo.especialidade_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    carregado = await db.scalar(
        select(UsuarioGrupo)
        .where(UsuarioGrupo.id == vinculo.id)
        .options(selectinload(UsuarioGrupo.grupo))
    )
    return VinculoGrupoOut.model_validate(carregado)


@router.delete(
    "/usuarios/{usuario_id}/grupos/{vinculo_id}",
    status_code=204,
    summary="Revogar vínculo",
)
async def remover_grupo(
    usuario_id: uuid.UUID,
    vinculo_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    alvo = await obter(db, tenant_id, usuario_id)
    await revogar_vinculo(
        db,
        usuario=alvo,
        vinculo_id=vinculo_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return Response(status_code=204)


@router.post("/usuarios/{usuario_id}/revogar-sessoes", summary="Revogar sessões do usuário")
async def revogar(
    usuario_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.USUARIO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    alvo = await obter(db, tenant_id, usuario_id)
    await revogar_sessoes(db, alvo, ator, dados_do_cliente(request))
    return {"mensagem": "Sessões revogadas."}


@router.get("/grupos", response_model=list[GrupoOut], summary="Listar grupos nacionais do tenant")
async def listar_grupos(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.GRUPO_LER)),
    db: AsyncSession = Depends(get_db),
):
    grupos = (
        await db.execute(
            select(Grupo).where(Grupo.tenant_id == tenant_id).order_by(Grupo.codigo)
        )
    ).scalars().all()
    return [GrupoOut.model_validate(g) for g in grupos]


@router.get("/permissoes", summary="Catálogo de permissões")
async def listar_permissoes(
    _usuario: Usuario = Depends(exigir(Permissao.GRUPO_LER)),
):
    return [
        {"codigo": p.value, "descricao": p.name.replace("_", " ").title()}
        for p in sorted(ALL_PERMISSIONS, key=lambda item: item.value)
    ]
