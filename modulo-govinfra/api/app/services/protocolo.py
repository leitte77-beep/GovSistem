"""Geração de protocolos e números sequenciais.

Dois atendentes salvando ao mesmo tempo não podem receber o mesmo protocolo. Por
isso o contador é uma linha em `govinfra_counters` travada dentro da transação
(`SELECT ... FOR UPDATE` no PostgreSQL), e não um `MAX(numero) + 1`.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import suporta_bloqueio_linha
from app.models.governanca import Contador


async def proximo(
    db: AsyncSession, organizacao_id: uuid.UUID, escopo: str, ano: int | None = None
) -> tuple[int, int]:
    """Reserva o próximo número da sequência. Retorna (ano, número)."""
    ano = ano or date.today().year

    consulta = select(Contador).where(
        Contador.organizacao_id == organizacao_id,
        Contador.escopo == escopo,
        Contador.ano == ano,
    )
    if suporta_bloqueio_linha():
        consulta = consulta.with_for_update()

    contador = await db.scalar(consulta)
    if contador is None:
        contador = Contador(organizacao_id=organizacao_id, escopo=escopo, ano=ano, valor=0)
        db.add(contador)
        await db.flush()
        # Relê com trava: se outra transação criou a linha primeiro, o UNIQUE
        # teria estourado antes; aqui garantimos o bloqueio para o incremento.
        if suporta_bloqueio_linha():
            contador = await db.scalar(consulta)

    contador.valor += 1
    await db.flush()
    return ano, contador.valor


def formatar(ano: int, numero: int, digitos: int = 6) -> str:
    """Protocolo legível pelo cidadão: 2026/000123."""
    return f"{ano}/{numero:0{digitos}d}"


async def protocolo_solicitacao_cacamba(
    db: AsyncSession, organizacao_id: uuid.UUID
) -> tuple[int, int, str]:
    ano, numero = await proximo(db, organizacao_id, "solicitacao_cacamba")
    return ano, numero, formatar(ano, numero)


async def protocolo_servico(db: AsyncSession, organizacao_id: uuid.UUID) -> tuple[int, int, str]:
    ano, numero = await proximo(db, organizacao_id, "servico")
    return ano, numero, formatar(ano, numero)


async def numero_ordem(db: AsyncSession, organizacao_id: uuid.UUID) -> tuple[int, int, str]:
    ano, numero = await proximo(db, organizacao_id, "ordem")
    return ano, numero, f"OS {ano}/{numero:05d}"


async def codigo_imovel(db: AsyncSession, organizacao_id: uuid.UUID) -> str:
    ano, numero = await proximo(db, organizacao_id, "imovel")
    return f"IM{ano}{numero:05d}"
