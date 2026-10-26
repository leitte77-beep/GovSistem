"""Fila de atendimento, classificação, chamada e transições (B.6-008, B.6-012)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agenda_helpers import chamada_out, fila_out
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.schemas.agenda import (
    ChamadaOut,
    FilaCancelarRequest,
    FilaChamarRequest,
    FilaClassificacaoUpdate,
    FilaEntradaCreate,
    FilaEventoOut,
    FilaFinalizarRequest,
    FilaListaOut,
    FilaOut,
)
from app.services import filas
from app.services.auditoria import dados_do_cliente, registrar

router = APIRouter(prefix="/filas", tags=["Filas de atendimento"])


async def _auditar_leitura(
    db: AsyncSession,
    request: Request,
    usuario: Usuario,
    *,
    fila_id: uuid.UUID | None = None,
) -> None:
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=usuario,
        recurso="fila_atendimento",
        recurso_id=fila_id,
        finalidade="operação de recepção e fila de atendimento",
        cliente=dados_do_cliente(request),
    )
    await db.commit()


async def _posicao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    registro,
) -> int | None:
    itens, _ = await filas.listar(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=registro.estabelecimento_id,
        setor_id=registro.setor_id,
        situacoes=None,
    )
    return filas.posicao_na_fila(itens, registro.id)


@router.get("", response_model=FilaListaOut)
async def listar_fila(
    request: Request,
    estabelecimento_id: uuid.UUID = Query(...),
    setor_id: uuid.UUID = Query(...),
    situacao: list[str] | None = Query(default=None),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, regra = await filas.listar(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        setor_id=setor_id,
        situacoes=situacao,
    )
    await _auditar_leitura(db, request, usuario)
    return FilaListaOut(
        estabelecimento_id=estabelecimento_id,
        setor_id=setor_id,
        situacao=[item.situacao for item in itens],
        regra_ordenacao=regra,
        itens=[
            fila_out(item, posicao=indice)
            for indice, item in enumerate(itens, start=1)
        ],
        total_estimado=len(itens),
        gerado_em=agora(),
    )


@router.post("", response_model=FilaOut, status_code=201)
async def entrar_na_fila(
    corpo: FilaEntradaCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.entrar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.get("/{fila_id}", response_model=FilaOut)
async def detalhar_fila(
    fila_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.obter_com_escopo(db, tenant_id, usuario, fila_id)
    posicao = await _posicao(db, tenant_id, usuario, registro)
    await _auditar_leitura(db, request, usuario, fila_id=registro.id)
    return fila_out(registro, posicao=posicao)


@router.get("/{fila_id}/eventos", response_model=list[FilaEventoOut])
async def eventos_fila(
    fila_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens = await filas.eventos(db, tenant_id, usuario, fila_id)
    await _auditar_leitura(db, request, usuario, fila_id=fila_id)
    return [FilaEventoOut.model_validate(item) for item in itens]


@router.post("/{fila_id}/classificacao", response_model=FilaOut)
async def classificar_fila(
    fila_id: uuid.UUID,
    corpo: FilaClassificacaoUpdate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.atualizar_classificacao(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.post("/{fila_id}/chamar", response_model=ChamadaOut)
async def chamar(
    fila_id: uuid.UUID,
    corpo: FilaChamarRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    chamada = await filas.chamar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return chamada_out(chamada)


@router.post("/{fila_id}/rechamar", response_model=ChamadaOut)
async def rechamar(
    fila_id: uuid.UUID,
    corpo: FilaChamarRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    dados = corpo.model_copy(update={"tipo": "RECHAMADA"})
    chamada = await filas.chamar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        dados=dados,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return chamada_out(chamada)


@router.post("/{fila_id}/iniciar-triagem", response_model=FilaOut)
async def iniciar_triagem(
    fila_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.iniciar_triagem(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.post("/{fila_id}/finalizar-triagem", response_model=FilaOut)
async def finalizar_triagem(
    fila_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.finalizar_triagem(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.post("/{fila_id}/iniciar-atendimento", response_model=FilaOut)
async def iniciar_atendimento(
    fila_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.iniciar_atendimento(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.post("/{fila_id}/finalizar", response_model=FilaOut)
async def finalizar(
    fila_id: uuid.UUID,
    request: Request,
    corpo: FilaFinalizarRequest | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.finalizar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        dados=corpo or FilaFinalizarRequest(),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.post("/{fila_id}/evadir", response_model=FilaOut)
async def evadir(
    fila_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.evadir(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))


@router.post("/{fila_id}/cancelar", response_model=FilaOut)
async def cancelar(
    fila_id: uuid.UUID,
    corpo: FilaCancelarRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await filas.cancelar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        fila_id=fila_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return fila_out(registro, posicao=await _posicao(db, tenant_id, ator, registro))
