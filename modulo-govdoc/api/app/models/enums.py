"""Enumerações de domínio do GovDoc.

Todas são gravadas como texto (string) — legível no banco e estável entre
migrações, sem depender de tipos ENUM nativos do PostgreSQL.
"""

from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:  # pragma: no cover - conveniência
        return self.value


class Profile(StrEnum):
    """Perfis (papéis) iniciais do módulo."""

    ADMIN_GERAL = "admin_geral"
    ADMIN_SECRETARIA = "admin_secretaria"
    GESTOR_SETOR = "gestor_setor"
    COLABORADOR = "colaborador"
    LEITOR = "leitor"
    AUDITOR = "auditor"


class Permission(StrEnum):
    """Permissões específicas verificadas pelo motor de autorização."""

    VIEW = "view"
    VIEW_METADATA = "view_metadata"
    DOWNLOAD = "download"
    UPLOAD = "upload"
    CREATE_FOLDER = "create_folder"
    EDIT_METADATA = "edit_metadata"
    NEW_VERSION = "new_version"
    MOVE = "move"
    COPY = "copy"
    DELETE = "delete"
    RESTORE = "restore"
    SHARE_INTERNAL = "share_internal"
    SHARE_EXTERNAL = "share_external"
    MANAGE_PERMISSIONS = "manage_permissions"
    APPROVE = "approve"
    VIEW_HISTORY = "view_history"
    VIEW_VERSIONS = "view_versions"
    MANAGE_BACKUP = "manage_backup"


class Classification(StrEnum):
    """Classificação de segurança (art. 20 do prompt de especificação)."""

    PUBLICO = "publico"
    INTERNO = "interno"
    RESTRITO = "restrito"
    CONFIDENCIAL = "confidencial"
    SIGILOSO = "sigiloso"


CLASSIFICATION_ORDER = {
    Classification.PUBLICO: 0,
    Classification.INTERNO: 1,
    Classification.RESTRITO: 2,
    Classification.CONFIDENCIAL: 3,
    Classification.SIGILOSO: 4,
}


class ResourceType(StrEnum):
    INSTITUTION = "institution"
    SECRETARIAT = "secretariat"
    DEPARTMENT = "department"
    FOLDER = "folder"
    DOCUMENT = "document"


class SubjectType(StrEnum):
    USER = "user"
    GROUP = "group"
    DEPARTMENT = "department"
    SECRETARIAT = "secretariat"
    PROFILE = "profile"


