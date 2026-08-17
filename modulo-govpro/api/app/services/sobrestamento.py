"""Sobrestamento (suspensão) e reativação de processos."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.andamento import Andamento
from app.models.enums import SituacaoProcesso, TipoEvento
from app.models.gestao import Sobrestamento
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar


async def sobrestar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    motivo_texto: str,
    motivo_id: Optional[uuid.UUID] = None,
    fim_previsto: Optional[datetime] = None,
    evento: Optional[str] = None,
    client: Optional[dict] = None,
) -> Sobrestamento:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    if processo.situacao == SituacaoProcesso.SOBRESTADO.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Processo já sobrestado")

    processo.situacao = SituacaoProcesso.SOBRESTADO.value

    sobrestamento = Sobrestamento(
        tenant_id=tenant_id,
        processo_id=processo.id,
        motivo_id=motivo_id,
        motivo_texto=motivo_texto.strip(),
        inicio=datetime.now(timezone.utc),
        fim_previsto=fim_previsto,
        evento=evento,
        criado_por_user_id=user.id,
    )
    db.add(sobrestamento)
    await db.flush()

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.SOBRESTAMENTO.value,
            descricao=f"Processo sobrestado: {motivo_texto.strip()}",
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="processo",
        entity_id=str(processo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"situacao": SituacaoProcesso.SOBRESTADO.value, "motivo": motivo_texto},
    )

    await db.commit()
    await db.refresh(sobrestamento)
    return sobrestamento


async def reativar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    client: Optional[dict] = None,
) -> Processo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    processo.situacao = SituacaoProcesso.EM_TRAMITACAO.value

    result = await db.execute(
        select(Sobrestamento).where(
            Sobrestamento.processo_id == processo.id, Sobrestamento.ativo.is_(True)
        )
    )
    for sobrestamento in result.scalars():
        sobrestamento.ativo = False
        sobrestamento.reativado_em = datetime.now(timezone.utc)

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.REATIVACAO.value,
            descricao="Processo reativado.",
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="processo",
        entity_id=str(processo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"situacao": SituacaoProcesso.EM_TRAMITACAO.value},
    )

    await db.commit()
    await db.refresh(processo)
    return processo


async def reativar_expirados(db: AsyncSession) -> int:
    """Reativa automaticamente sobrestamentos cujo fim previsto venceu."""
    agora = datetime.now(timezone.utc)
    result = await db.execute(
        select(Sobrestamento).where(
            Sobrestamento.ativo.is_(True),
            Sobrestamento.fim_previsto.isnot(None),
            Sobrestamento.fim_previsto < agora,
        )
    )
    sobrestamentos = list(result.scalars())
    contagem = 0

    for sobrestamento in sobrestamentos:
        processo = await db.get(Processo, sobrestamento.processo_id)
        if processo is None or processo.situacao != SituacaoProcesso.SOBRESTADO.value:
            continue
        processo.situacao = SituacaoProcesso.EM_TRAMITACAO.value
        sobrestamento.ativo = False
        sobrestamento.reativado_em = agora
        db.add(
            Andamento(
                tenant_id=sobrestamento.tenant_id,
                processo_id=processo.id,
                tipo_evento=TipoEvento.REATIVACAO.value,
                descricao="Reativação automática (fim do sobrestamento).",
            )
        )
        contagem += 1

    await db.commit()
    return contagem
