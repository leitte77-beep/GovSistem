"""Dotação orçamentária e autorização (seções 34-35)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import NotFound
from app.core.permissoes import P
from app.models.dotacao import Autorizacao, DotacaoOrcamentaria, ProcessoDotacao
from app.models.organizacao import User
from app.models.processo import ProcessoInstancia
from app.schemas.comuns import Criado
from app.schemas.dotacao import (
    AutorizacaoIn,
    AutorizacaoOut,
    DecidirDotacaoIn,
    DotacaoIn,
    DotacaoOut,
    ProcessoDotacaoOut,
    VincularDotacaoIn,
)

router = APIRouter(tags=["Dotação e Autorização"])


@router.get("/dotacoes", response_model=list[DotacaoOut])
async def listar_dotacoes(
    db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.DOTACAO_VISUALIZAR))
):
    resultado = await db.scalars(
        select(DotacaoOrcamentaria).where(DotacaoOrcamentaria.organizacao_id == user.organizacao_id)
    )
    return list(resultado.all())


@router.post("/dotacoes", response_model=Criado, status_code=201)
async def criar_dotacao(
    payload: DotacaoIn, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.DOTACAO_CONFIRMAR))
):
    dotacao = DotacaoOrcamentaria(organizacao_id=user.organizacao_id, **payload.model_dump())
    db.add(dotacao)
    await db.flush()
    await db.commit()
    return Criado(id=dotacao.id, mensagem="Dotação cadastrada.")


@router.post("/processos/{processo_id}/dotacoes", response_model=Criado, status_code=201)
async def vincular_dotacao(
    processo_id: uuid.UUID,
    payload: VincularDotacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DOTACAO_VISUALIZAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    vinculo = ProcessoDotacao(processo_id=processo_id, **payload.model_dump())
    db.add(vinculo)
    await db.commit()
    return Criado(id=vinculo.id, mensagem="Processo encaminhado à Contabilidade.")


@router.get("/processos/{processo_id}/dotacoes", response_model=list[ProcessoDotacaoOut])
async def listar_vinculos(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.DOTACAO_VISUALIZAR))
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    resultado = await db.scalars(select(ProcessoDotacao).where(ProcessoDotacao.processo_id == processo_id))
    return list(resultado.all())


@router.post("/processos/{processo_id}/dotacoes/{vinculo_id}/decidir", response_model=ProcessoDotacaoOut)
async def decidir_dotacao(
    processo_id: uuid.UUID,
    vinculo_id: uuid.UUID,
    payload: DecidirDotacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DOTACAO_CONFIRMAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    vinculo = await db.get(ProcessoDotacao, vinculo_id)
    if vinculo is None:
        raise NotFound("Vínculo de dotação não encontrado.")
    vinculo.status = payload.status
    vinculo.justificativa_devolucao = payload.justificativa_devolucao
    vinculo.decidido_por_id = user.id
    if payload.status == "confirmada":
        dotacao = await db.get(DotacaoOrcamentaria, vinculo.dotacao_id)
        dotacao.valor_comprometido += vinculo.valor_reservado
    await db.commit()
    await db.refresh(vinculo)
    return vinculo


@router.post("/processos/{processo_id}/autorizacao", response_model=AutorizacaoOut, status_code=201)
async def decidir_autorizacao(
    processo_id: uuid.UUID,
    payload: AutorizacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AUTORIZACAO_DECIDIR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    autorizacao = Autorizacao(processo_id=processo_id, autoridade_usuario_id=user.id, **payload.model_dump())
    db.add(autorizacao)
    await db.commit()
    await db.refresh(autorizacao)
    return autorizacao
