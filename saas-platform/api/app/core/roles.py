"""Central catalog of per-module roles (RBAC).

This is the single source of truth for "who can do what" inside each module.
A user receives module roles through ``user_module_grants`` and the SSO flow
forwards exactly these role names to the module (no more hard-coded mapping).

The role names for the ``diario`` module must match the seeded ``roles`` table
of the Diário module, so they map 1:1 when synced.
"""

# module_slug -> list of {name, label}
MODULE_ROLE_CATALOG: dict[str, list[dict]] = {
    "diario": [
        {"name": "AUTOR", "label": "Autor — cria e edita matérias"},
        {"name": "REVISOR", "label": "Revisor — revisa e aprova matérias"},
        {"name": "DIAGRAMADOR", "label": "Diagramador — monta e prepara edições"},
        {"name": "ASSINADOR", "label": "Assinador — assina digitalmente edições"},
        {"name": "PUBLICADOR", "label": "Publicador — publica edições"},
        {"name": "AUDITOR", "label": "Auditor — somente leitura de logs"},
        {"name": "DIARIO_ADMIN", "label": "Administrador do módulo"},
    ],
    "financeiro": [
        {"name": "FINANCEIRO_ADMIN", "label": "Administrador financeiro"},
        {"name": "BILLING_MANAGER", "label": "Gestor de cobrança"},
        {"name": "FINANCEIRO_VIEWER", "label": "Consulta — somente leitura"},
    ],
    "chatgov": [
        {"name": "CHATGOV_ADMIN", "label": "Administrador do ChatGov"},
        {"name": "CHATGOV_USER", "label": "Atendente"},
    ],
    "govtask": [
        {"name": "GOVTASK_ADMIN", "label": "Administrador do GovTask"},
        {"name": "ASSESSOR", "label": "Assessor — orquestra convênios, etapas e tarefas"},
        {"name": "ENGENHEIRO_TECNICO", "label": "Engenheiro / Técnico"},
        {"name": "COMPRAS_LICITACAO", "label": "Compras e Licitação"},
        {"name": "GESTOR", "label": "Gestor / Prefeito — somente leitura"},
    ],
    "govfrota": [
        {"name": "ADMIN", "label": "Administrador do GovFrota"},
        {"name": "GESTOR_FROTA", "label": "Gestor da frota"},
        {"name": "RESP_COMBUSTIVEL", "label": "Responsável pelo combustível"},
        {"name": "RESP_MANUTENCAO", "label": "Responsável pela manutenção"},
        {"name": "CONSULTA", "label": "Consulta — somente leitura"},
        {"name": "AUDITOR", "label": "Auditor — leitura e logs de auditoria"},
    ],
    "govsocial": [
        {"name": "GOVSOCIAL_ADMIN", "label": "Administrador do GovSocial"},
        {"name": "gestor_municipal", "label": "Gestor municipal — dashboards, RMA consolidado, configurações"},
        {"name": "coordenador_unidade", "label": "Coordenador de unidade — gestão e fechamento do RMA da unidade"},
        {"name": "tecnico_superior", "label": "Técnico de nível superior — prontuário completo da unidade"},
        {"name": "tecnico_medio", "label": "Técnico de nível médio — grupos, atividades coletivas, visitas"},
        {"name": "recepcao", "label": "Recepção — cadastro de pessoas/famílias, agenda, fila"},
        {"name": "vigilancia", "label": "Vigilância socioassistencial — indicadores, mapas, configurações"},
        {"name": "conselho", "label": "Conselho (CMAS) — relatórios agregados e anonimizados"},
    ],
    "govdoc": [
        {"name": "admin_geral", "label": "Administrador do GovDoc — acesso total ao módulo"},
        {"name": "admin_secretaria", "label": "Administrador de secretaria — gerencia documentos da secretaria"},
        {"name": "gestor_setor", "label": "Gestor de setor — gerencia documentos do setor"},
        {"name": "colaborador", "label": "Colaborador — cria e edita documentos do setor"},
        {"name": "leitor", "label": "Leitor — somente leitura"},
        {"name": "auditor", "label": "Auditor — somente leitura de logs"},
    ],
    "govpro": [
        {"name": "ADMIN", "label": "Administrador do GovPro"},
        {"name": "SERVIDOR", "label": "Servidor — atua nos processos da sua unidade"},
        {"name": "CHEFE_UNIDADE", "label": "Chefe de unidade — atribui e aprova"},
        {"name": "PROTOCOLO", "label": "Protocolo — autua, recebe e distribui"},
        {"name": "ARQUIVISTA", "label": "Arquivista / gestor documental"},
        {"name": "AUDITOR", "label": "Auditor — leitura ampla, sem edição"},
        {"name": "DPO", "label": "Encarregado de dados (DPO)"},
        {"name": "GESTOR_SIGILO", "label": "Gestor de sigilo / autoridade classificadora"},
        {"name": "AUTORIDADE_SIGNATARIA", "label": "Autoridade signatária"},
    ],
    "govavalia": [
        {"name": "GOVAVALIA_ADMIN", "label": "Administrador do GovAvalia"},
        {"name": "GOVAVALIA_GESTOR", "label": "Gestor — analisa resultados agregados"},
        {"name": "GOVAVALIA_OUVIDORIA", "label": "Ouvidoria — trata manifestações"},
    ],
    "govouve": [
        {"name": "GOVOUVE_ADMIN", "label": "Administrador do GovOuve"},
        {"name": "GOVOUVE_GESTOR", "label": "Gestor — analisa resultados agregados"},
        {"name": "GOVOUVE_OUVIDORIA", "label": "Ouvidoria — trata manifestações"},
    ],
}

