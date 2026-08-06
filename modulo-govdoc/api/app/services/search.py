"""Pesquisa e filtros de documentos — sempre limitados pelo escopo do usuário."""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.enums import Profile
from app.models.folder import Folder
from app.models.taxonomy import DocumentTag, Tag
from app.models.user import User
from app.services.permissions import scope_filter_for_documents, visible_scope

SORTABLE = {
    "nome": Document.display_name,
    "criacao": Document.created_at,
    "alteracao": Document.updated_at,
    "tamanho": Document.size_bytes,
    "tipo": Document.extension,
    "responsavel": Document.owner_user_id,
    "data_documento": Document.document_date,
    "vencimento": Document.expires_on,
    "codigo": Document.code,
}


async def apply_scope(db: AsyncSession, user: User, stmt: Select) -> Select:
    """Filtro de permissão obrigatório em toda listagem/pesquisa."""
    stmt = stmt.where(Document.institution_id == user.institution_id)
    if user.profile in {Profile.ADMIN_GERAL.value, Profile.AUDITOR.value}:
        return stmt
    scope = await visible_scope(db, user)
    condition = scope_filter_for_documents(scope)
    owner_condition = or_(
        Document.owner_user_id == user.id, Document.created_by_id == user.id
    )
    return stmt.where(or_(condition, owner_condition)) if condition is not None else stmt


def _term_condition(term: str):
    like = f"%{term.lower()}%"
    return or_(
        func.lower(Document.display_name).like(like),
        func.lower(func.coalesce(Document.description, "")).like(like),
        func.lower(func.coalesce(Document.subject, "")).like(like),
        func.lower(func.coalesce(Document.original_name, "")).like(like),
        func.lower(func.coalesce(Document.process_number, "")).like(like),
        func.lower(func.coalesce(Document.protocol_number, "")).like(like),
        func.lower(func.coalesce(Document.contract_number, "")).like(like),
        func.lower(func.coalesce(Document.author_name, "")).like(like),
        func.lower(func.coalesce(Document.stakeholder_name, "")).like(like),
        func.lower(Document.code).like(like),
        func.lower(func.coalesce(Document.extracted_text, "")).like(like),
    )


async def build_query(
    db: AsyncSession,
    user: User,
    *,
    term: Optional[str] = None,
    folder_id: Optional[uuid.UUID] = None,
    include_subfolders: bool = False,
    secretariat_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    category_id: Optional[uuid.UUID] = None,
    owner_id: Optional[uuid.UUID] = None,
    classification: Optional[str] = None,
    status: Optional[str] = None,
    extension: Optional[str] = None,
    tag: Optional[str] = None,
    reference_year: Optional[int] = None,
    created_from: Optional[date] = None,
    created_to: Optional[date] = None,
    document_from: Optional[date] = None,
    document_to: Optional[date] = None,
    expires_from: Optional[date] = None,
    expires_to: Optional[date] = None,
    expiring_in_days: Optional[int] = None,
    expired: Optional[bool] = None,
    without_category: Optional[bool] = None,
    with_external_link: Optional[bool] = None,
    duplicates: Optional[bool] = None,
    min_size: Optional[int] = None,
    max_size: Optional[int] = None,
    trash: bool = False,
) -> Select:
    stmt = select(Document)
    stmt = stmt.where(
        Document.deleted_at.is_not(None) if trash else Document.deleted_at.is_(None)
    )
    stmt = await apply_scope(db, user, stmt)

    if term:
        stmt = stmt.where(_term_condition(term))
    if folder_id:
        if include_subfolders:
            folder = await db.get(Folder, folder_id)
            if folder is not None:
                descendants = (
                    await db.scalars(
                        select(Folder.id).where(
                            Folder.materialized_path.like(f"{folder.child_path()}%")
                        )
                    )
                ).all()
                stmt = stmt.where(Document.folder_id.in_([folder_id, *descendants]))
            else:
                stmt = stmt.where(Document.folder_id == folder_id)
        else:
            stmt = stmt.where(Document.folder_id == folder_id)
    if secretariat_id:
        stmt = stmt.where(Document.secretariat_id == secretariat_id)
    if department_id:
        stmt = stmt.where(Document.department_id == department_id)
    if category_id:
        stmt = stmt.where(Document.category_id == category_id)
    if owner_id:
        stmt = stmt.where(Document.owner_user_id == owner_id)
    if classification:
        stmt = stmt.where(Document.classification == classification)
    if status:
        stmt = stmt.where(Document.status == status)
    if extension:
        ext = extension if extension.startswith(".") else f".{extension}"
        stmt = stmt.where(Document.extension == ext.lower())
    if reference_year:
        stmt = stmt.where(Document.reference_year == reference_year)
    if tag:
        stmt = stmt.where(
            Document.id.in_(
                select(DocumentTag.document_id)
                .join(Tag, Tag.id == DocumentTag.tag_id)
                .where(func.lower(Tag.slug) == tag.lower())
            )
        )
    if created_from:
        stmt = stmt.where(func.date(Document.created_at) >= created_from)
    if created_to:
        stmt = stmt.where(func.date(Document.created_at) <= created_to)
    if document_from:
        stmt = stmt.where(Document.document_date >= document_from)
    if document_to:
        stmt = stmt.where(Document.document_date <= document_to)
    if expires_from:
        stmt = stmt.where(Document.expires_on >= expires_from)
    if expires_to:
        stmt = stmt.where(Document.expires_on <= expires_to)
    if expiring_in_days is not None:
        from datetime import timedelta

        limit = date.today() + timedelta(days=expiring_in_days)
        stmt = stmt.where(
            and_(
                Document.expires_on.is_not(None),
                Document.expires_on <= limit,
                Document.expires_on >= date.today(),
            )
        )
    if expired:
        stmt = stmt.where(
            and_(Document.expires_on.is_not(None), Document.expires_on < date.today())
        )
    if without_category:
        stmt = stmt.where(Document.category_id.is_(None))
    if with_external_link:
        from app.models.sharing import ExternalLink, ExternalLinkItem

        stmt = stmt.where(
            Document.id.in_(
                select(ExternalLinkItem.resource_id)
                .join(ExternalLink, ExternalLink.id == ExternalLinkItem.link_id)
                .where(ExternalLink.revoked_at.is_(None))
            )
        )
    if duplicates:
        duplicated = (
            select(Document.sha256)
            .where(Document.deleted_at.is_(None), Document.sha256.is_not(None))
            .group_by(Document.sha256)
            .having(func.count(Document.id) > 1)
        )
        stmt = stmt.where(Document.sha256.in_(duplicated))
    if min_size:
        stmt = stmt.where(Document.size_bytes >= min_size)
    if max_size:
        stmt = stmt.where(Document.size_bytes <= max_size)
    return stmt


def apply_sort(stmt: Select, sort: str, direction: str) -> Select:
    column = SORTABLE.get(sort, Document.updated_at)
    return stmt.order_by(column.asc() if direction == "asc" else column.desc())


async def count_query(db: AsyncSession, stmt: Select) -> int:
    subquery = stmt.with_only_columns(Document.id).order_by(None).subquery()
    return int(await db.scalar(select(func.count()).select_from(subquery)) or 0)
