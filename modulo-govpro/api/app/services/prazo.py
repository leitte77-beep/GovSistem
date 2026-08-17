"""Motor de prazos: criação, vencimento (regra legal + feriados), prorrogação e consulta."""

import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.prazos import calcular_vencimento
from app.models.enums import ModoContagem, TipoPrazo
from app.models.gestao import Prazo
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar
from app.services.calendario import feriados_do_tenant


async def criar_prazo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    tipo: str = TipoPrazo.INTERNO.value,
    titulo: str,
    dias: int,
    modo: str = ModoContagem.CORRIDOS.value,
    data_inicio: Optional[date] = None,
    unidade_id: Optional[uuid.UUID] = None,
    client: Optional[dict] = None,
) -> Prazo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    feriados = await feriados_do_tenant(db, tenant_id)
    inicio = data_inicio or date.today()
    vencimento = calcular_vencimento(inicio, dias, modo, feriados)

    prazo = Prazo(
        tenant_id=tenant_id,
        processo_id=processo.id,
        tipo=tipo,
        titulo=titulo.strip(),
        dias=dias,
        modo=modo,
        data_inicio=inicio,
        data_vencimento=vencimento,
        criado_por_user_id=user.id,
        unidade_id=unidade_id,
    )
    db.add(prazo)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="prazo",
        entity_id=str(prazo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"tipo": tipo, "dias": dias, "vencimento": vencimento.isoformat()},
    )

    await db.commit()
    await db.refresh(prazo)
    return prazo


async def prorrogar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    prazo_id: uuid.UUID,
    novos_dias: int,
    motivo: str,
    client: Optional[dict] = None,
) -> Prazo:
    prazo = await db.get(Prazo, prazo_id)
    if prazo is None or prazo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prazo não encontrado")
    if prazo.concluido:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prazo já concluído")

    feriados = await feriados_do_tenant(db, tenant_id)
    novo_vencimento = calcular_vencimento(prazo.data_vencimento, novos_dias, prazo.modo, feriados)

    prazo.data_vencimento = novo_vencimento
    prazo.prorrogado = True
    prazo.prorrogacoes += 1
    prazo.motivo_prorrogacao = motivo.strip()

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="prazo",
        entity_id=str(prazo.id),
        actor_user_id=user.id,
        processo_id=prazo.processo_id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"novo_vencimento": novo_vencimento.isoformat(), "motivo": motivo},
    )

    await db.commit()
    await db.refresh(prazo)
    return prazo


async def prorrogar_ate(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    prazo_id: uuid.UUID,
    novo_vencimento: date,
    motivo: str,
) -> Prazo:
    """Prorrogação automática (ex.: indisponibilidade) para data exata."""
    prazo = await db.get(Prazo, prazo_id)
    if prazo is None or prazo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prazo não encontrado")
    if prazo.concluido:
        return prazo

    prazo.data_vencimento = novo_vencimento
    prazo.prorrogado = True
    prazo.prorrogacoes += 1
    prazo.motivo_prorrogacao = motivo
    return prazo


async def marcar_concluido(db: AsyncSession, tenant_id: uuid.UUID, prazo_id: uuid.UUID) -> Prazo:
    prazo = await db.get(Prazo, prazo_id)
    if prazo is None or prazo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prazo não encontrado")
    prazo.concluido = True
    prazo.concluido_em = None
    return prazo


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    unidade_id: Optional[uuid.UUID] = None,
    criado_por_user_id: Optional[uuid.UUID] = None,
    vencidos: bool = False,
    dias_a_vencer: Optional[int] = None,
    limit: int = 100,
) -> list[Prazo]:
    stmt = select(Prazo).where(Prazo.tenant_id == tenant_id, Prazo.concluido.is_(False))
    if unidade_id is not None:
        stmt = stmt.where(Prazo.unidade_id == unidade_id)
    if criado_por_user_id is not None:
        stmt = stmt.where(Prazo.criado_por_user_id == criado_por_user_id)

    hoje = date.today()
    if vencidos:
        stmt = stmt.where(Prazo.data_vencimento < hoje)
    elif dias_a_vencer is not None:
        limite = hoje + timedelta(days=dias_a_vencer)
        stmt = stmt.where(Prazo.data_vencimento.between(hoje, limite))

    stmt = stmt.order_by(Prazo.data_vencimento).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars())
