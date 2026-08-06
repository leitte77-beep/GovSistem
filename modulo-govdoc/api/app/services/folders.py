"""Regras de negócio de pastas: criação, movimentação (sem ciclos) e lixeira."""

import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Conflict, NotFound
from app.models.document import Document
from app.models.folder import Folder
from app.models.organization import Department, Secretariat
from app.models.user import User

INVALID_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVED_NAMES = {"con", "prn", "aux", "nul", ".", ".."}


def validate_name(name: str) -> str:
    name = (name or "").strip()
    if not name:
        raise AppError("Informe o nome da pasta.", 422, "nome_invalido")
    if len(name) > 255:
        raise AppError("O nome da pasta deve ter no máximo 255 caracteres.", 422, "nome_invalido")
    if INVALID_NAME_RE.search(name):
        raise AppError(
            'O nome da pasta não pode conter os caracteres < > : " / \\ | ? *',
            422,
            "nome_invalido",
        )
    if name.lower() in RESERVED_NAMES:
        raise AppError("Este nome de pasta é reservado pelo sistema.", 422, "nome_invalido")
    return name


async def ensure_unique_name(
    db: AsyncSession,
    *,
    institution_id: uuid.UUID,
    parent_id: Optional[uuid.UUID],
    name: str,
    exclude_id: Optional[uuid.UUID] = None,
) -> None:
    stmt = select(Folder.id).where(
        Folder.institution_id == institution_id,
        Folder.deleted_at.is_(None),
        func.lower(Folder.name) == name.lower(),
    )
    stmt = stmt.where(Folder.parent_id == parent_id) if parent_id else stmt.where(
        Folder.parent_id.is_(None)
    )
    if exclude_id:
        stmt = stmt.where(Folder.id != exclude_id)
    if await db.scalar(stmt):
        raise Conflict(f'Já existe uma pasta chamada "{name}" neste local.', "pasta_duplicada")


async def resolve_scope(
    db: AsyncSession,
    *,
    parent: Optional[Folder],
    secretariat_id: Optional[uuid.UUID],
    department_id: Optional[uuid.UUID],
) -> tuple:
    """Uma subpasta herda secretaria/setor do pai quando não forem informados."""
    if parent is not None:
        secretariat_id = secretariat_id or parent.secretariat_id
        department_id = department_id or parent.department_id

    if department_id:
        dept = await db.get(Department, department_id)
        if dept is None or dept.deleted_at is not None:
            raise NotFound("Setor não encontrado.")
        if secretariat_id and dept.secretariat_id != secretariat_id:
            raise AppError(
                "O setor informado não pertence à secretaria selecionada.", 422, "escopo_invalido"
            )
        secretariat_id = dept.secretariat_id
    elif secretariat_id:
        sec = await db.get(Secretariat, secretariat_id)
        if sec is None or sec.deleted_at is not None:
            raise NotFound("Secretaria não encontrada.")
    return secretariat_id, department_id


async def create_folder(
    db: AsyncSession,
    *,
    user: User,
    name: str,
    parent_id: Optional[uuid.UUID] = None,
    secretariat_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    **extra,
) -> Folder:
    name = validate_name(name)
    parent = None
    if parent_id:
        parent = await db.get(Folder, parent_id)
        if parent is None or parent.deleted_at is not None:
            raise NotFound("Pasta superior não encontrada.")
        if parent.institution_id != user.institution_id:
            raise NotFound("Pasta superior não encontrada.")

    secretariat_id, department_id = await resolve_scope(
        db, parent=parent, secretariat_id=secretariat_id, department_id=department_id
    )
    await ensure_unique_name(
        db, institution_id=user.institution_id, parent_id=parent_id, name=name
    )

    folder = Folder(
        institution_id=user.institution_id,
        parent_id=parent.id if parent else None,
        materialized_path=parent.child_path() if parent else "/",
        depth=(parent.depth + 1) if parent else 0,
        name=name,
        secretariat_id=secretariat_id,
        department_id=department_id,
        owner_user_id=extra.pop("owner_user_id", None) or user.id,
        created_by_id=user.id,
        updated_by_id=user.id,
        **extra,
    )
    db.add(folder)
    await db.flush()
    return folder


async def descendants(db: AsyncSession, folder: Folder) -> List[Folder]:
    return list(
        (
            await db.scalars(
                select(Folder).where(
                    Folder.materialized_path.like(f"{folder.child_path()}%"),
                    Folder.deleted_at.is_(None),
                )
            )
        ).all()
    )


