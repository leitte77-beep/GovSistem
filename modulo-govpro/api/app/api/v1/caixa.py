"""Minha Caixa — visão operacional agregada do usuário logado.

Junta `ProcessoUnidade` (estado do processo nas unidades do usuário),
`Tramitacao` (envios/retornos) e `ProcessoVisualizacao`/`Processo.responsavel_id`
para montar as sete caixas de trabalho do frontend. Nunca decide isso no
frontend: cada aba aqui é uma consulta própria, sempre filtrada por tenant e
pelas unidades em que o usuário está lotado (fail-closed).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import PAPEIS_LEITURA, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import EstadoProcessoUnidade
from app.models.processo import Processo, ProcessoUnidade, ProcessoVisualizacao
from app.models.tramitacao import Tramitacao
from app.models.unidade import LotacaoUsuario
from app.models.user import User
from app.schemas import ProcessoOut

router = APIRouter(prefix="/minha-caixa", tags=["minha-caixa"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]
UserDep = Annotated[User, Depends(require_roles(*PAPEIS_LEITURA))]


async def _minhas_unidades(db: AsyncSession, tenant_id, user_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(LotacaoUsuario.unidade_id).where(
            LotacaoUsuario.tenant_id == tenant_id, LotacaoUsuario.user_id == user_id
        )
    )
    return [row[0] for row in result.all()]


def _tramitacao_out(t: Tramitacao, nup: str, especificacao: str) -> dict:
    return {
        "id": str(t.id),
        "processo_id": str(t.processo_id),
        "nup": nup,
        "especificacao": especificacao,
        "unidade_origem_id": str(t.unidade_origem_id) if t.unidade_origem_id else None,
        "unidade_destino_id": str(t.unidade_destino_id),
        "tipo": t.tipo,
        "prazo_dias": t.prazo_dias,
        "recebida": t.recebida,
        "created_at": t.created_at.isoformat(),
    }


@router.get("/recebidos", response_model=list[ProcessoOut])
async def recebidos(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    unidades = await _minhas_unidades(db, tenant_id, user.id)
    if not unidades:
        return []
    result = await db.execute(
        select(Processo)
        .join(ProcessoUnidade, ProcessoUnidade.processo_id == Processo.id)
        .where(
            Processo.tenant_id == tenant_id,
            ProcessoUnidade.unidade_id.in_(unidades),
            ProcessoUnidade.estado == EstadoProcessoUnidade.RECEBIDO.value,
        )
        .order_by(ProcessoUnidade.recebido_em.desc())
        .limit(limit)
    )
    return list(result.scalars())


@router.get("/atribuidos", response_model=list[ProcessoOut])
async def atribuidos(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    result = await db.execute(
        select(Processo)
        .where(Processo.tenant_id == tenant_id, Processo.responsavel_id == user.id)
        .order_by(Processo.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars())


@router.get("/nao-visualizados", response_model=list[ProcessoOut])
async def nao_visualizados(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    unidades = await _minhas_unidades(db, tenant_id, user.id)
    if not unidades:
        return []
    vistos = select(ProcessoVisualizacao.processo_id).where(
        ProcessoVisualizacao.tenant_id == tenant_id, ProcessoVisualizacao.user_id == user.id
    )
    result = await db.execute(
        select(Processo)
        .join(ProcessoUnidade, ProcessoUnidade.processo_id == Processo.id)
        .where(
            Processo.tenant_id == tenant_id,
            ProcessoUnidade.unidade_id.in_(unidades),
            Processo.id.not_in(vistos),
        )
        .order_by(Processo.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars())


@router.get("/aguardando-acao", response_model=list[ProcessoOut])
async def aguardando_acao(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    unidades = await _minhas_unidades(db, tenant_id, user.id)
    if not unidades:
        return []
    result = await db.execute(
        select(Processo)
        .join(ProcessoUnidade, ProcessoUnidade.processo_id == Processo.id)
        .where(
            Processo.tenant_id == tenant_id,
            ProcessoUnidade.unidade_id.in_(unidades),
            ProcessoUnidade.estado.in_(
                [EstadoProcessoUnidade.RECEBIDO.value, EstadoProcessoUnidade.EM_ANALISE.value]
            ),
        )
        .order_by(Processo.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars())


@router.get("/aguardando-retorno")
async def aguardando_retorno(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    """Tramitações que a minha unidade enviou, com prazo de resposta definido,
    e que o destino ainda não recebeu."""
    unidades = await _minhas_unidades(db, tenant_id, user.id)
    if not unidades:
        return []
    result = await db.execute(
        select(Tramitacao, Processo.nup, Processo.especificacao)
        .join(Processo, Processo.id == Tramitacao.processo_id)
        .where(
            Tramitacao.tenant_id == tenant_id,
            Tramitacao.unidade_origem_id.in_(unidades),
            Tramitacao.prazo_dias.is_not(None),
            Tramitacao.recebida.is_(False),
        )
        .order_by(Tramitacao.created_at.desc())
        .limit(limit)
    )
    return [_tramitacao_out(t, nup, esp) for t, nup, esp in result.all()]


@router.get("/enviados")
async def enviados(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    unidades = await _minhas_unidades(db, tenant_id, user.id)
    if not unidades:
        return []
    result = await db.execute(
        select(Tramitacao, Processo.nup, Processo.especificacao)
        .join(Processo, Processo.id == Tramitacao.processo_id)
        .where(Tramitacao.tenant_id == tenant_id, Tramitacao.unidade_origem_id.in_(unidades))
        .order_by(Tramitacao.created_at.desc())
        .limit(limit)
    )
    return [_tramitacao_out(t, nup, esp) for t, nup, esp in result.all()]


@router.get("/concluidos", response_model=list[ProcessoOut])
async def concluidos(
    db: DbDep,
    tenant_id: TenantDep,
    user: UserDep,
    limit: int = Query(default=50, ge=1, le=100),
):
    unidades = await _minhas_unidades(db, tenant_id, user.id)
    if not unidades:
        return []
    result = await db.execute(
        select(Processo)
        .join(ProcessoUnidade, ProcessoUnidade.processo_id == Processo.id)
        .where(
            Processo.tenant_id == tenant_id,
            ProcessoUnidade.unidade_id.in_(unidades),
            ProcessoUnidade.estado == EstadoProcessoUnidade.CONCLUIDO.value,
        )
        .order_by(ProcessoUnidade.concluido_em.desc())
        .limit(limit)
    )
    return list(result.scalars())
