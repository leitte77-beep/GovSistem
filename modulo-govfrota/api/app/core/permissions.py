"""Catálogo de permissões granulares do GovFrota (RBAC por recurso/ação).

Convenção de nomes: `recurso.acao`, alinhada ao padrão dos demais módulos
da plataforma GovSistem.
"""


class Perm:
    # Veículos
    VEHICLE_VIEW = "vehicle.view"
    VEHICLE_MANAGE = "vehicle.manage"
    # Motoristas (cadastro administrativo e credenciais de acesso)
    DRIVER_MANAGE = "driver.manage"
    # Abastecimentos
    REFUELING_VIEW = "refueling.view"
    REFUELING_MANAGE = "refueling.manage"
    # Combustível: tipos, tanques, entradas, estoque, fornecedores
    FUEL_MANAGE = "fuel.manage"
    # Manutenções e ocorrências
    MAINTENANCE_VIEW = "maintenance.view"
    MAINTENANCE_MANAGE = "maintenance.manage"
    OCCURRENCE_MANAGE = "occurrence.manage"
    # Relatórios / auditoria / configurações
    REPORTS_VIEW = "reports.view"
    AUDIT_VIEW = "audit.view"
    CONFIG_MANAGE = "config.manage"
    # Contratos com postos (preço/saldo) — gestão da frota ou fiscal do contrato
    CONTRACT_MANAGE = "contract.manage"
    # Fechamentos / faturamento com os postos (montar, confirmar, cancelar)
    BILLING_MANAGE = "billing.manage"
    # Atestar (e reabrir o atesto de) fechamentos conciliados
    BILLING_ATTEST = "billing.attest"


ALL_PERMISSIONS = frozenset(
    [
        Perm.VEHICLE_VIEW,
        Perm.VEHICLE_MANAGE,
        Perm.DRIVER_MANAGE,
        Perm.REFUELING_VIEW,
        Perm.REFUELING_MANAGE,
        Perm.FUEL_MANAGE,
        Perm.MAINTENANCE_VIEW,
        Perm.MAINTENANCE_MANAGE,
        Perm.OCCURRENCE_MANAGE,
        Perm.REPORTS_VIEW,
        Perm.AUDIT_VIEW,
        Perm.CONFIG_MANAGE,
        Perm.CONTRACT_MANAGE,
        Perm.BILLING_MANAGE,
        Perm.BILLING_ATTEST,
    ]
)

ROLE_DEFAULT_PERMISSIONS: dict[str, set[str]] = {
    "ADMIN": set(ALL_PERMISSIONS),
    "GESTOR_FROTA": {
        Perm.VEHICLE_VIEW,
        Perm.VEHICLE_MANAGE,
        Perm.DRIVER_MANAGE,
        Perm.REFUELING_VIEW,
        Perm.REFUELING_MANAGE,
        Perm.FUEL_MANAGE,
        Perm.MAINTENANCE_VIEW,
        Perm.MAINTENANCE_MANAGE,
        Perm.OCCURRENCE_MANAGE,
        Perm.REPORTS_VIEW,
        Perm.CONTRACT_MANAGE,
        Perm.BILLING_MANAGE,
        Perm.BILLING_ATTEST,
    },
    # Lança e ajusta a operação do dia a dia, sem configurar o sistema.
    "OPERADOR_FROTA": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.REFUELING_MANAGE,
        Perm.MAINTENANCE_VIEW,
        Perm.OCCURRENCE_MANAGE,
        Perm.REPORTS_VIEW,
    },
    # Restritos às secretarias vinculadas (ver PERFIS_COM_ESCOPO).
    "SECRETARIO": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.MAINTENANCE_VIEW,
        Perm.REPORTS_VIEW,
    },
    "GESTOR_SECRETARIA": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.MAINTENANCE_VIEW,
        Perm.REPORTS_VIEW,
    },
    "FISCAL_CONTRATO": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.REPORTS_VIEW,
        Perm.CONTRACT_MANAGE,
        Perm.BILLING_MANAGE,
        Perm.BILLING_ATTEST,
    },
    "CONTABILIDADE": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.REPORTS_VIEW,
    },
    "RESP_COMBUSTIVEL": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.REFUELING_MANAGE,
        Perm.FUEL_MANAGE,
        Perm.REPORTS_VIEW,
    },
    "RESP_MANUTENCAO": {
        Perm.VEHICLE_VIEW,
        Perm.MAINTENANCE_VIEW,
        Perm.MAINTENANCE_MANAGE,
        Perm.OCCURRENCE_MANAGE,
        Perm.REPORTS_VIEW,
    },
    "CONSULTA": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.MAINTENANCE_VIEW,
        Perm.REPORTS_VIEW,
    },
    "AUDITOR": {
        Perm.VEHICLE_VIEW,
        Perm.REFUELING_VIEW,
        Perm.MAINTENANCE_VIEW,
        Perm.REPORTS_VIEW,
        Perm.AUDIT_VIEW,
    },
}


def default_permissions_for_role(role_name: str) -> set[str]:
    return set(ROLE_DEFAULT_PERMISSIONS.get(role_name, set()))


# Perfis que só enxergam as secretarias vinculadas ao usuário. Sem nenhuma
# secretaria vinculada, não enxergam nada (falha fechada).
PERFIS_COM_ESCOPO = frozenset({"SECRETARIO", "GESTOR_SECRETARIA"})

# Perfis que podem ser atribuídos pela tela de acessos do GovFrota.
PERFIS_ATRIBUIVEIS = {
    "ADMIN": "Administrador",
    "GESTOR_FROTA": "Gestor da Frota",
    "OPERADOR_FROTA": "Operador da Frota",
    "SECRETARIO": "Secretário",
    "GESTOR_SECRETARIA": "Gestor de Secretaria",
    "FISCAL_CONTRATO": "Fiscal do Contrato",
    "CONTABILIDADE": "Contabilidade",
    "AUDITOR": "Auditor",
    "CONSULTA": "Consulta",
}