async def move_folder(
    db: AsyncSession, *, folder: Folder, new_parent_id: Optional[uuid.UUID], user: User
) -> Folder:
    """Move a pasta impedindo ciclos (pasta dentro de si mesma ou de descendente)."""
    if new_parent_id == folder.id:
        raise AppError(
            "Não é possível mover uma pasta para dentro dela mesma.", 422, "ciclo_pasta"
        )

    new_parent = None
    if new_parent_id:
        new_parent = await db.get(Folder, new_parent_id)
        if new_parent is None or new_parent.deleted_at is not None:
            raise NotFound("Pasta de destino não encontrada.")
        if new_parent.institution_id != folder.institution_id:
            raise NotFound("Pasta de destino não encontrada.")
        if str(folder.id) in new_parent.materialized_path.split("/"):
            raise AppError(
                "Não é possível mover uma pasta para dentro de uma subpasta dela mesma.",
                422,
                "ciclo_pasta",
            )

    await ensure_unique_name(
        db,
        institution_id=folder.institution_id,
        parent_id=new_parent_id,
        name=folder.name,
        exclude_id=folder.id,
    )

    old_child_path = folder.child_path()
    children = await descendants(db, folder)

    folder.parent_id = new_parent.id if new_parent else None
    folder.materialized_path = new_parent.child_path() if new_parent else "/"
    folder.depth = (new_parent.depth + 1) if new_parent else 0
    folder.updated_by_id = user.id
    if new_parent:
        folder.secretariat_id = new_parent.secretariat_id or folder.secretariat_id
        folder.department_id = new_parent.department_id or folder.department_id

    new_child_path = folder.child_path()
    for child in children:
        child.materialized_path = child.materialized_path.replace(
            old_child_path, new_child_path, 1
        )
        child.depth = child.materialized_path.strip("/").count("/") + 1
        child.secretariat_id = folder.secretariat_id
        child.department_id = folder.department_id

    await db.flush()
    return folder


async def soft_delete(
    db: AsyncSession, *, folder: Folder, user: User, reason: Optional[str] = None
) -> dict:
    """Manda a pasta e todo o conteúdo para a lixeira (nada é apagado)."""
    now = datetime.now(timezone.utc)
    subtree = [folder] + await descendants(db, folder)
    folder_ids = [f.id for f in subtree]

    blocked = await db.scalar(
        select(func.count(Document.id)).where(
            Document.folder_id.in_(folder_ids),
            Document.deleted_at.is_(None),
            Document.legal_hold.is_(True),
        )
    )
    if blocked:
        raise AppError(
            f"A pasta contém {blocked} documento(s) sob bloqueio legal e não pode ser excluída.",
            409,
            "bloqueio_legal",
        )

    documents = (
        await db.scalars(
            select(Document).where(
                Document.folder_id.in_(folder_ids), Document.deleted_at.is_(None)
            )
        )
    ).all()
    for item in subtree:
        item.deleted_at = now
        item.deleted_by_id = user.id
        item.delete_reason = reason
    for document in documents:
        document.deleted_at = now
        document.deleted_by_id = user.id
        document.delete_reason = reason or "Pasta enviada para a lixeira"
    await db.flush()
    return {"pastas": len(subtree), "documentos": len(documents)}


async def restore(db: AsyncSession, *, folder: Folder, user: User) -> dict:
    """Restaura a pasta; se o pai continuar na lixeira, volta para a raiz."""
    if folder.parent_id:
        parent = await db.get(Folder, folder.parent_id)
        if parent is None or parent.deleted_at is not None:
            folder.parent_id = None
            folder.materialized_path = "/"
            folder.depth = 0

    deleted_at = folder.deleted_at
    subtree = list(
        (
            await db.scalars(
                select(Folder).where(
                    Folder.materialized_path.like(f"{folder.child_path()}%"),
                    Folder.deleted_at == deleted_at,
                )
            )
        ).all()
    )
    folder_ids = [folder.id] + [f.id for f in subtree]
    documents = (
        await db.scalars(
            select(Document).where(
                Document.folder_id.in_(folder_ids), Document.deleted_at == deleted_at
            )
        )
    ).all()

    for item in [folder] + subtree:
        item.deleted_at = None
        item.deleted_by_id = None
        item.delete_reason = None
        item.updated_by_id = user.id
    for document in documents:
        document.deleted_at = None
        document.deleted_by_id = None
        document.delete_reason = None
    await db.flush()
    return {"pastas": len(subtree) + 1, "documentos": len(documents)}


async def breadcrumb(db: AsyncSession, folder: Folder) -> List[dict]:
    ids = [
        uuid.UUID(part)
        for part in folder.materialized_path.strip("/").split("/")
        if part
    ]
    trail: List[dict] = []
    if ids:
        rows = (await db.scalars(select(Folder).where(Folder.id.in_(ids)))).all()
        by_id = {row.id: row for row in rows}
        for fid in ids:
            item = by_id.get(fid)
            if item:
                trail.append({"id": str(item.id), "nome": item.name})
    trail.append({"id": str(folder.id), "nome": folder.name})
    return trail


async def folder_size(db: AsyncSession, folder: Folder) -> int:
    folder_ids = [folder.id] + [f.id for f in await descendants(db, folder)]
    return int(
        await db.scalar(
            select(func.coalesce(func.sum(Document.size_bytes), 0)).where(
                Document.folder_id.in_(folder_ids), Document.deleted_at.is_(None)
            )
        )
        or 0
    )


async def search_folders(
    db: AsyncSession, *, institution_id: uuid.UUID, term: str, limit: int = 20
) -> List[Folder]:
    like = f"%{term.lower()}%"
    return list(
        (
            await db.scalars(
                select(Folder)
                .where(
                    Folder.institution_id == institution_id,
                    Folder.deleted_at.is_(None),
                    or_(
                        func.lower(Folder.name).like(like),
                        func.lower(func.coalesce(Folder.description, "")).like(like),
                    ),
                )
                .limit(limit)
            )
        ).all()
    )
