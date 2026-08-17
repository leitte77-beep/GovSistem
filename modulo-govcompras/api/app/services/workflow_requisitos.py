"""Registry de resolvedores de requisitos automáticos (`ENTIDADE_STATUS`).

Uma "etapa-gate" (seção 11: TR aprovado, dotação confirmada...) não é um tipo
de tabela separado — é um `WorkflowEtapaRequisito` cujo `entidade_ref` aponta
para uma chave deste dicionário. Adicionar uma nova entidade verificável é uma
linha nova aqui, não uma migração de schema.

Cada resolvedor recebe `(db, processo_id)` e devolve `True` quando o
requisito está satisfeito.
"""

import uuid
from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compras import Cotacao
from app.models.dotacao import Autorizacao, ProcessoDotacao
from app.models.licitacao import Edital, Homologacao
from app.models.planejamento import Dfd, Etp, MatrizRisco, MatrizRiscoItem, TermoReferencia

Resolvedor = Callable[[AsyncSession, uuid.UUID], Awaitable[bool]]


async def _dfd_aprovado(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    dfd = await db.scalar(select(Dfd).where(Dfd.processo_id == processo_id))
    return dfd is not None and dfd.status == "aprovado"


async def _etp_aprovado(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    etp = await db.scalar(select(Etp).where(Etp.processo_id == processo_id))
    return etp is not None and etp.status == "aprovado"


async def _termo_referencia_aprovado(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    tr = await db.scalar(select(TermoReferencia).where(TermoReferencia.processo_id == processo_id))
    return tr is not None and tr.status == "aprovado"


async def _matriz_risco_preenchida(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    matriz = await db.scalar(select(MatrizRisco).where(MatrizRisco.processo_id == processo_id))
    if matriz is None:
        return False
    total = await db.scalar(
        select(MatrizRiscoItem.id).where(MatrizRiscoItem.matriz_id == matriz.id).limit(1)
    )
    return total is not None


async def _cotacao_concluida(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    cotacao = await db.scalar(
        select(Cotacao).where(Cotacao.processo_id == processo_id, Cotacao.status == "concluida")
    )
    return cotacao is not None


async def _dotacao_confirmada(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    vinculo = await db.scalar(
        select(ProcessoDotacao).where(
            ProcessoDotacao.processo_id == processo_id, ProcessoDotacao.status == "confirmada"
        )
    )
    return vinculo is not None


async def _autorizado(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    autorizacao = await db.scalar(
        select(Autorizacao).where(
            Autorizacao.processo_id == processo_id, Autorizacao.decisao == "autorizado"
        )
    )
    return autorizacao is not None


async def _edital_publicado(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    edital = await db.scalar(select(Edital).where(Edital.processo_id == processo_id))
    return edital is not None and edital.status in {"publicado", "retificado"}


async def _homologado(db: AsyncSession, processo_id: uuid.UUID) -> bool:
    homologacao = await db.scalar(select(Homologacao).where(Homologacao.processo_id == processo_id))
    return homologacao is not None


RESOLVEDORES: dict[str, Resolvedor] = {
    "dfd": _dfd_aprovado,
    "etp": _etp_aprovado,
    "termo_referencia": _termo_referencia_aprovado,
    "matriz_risco": _matriz_risco_preenchida,
    "cotacao": _cotacao_concluida,
    "dotacao": _dotacao_confirmada,
    "autorizacao": _autorizado,
    "edital_publicado": _edital_publicado,
    "homologacao": _homologado,
}


async def resolver(db: AsyncSession, entidade_ref: str, processo_id: uuid.UUID) -> bool:
    funcao = RESOLVEDORES.get(entidade_ref)
    if funcao is None:
        # Entidade sem resolvedor cadastrado: trata como não satisfeito, nunca
        # como satisfeito por omissão (falha segura).
        return False
    return await funcao(db, processo_id)
