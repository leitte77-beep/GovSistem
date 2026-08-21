"""Catálogo de permissões granulares do GovTask (RBAC por recurso/ação).

As permissões são a fonte de autorização para operações sensíveis, sobrepostas
ao modelo de roles. Cada role possui um conjunto de permissões configurável
(tabela `role_permissions`), permitindo ao administrador ajustar o acesso sem
alterar código.

Convenção de nomes: `recurso.acao`, em inglês, alinhado à semântica do SaaS.
"""

# ── Catálogo de permissões ──────────────────────────────────────────────────

class Perm:
    RESOURCE_VIEW = "resource.view"
    RESOURCE_CREATE = "resource.create"
    RESOURCE_EDIT = "resource.edit"
    RESOURCE_DELETE = "resource.delete"
    TASK_ASSIGN = "task.assign"
    TASK_APPROVE = "task.approve"
    FINANCIAL_VIEW = "financial.view"
    FINANCIAL_MANAGE = "financial.manage"
    ENGINEERING_MANAGE = "engineering.manage"
    ACCOUNTABILITY_MANAGE = "accountability.manage"
    LICITACAO_MANAGE = "licitacao.manage"
    EXPORT = "export"
    AUDIT_VIEW = "audit.view"
    ADMIN_CONFIG = "admin.config"


ALL_PERMISSIONS = frozenset(
    [
        Perm.RESOURCE_VIEW,
        Perm.RESOURCE_CREATE,
        Perm.RESOURCE_EDIT,
        Perm.RESOURCE_DELETE,
        Perm.TASK_ASSIGN,
        Perm.TASK_APPROVE,
        Perm.FINANCIAL_VIEW,
        Perm.FINANCIAL_MANAGE,
        Perm.ENGINEERING_MANAGE,
        Perm.ACCOUNTABILITY_MANAGE,
        Perm.LICITACAO_MANAGE,
        Perm.EXPORT,
        Perm.AUDIT_VIEW,
        Perm.ADMIN_CONFIG,
    ]
)

# ── Permissões padrão por role (defaults; configurável via role_permissions) ─

ROLE_DEFAULT_PERMISSIONS: dict[str, set[str]] = {
    "ADMIN": set(ALL_PERMISSIONS),
    "ASSESSOR": {
        Perm.RESOURCE_VIEW,
        Perm.RESOURCE_CREATE,
        Perm.RESOURCE_EDIT,
        Perm.RESOURCE_DELETE,
        Perm.TASK_ASSIGN,
        Perm.TASK_APPROVE,
        Perm.FINANCIAL_VIEW,
        Perm.FINANCIAL_MANAGE,
        Perm.ENGINEERING_MANAGE,
        Perm.ACCOUNTABILITY_MANAGE,
        Perm.LICITACAO_MANAGE,
        Perm.EXPORT,
        Perm.AUDIT_VIEW,
    },
    "ENGENHEIRO_TECNICO": {
        Perm.RESOURCE_VIEW,
        Perm.ENGINEERING_MANAGE,
        Perm.EXPORT,
    },
    "COMPRAS_LICITACAO": {
        Perm.RESOURCE_VIEW,
        Perm.LICITACAO_MANAGE,
        Perm.TASK_ASSIGN,
        Perm.EXPORT,
    },
    "GESTOR": {
        Perm.RESOURCE_VIEW,
        Perm.FINANCIAL_VIEW,
        Perm.EXPORT,
    },
}


def default_permissions_for_role(role_name: str) -> set[str]:
    """Permissões padrão de uma role, usadas como fallback.

    Roles sem nenhuma linha em `role_permissions` (criadas antes do RBAC
    granular ou provisionadas pelo SaaS) caem neste mapa, para que a migração
    de `require_roles` para `require_permission` não retire acesso de quem já
    trabalhava no módulo.
    """
    return set(ROLE_DEFAULT_PERMISSIONS.get(role_name, set()))
