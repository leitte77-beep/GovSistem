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
