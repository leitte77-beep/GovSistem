"""Motor central de autorização do GovDoc.

Este é o ÚNICO lugar que decide se alguém pode fazer algo com uma pasta ou
documento. Rotas, serviços e o frontend consultam este módulo — a interface
esconder um botão nunca é a proteção.

Como a permissão efetiva é calculada:

1. `admin_geral` recebe tudo.
2. O perfil do usuário dá uma base dentro do seu escopo (setor / secretaria).
3. Compartilhamentos internos ativos somam permissões.
4. As entradas de permissão (`permission_entries`) são aplicadas da raiz até o
   recurso: `allow` soma, `deny` subtrai, e o nível mais específico vence.
5. A classificação de segurança faz o corte final (sigiloso/confidencial).
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, List, Optional, Sequence, Set

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, PermissionDenied
from app.core.timeutils import is_future, is_past
from app.models.document import Document
from app.models.enums import (
    Classification,
    Permission,
    PermissionEffect,
    Profile,
    ResourceType,
    SubjectType,
)
from app.models.folder import Folder
from app.models.organization import Department, Secretariat
from app.models.permission import PermissionEntry
from app.models.sharing import InternalShare
from app.models.user import User, UserGroup

ALL_PERMISSIONS: Set[str] = {p.value for p in Permission}

READ_ONLY: Set[str] = {
    Permission.VIEW.value,
    Permission.VIEW_METADATA.value,
    Permission.DOWNLOAD.value,
    Permission.VIEW_HISTORY.value,
    Permission.VIEW_VERSIONS.value,
}

CONTRIBUTOR: Set[str] = READ_ONLY | {
    Permission.UPLOAD.value,
    Permission.CREATE_FOLDER.value,
    Permission.EDIT_METADATA.value,
    Permission.NEW_VERSION.value,
    Permission.COPY.value,
}

MANAGER: Set[str] = CONTRIBUTOR | {
    Permission.MOVE.value,
    Permission.DELETE.value,
    Permission.RESTORE.value,
    Permission.SHARE_INTERNAL.value,
    Permission.SHARE_EXTERNAL.value,
    Permission.APPROVE.value,
}

SECRETARIAT_ADMIN: Set[str] = MANAGER | {Permission.MANAGE_PERMISSIONS.value}

AUDITOR: Set[str] = {
    Permission.VIEW.value,
    Permission.VIEW_METADATA.value,
    Permission.VIEW_HISTORY.value,
    Permission.VIEW_VERSIONS.value,
}


@dataclass
class ResourceContext:
    """Tudo que o motor precisa saber sobre o recurso e sua linhagem."""

    resource_type: str
    resource_id: uuid.UUID
    institution_id: uuid.UUID
    secretariat_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    folder_chain: List[uuid.UUID] = field(default_factory=list)
    classification: str = Classification.INTERNO.value
    allow_external_share: bool = False
    inherit: bool = True
    document_id: Optional[uuid.UUID] = None

    def ancestry(self) -> List[tuple]:
        """Do mais genérico ao mais específico."""
        chain: List[tuple] = [(ResourceType.INSTITUTION.value, self.institution_id)]
        if self.secretariat_id:
            chain.append((ResourceType.SECRETARIAT.value, self.secretariat_id))
        if self.department_id:
            chain.append((ResourceType.DEPARTMENT.value, self.department_id))
        for folder_id in self.folder_chain:
            chain.append((ResourceType.FOLDER.value, folder_id))
        if self.document_id:
            chain.append((ResourceType.DOCUMENT.value, self.document_id))
        return chain


def _parse_path(path: str) -> List[uuid.UUID]:
    ids = []
    for part in (path or "/").strip("/").split("/"):
        if not part:
            continue
        try:
            ids.append(uuid.UUID(part))
        except ValueError:
            continue
    return ids


async def build_folder_context(db: AsyncSession, folder: Folder) -> ResourceContext:
    chain = _parse_path(folder.materialized_path) + [folder.id]
    return ResourceContext(
        resource_type=ResourceType.FOLDER.value,
        resource_id=folder.id,
        institution_id=folder.institution_id,
        secretariat_id=folder.secretariat_id,
        department_id=folder.department_id,
        folder_chain=chain,
        classification=folder.classification,
        allow_external_share=folder.allow_external_share,
        inherit=folder.inherit_permissions,
    )


async def build_document_context(db: AsyncSession, document: Document) -> ResourceContext:
    folder = await db.get(Folder, document.folder_id)
    chain = (_parse_path(folder.materialized_path) + [folder.id]) if folder else []
    return ResourceContext(
        resource_type=ResourceType.DOCUMENT.value,
        resource_id=document.id,
        institution_id=document.institution_id,
        secretariat_id=document.secretariat_id or (folder.secretariat_id if folder else None),
        department_id=document.department_id or (folder.department_id if folder else None),
        folder_chain=chain,
        classification=document.classification,
        allow_external_share=folder.allow_external_share if folder else False,
        inherit=document.inherit_permissions,
        document_id=document.id,
    )


async def user_subjects(db: AsyncSession, user: User) -> List[tuple]:
    """Identidades que podem receber permissão: o usuário, seus grupos,
    seu setor, sua secretaria e seu perfil."""
    subjects: List[tuple] = [(SubjectType.USER.value, user.id, None)]
    group_ids = (
        await db.scalars(select(UserGroup.group_id).where(UserGroup.user_id == user.id))
    ).all()
    for gid in group_ids:
        subjects.append((SubjectType.GROUP.value, gid, None))
    if user.department_id:
        subjects.append((SubjectType.DEPARTMENT.value, user.department_id, None))
    if user.secretariat_id:
        subjects.append((SubjectType.SECRETARIAT.value, user.secretariat_id, None))
    subjects.append((SubjectType.PROFILE.value, None, user.profile))
    return subjects


def _profile_baseline(user: User, ctx: ResourceContext) -> Set[str]:
    profile = user.profile
    if profile == Profile.ADMIN_GERAL.value:
        return set(ALL_PERMISSIONS)
    if profile == Profile.AUDITOR.value:
        return set(AUDITOR) if ctx.institution_id == user.institution_id else set()

    same_secretariat = (
        user.secretariat_id is not None and ctx.secretariat_id == user.secretariat_id
    )
    same_department = (
        user.department_id is not None and ctx.department_id == user.department_id
    )

    if profile == Profile.ADMIN_SECRETARIA.value and same_secretariat:
        return set(SECRETARIAT_ADMIN)
    if profile == Profile.GESTOR_SETOR.value and same_department:
        return set(MANAGER)
    if profile == Profile.COLABORADOR.value and same_department:
        return set(CONTRIBUTOR)
    if profile == Profile.LEITOR.value and same_department:
        return {
            Permission.VIEW.value,
            Permission.VIEW_METADATA.value,
            Permission.DOWNLOAD.value,
        }
    return set()


async def _share_permissions(
    db: AsyncSession, subjects: Sequence[tuple], ctx: ResourceContext, now: datetime
) -> Set[str]:
    targets = [(s[0], s[1]) for s in subjects if s[1] is not None]
    if not targets:
        return set()
    resources = ctx.ancestry()
    conditions = [
        (InternalShare.resource_type == rtype) & (InternalShare.resource_id == rid)
        for rtype, rid in resources
        if rtype in {ResourceType.FOLDER.value, ResourceType.DOCUMENT.value}
    ]
    if not conditions:
        return set()
    target_conditions = [
        (InternalShare.target_type == ttype) & (InternalShare.target_id == tid)
        for ttype, tid in targets
    ]
    stmt = select(InternalShare).where(
        or_(*conditions),
        or_(*target_conditions),
        InternalShare.revoked_at.is_(None),
    )
    granted: Set[str] = set()
    for share in (await db.scalars(stmt)).all():
        if is_future(share.starts_at, now):
            continue
        if is_past(share.expires_at, now):
            continue
        granted.update(share.permissions or [])
    return granted


async def _entry_permissions(
    db: AsyncSession,
    subjects: Sequence[tuple],
    ctx: ResourceContext,
    baseline: Set[str],
    now: datetime,
) -> Set[str]:
    """Aplica as entradas de permissão da raiz até o recurso (o mais específico vence)."""
    ancestry = ctx.ancestry()
    if not ctx.inherit:
        # Recurso com herança desligada: só valem as entradas dele próprio.
        ancestry = ancestry[-1:]

    resource_ids = [rid for _, rid in ancestry]
    stmt = select(PermissionEntry).where(PermissionEntry.resource_id.in_(resource_ids))
    entries = (await db.scalars(stmt)).all()

    subject_keys = {(s[0], s[1], s[2]) for s in subjects}

    def matches(entry: PermissionEntry) -> bool:
        if entry.subject_type == SubjectType.PROFILE.value:
            return (SubjectType.PROFILE.value, None, entry.subject_profile) in subject_keys
        return (entry.subject_type, entry.subject_id, None) in subject_keys

    result = set(baseline)
    for index, (rtype, rid) in enumerate(ancestry):
        is_leaf = index == len(ancestry) - 1
        level_entries = [
            e
            for e in entries
            if e.resource_type == rtype
            and e.resource_id == rid
            and matches(e)
            and not is_past(e.expires_at, now)
            and (is_leaf or e.apply_to_children)
        ]
        for entry in level_entries:
            if entry.effect == PermissionEffect.ALLOW.value:
                result |= set(entry.permissions or [])
        for entry in level_entries:
            if entry.effect == PermissionEffect.DENY.value:
                result -= set(entry.permissions or [])
    return result


def _has_explicit_grant(entries: Iterable[PermissionEntry], permission: str) -> bool:
    return any(
        e.effect == PermissionEffect.ALLOW.value and permission in (e.permissions or [])
        for e in entries
    )


async def _apply_classification(
    db: AsyncSession,
    user: User,
    ctx: ResourceContext,
    perms: Set[str],
    subjects: Sequence[tuple],
) -> Set[str]:
    """Regras do art. 20: quanto mais sensível, mais restrito o padrão."""
    if user.profile == Profile.ADMIN_GERAL.value:
        return perms

    classification = ctx.classification

    if classification == Classification.SIGILOSO.value:
        # Sem link externo, jamais. Download só com concessão explícita no
        # próprio recurso (ou na pasta imediata).
        perms.discard(Permission.SHARE_EXTERNAL.value)
        leaf_type, leaf_id = ctx.ancestry()[-1]
        explicit = (
            await db.scalars(
                select(PermissionEntry).where(
                    PermissionEntry.resource_type == leaf_type,
                    PermissionEntry.resource_id == leaf_id,
                )
            )
        ).all()
        subject_keys = {(s[0], s[1], s[2]) for s in subjects}
        mine = [
            e
            for e in explicit
            if (
                (e.subject_type, e.subject_id, None) in subject_keys
                or (e.subject_type == SubjectType.PROFILE.value
                    and (SubjectType.PROFILE.value, None, e.subject_profile) in subject_keys)
            )
        ]
        if not _has_explicit_grant(mine, Permission.DOWNLOAD.value):
            perms.discard(Permission.DOWNLOAD.value)

    elif classification == Classification.CONFIDENCIAL.value:
        if not ctx.allow_external_share:
            perms.discard(Permission.SHARE_EXTERNAL.value)

    elif classification == Classification.RESTRITO.value:
        if not ctx.allow_external_share:
            perms.discard(Permission.SHARE_EXTERNAL.value)

    return perms


async def effective_permissions(
    db: AsyncSession, user: User, ctx: ResourceContext
) -> Set[str]:
    """Permissões efetivas do usuário sobre um recurso."""
    if user.profile == Profile.ADMIN_GERAL.value:
        return set(ALL_PERMISSIONS)
    if ctx.institution_id != user.institution_id:
        return set()

    now = datetime.now(timezone.utc)
    subjects = await user_subjects(db, user)
    baseline = _profile_baseline(user, ctx)
    baseline |= await _share_permissions(db, subjects, ctx, now)
    perms = await _entry_permissions(db, subjects, ctx, baseline, now)
    perms = await _apply_classification(db, user, ctx, perms, subjects)

    if user.profile == Profile.AUDITOR.value:
        # Auditor nunca altera conteúdo, mesmo que ganhe permissão por engano.
        perms &= AUDITOR | {Permission.DOWNLOAD.value}
    return perms


async def get_folder_or_404(db: AsyncSession, folder_id: uuid.UUID) -> Folder:
    folder = await db.get(Folder, folder_id)
    if folder is None or folder.deleted_at is not None:
        raise NotFound("Pasta não encontrada.")
    return folder


async def get_document_or_404(db: AsyncSession, document_id: uuid.UUID) -> Document:
    document = await db.get(Document, document_id)
    if document is None or document.deleted_at is not None:
        raise NotFound("Documento não encontrado.")
    return document


async def require_folder_permission(
    db: AsyncSession, user: User, folder: Folder, permission: Permission
) -> Set[str]:
    ctx = await build_folder_context(db, folder)
    perms = await effective_permissions(db, user, ctx)
    if permission.value not in perms:
        raise PermissionDenied(
            f"Você não possui permissão para {_label(permission, alvo='pasta')}."
        )
    return perms


async def require_document_permission(
    db: AsyncSession, user: User, document: Document, permission: Permission
) -> Set[str]:
    ctx = await build_document_context(db, document)
    perms = await effective_permissions(db, user, ctx)
    if permission.value not in perms:
        raise PermissionDenied(
            f"Você não possui permissão para {_label(permission, alvo='documento')}."
        )
    return perms


async def can_folder(
    db: AsyncSession, user: User, folder: Folder, permission: Permission
) -> bool:
    ctx = await build_folder_context(db, folder)
    return permission.value in await effective_permissions(db, user, ctx)


async def can_document(
    db: AsyncSession, user: User, document: Document, permission: Permission
) -> bool:
    ctx = await build_document_context(db, document)
    return permission.value in await effective_permissions(db, user, ctx)


# Frase completa por permissão, para cada tipo de recurso — evita montar texto
# concatenando pedaços e produzir português quebrado.
_LABELS = {
    Permission.VIEW: ("visualizar este documento", "visualizar esta pasta"),
    Permission.VIEW_METADATA: (
        "ver as informações deste documento",
        "ver as informações desta pasta",
    ),
    Permission.DOWNLOAD: ("baixar este documento", "baixar esta pasta"),
    Permission.UPLOAD: (
        "enviar arquivos para este local",
        "enviar arquivos para esta pasta",
    ),
    Permission.CREATE_FOLDER: ("criar pastas neste local", "criar pastas nesta pasta"),
    Permission.EDIT_METADATA: ("editar este documento", "editar esta pasta"),
    Permission.NEW_VERSION: (
        "enviar nova versão deste documento",
        "enviar nova versão nesta pasta",
    ),
    Permission.MOVE: ("mover este documento", "mover esta pasta"),
    Permission.COPY: ("copiar este documento", "copiar esta pasta"),
    Permission.DELETE: ("excluir este documento", "excluir esta pasta"),
    Permission.RESTORE: ("restaurar este documento", "restaurar itens nesta pasta"),
    Permission.SHARE_INTERNAL: (
        "compartilhar este documento",
        "compartilhar esta pasta",
    ),
    Permission.SHARE_EXTERNAL: (
        "criar link externo para este documento",
        "criar link externo para esta pasta",
    ),
    Permission.MANAGE_PERMISSIONS: (
        "gerenciar as permissões deste documento",
        "gerenciar as permissões desta pasta",
    ),
    Permission.APPROVE: ("aprovar este documento", "aprovar itens desta pasta"),
    Permission.VIEW_HISTORY: (
        "consultar o histórico deste documento",
        "consultar o histórico desta pasta",
    ),
    Permission.VIEW_VERSIONS: (
        "consultar as versões deste documento",
        "consultar as versões dos documentos desta pasta",
    ),
    Permission.MANAGE_BACKUP: ("administrar o backup", "administrar o backup"),
}


def _label(permission: Permission, alvo: str = "documento") -> str:
    documento, pasta = _LABELS.get(
        permission, (f"executar {permission.value}", f"executar {permission.value}")
    )
    return documento if alvo == "documento" else pasta


async def visible_scope(db: AsyncSession, user: User) -> Optional[dict]:
    """Escopo de leitura do usuário, usado por pesquisa, listagens e relatórios.

    Retorna `None` quando o usuário enxerga tudo na instituição (admin/auditor).
    Caso contrário devolve os conjuntos de pastas e documentos visíveis.
    """
    if user.profile in {Profile.ADMIN_GERAL.value, Profile.AUDITOR.value}:
        return None

    now = datetime.now(timezone.utc)
    subjects = await user_subjects(db, user)
    subject_pairs = [(s[0], s[1]) for s in subjects if s[1] is not None]

    folder_ids: Set[uuid.UUID] = set()
    document_ids: Set[uuid.UUID] = set()
    department_ids: Set[uuid.UUID] = set()
    secretariat_ids: Set[uuid.UUID] = set()

    if user.profile == Profile.ADMIN_SECRETARIA.value and user.secretariat_id:
        secretariat_ids.add(user.secretariat_id)
        rows = (
            await db.scalars(
                select(Department.id).where(
                    Department.secretariat_id == user.secretariat_id,
                    Department.deleted_at.is_(None),
                )
            )
        ).all()
        department_ids.update(rows)
    if user.department_id:
        department_ids.add(user.department_id)

    # Concessões explícitas
    entry_conditions = []
    for stype, sid in subject_pairs:
        entry_conditions.append(
            (PermissionEntry.subject_type == stype) & (PermissionEntry.subject_id == sid)
        )
    entry_conditions.append(
        (PermissionEntry.subject_type == SubjectType.PROFILE.value)
        & (PermissionEntry.subject_profile == user.profile)
    )
    entries = (
        await db.scalars(
            select(PermissionEntry).where(
                PermissionEntry.institution_id == user.institution_id,
                or_(*entry_conditions),
                PermissionEntry.effect == PermissionEffect.ALLOW.value,
            )
        )
    ).all()
    for entry in entries:
        if is_past(entry.expires_at, now):
            continue
        if Permission.VIEW.value not in (entry.permissions or []):
            continue
        if entry.resource_type == ResourceType.FOLDER.value:
            folder_ids.add(entry.resource_id)
        elif entry.resource_type == ResourceType.DOCUMENT.value:
            document_ids.add(entry.resource_id)
        elif entry.resource_type == ResourceType.DEPARTMENT.value:
            department_ids.add(entry.resource_id)
        elif entry.resource_type == ResourceType.SECRETARIAT.value:
            secretariat_ids.add(entry.resource_id)

    # Compartilhamentos internos
    share_conditions = [
        (InternalShare.target_type == ttype) & (InternalShare.target_id == tid)
        for ttype, tid in subject_pairs
    ]
    if share_conditions:
        shares = (
            await db.scalars(
                select(InternalShare).where(
                    InternalShare.institution_id == user.institution_id,
                    or_(*share_conditions),
                    InternalShare.revoked_at.is_(None),
                )
            )
        ).all()
        for share in shares:
            if is_past(share.expires_at, now):
                continue
            if is_future(share.starts_at, now):
                continue
            if Permission.VIEW.value not in (share.permissions or []):
                continue
            if share.resource_type == ResourceType.FOLDER.value:
                folder_ids.add(share.resource_id)
            else:
                document_ids.add(share.resource_id)

    # Expande pastas concedidas para todas as descendentes
    if folder_ids:
        granted = (
            await db.scalars(select(Folder).where(Folder.id.in_(folder_ids)))
        ).all()
        for folder in granted:
            descendants = (
                await db.scalars(
                    select(Folder.id).where(
                        Folder.materialized_path.like(f"{folder.child_path()}%")
                    )
                )
            ).all()
            folder_ids.update(descendants)

    return {
        "folder_ids": folder_ids,
        "document_ids": document_ids,
        "department_ids": department_ids,
        "secretariat_ids": secretariat_ids,
    }


def scope_filter_for_documents(scope: Optional[dict]):
    """Traduz o escopo em condição SQL para consultas de documentos."""
    if scope is None:
        return None
    conditions = []
    if scope["department_ids"]:
        conditions.append(Document.department_id.in_(scope["department_ids"]))
    if scope["secretariat_ids"]:
        conditions.append(Document.secretariat_id.in_(scope["secretariat_ids"]))
    if scope["folder_ids"]:
        conditions.append(Document.folder_id.in_(scope["folder_ids"]))
    if scope["document_ids"]:
        conditions.append(Document.id.in_(scope["document_ids"]))
    if not conditions:
        return Document.id.is_(None)  # nada visível — fail closed
    return or_(*conditions)


def scope_filter_for_folders(scope: Optional[dict]):
    if scope is None:
        return None
    conditions = []
    if scope["department_ids"]:
        conditions.append(Folder.department_id.in_(scope["department_ids"]))
    if scope["secretariat_ids"]:
        conditions.append(Folder.secretariat_id.in_(scope["secretariat_ids"]))
    if scope["folder_ids"]:
        conditions.append(Folder.id.in_(scope["folder_ids"]))
    if not conditions:
        return Folder.id.is_(None)
    return or_(*conditions)


async def secretariat_of_department(
    db: AsyncSession, department_id: Optional[uuid.UUID]
) -> Optional[uuid.UUID]:
    if department_id is None:
        return None
    dept = await db.get(Department, department_id)
    return dept.secretariat_id if dept else None


async def department_belongs_to(
    db: AsyncSession, department_id: uuid.UUID, secretariat_id: uuid.UUID
) -> bool:
    dept = await db.get(Department, department_id)
    return bool(dept and dept.secretariat_id == secretariat_id)


async def secretariat_exists(db: AsyncSession, secretariat_id: uuid.UUID) -> bool:
    sec = await db.get(Secretariat, secretariat_id)
    return bool(sec and sec.deleted_at is None)
