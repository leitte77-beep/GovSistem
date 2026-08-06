"""Lixeira: consulta, restauração e exclusão definitiva."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Pagination, client_info, get_institution, page_payload, user_names
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.models.document import Document
from app.models.enums import AuditAction, Permission, Profile
from app.models.folder import Folder
from app.models.organization import Institution
from app.models.user import User
from app.schemas.common import Message
from app.schemas.content import RestoreRequest
from app.services import audit
from app.services import documents as doc_service
from app.services import folders as folder_service
from app.services import permissions as perm

router = APIRouter(prefix="/lixeira", tags=["Lixeira"])


@router.get("", summary="Itens na lixeira")
async def list_trash(
    tipo: Optional[str] = Query(None, description="documento | pasta"),
    termo: Optional[str] = Query(None),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    itens = []
    total = 0

    if tipo in (None, "documento"):
        stmt = select(Document).where(
            Document.institution_id == institution.id, Document.deleted_at.is_not(None)
        )
        if user.profile not in {Profile.ADMIN_GERAL.value, Profile.AUDITOR.value}:
            scope = await perm.visible_scope(db, user)
            condition = perm.scope_filter_for_documents(scope)
            if condition is not None:
                stmt = stmt.where(or_(condition, Document.deleted_by_id == user.id))
        if termo:
            stmt = stmt.where(func.lower(Document.display_name).like(f"%{termo.lower()}%"))
        total += int(
            await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        rows = (
            await db.scalars(
                stmt.order_by(Document.deleted_at.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        ).all()
        names = await user_names(db, [row.deleted_by_id for row in rows])
        for row in rows:
            itens.append(
                {
                    "tipo": "documento",
                    "id": str(row.id),
                    "nome": row.display_name,
                    "codigo": row.code,
                    "tamanho_bytes": row.size_bytes,
                    "pasta_id": str(row.folder_id),
                    "excluido_em": row.deleted_at,
                    "excluido_por": names.get(row.deleted_by_id),
                    "motivo": row.delete_reason,
                    "bloqueio_legal": row.legal_hold,
                }
            )

    if tipo in (None, "pasta"):
        stmt = select(Folder).where(
            Folder.institution_id == institution.id, Folder.deleted_at.is_not(None)
        )
        if termo:
            stmt = stmt.where(func.lower(Folder.name).like(f"%{termo.lower()}%"))
        rows = (await db.scalars(stmt.order_by(Folder.deleted_at.desc()).limit(100))).all()
        names = await user_names(db, [row.deleted_by_id for row in rows])
        # Apenas a pasta "raiz" da exclusão aparece na lista.
        deleted_ids = {row.id for row in rows}
        for row in rows:
            if row.parent_id in deleted_ids:
                continue
            total += 1
            itens.append(
                {
                    "tipo": "pasta",
                    "id": str(row.id),
                    "nome": row.name,
                    "codigo": None,
                    "tamanho_bytes": row.size_bytes_cache,
                    "pasta_id": str(row.parent_id) if row.parent_id else None,
                    "excluido_em": row.deleted_at,
                    "excluido_por": names.get(row.deleted_by_id),
                    "motivo": row.delete_reason,
                    "bloqueio_legal": False,
                }
            )

    itens.sort(key=lambda item: item["excluido_em"], reverse=True)
    return {
        **page_payload(itens, total, paginacao),
        "prazo_retencao_dias": settings.TRASH_RETENTION_DAYS,
    }


@router.post("/documentos/{document_id}/restaurar", summary="Restaurar documento")
async def restore_document(
    document_id: uuid.UUID,
    payload: RestoreRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await db.get(Document, document_id)
    if document is None or document.deleted_at is None:
        raise NotFound("Documento não encontrado na lixeira.")

    folder = await db.get(Folder, payload.pasta_destino_id or document.folder_id)
    if folder is None:
        raise NotFound("Pasta de destino não encontrada.")
    await perm.require_folder_permission(db, user, folder, Permission.RESTORE)

    await doc_service.restore_document(
        db, user=user, document=document, target_folder_id=folder.id
    )
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_RESTORE,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        detail=f"Restaurado para a pasta {folder.name}",
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'"{document.display_name}" foi restaurado.',
        detalhe=f"Local: {folder.name}",
    )


@router.post("/pastas/{folder_id}/restaurar", summary="Restaurar pasta")
async def restore_folder(
    folder_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await db.get(Folder, folder_id)
    if folder is None or folder.deleted_at is None:
        raise NotFound("Pasta não encontrada na lixeira.")
    if user.profile not in {Profile.ADMIN_GERAL.value, Profile.ADMIN_SECRETARIA.value}:
        if folder.department_id != user.department_id:
            raise AppError(
                "Você não possui permissão para restaurar esta pasta.", 403, "permissao_negada"
            )

    resumo = await folder_service.restore(db, folder=folder, user=user)
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_RESTORE,
        user=user,
        resource_type="folder",
        resource_id=folder.id,
        resource_name=folder.name,
        data_after=resumo,
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'Pasta "{folder.name}" restaurada.',
        detalhe=f"{resumo['pastas']} pasta(s) e {resumo['documentos']} documento(s).",
    )


@router.delete("/documentos/{document_id}", summary="Excluir documento definitivamente")
async def purge_document(
    document_id: uuid.UUID,
    request: Request,
    confirmar: bool = Query(False, description="Confirmação obrigatória"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await db.get(Document, document_id)
    if document is None or document.deleted_at is None:
        raise NotFound("Documento não encontrado na lixeira.")
    if not confirmar:
        raise AppError(
            "A exclusão definitiva é irreversível. Confirme a operação para prosseguir.",
            400,
            "confirmacao_necessaria",
        )
    if user.profile not in {Profile.ADMIN_GERAL.value, Profile.ADMIN_SECRETARIA.value}:
        raise AppError(
            "Apenas administradores podem excluir definitivamente.", 403, "permissao_negada"
        )
    if document.legal_hold:
        raise AppError(
            "Este documento está sob bloqueio legal e não pode ser excluído.",
            409,
            "bloqueio_legal",
        )
    if document.retention_policy_id:
        from app.models.governance import RetentionPolicy

        politica = await db.get(RetentionPolicy, document.retention_policy_id)
        if politica and politica.block_delete_until_expiry:
            raise AppError(
                f'A política de retenção "{politica.name}" impede a exclusão definitiva '
                f"antes de {politica.retain_days} dias.",
                409,
                "retencao_ativa",
            )

    nome, codigo = document.display_name, document.code
    removidos = await doc_service.purge_document(db, document=document)
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_PURGE,
        user=user,
        resource_type="document",
        resource_id=document_id,
        resource_name=nome,
        detail=f"Exclusão definitiva de {codigo} ({removidos} arquivo(s) removidos)",
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'"{nome}" foi excluído definitivamente.',
        detalhe=f"{removidos} arquivo(s) removidos do armazenamento.",
    )


@router.post("/esvaziar", summary="Esvaziar lixeira")
async def empty_trash(
    request: Request,
    confirmar: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    if user.profile != Profile.ADMIN_GERAL.value:
        raise AppError(
            "Apenas o administrador geral pode esvaziar a lixeira.", 403, "permissao_negada"
        )
    if not confirmar:
        raise AppError(
            "A operação é irreversível. Confirme para esvaziar a lixeira.",
            400,
            "confirmacao_necessaria",
        )

    documents = (
        await db.scalars(
            select(Document).where(
                Document.institution_id == institution.id,
                Document.deleted_at.is_not(None),
                Document.legal_hold.is_(False),
                Document.retention_policy_id.is_(None),
            )
        )
    ).all()
    total = 0
    for document in documents:
        await doc_service.purge_document(db, document=document)
        total += 1
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_PURGE,
        user=user,
        resource_type="institution",
        resource_id=institution.id,
        detail=f"Lixeira esvaziada: {total} documento(s)",
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f"{total} documento(s) excluídos definitivamente.",
        detalhe="Itens sob bloqueio legal ou política de retenção foram preservados.",
    )