class PermissionEffect(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class FileStatus(StrEnum):
    """Ciclo de vida físico do arquivo enviado."""

    UPLOADING = "uploading"
    PROCESSING = "processing"
    QUARANTINE = "quarantine"
    SCANNING = "scanning"
    AVAILABLE = "available"
    BLOCKED = "blocked"
    ERROR = "error"


class DocumentStatus(StrEnum):
    """Situação documental / fluxo de aprovação."""

    RASCUNHO = "rascunho"
    AGUARDANDO_REVISAO = "aguardando_revisao"
    EM_REVISAO = "em_revisao"
    AGUARDANDO_APROVACAO = "aguardando_aprovacao"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    ARQUIVADO = "arquivado"
    CANCELADO = "cancelado"


class IndexStatus(StrEnum):
    PENDENTE = "pendente"
    PROCESSANDO = "processando"
    INDEXADO = "indexado"
    FALHOU = "falhou"
    NAO_SUPORTADO = "nao_suportado"


class ExternalRequestStatus(StrEnum):
    RECEBIDO = "recebido"
    EM_ANALISE = "em_analise"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    CORRECAO_SOLICITADA = "correcao_solicitada"
    INCORPORADO = "incorporado"


class BackupType(StrEnum):
    FULL = "full"
    INCREMENTAL = "incremental"
    MANUAL = "manual"


class BackupStatus(StrEnum):
    AGENDADO = "agendado"
    EM_EXECUCAO = "em_execucao"
    CONCLUIDO = "concluido"
    CONCLUIDO_COM_ALERTA = "concluido_com_alerta"
    FALHOU = "falhou"
    CANCELADO = "cancelado"


class RestoreStatus(StrEnum):
    PLANEJADO = "planejado"
    EM_EXECUCAO = "em_execucao"
    CONCLUIDO = "concluido"
    FALHOU = "falhou"
    CANCELADO = "cancelado"


class ConflictStrategy(StrEnum):
    SOBRESCREVER = "sobrescrever"
    NOVA_VERSAO = "nova_versao"
    RENOMEAR = "renomear"
    IGNORAR = "ignorar"


class AuditAction(StrEnum):
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    FOLDER_CREATE = "folder_create"
    FOLDER_UPDATE = "folder_update"
    FOLDER_MOVE = "folder_move"
    FOLDER_DELETE = "folder_delete"
    DOCUMENT_UPLOAD = "document_upload"
    DOCUMENT_VIEW = "document_view"
    DOCUMENT_DOWNLOAD = "document_download"
    DOCUMENT_PRINT = "document_print"
    DOCUMENT_UPDATE = "document_update"
    DOCUMENT_MOVE = "document_move"
    DOCUMENT_COPY = "document_copy"
    DOCUMENT_DELETE = "document_delete"
    DOCUMENT_RESTORE = "document_restore"
    DOCUMENT_PURGE = "document_purge"
    VERSION_CREATE = "version_create"
    VERSION_RESTORE = "version_restore"
    SHARE_CREATE = "share_create"
    SHARE_REVOKE = "share_revoke"
    EXTERNAL_LINK_CREATE = "external_link_create"
    EXTERNAL_LINK_REVOKE = "external_link_revoke"
    EXTERNAL_ACCESS = "external_access"
    EXTERNAL_DOWNLOAD = "external_download"
    EXTERNAL_UPLOAD = "external_upload"
    PERMISSION_CHANGE = "permission_change"
    APPROVAL_DECISION = "approval_decision"
    BACKUP_RUN = "backup_run"
    BACKUP_VERIFY = "backup_verify"
    RESTORE_RUN = "restore_run"
    CONFIG_CHANGE = "config_change"
    ACCESS_DENIED = "access_denied"
    ANTIVIRUS_BLOCK = "antivirus_block"
    SECRETARIAT_CREATE = "secretariat_create"
    SECRETARIAT_UPDATE = "secretariat_update"
    DEPARTMENT_CREATE = "department_create"
    DEPARTMENT_UPDATE = "department_update"
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"


class AuditResult(StrEnum):
    SUCESSO = "sucesso"
    NEGADO = "negado"
    ERRO = "erro"


class NotificationType(StrEnum):
    DOCUMENTO_COMPARTILHADO = "documento_compartilhado"
    NOVA_VERSAO = "nova_versao"
    COMENTARIO = "comentario"
    MENCAO = "mencao"
    APROVACAO_SOLICITADA = "aprovacao_solicitada"
    DOCUMENTO_APROVADO = "documento_aprovado"
    DOCUMENTO_REJEITADO = "documento_rejeitado"
    DOCUMENTO_VENCENDO = "documento_vencendo"
    DOCUMENTO_VENCIDO = "documento_vencido"
    LINK_ACESSADO = "link_acessado"
    LINK_EXPIRANDO = "link_expirando"
    UPLOAD_EXTERNO = "upload_externo"
    BACKUP_FALHOU = "backup_falhou"
    ARMAZENAMENTO_LIMITE = "armazenamento_limite"
    ARQUIVO_BLOQUEADO = "arquivo_bloqueado"


class NotificationState(StrEnum):
    NAO_LIDA = "nao_lida"
    LIDA = "lida"
    ARQUIVADA = "arquivada"


class FieldType(StrEnum):
    TEXTO = "texto"
    TEXTO_LONGO = "texto_longo"
    NUMERO = "numero"
    MOEDA = "moeda"
    DATA = "data"
    BOOLEANO = "booleano"
    SELECAO = "selecao"
    CNPJ = "cnpj"
    CPF = "cpf"
