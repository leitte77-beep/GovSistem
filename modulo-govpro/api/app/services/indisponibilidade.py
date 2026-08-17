"""Registro de indisponibilidade (Lei 14.129/2021): certidão e prorrogação de prazos."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.prazos import proximo_dia_util
from app.models.enums import TipoIndisponibilidade
from app.models.gestao import Indisponibilidade, Prazo
from app.models.user import User
from app.services.auditoria import registrar as registrar_auditoria
from app.services.calendario import feriados_do_tenant


async def registrar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    inicio: datetime,
    causa: str,
    tipo: str = TipoIndisponibilidade.INCIDENTE.value,
    fim: Optional[datetime] = None,
    escopo: Optional[str] = None,
    client: Optional[dict] = None,
) -> Indisponibilidade:
    indisponibilidade = Indisponibilidade(
        tenant_id=tenant_id,
        tipo=tipo,
        inicio=inicio,
        fim=fim,
        escopo=escopo,
        causa=causa.strip(),
        encerrada=fim is not None,
        registrado_por_user_id=user.id,
    )
    db.add(indisponibilidade)

    await registrar_auditoria(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="indisponibilidade",
        entity_id=str(indisponibilidade.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"inicio": inicio.isoformat(), "causa": causa},
    )

    await db.commit()
    await db.refresh(indisponibilidade)
    return indisponibilidade


async def encerrar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    indisponibilidade_id: uuid.UUID,
    fim: datetime,
    client: Optional[dict] = None,
) -> Indisponibilidade:
    indisponibilidade = await db.get(Indisponibilidade, indisponibilidade_id)
    if indisponibilidade is None or indisponibilidade.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Indisponibilidade não encontrada"
        )
    if indisponibilidade.encerrada:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Indisponibilidade já encerrada"
        )

    indisponibilidade.fim = fim
    indisponibilidade.encerrada = True

    # Prorroga automaticamente os prazos que venceriam no período.
    await prorrogar_prazos_do_periodo(db, tenant_id, indisponibilidade)

    await registrar_auditoria(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="indisponibilidade",
        entity_id=str(indisponibilidade.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"fim": fim.isoformat()},
    )

    await db.commit()
    await db.refresh(indisponibilidade)
    return indisponibilidade


async def prorrogar_prazos_do_periodo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    indisponibilidade: Indisponibilidade,
) -> int:
    """Prorroga para o próximo dia útil após o fim os prazos que venceriam no período."""
    if indisponibilidade.fim is None:
        return 0

    feriados = await feriados_do_tenant(db, tenant_id)
    fim_naive = (
        indisponibilidade.fim.replace(tzinfo=None)
        if indisponibilidade.fim.tzinfo
        else indisponibilidade.fim
    )
    inicio_naive = (
        indisponibilidade.inicio.replace(tzinfo=None)
        if indisponibilidade.inicio.tzinfo
        else indisponibilidade.inicio
    )
    inicio_dia = inicio_naive.date()
    fim_dia = fim_naive.date()

    result = await db.execute(
        select(Prazo).where(
            Prazo.tenant_id == tenant_id,
            Prazo.concluido.is_(False),
            Prazo.data_vencimento >= inicio_dia,
            Prazo.data_vencimento <= fim_dia,
        )
    )
    prazos = list(result.scalars())
    novo_vencimento = proximo_dia_util(fim_dia, feriados)

    for prazo in prazos:
        prazo.data_vencimento = novo_vencimento
        prazo.prorrogado = True
        prazo.prorrogacoes += 1
        prazo.motivo_prorrogacao = f"Indisponibilidade do sistema ({indisponibilidade.id})"

    return len(prazos)


def gerar_certidao(indisponibilidade: Indisponibilidade) -> dict:
    return {
        "indisponibilidade_id": str(indisponibilidade.id),
        "inicio": indisponibilidade.inicio.isoformat(),
        "fim": indisponibilidade.fim.isoformat() if indisponibilidade.fim else None,
        "escopo": indisponibilidade.escopo,
        "causa": indisponibilidade.causa,
        "encerrada": indisponibilidade.encerrada,
    }
