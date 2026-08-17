"""Solicitações de contratação (seções 8-10)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Paginacao, buscar_da_organizacao, pagina_payload
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError
from app.core.permissoes import P
from app.models.enums import StatusSolicitacao
from app.models.organizacao import User
from app.models.solicitacao import Solicitacao, SolicitacaoItem
from app.schemas.comuns import Pagina
from app.schemas.processo import ProcessoDetalheOut
from app.schemas.solicitacao import EnviarSolicitacaoIn, SolicitacaoIn, SolicitacaoOut
from app.services import numeracao, workflow

router = APIRouter(prefix="/solicitacoes", tags=["Solicitações"])


@router.get("", response_model=Pagina[SolicitacaoOut])
async def listar(
    paginacao: Paginacao = Depends(),
    status_atual: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    consulta = select(Solicitacao).where(Solicitacao.organizacao_id == user.organizacao_id)
    if status_atual:
        consulta = consulta.where(Solicitacao.status == status_atual)
    total = len((await db.scalars(consulta)).all())
    itens = list(
        (
            await db.scalars(
                consulta.order_by(Solicitacao.created_at.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        ).all()
    )
    return pagina_payload(itens, total, paginacao)


@router.post("", response_model=SolicitacaoOut, status_code=201)
async def criar(
    payload: SolicitacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_CRIAR)),
):
    _, numero = await numeracao.numero_solicitacao(db, user.organizacao_id)
    dados = payload.model_dump(exclude={"itens"})
    valor_total = sum((item.valor_unitario_estimado or 0) * item.quantidade for item in payload.itens)
    solicitacao = Solicitacao(
        organizacao_id=user.organizacao_id,
        numero=numero,
        exercicio=datetime.now(timezone.utc).year,
        solicitante_usuario_id=user.id,
        valor_estimado_total=valor_total or None,
        status=StatusSolicitacao.RASCUNHO.value,
        created_by_id=user.id,
        **dados,
    )
    db.add(solicitacao)
    await db.flush()
    for item in payload.itens:
        db.add(SolicitacaoItem(solicitacao_id=solicitacao.id, **item.model_dump()))
    await db.commit()
    await db.refresh(solicitacao)
    return solicitacao


@router.get("/{solicitacao_id}", response_model=SolicitacaoOut)
async def obter(
    solicitacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    return await buscar_da_organizacao(db, Solicitacao, solicitacao_id, user)


@router.post("/{solicitacao_id}/enviar", response_model=ProcessoDetalheOut)
async def enviar(
    solicitacao_id: uuid.UUID,
    payload: EnviarSolicitacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_ENVIAR)),
):
    from app.api.v1.processos import _detalhe  # import tardio evita ciclo

    solicitacao = await buscar_da_organizacao(db, Solicitacao, solicitacao_id, user)
    if solicitacao.status != StatusSolicitacao.RASCUNHO.value:
        raise AppError("Esta solicitação já foi enviada.", 409, "ja_enviada")

    processo = await workflow.abrir_processo(
        db,
        organizacao_id=user.organizacao_id,
        tipo_processo=payload.tipo_processo,
        secretaria_id=solicitacao.secretaria_id,
        setor_id=solicitacao.setor_id,
        objeto=solicitacao.objeto,
        valor_estimado=solicitacao.valor_estimado_total,
        usuario=user,
        solicitacao_id=solicitacao.id,
    )
    solicitacao.status = StatusSolicitacao.EM_PROCESSAMENTO.value
    await db.commit()
    await db.refresh(processo)
    return await _detalhe(db, processo)
