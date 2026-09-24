"""Consulta da trilha de auditoria (item 47).

A leitura é permitida apenas a quem tem `govinfra.auditoria.visualizar`; os
logs são append-only e não podem ser alterados pela interface comum.
"""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Paginacao, Periodo, buscar_da_organizacao, pagina_payload
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.governanca import RegistroAuditoria
from app.models.organizacao import User

router = APIRouter(prefix="/auditoria", tags=["Auditoria"])


@router.get("", summary="Consultar registros de auditoria")
async def listar(
    acao: str | None = Query(None, description="Filtra pela ação (ex.: aprovar, bloquear)"),
    entidade: str | None = Query(None, description="Filtra pela entidade (ex.: solicitacao_cacamba)"),
    entidade_id: uuid.UUID | None = Query(None),
    usuario_id: uuid.UUID | None = Query(None),
    resultado: str | None = Query(None),
    periodo: Periodo = Depends(),
    termo: str | None = Query(None, max_length=120),
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AUDITORIA_VISUALIZAR)),
):
    condicoes = [RegistroAuditoria.organizacao_id == user.organizacao_id]
    if acao:
        condicoes.append(RegistroAuditoria.acao == acao)
    if entidade:
        condicoes.append(RegistroAuditoria.entidade == entidade)
    if entidade_id:
        condicoes.append(RegistroAuditoria.entidade_id == entidade_id)
    if usuario_id:
        condicoes.append(RegistroAuditoria.user_id == usuario_id)
    if resultado:
        condicoes.append(RegistroAuditoria.resultado == resultado)
    if periodo.inicio:
        condicoes.append(RegistroAuditoria.created_at >= periodo.inicio)
    if periodo.fim:
        condicoes.append(RegistroAuditoria.created_at <= periodo.fim + timedelta(days=1))
    if termo:
        condicoes.append(RegistroAuditoria.entidade_descricao.ilike(f"%{termo}%"))

    total = await db.scalar(select(func.count()).select_from(RegistroAuditoria).where(*condicoes)) or 0
    registros = (
        await db.execute(
            select(RegistroAuditoria)
            .where(*condicoes)
            .order_by(RegistroAuditoria.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).scalars().all()

    itens = [
        {
            "id": r.id,
            "acao": r.acao,
            "modulo": r.modulo,
            "entidade": r.entidade,
            "entidade_id": r.entidade_id,
            "entidade_descricao": r.entidade_descricao,
            "resultado": r.resultado,
            "justificativa": r.justificativa,
            "detalhe": r.detalhe,
            "usuario": {"id": r.user_id, "nome": r.user_nome, "perfil": r.user_perfil},
            "criada_em": r.created_at,
            "ip": r.ip,
            "origem": r.origem,
            "correlacao": r.correlacao,
        }
        for r in registros
    ]
    return pagina_payload(itens, total, paginacao)


@router.get("/acoes", summary="Ações disponíveis para filtro")
async def acoes_disponiveis(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AUDITORIA_VISUALIZAR)),
):
    registros = (
        await db.execute(
            select(RegistroAuditoria.acao)
            .where(RegistroAuditoria.organizacao_id == user.organizacao_id)
            .distinct()
            .order_by(RegistroAuditoria.acao)
        )
    ).scalars().all()
    return {"acoes": registros}


@router.get("/{registro_id}", summary="Detalhe de um registro de auditoria")
async def detalhar(
    registro_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AUDITORIA_VISUALIZAR)),
):
    registro = await buscar_da_organizacao(db, RegistroAuditoria, registro_id)
    return {
        "id": registro.id,
        "acao": registro.acao,
        "modulo": registro.modulo,
        "entidade": registro.entidade,
        "entidade_id": registro.entidade_id,
        "entidade_descricao": registro.entidade_descricao,
        "resultado": registro.resultado,
        "justificativa": registro.justificativa,
        "detalhe": registro.detalhe,
        "dados_antes": registro.dados_antes,
        "dados_depois": registro.dados_depois,
        "usuario": {"id": registro.user_id, "nome": registro.user_nome, "perfil": registro.user_perfil},
        "criada_em": registro.created_at,
        "ip": registro.ip,
        "dispositivo": registro.dispositivo,
        "origem": registro.origem,
        "correlacao": registro.correlacao,
    }