# Legacy role names mapped to current canonical names.
# Allows old grants (e.g. "ADMIN") to be accepted while normalizing to the
# new prefixed name (e.g. "DIARIO_ADMIN") at write time.
LEGACY_ROLE_MAP: dict[str, dict[str, str]] = {
    "diario": {"ADMIN": "DIARIO_ADMIN"},
    "govtask": {"ADMIN": "GOVTASK_ADMIN"},
    "govsocial": {"ADMIN": "GOVSOCIAL_ADMIN"},
    "govdoc": {"ADMIN": "admin_geral", "AUDITOR": "auditor"},
}


def valid_role_names(module_slug: str) -> set[str]:
    return {r["name"] for r in MODULE_ROLE_CATALOG.get(module_slug, [])}


def is_valid_grant(module_slug: str, role_name: str) -> bool:
    if role_name in valid_role_names(module_slug):
        return True
    legacy = LEGACY_ROLE_MAP.get(module_slug, {})
    return role_name in legacy


def normalize_grant_role(module_slug: str, role_name: str) -> str:
    """Convert legacy role names to current canonical names."""
    legacy = LEGACY_ROLE_MAP.get(module_slug, {})
    return legacy.get(role_name, role_name)


# Role "segura" aplicada quando o gestor aprova um grant placeholder
# (__PENDING_LEGACY__) sem definir uma role concreta. É sempre uma role de
# somente leitura, evitando privilégios indevidos a partir de permissões
# legadas. Se o módulo não tiver uma role de leitura, o gestor precisa
# revisar caso a caso via GrantsModal.
LEGACY_SAFE_ROLE: dict[str, str] = {
    "diario": "AUDITOR",
    "chatgov": "CHATGOV_USER",
    "govtask": "GESTOR",
    "govfrota": "CONSULTA",
    "govsocial": "conselho",
    "govdoc": "leitor",
    "govpro": "AUDITOR",
    "govavalia": "GOVAVALIA_GESTOR",
    "govouve": "GOVOUVE_GESTOR",
    "financeiro": "FINANCEIRO_VIEWER",
}
