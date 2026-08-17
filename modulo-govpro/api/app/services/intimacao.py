"""Intimação eletrônica a interessado (ciência + prazo + decurso)."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cidadao import Intimacao, UsuarioExterno
from app.models.enums import StatusIntimacao
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar


async def criar_intimacao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    destinatario_nome: str,
    texto: str,
    prazo_dias: int,
    usuario_externo_id: Optional[uuid.UUID] = None,
    destinatario_documento: Optional[str] = None,
    client: Optional[dict] = None,
) -> Intimacao:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    intimacao = Intimacao(
        tenant_id=tenant_id,
        processo_id=processo.id,
        usuario_externo_id=usuario_externo_id,
        destinatario_nome=destinatario_nome.strip(),
        destinatario_documento=destinatario_documento,
        texto=texto.strip(),
        prazo_dias=prazo_dias,
        status=StatusIntimacao.DISPONIBILIZADA.value,
        disponibilizada_em=datetime.now(timezone.utc),
    )
    db.add(intimacao)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="intimacao",
        entity_id=str(intimacao.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(intimacao)
    return intimacao


async def registrar_ciencia(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao: UsuarioExterno,
    *,
    intimacao_id: uuid.UUID,
    ip: Optional[str] = None,
) -> Intimacao:
    intimacao = await db.get(Intimacao, intimacao_id)
    if intimacao is None or intimacao.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Intimação não encontrada"
        )

    if intimacao.usuario_externo_id is not None and intimacao.usuario_externo_id != cidadao.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Intimação destinada a outro usuário"
        )

    if intimacao.status != StatusIntimacao.CIENTE.value:
        intimacao.status = StatusIntimacao.CIENTE.value
        intimacao.ciencia_em = datetime.now(timezone.utc)
        intimacao.ciencia_ip = ip

    await registrar(
        db,
        tenant_id=tenant_id,
        action="LEITURA",
        entity="intimacao",
        entity_id=str(intimacao.id),
        actor_tipo="EXTERNO",
        processo_id=intimacao.processo_id,
        ip_address=ip,
        finalidade="Ciência de intimação eletrônica",
    )

    await db.commit()
    await db.refresh(intimacao)
    return intimacao
