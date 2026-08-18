"""Tramitação — envio simultâneo a múltiplas unidades (não linear)."""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutils import agora_utc
from app.models.andamento import Andamento
from app.models.enums import EstadoProcessoUnidade, TipoEvento, TipoTramitacao
from app.models.processo import Processo, ProcessoUnidade
from app.models.tramitacao import Tramitacao
from app.models.unidade import Unidade
from app.models.user import User
from app.services.auditoria import registrar


async def _get_processo(db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID) -> Processo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    return processo


async def _valida_unidade(db: AsyncSession, tenant_id: uuid.UUID, unidade_id: uuid.UUID) -> Unidade:
    unidade = await db.get(Unidade, unidade_id)
    if unidade is None or unidade.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidade não encontrada")
    return unidade


async def tramitar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    unidade_origem_id: uuid.UUID,
    destinos: list[dict],
    client: Optional[dict] = None,
) -> list[Tramitacao]:
    processo = await _get_processo(db, tenant_id, processo_id)
    await _valida_unidade(db, tenant_id, unidade_origem_id)

    if not destinos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Informe ao menos uma unidade de destino",
        )

    criadas: list[Tramitacao] = []
    for destino in destinos:
        unidade_destino = await _valida_unidade(db, tenant_id, destino["unidade_id"])
        tramitacao = Tramitacao(
            tenant_id=tenant_id,
            processo_id=processo.id,
            unidade_origem_id=unidade_origem_id,
            unidade_destino_id=unidade_destino.id,
            tipo=TipoTramitacao.ENVIO.value,
            prazo_dias=destino.get("prazo_dias"),
            observacao=destino.get("observacao"),
            criado_por_user_id=user.id,
        )
        db.add(tramitacao)
        await db.flush()
        criadas.append(tramitacao)

        existe = await db.execute(
            select(ProcessoUnidade).where(
                ProcessoUnidade.processo_id == processo.id,
                ProcessoUnidade.unidade_id == unidade_destino.id,
            )
        )
        pu = existe.scalar_one_or_none()
        if pu is None:
            db.add(
                ProcessoUnidade(
                    tenant_id=tenant_id,
                    processo_id=processo.id,
                    unidade_id=unidade_destino.id,
                    estado=EstadoProcessoUnidade.RECEBIDO.value,
                )
            )
        else:
            pu.estado = EstadoProcessoUnidade.RECEBIDO.value

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.TRAMITACAO.value,
            descricao=f"Processo enviado para {len(destinos)} unidade(s).",
            unidade_id=unidade_origem_id,
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="TRAMITACAO",
        entity="tramitacao",
        entity_id=str(criadas[0].id) if criadas else None,
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"destinos": [str(t.unidade_destino_id) for t in criadas]},
    )

    await db.commit()
    return criadas


async def receber_tramitacao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    tramitacao_id: uuid.UUID,
) -> Tramitacao:
    tramitacao = await db.get(Tramitacao, tramitacao_id)
    if tramitacao is None or tramitacao.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Envio não encontrado"
        )
    if tramitacao.recebida:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Envio já recebido")

    tramitacao.recebida = True
    tramitacao.recebida_em = agora_utc()

    await db.commit()
    await db.refresh(tramitacao)
    return tramitacao


async def concluir_na_unidade(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    unidade_id: uuid.UUID,
) -> ProcessoUnidade:
    processo = await _get_processo(db, tenant_id, processo_id)
    result = await db.execute(
        select(ProcessoUnidade).where(
            ProcessoUnidade.processo_id == processo.id,
            ProcessoUnidade.unidade_id == unidade_id,
        )
    )
    pu = result.scalar_one_or_none()
    if pu is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Processo não está nesta unidade"
        )

    pu.estado = EstadoProcessoUnidade.CONCLUIDO.value
    pu.concluido_em = agora_utc()

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.OUTRO.value,
            descricao="Conclusão na unidade.",
            unidade_id=unidade_id,
            usuario_id=user.id,
        )
    )

    await db.commit()
    await db.refresh(pu)
    return pu


async def devolver(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    unidade_origem_id: uuid.UUID,
    unidade_destino_id: uuid.UUID,
    motivo: str,
    client: Optional[dict] = None,
) -> Tramitacao:
    if not motivo or not motivo.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Devolução exige motivo",
        )
    processo = await _get_processo(db, tenant_id, processo_id)
    await _valida_unidade(db, tenant_id, unidade_destino_id)

    tramitacao = Tramitacao(
        tenant_id=tenant_id,
        processo_id=processo.id,
        unidade_origem_id=unidade_origem_id,
        unidade_destino_id=unidade_destino_id,
        tipo=TipoTramitacao.DEVOLUCAO.value,
        observacao=motivo.strip(),
        criado_por_user_id=user.id,
    )
    db.add(tramitacao)
    await db.flush()

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.DEVOLUCAO.value,
            descricao=f"Processo devolvido: {motivo.strip()}",
            unidade_id=unidade_origem_id,
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="TRAMITACAO",
        entity="tramitacao",
        entity_id=str(tramitacao.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        detalhe={"tipo": "DEVOLUCAO"},
    )

    await db.commit()
    await db.refresh(tramitacao)
    return tramitacao
