"""Conclusão na unidade, arquivamento e reabertura de processo (modelo SEI)."""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.andamento import Andamento
from app.models.enums import EstadoProcessoUnidade, SituacaoProcesso, TipoEvento
from app.models.processo import Processo, ProcessoUnidade
from app.models.user import User
from app.services.auditoria import registrar

# Transições permitidas. Os valores persistidos (EM_TRAMITACAO/ENCERRADO/…) são
# mantidos por compatibilidade de dados; a exibição usa os rótulos SEI
# (Aberto/Concluído/Arquivado) na camada de apresentação.
_TRANSICOES = {
    SituacaoProcesso.EM_TRAMITACAO.value: {
        SituacaoProcesso.ENCERRADO.value,
        SituacaoProcesso.SOBRESTADO.value,
        SituacaoProcesso.ARQUIVADO.value,
    },
    SituacaoProcesso.SOBRESTADO.value: {
        SituacaoProcesso.ENCERRADO.value,
        SituacaoProcesso.EM_TRAMITACAO.value,
        SituacaoProcesso.ARQUIVADO.value,
    },
    SituacaoProcesso.ENCERRADO.value: {
        SituacaoProcesso.EM_TRAMITACAO.value,
        SituacaoProcesso.ARQUIVADO.value,
    },
    SituacaoProcesso.ARQUIVADO.value: {SituacaoProcesso.EM_TRAMITACAO.value},
}


async def _get_processo(
    db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID
) -> Processo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    return processo


async def _transicionar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    processo_id: uuid.UUID,
    *,
    destino: str,
    tipo_evento: str,
    descricao: str,
    client: Optional[dict] = None,
) -> Processo:
    processo = await _get_processo(db, tenant_id, processo_id)
    if destino not in _TRANSICOES.get(processo.situacao, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transição inválida para processo na situação '{processo.situacao}'",
        )

    situacao_antes = processo.situacao
    processo.situacao = destino
    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=tipo_evento,
            descricao=descricao,
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
        dados_antes={"situacao": situacao_antes},
        dados_depois={"situacao": destino},
    )

    await db.commit()
    await db.refresh(processo)
    return processo


async def _marcar_unidades(
    db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID, estado: str
) -> None:
    """Reflete a conclusão/arquivamento/reabertura no estado por unidade.

    Mantém o Controle de Processos coerente: ao concluir/arquivar o processo
    sai das caixas ativas; ao reabrir, volta para análise.
    """
    result = await db.execute(
        select(ProcessoUnidade).where(
            ProcessoUnidade.tenant_id == tenant_id,
            ProcessoUnidade.processo_id == processo_id,
        )
    )
    for pu in result.scalars():
        pu.estado = estado


async def concluir(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    motivo: Optional[str] = None,
    client: Optional[dict] = None,
) -> Processo:
    """Concluir Processo na Unidade (SEI) — reversível via reabrir."""
    texto = motivo.strip() if motivo and motivo.strip() else None
    descricao = (
        f"Processo concluído na unidade: {texto}" if texto else "Processo concluído na unidade."
    )
    await _marcar_unidades(db, tenant_id, processo_id, EstadoProcessoUnidade.CONCLUIDO.value)
    return await _transicionar(
        db,
        tenant_id,
        user,
        processo_id,
        destino=SituacaoProcesso.ENCERRADO.value,
        tipo_evento=TipoEvento.ENCERRAMENTO.value,
        descricao=descricao,
        client=client,
    )


async def arquivar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    motivo: Optional[str] = None,
    client: Optional[dict] = None,
) -> Processo:
    """Arquivar processo (SEI) — reversível via reabrir."""
    texto = motivo.strip() if motivo and motivo.strip() else None
    descricao = f"Processo arquivado: {texto}" if texto else "Processo arquivado."
    await _marcar_unidades(db, tenant_id, processo_id, EstadoProcessoUnidade.CONCLUIDO.value)
    return await _transicionar(
        db,
        tenant_id,
        user,
        processo_id,
        destino=SituacaoProcesso.ARQUIVADO.value,
        tipo_evento=TipoEvento.ARQUIVAMENTO.value,
        descricao=descricao,
        client=client,
    )


async def reabrir(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    motivo: Optional[str] = None,
    client: Optional[dict] = None,
) -> Processo:
    """Reabrir Processo (SEI) — retorna Concluído/Arquivado para Aberto."""
    texto = motivo.strip() if motivo and motivo.strip() else None
    descricao = f"Processo reaberto: {texto}" if texto else "Processo reaberto."
    await _marcar_unidades(db, tenant_id, processo_id, EstadoProcessoUnidade.EM_ANALISE.value)
    return await _transicionar(
        db,
        tenant_id,
        user,
        processo_id,
        destino=SituacaoProcesso.EM_TRAMITACAO.value,
        tipo_evento=TipoEvento.REABERTURA.value,
        descricao=descricao,
        client=client,
    )
