"""Verificação periódica de integridade por hash (preservação digital)."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import ler, sha256
from app.models.arquivo import VerificacaoIntegridade
from app.models.documento import ComponenteDigital


async def verificar_integridade(db: AsyncSession, tenant_id: uuid.UUID) -> VerificacaoIntegridade:
    """Recalcula o SHA-256 de cada componente e reporta divergências."""
    result = await db.execute(
        select(ComponenteDigital).where(ComponenteDigital.tenant_id == tenant_id)
    )
    componentes = list(result.scalars())

    divergencias = []
    total = 0
    for componente in componentes:
        total += 1
        try:
            conteudo = await ler(tenant_id, componente.storage_key)
            if sha256(conteudo) != componente.sha256:
                divergencias.append(
                    {"componente_id": str(componente.id), "sha256": componente.sha256}
                )
        except Exception as exc:  # arquivo ausente/corrompido
            divergencias.append({"componente_id": str(componente.id), "erro": str(exc)})

    verificacao = VerificacaoIntegridade(
        tenant_id=tenant_id,
        executada_em=datetime.now(timezone.utc),
        total_verificados=total,
        divergencias={"total": len(divergencias), "itens": divergencias} if divergencias else None,
    )
    db.add(verificacao)
    await db.commit()
    await db.refresh(verificacao)
    return verificacao
