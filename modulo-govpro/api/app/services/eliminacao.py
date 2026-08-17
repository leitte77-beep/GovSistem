"""Eliminação de documentos com o rito completo (CONARQ / e-ARQ Brasil).

Etapas: elaboração (listagem) → aprovação da autoridade → edital de ciência
(prazo de manifestação) → termo de eliminação assinado → expurgo lógico
(metadados sobrevivem ao conteúdo).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import sha256
from app.models.arquivo import (
    EditalEliminacao,
    Eliminacao,
    ListagemEliminacao,
    TermoEliminacao,
)
from app.models.documento import Documento
from app.models.enums import StatusEliminacao
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar


async def criar_eliminacao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    titulo: str,
    processos: list[dict],
    client: Optional[dict] = None,
) -> Eliminacao:
    eliminacao = Eliminacao(
        tenant_id=tenant_id,
        titulo=titulo.strip(),
        status=StatusEliminacao.ELABORACAO.value,
        criado_por_user_id=user.id,
    )
    db.add(eliminacao)
    await db.flush()

    for item in processos:
        processo = await db.get(Processo, item["processo_id"])
        if processo is None or processo.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado"
            )
        db.add(
            ListagemEliminacao(
                tenant_id=tenant_id,
                eliminacao_id=eliminacao.id,
                processo_id=processo.id,
                nup=processo.nup,
                classe_id=processo.classe_id,
                justificativa=item.get("justificativa"),
            )
        )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="eliminacao",
        entity_id=str(eliminacao.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(eliminacao)
    return eliminacao


async def _get_eliminacao(
    db: AsyncSession, tenant_id: uuid.UUID, eliminacao_id: uuid.UUID
) -> Eliminacao:
    eliminacao = await db.get(Eliminacao, eliminacao_id)
    if eliminacao is None or eliminacao.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Eliminação não encontrada"
        )
    return eliminacao


async def aprovar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    eliminacao_id: uuid.UUID,
    client: Optional[dict] = None,
) -> Eliminacao:
    eliminacao = await _get_eliminacao(db, tenant_id, eliminacao_id)
    if eliminacao.status != StatusEliminacao.ELABORACAO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Eliminação não está em elaboração"
        )

    eliminacao.status = StatusEliminacao.APROVADA.value
    eliminacao.aprovado_por_user_id = user.id
    eliminacao.aprovado_em = datetime.now(timezone.utc)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="eliminacao",
        entity_id=str(eliminacao.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(eliminacao)
    return eliminacao


async def publicar_edital(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    eliminacao_id: uuid.UUID,
    prazo_dias: int = 30,
    client: Optional[dict] = None,
) -> EditalEliminacao:
    eliminacao = await _get_eliminacao(db, tenant_id, eliminacao_id)
    if eliminacao.status != StatusEliminacao.APROVADA.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Eliminação deve estar aprovada"
        )

    edital = EditalEliminacao(
        tenant_id=tenant_id,
        eliminacao_id=eliminacao.id,
        codigo=uuid.uuid4().hex[:16].upper(),
        publicado_em=datetime.now(timezone.utc),
        prazo_manifestacao_dias=prazo_dias,
    )
    db.add(edital)

    eliminacao.edital_publicado_em = edital.publicado_em
    eliminacao.edital_prazo_dias = prazo_dias
    eliminacao.status = StatusEliminacao.EDITAL_PUBLICADO.value

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="edital_eliminacao",
        entity_id=str(edital.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(edital)
    return edital


async def registrar_termo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    eliminacao_id: uuid.UUID,
    client: Optional[dict] = None,
) -> TermoEliminacao:
    eliminacao = await _get_eliminacao(db, tenant_id, eliminacao_id)
    if eliminacao.status != StatusEliminacao.EDITAL_PUBLICADO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Eliminação deve ter edital publicado"
        )

    codigo = uuid.uuid4().hex[:16].upper()
    termo = TermoEliminacao(
        tenant_id=tenant_id,
        eliminacao_id=eliminacao.id,
        codigo=codigo,
        assinado_em=datetime.now(timezone.utc),
        signatario_user_id=user.id,
        hash_termo=sha256(codigo.encode("utf-8")),
    )
    db.add(termo)
    eliminacao.termo_assinado_em = termo.assinado_em

    await registrar(
        db,
        tenant_id=tenant_id,
        action="ASSINATURA",
        entity="termo_eliminacao",
        entity_id=str(termo.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(termo)
    return termo


async def executar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    eliminacao_id: uuid.UUID,
    client: Optional[dict] = None,
) -> dict:
    eliminacao = await _get_eliminacao(db, tenant_id, eliminacao_id)
    if (
        eliminacao.status != StatusEliminacao.EDITAL_PUBLICADO.value
        or eliminacao.termo_assinado_em is None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Eliminação exige edital publicado e termo assinado",
        )

    agora = datetime.now(timezone.utc)
    result = await db.execute(
        select(ListagemEliminacao).where(ListagemEliminacao.eliminacao_id == eliminacao.id)
    )
    listagem = list(result.scalars())

    for item in listagem:
        processo = await db.get(Processo, item.processo_id)
        if processo is not None:
            processo.eliminado_em = agora
        docs_result = await db.execute(
            select(Documento).where(
                Documento.processo_id == item.processo_id, Documento.tenant_id == tenant_id
            )
        )
        for doc in docs_result.scalars():
            doc.eliminado_em = agora

    eliminacao.executada_em = agora
    eliminacao.status = StatusEliminacao.ELIMINADA.value

    await registrar(
        db,
        tenant_id=tenant_id,
        action="ELIMINACAO",
        entity="eliminacao",
        entity_id=str(eliminacao.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"processos_eliminados": len(listagem)},
    )

    await db.commit()
    return {
        "eliminacao_id": str(eliminacao.id),
        "processos_eliminados": len(listagem),
        "status": eliminacao.status,
    }
