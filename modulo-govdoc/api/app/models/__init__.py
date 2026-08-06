"""Registro de todos os modelos — importados aqui para o Alembic enxergar tudo."""

from app.models.base import Base
from app.models.document import (
    Document,
    DocumentCustomField,
    DocumentLock,
    DocumentVersion,
    Favorite,
)
from app.models.folder import Folder
from app.models.governance import (
    ApprovalExecution,
    ApprovalFlow,
    ApprovalStep,
    AuditLog,
    BackupExecution,
    BackupJob,
    Comment,
    CommentMention,
    IntegrityCheck,
    Notification,
    RestoreJob,
    RetentionPolicy,
    StorageQuota,
)
from app.models.organization import Department, Institution, Secretariat
from app.models.permission import PermissionEntry
from app.models.sharing import (
    ExternalAccessLog,
    ExternalLink,
    ExternalLinkItem,
    ExternalUpload,
    ExternalUploadRequest,
    InternalShare,
)
from app.models.taxonomy import (
    Category,
    CategoryField,
    DocumentTag,
    FolderTag,
    SavedFilter,
    Tag,
)
from app.models.user import Group, RefreshToken, User, UserGroup

__all__ = [
    "Base",
    "Institution",
    "Secretariat",
    "Department",
    "User",
    "Group",
    "UserGroup",
    "RefreshToken",
    "Folder",
    "Document",
    "DocumentVersion",
    "DocumentCustomField",
    "DocumentLock",
    "Favorite",
    "Category",
    "CategoryField",
    "Tag",
    "DocumentTag",
    "FolderTag",
    "SavedFilter",
    "PermissionEntry",
    "InternalShare",
    "ExternalLink",
    "ExternalLinkItem",
    "ExternalAccessLog",
    "ExternalUploadRequest",
    "ExternalUpload",
    "AuditLog",
    "Notification",
    "Comment",
    "CommentMention",
    "ApprovalFlow",
    "ApprovalStep",
    "ApprovalExecution",
    "RetentionPolicy",
    "StorageQuota",
    "BackupJob",
    "BackupExecution",
    "RestoreJob",
    "IntegrityCheck",
]
