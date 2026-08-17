"""Numeração automática e sequencial por escopo/exercício (seção 37).

Dois usuários salvando ao mesmo tempo não podem receber o mesmo número. Por
isso o contador é uma linha em `govcompras_contadores` travada dentro da
transação (`SELECT ... FOR UPDATE` no PostgreSQL), e não um `MAX(numero) + 1`.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import suporta_bloqueio_linha
from app.models.governanca import ContadorNumeracao


async def proximo(
    db: AsyncSession, organizacao_id: uuid.UUID, escopo: str, exercicio: int | None = None
) -> tuple[int, int]:
    """Reserva o próximo número da sequência. Retorna (exercicio, número)."""
    exercicio = exercicio or date.today().year

    consulta = select(ContadorNumeracao).where(
        ContadorNumeracao.organizacao_id == organizacao_id,
        ContadorNumeracao.escopo == escopo,
        ContadorNumeracao.exercicio == exercicio,
    )
    if suporta_bloqueio_linha():
        consulta = consulta.with_for_update()

    contador = await db.scalar(consulta)
    if contador is None:
        contador = ContadorNumeracao(organizacao_id=organizacao_id, escopo=escopo, exercicio=exercicio, valor=0)
        db.add(contador)
        await db.flush()
        if suporta_bloqueio_linha():
            contador = await db.scalar(consulta)

    contador.valor += 1
    await db.flush()
    return exercicio, contador.valor


def formatar(exercicio: int, numero: int, digitos: int = 4) -> str:
    """Ex.: 0148/2026."""
    return f"{numero:0{digitos}d}/{exercicio}"


async def numero_processo(db: AsyncSession, organizacao_id: uuid.UUID, tipo_processo: str) -> tuple[int, str]:
    exercicio, numero = await proximo(db, organizacao_id, f"processo:{tipo_processo}")
    return exercicio, formatar(exercicio, numero)


async def numero_contrato(db: AsyncSession, organizacao_id: uuid.UUID) -> tuple[int, str]:
    exercicio, numero = await proximo(db, organizacao_id, "contrato")
    return exercicio, formatar(exercicio, numero)


async def numero_ata(db: AsyncSession, organizacao_id: uuid.UUID) -> tuple[int, str]:
    exercicio, numero = await proximo(db, organizacao_id, "ata")
    return exercicio, formatar(exercicio, numero)


async def numero_aditivo(db: AsyncSession, organizacao_id: uuid.UUID) -> tuple[int, str]:
    exercicio, numero = await proximo(db, organizacao_id, "aditivo")
    return exercicio, formatar(exercicio, numero, digitos=2)


async def numero_solicitacao(db: AsyncSession, organizacao_id: uuid.UUID) -> tuple[int, str]:
    exercicio, numero = await proximo(db, organizacao_id, "solicitacao")
    return exercicio, formatar(exercicio, numero)
