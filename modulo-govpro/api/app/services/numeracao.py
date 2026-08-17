"""Geração de NUP transacional (idempotente e resistente a concorrência).

O sequencial é por unidade protocolizadora + ano, protegido por SELECT FOR UPDATE.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.nup import calcular_dv, formatar_nup
from app.models.sequencia import SequenciaNup
from app.models.unidade import Unidade


def _codigo_unidade(unidade: Unidade) -> int:
    codigo = (unidade.codigo_protocolizadora or "").strip()
    if not codigo.isdigit() or len(codigo) != 5:
        raise ValueError("Unidade protocolizadora sem código de 5 dígitos (NUP)")
    return int(codigo)


async def proximo_nup(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    unidade: Unidade,
    ano: int,
) -> str:
    """Gera o próximo NUP para uma unidade protocolizadora num dado ano."""
    result = await db.execute(
        select(SequenciaNup)
        .where(SequenciaNup.unidade_id == unidade.id, SequenciaNup.ano == ano)
        .with_for_update()
    )
    seq = result.scalar_one_or_none()

    if seq is None:
        seq = SequenciaNup(tenant_id=tenant_id, unidade_id=unidade.id, ano=ano, proximo=1)
        db.add(seq)
        await db.flush()

    numero = seq.proximo
    seq.proximo = numero + 1

    codigo = _codigo_unidade(unidade)
    return formatar_nup(codigo, numero, ano)


def calcular_dv_nup(codigo_unidade: int, sequencial: int, ano: int) -> str:
    base = f"{codigo_unidade:05d}{sequencial:06d}{ano:04d}"
    return calcular_dv(base)
