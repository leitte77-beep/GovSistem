"""Blocos de assinatura — assinatura em lote de peças."""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documento import Assinatura, BlocoAssinatura, BlocoAssinaturaDocumento, Documento
from app.models.dominio import TipoDocumento
from app.models.enums import SituacaoDocumento
from app.models.user import User
from app.services import assinatura as assinatura_service
from app.services.auditoria import registrar


async def criar_bloco(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    nome: str,
    client: Optional[dict] = None,
) -> BlocoAssinatura:
    bloco = BlocoAssinatura(tenant_id=tenant_id, nome=nome.strip(), criado_por_user_id=user.id)
    db.add(bloco)
    await db.flush()
    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="bloco_assinatura",
        entity_id=str(bloco.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )
    await db.commit()
    await db.refresh(bloco)
    return bloco


async def adicionar_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    bloco_id: uuid.UUID,
    documento_id: uuid.UUID,
    ordem: int = 0,
) -> BlocoAssinaturaDocumento:
    bloco = await db.get(BlocoAssinatura, bloco_id)
    if bloco is None or bloco.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bloco não encontrado")

    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )

    if documento.tipo_documento_id is not None:
        tipo = await db.get(TipoDocumento, documento.tipo_documento_id)
        if tipo is not None and tipo.permite_bloco is False:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Este tipo de ato não permite assinatura em bloco (matriz de assinatura)",
            )

    existe = await db.execute(
        select(BlocoAssinaturaDocumento).where(
            BlocoAssinaturaDocumento.bloco_id == bloco_id,
            BlocoAssinaturaDocumento.documento_id == documento_id,
        )
    )
    if existe.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Documento já está no bloco"
        )

    item = BlocoAssinaturaDocumento(
        tenant_id=tenant_id, bloco_id=bloco_id, documento_id=documento_id, ordem=ordem
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def assinar_bloco(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    bloco_id: uuid.UUID,
    papel_cargo: Optional[str] = None,
    nivel: str = "SIMPLES",
    client: Optional[dict] = None,
) -> list[dict]:
    bloco = await db.get(BlocoAssinatura, bloco_id)
    if bloco is None or bloco.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bloco não encontrado")

    result = await db.execute(
        select(BlocoAssinaturaDocumento)
        .where(BlocoAssinaturaDocumento.bloco_id == bloco_id)
        .order_by(BlocoAssinaturaDocumento.ordem)
    )
    itens = list(result.scalars())

    resultados = []
    for item in itens:
        documento = await db.get(Documento, item.documento_id)
        if documento is None or documento.situacao == SituacaoDocumento.ASSINADO.value:
            continue
        ja_assinou = (
            await db.execute(
                select(Assinatura.id).where(
                    Assinatura.documento_id == documento.id,
                    Assinatura.signatario_user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if ja_assinou is not None:
            continue
        assinatura = await assinatura_service.assinar_documento(
            db,
            tenant_id,
            user,
            documento_id=documento.id,
            papel_cargo=papel_cargo,
            nivel=nivel,
            client=client,
        )
        resultados.append({"documento_id": str(documento.id), "assinatura_id": str(assinatura.id)})

    await registrar(
        db,
        tenant_id=tenant_id,
        action="ASSINATURA",
        entity="bloco_assinatura",
        entity_id=str(bloco.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        detalhe={"documentos_assinados": len(resultados)},
    )
    await db.commit()
    return resultados
