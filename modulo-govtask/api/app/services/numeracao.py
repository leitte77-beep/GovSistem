"""Numeração de demandas (§123).

O número é gerado dentro da mesma transação que grava a demanda, sob trava de
linha do contador (`SELECT ... FOR UPDATE`). Duas criações simultâneas no mesmo
tenant/exercício serializam nesse ponto, o que torna impossível emitir número
duplicado — e a restrição única `(organization_id, exercicio, sequencial)`
existe como segunda barreira, caso alguém insira fora deste caminho.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sequencia import SequenciaNumeracao

FORMATO_PADRAO = "{exercicio}/{sequencial:06d}"


async def proximo_numero(
    db: AsyncSession,
    organization_id: uuid.UUID,
    exercicio: int | None = None,
    escopo: str = "DEMANDA",
    formato: str = FORMATO_PADRAO,
) -> tuple[str, int, int]:
    """Reserva o próximo número da organização. Retorna (numero, exercicio, sequencial)."""
    exercicio = exercicio or datetime.now(timezone.utc).year

    resultado = await db.execute(
        select(SequenciaNumeracao)
        .where(
            SequenciaNumeracao.organization_id == organization_id,
            SequenciaNumeracao.escopo == escopo,
            SequenciaNumeracao.exercicio == exercicio,
        )
        .with_for_update()
    )
    sequencia = resultado.scalar_one_or_none()

    if sequencia is None:
        sequencia = SequenciaNumeracao(
            organization_id=organization_id,
            escopo=escopo,
            exercicio=exercicio,
            ultimo_numero=0,
        )
        db.add(sequencia)
        await db.flush()

    sequencia.ultimo_numero += 1
    sequencial = sequencia.ultimo_numero
    await db.flush()

    return formato.format(exercicio=exercicio, sequencial=sequencial), exercicio, sequencial
