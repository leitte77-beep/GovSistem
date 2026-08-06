"""Pastas: navegação, criação, movimentação, download em ZIP e lixeira."""

import io
import uuid
import zipfile
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Pagination,
    client_info,
    department_names,
    get_institution,
    page_payload,
    secretariat_names,
    user_names,
)
from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.storage import get_storage
from app.models.document import Document, DocumentVersion, Favorite
from app.models.enums import AuditAction, Permission, ResourceType
from app.models.folder import Folder
from app.models.organization import Institution
from app.models.taxonomy import FolderTag, Tag
from app.models.user import User
from app.schemas.common import Message
from app.schemas.content import (
    DeleteRequest,
    FolderCreate,
    FolderMove,
    FolderOut,
    FolderUpdate,
)
from app.services import audit
from app.services import folders as folder_service
from app.services import permissions as perm
from app.services.search import apply_scope

router = APIRouter(prefix="/pastas", tags=["Pastas"])


async def _slugify(name: str) -> str:
    import re
    import unicodedata

    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")[:80]


async def _sync_tags(db: AsyncSession, folder: Folder, etiquetas: List[str]) -> None:
    atuais = (
        await db.scalars(select(FolderTag).where(FolderTag.folder_id == folder.id))
    ).all()
    for item in atuais:
        await db.delete(item)
    for nome in etiquetas or []:
        slug = await _slugify(nome)
        if not slug:
            continue
        tag = await db.scalar(
            select(Tag).where(
                Tag.institution_id == folder.institution_id, Tag.slug == slug
            )
        )
        if tag is None:
            tag = Tag(institution_id=folder.institution_id, name=nome.strip(), slug=slug)
            db.add(tag)
            await db.flush()
        db.add(FolderTag(folder_id=folder.id, tag_id=tag.id))


async def _decorate(
    db: AsyncSession, user: User, folders: List[Folder], *, with_counts: bool = True
) -> List[FolderOut]:
    sec_names = await secretariat_names(db, [f.secretariat_id for f in folders])
    dep_names = await department_names(db, [f.department_id for f in folders])
    owner_names = await user_names(db, [f.owner_user_id for f in folders])
    favorites = set(
        (
            await db.scalars(
                select(Favorite.resource_id).where(
                    Favorite.user_id == user.id,
                    Favorite.resource_type == ResourceType.FOLDER.value,
                )
            )
        ).all()
    )

    result = []
    for folder in folders:
        counts = {}
        if with_counts:
            counts["total_subpastas"] = int(
                await db.scalar(
                    select(func.count(Folder.id)).where(
                        Folder.parent_id == folder.id, Folder.deleted_at.is_(None)
                    )
                )
                or 0
            )
            counts["total_documentos"] = int(
                await db.scalar(
                    select(func.count(Document.id)).where(
                        Document.folder_id == folder.id, Document.deleted_at.is_(None)
                    )
                )
                or 0
            )
        ctx = await perm.build_folder_context(db, folder)
        perms = await perm.effective_permissions(db, user, ctx)
        result.append(
            FolderOut.build(
                folder,
                secretaria_nome=sec_names.get(folder.secretariat_id),
                setor_nome=dep_names.get(folder.department_id),
                responsavel_nome=owner_names.get(folder.owner_user_id),
                favorito=folder.id in favorites,
                permissoes=sorted(perms),
                **counts,
            )
        )
    return result


async def _visible_folders(db: AsyncSession, user: User, stmt):
    scope = await perm.visible_scope(db, user)
    condition = perm.scope_filter_for_folders(scope)
    if condition is not None:
        from sqlalchemy import or_

        stmt = stmt.where(or_(condition, Folder.created_by_id == user.id))
    return stmt


