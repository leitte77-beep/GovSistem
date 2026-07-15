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
        {"name": "ADMIN", "label": "Administrador do módulo"},
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
        {"name": "ADMIN", "label": "Administrador do GovTask"},
        {"name": "ASSESSOR", "label": "Assessor — orquestra convênios, etapas e tarefas"},
        {"name": "ENGENHEIRO_TECNICO", "label": "Engenheiro / Técnico"},
        {"name": "COMPRAS_LICITACAO", "label": "Compras e Licitação"},
        {"name": "GESTOR", "label": "Gestor / Prefeito — somente leitura"},
    ],
    "govsocial": [
        {"name": "ADMIN", "label": "Administrador do GovSocial"},
        {"name": "gestor_municipal", "label": "Gestor municipal — dashboards, RMA consolidado, configurações"},
        {"name": "coordenador_unidade", "label": "Coordenador de unidade — gestão e fechamento do RMA da unidade"},
        {"name": "tecnico_superior", "label": "Técnico de nível superior — prontuário completo da unidade"},
        {"name": "tecnico_medio", "label": "Técnico de nível médio — grupos, atividades coletivas, visitas"},
        {"name": "recepcao", "label": "Recepção — cadastro de pessoas/famílias, agenda, fila"},
        {"name": "vigilancia", "label": "Vigilância socioassistencial — indicadores, mapas, configurações"},
        {"name": "conselho", "label": "Conselho (CMAS) — relatórios agregados e anonimizados"},
    ],
}


def valid_role_names(module_slug: str) -> set[str]:
    return {r["name"] for r in MODULE_ROLE_CATALOG.get(module_slug, [])}


def is_valid_grant(module_slug: str, role_name: str) -> bool:
    return role_name in valid_role_names(module_slug)
