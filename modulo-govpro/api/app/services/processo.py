"""Encerramento e reabertura de processo (arquivamento)."""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.andamento import Andamento
from app.models.enums import SituacaoProcesso, TipoEvento
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar

_TRANSICOES = {
    SituacaoProcesso.EM_TRAMITACAO.value: {
        SituacaoProcesso.ENCERRADO.value,
        SituacaoProcesso.SOBRESTADO.value,
    },
    SituacaoProcesso.SOBRESTADO.value: {
        SituacaoProcesso.ENCERRADO.value,
        SituacaoProcesso.EM_TRAMITACAO.value,
    },
    SituacaoProcesso.ENCERRADO.value: {SituacaoProcesso.EM_TRAMITACAO.value},
}


async def encerrar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    motivo: str,
    client: Optional[dict] = None,
) -> Processo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    if not motivo or not motivo.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Encerramento exige despacho de arquivamento motivado",
        )
    if SituacaoProcesso.ENCERRADO.value not in _TRANSICOES.get(processo.situacao, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Não é possível encerrar processo na situação '{processo.situacao}'",
        )

    processo.situacao = SituacaoProcesso.ENCERRADO.value
    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.ENCERRAMENTO.value,
            descricao=f"Processo encerrado: {motivo.strip()}",
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
        dados_antes={"situacao": processo.situacao},
        dados_depois={"situacao": SituacaoProcesso.ENCERRADO.value, "motivo": motivo.strip()},
    )

    await db.commit()
    await db.refresh(processo)
    return processo


async def reabrir(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    motivo: str,
    client: Optional[dict] = None,
) -> Processo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    if not motivo or not motivo.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Reabertura exige justificativa",
        )
    if SituacaoProcesso.EM_TRAMITACAO.value not in _TRANSICOES.get(processo.situacao, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Não é possível reabrir processo na situação '{processo.situacao}'",
        )

    processo.situacao = SituacaoProcesso.EM_TRAMITACAO.value
    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.REABERTURA.value,
            descricao=f"Processo reaberto: {motivo.strip()}",
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
        dados_depois={"situacao": SituacaoProcesso.EM_TRAMITACAO.value, "motivo": motivo.strip()},
    )

    await db.commit()
    await db.refresh(processo)
    return processo