@router.get("", summary="Listar pastas de um nível")
async def list_folders(
    pasta_superior_id: Optional[uuid.UUID] = Query(None),
    secretaria_id: Optional[uuid.UUID] = Query(None),
    setor_id: Optional[uuid.UUID] = Query(None),
    termo: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(Folder).where(
        Folder.institution_id == institution.id, Folder.deleted_at.is_(None)
    )
    if pasta_superior_id:
        stmt = stmt.where(Folder.parent_id == pasta_superior_id)
    elif not termo and not secretaria_id and not setor_id:
        stmt = stmt.where(Folder.parent_id.is_(None))
    if secretaria_id:
        stmt = stmt.where(Folder.secretariat_id == secretaria_id)
    if setor_id:
        stmt = stmt.where(Folder.department_id == setor_id)
    if termo:
        stmt = stmt.where(func.lower(Folder.name).like(f"%{termo.lower()}%"))

    stmt = await _visible_folders(db, user, stmt)
    folders = list((await db.scalars(stmt.order_by(Folder.name))).all())
    return await _decorate(db, user, folders)


@router.get("/arvore", summary="Árvore de pastas para navegação")
async def folder_tree(
    profundidade: int = Query(3, ge=1, le=6),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(Folder).where(
        Folder.institution_id == institution.id,
        Folder.deleted_at.is_(None),
        Folder.depth < profundidade,
    )
    stmt = await _visible_folders(db, user, stmt)
    folders = list((await db.scalars(stmt.order_by(Folder.depth, Folder.name))).all())

    nodes = {
        folder.id: {
            "id": str(folder.id),
            "nome": folder.name,
            "cor": folder.color,
            "icone": folder.icon,
            "classificacao": folder.classification,
            "pasta_superior_id": str(folder.parent_id) if folder.parent_id else None,
            "filhos": [],
        }
        for folder in folders
    }
    raizes = []
    for folder in folders:
        node = nodes[folder.id]
        if folder.parent_id and folder.parent_id in nodes:
            nodes[folder.parent_id]["filhos"].append(node)
        else:
            raizes.append(node)
    return raizes


@router.post("", response_model=FolderOut, status_code=201, summary="Criar pasta")
async def create_folder(
    payload: FolderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    if payload.pasta_superior_id:
        parent = await perm.get_folder_or_404(db, payload.pasta_superior_id)
        await perm.require_folder_permission(db, user, parent, Permission.CREATE_FOLDER)
    else:
        from app.models.enums import Profile

        if user.profile not in {Profile.ADMIN_GERAL.value, Profile.ADMIN_SECRETARIA.value}:
            raise AppError(
                "Apenas administradores podem criar pastas na raiz. "
                "Selecione uma pasta superior.",
                403,
                "permissao_negada",
            )

    folder = await folder_service.create_folder(
        db,
        user=user,
        name=payload.nome,
        parent_id=payload.pasta_superior_id,
        secretariat_id=payload.secretaria_id,
        department_id=payload.setor_id,
        description=payload.descricao,
        owner_user_id=payload.responsavel_id,
        color=payload.cor,
        icon=payload.icone,
        classification=payload.classificacao.value,
        allow_external_share=payload.permitir_compartilhamento_externo,
        retention_policy_id=payload.politica_retencao_id,
        expires_on=payload.vencimento,
        notes=payload.observacoes,
    )
    await _sync_tags(db, folder, payload.etiquetas)
    await audit.record(
        db,
        action=AuditAction.FOLDER_CREATE,
        user=user,
        resource_type="folder",
        resource_id=folder.id,
        resource_name=folder.name,
        secretariat_id=folder.secretariat_id,
        department_id=folder.department_id,
        data_after={"nome": folder.name, "pasta_superior": str(folder.parent_id or "")},
        client=client_info(request),
    )
    await db.commit()
    await db.refresh(folder)
    return (await _decorate(db, user, [folder]))[0]


@router.get("/{folder_id}", response_model=FolderOut, summary="Detalhar pasta")
async def get_folder(
    folder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.VIEW)
    detail = (await _decorate(db, user, [folder]))[0]
    detail.tamanho_bytes = await folder_service.folder_size(db, folder)
    return detail


@router.get("/{folder_id}/caminho", summary="Trilha de navegação (breadcrumb)")
async def get_breadcrumb(
    folder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.VIEW)
    return await folder_service.breadcrumb(db, folder)


@router.get("/{folder_id}/conteudo", summary="Conteúdo da pasta (subpastas e documentos)")
async def folder_contents(
    folder_id: uuid.UUID,
    ordenar: str = Query("nome"),
    direcao: str = Query("asc"),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.schemas.content import DocumentOut
    from app.services.search import apply_sort

    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.VIEW)

    subpastas_stmt = await _visible_folders(
        db,
        user,
        select(Folder).where(Folder.parent_id == folder.id, Folder.deleted_at.is_(None)),
    )
    subpastas = list((await db.scalars(subpastas_stmt.order_by(Folder.name))).all())

    docs_stmt = select(Document).where(
        Document.folder_id == folder.id, Document.deleted_at.is_(None)
    )
    docs_stmt = await apply_scope(db, user, docs_stmt)
    total = int(
        await db.scalar(select(func.count()).select_from(docs_stmt.subquery())) or 0
    )
    docs_stmt = apply_sort(docs_stmt, ordenar, direcao)
    documentos = list(
        (
            await db.scalars(
                docs_stmt.offset(paginacao.offset).limit(paginacao.por_pagina)
            )
        ).all()
    )

    owner_names = await user_names(db, [d.owner_user_id for d in documentos])
    favorites = set(
        (
            await db.scalars(
                select(Favorite.resource_id).where(
                    Favorite.user_id == user.id,
                    Favorite.resource_type == ResourceType.DOCUMENT.value,
                )
            )
        ).all()
    )
    itens_doc = []
    for doc in documentos:
        ctx = await perm.build_document_context(db, doc)
        perms = await perm.effective_permissions(db, user, ctx)
        itens_doc.append(
            DocumentOut.build(
                doc,
                pasta_nome=folder.name,
                responsavel_nome=owner_names.get(doc.owner_user_id),
                favorito=doc.id in favorites,
                permissoes=sorted(perms),
            )
        )

    return {
        "pasta": (await _decorate(db, user, [folder]))[0],
        "caminho": await folder_service.breadcrumb(db, folder),
        "subpastas": await _decorate(db, user, subpastas),
        "documentos": page_payload(itens_doc, total, paginacao),
    }


@router.put("/{folder_id}", response_model=FolderOut, summary="Editar pasta")
async def update_folder(
    folder_id: uuid.UUID,
    payload: FolderUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.EDIT_METADATA)

    before = {"nome": folder.name, "classificacao": folder.classification}
    data = payload.model_dump(exclude_unset=True)
    if "nome" in data and data["nome"]:
        nome = folder_service.validate_name(data["nome"])
        await folder_service.ensure_unique_name(
            db,
            institution_id=folder.institution_id,
            parent_id=folder.parent_id,
            name=nome,
            exclude_id=folder.id,
        )
        folder.name = nome
    mapping = {
        "descricao": "description",
        "responsavel_id": "owner_user_id",
        "cor": "color",
        "icone": "icon",
        "permitir_compartilhamento_externo": "allow_external_share",
        "herdar_permissoes": "inherit_permissions",
        "politica_retencao_id": "retention_policy_id",
        "vencimento": "expires_on",
        "observacoes": "notes",
    }
    for field, value in data.items():
        if field in mapping:
            setattr(folder, mapping[field], value)
        elif field == "classificacao" and value:
            folder.classification = value.value
    if "etiquetas" in data and data["etiquetas"] is not None:
        await _sync_tags(db, folder, data["etiquetas"])
    folder.updated_by_id = user.id
    folder.row_version += 1

    await audit.record(
        db,
        action=AuditAction.FOLDER_UPDATE,
        user=user,
        resource_type="folder",
        resource_id=folder.id,
        resource_name=folder.name,
        data_before=before,
        data_after={"nome": folder.name, "classificacao": folder.classification},
        client=client_info(request),
    )
    await db.commit()
    await db.refresh(folder)
    return (await _decorate(db, user, [folder]))[0]


@router.post("/{folder_id}/mover", response_model=FolderOut, summary="Mover pasta")
async def move_folder(
    folder_id: uuid.UUID,
    payload: FolderMove,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.MOVE)
    if payload.pasta_destino_id:
        destino = await perm.get_folder_or_404(db, payload.pasta_destino_id)
        await perm.require_folder_permission(db, user, destino, Permission.CREATE_FOLDER)

    origem = str(folder.parent_id or "raiz")
    await folder_service.move_folder(
        db, folder=folder, new_parent_id=payload.pasta_destino_id, user=user
    )
    await audit.record(
        db,
        action=AuditAction.FOLDER_MOVE,
        user=user,
        resource_type="folder",
        resource_id=folder.id,
        resource_name=folder.name,
        data_before={"pasta_superior": origem},
        data_after={"pasta_superior": str(folder.parent_id or "raiz")},
        client=client_info(request),
    )
    await db.commit()
    await db.refresh(folder)
    return (await _decorate(db, user, [folder]))[0]


@router.delete("/{folder_id}", response_model=Message, summary="Enviar pasta para a lixeira")
async def delete_folder(
    folder_id: uuid.UUID,
    payload: DeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.DELETE)
    resumo = await folder_service.soft_delete(
        db, folder=folder, user=user, reason=payload.motivo
    )
    await audit.record(
        db,
        action=AuditAction.FOLDER_DELETE,
        user=user,
        resource_type="folder",
        resource_id=folder.id,
        resource_name=folder.name,
        detail=payload.motivo,
        data_after=resumo,
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'Pasta "{folder.name}" enviada para a lixeira.',
        detalhe=(
            f"{resumo['pastas']} pasta(s) e {resumo['documentos']} documento(s) "
            "podem ser restaurados."
        ),
    )


@router.get("/{folder_id}/download", summary="Baixar pasta como ZIP")
async def download_folder(
    folder_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.DOWNLOAD)

    folder_ids = [folder.id] + [f.id for f in await folder_service.descendants(db, folder)]
    documents = (
        await db.scalars(
            select(Document).where(
                Document.folder_id.in_(folder_ids), Document.deleted_at.is_(None)
            )
        )
    ).all()

    storage = get_storage()
    buffer = io.BytesIO()
    incluidos = 0
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for doc in documents:
            if not await perm.can_document(db, user, doc, Permission.DOWNLOAD):
                continue
            version = await db.get(DocumentVersion, doc.current_version_id)
            if version is None:
                continue
            try:
                data = await storage.get(version.storage_key)
            except Exception:
                continue
            archive.writestr(f"{doc.code} - {doc.display_name}", data)
            incluidos += 1

    if incluidos == 0:
        raise NotFound("Não há documentos disponíveis para download nesta pasta.")

    buffer.seek(0)
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_DOWNLOAD,
        user=user,
        resource_type="folder",
        resource_id=folder.id,
        resource_name=folder.name,
        detail=f"Download em ZIP de {incluidos} documento(s)",
        client=client_info(request),
    )
    await db.commit()

    nome = f"{folder.name}.zip".replace('"', "")
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.post("/{folder_id}/favorito", response_model=Message, summary="Favoritar pasta")
async def toggle_favorite(
    folder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await perm.get_folder_or_404(db, folder_id)
    await perm.require_folder_permission(db, user, folder, Permission.VIEW)
    existing = await db.scalar(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.resource_type == ResourceType.FOLDER.value,
            Favorite.resource_id == folder.id,
        )
    )
    if existing:
        await db.delete(existing)
        mensagem = "Pasta removida dos favoritos."
    else:
        db.add(
            Favorite(
                user_id=user.id,
                resource_type=ResourceType.FOLDER.value,
                resource_id=folder.id,
            )
        )
        mensagem = "Pasta adicionada aos favoritos."
    await db.commit()
    return Message(mensagem=mensagem)
