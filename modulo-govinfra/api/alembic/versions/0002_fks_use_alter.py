"""correção: FKs use_alter ausentes da migration inicial

O autogenerate do Alembic renderiza ForeignKeyConstraint(use_alter=True)
dentro de op.create_table, mas o PostgreSQL descarta essas constraints no
CREATE TABLE (são criadas via ALTER pelo SQLAlchemy). Esta migration cria
as 100 constraints que ficaram de fora.

Revision ID: 0002_fks_use_alter
Revises: 4f18b0246ef2
Create Date: 2026-08-04
"""

from alembic import op

revision = "0002_fks_use_alter"
down_revision = "4f18b0246ef2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_govinfra_additional_hour_requests_created_by_id", "govinfra_additional_hour_requests", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_additional_hour_requests_updated_by_id", "govinfra_additional_hour_requests", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_block_reasons_created_by_id", "govinfra_block_reasons", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_block_reasons_updated_by_id", "govinfra_block_reasons", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_blocked_dates_created_by_id", "govinfra_blocked_dates", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_blocked_dates_updated_by_id", "govinfra_blocked_dates", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_blocks_created_by_id", "govinfra_blocks", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_blocks_updated_by_id", "govinfra_blocks", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_deliveries_created_by_id", "govinfra_dumpster_deliveries", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_deliveries_updated_by_id", "govinfra_dumpster_deliveries", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_pickups_created_by_id", "govinfra_dumpster_pickups", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_pickups_updated_by_id", "govinfra_dumpster_pickups", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_requests_created_by_id", "govinfra_dumpster_requests", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_requests_deleted_by_id", "govinfra_dumpster_requests", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_requests_updated_by_id", "govinfra_dumpster_requests", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_status_history_created_by_id", "govinfra_dumpster_status_history", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpster_status_history_updated_by_id", "govinfra_dumpster_status_history", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpsters_created_by_id", "govinfra_dumpsters", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpsters_deleted_by_id", "govinfra_dumpsters", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_dumpsters_updated_by_id", "govinfra_dumpsters", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_files_created_by_id", "govinfra_files", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_files_deleted_by_id", "govinfra_files", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_files_updated_by_id", "govinfra_files", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_fuel_movements_created_by_id", "govinfra_fuel_movements", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_fuel_movements_updated_by_id", "govinfra_fuel_movements", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_fuel_tanks_created_by_id", "govinfra_fuel_tanks", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_fuel_tanks_deleted_by_id", "govinfra_fuel_tanks", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_fuel_tanks_updated_by_id", "govinfra_fuel_tanks", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_hour_balances_created_by_id", "govinfra_hour_balances", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_hour_balances_updated_by_id", "govinfra_hour_balances", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_hour_transactions_created_by_id", "govinfra_hour_transactions", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_hour_transactions_updated_by_id", "govinfra_hour_transactions", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_inspections_created_by_id", "govinfra_inspections", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_inspections_deleted_by_id", "govinfra_inspections", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_inspections_updated_by_id", "govinfra_inspections", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_machine_categories_created_by_id", "govinfra_machine_categories", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_machine_categories_updated_by_id", "govinfra_machine_categories", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_machines_created_by_id", "govinfra_machines", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_machines_deleted_by_id", "govinfra_machines", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_machines_updated_by_id", "govinfra_machines", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_maintenance_plans_created_by_id", "govinfra_maintenance_plans", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_maintenance_plans_deleted_by_id", "govinfra_maintenance_plans", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_maintenance_plans_updated_by_id", "govinfra_maintenance_plans", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_maintenances_created_by_id", "govinfra_maintenances", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_maintenances_deleted_by_id", "govinfra_maintenances", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_maintenances_updated_by_id", "govinfra_maintenances", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_meter_readings_created_by_id", "govinfra_meter_readings", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_meter_readings_updated_by_id", "govinfra_meter_readings", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_operator_qualifications_created_by_id", "govinfra_operator_qualifications", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_operator_qualifications_deleted_by_id", "govinfra_operator_qualifications", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_operator_qualifications_updated_by_id", "govinfra_operator_qualifications", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_organizacoes_deleted_by_id", "govinfra_organizacoes", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_people_created_by_id", "govinfra_people", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_people_deleted_by_id", "govinfra_people", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_people_updated_by_id", "govinfra_people", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_person_properties_created_by_id", "govinfra_person_properties", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_person_properties_updated_by_id", "govinfra_person_properties", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_program_beneficiaries_created_by_id", "govinfra_program_beneficiaries", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_program_beneficiaries_deleted_by_id", "govinfra_program_beneficiaries", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_program_beneficiaries_updated_by_id", "govinfra_program_beneficiaries", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_programs_created_by_id", "govinfra_programs", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_programs_deleted_by_id", "govinfra_programs", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_programs_updated_by_id", "govinfra_programs", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_properties_created_by_id", "govinfra_properties", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_properties_deleted_by_id", "govinfra_properties", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_properties_updated_by_id", "govinfra_properties", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_refuelings_created_by_id", "govinfra_refuelings", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_refuelings_deleted_by_id", "govinfra_refuelings", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_refuelings_updated_by_id", "govinfra_refuelings", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_regioes_created_by_id", "govinfra_regioes", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_regioes_updated_by_id", "govinfra_regioes", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_service_requests_created_by_id", "govinfra_service_requests", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_service_requests_deleted_by_id", "govinfra_service_requests", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_service_requests_updated_by_id", "govinfra_service_requests", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_service_types_created_by_id", "govinfra_service_types", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_service_types_updated_by_id", "govinfra_service_types", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_settings_created_by_id", "govinfra_settings", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_settings_updated_by_id", "govinfra_settings", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_signatures_created_by_id", "govinfra_signatures", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_signatures_updated_by_id", "govinfra_signatures", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_status_history_created_by_id", "govinfra_status_history", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_status_history_updated_by_id", "govinfra_status_history", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_trips_created_by_id", "govinfra_trips", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_trips_updated_by_id", "govinfra_trips", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_users_deleted_by_id", "govinfra_users", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_users_organizacao_id", "govinfra_users", "govinfra_organizacoes", ["organizacao_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_govinfra_vehicles_created_by_id", "govinfra_vehicles", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_vehicles_deleted_by_id", "govinfra_vehicles", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_vehicles_updated_by_id", "govinfra_vehicles", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_waste_types_created_by_id", "govinfra_waste_types", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_waste_types_updated_by_id", "govinfra_waste_types", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_logs_created_by_id", "govinfra_work_logs", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_logs_updated_by_id", "govinfra_work_logs", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_order_equipment_created_by_id", "govinfra_work_order_equipment", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_order_equipment_updated_by_id", "govinfra_work_order_equipment", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_order_vehicles_created_by_id", "govinfra_work_order_vehicles", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_order_vehicles_updated_by_id", "govinfra_work_order_vehicles", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_orders_created_by_id", "govinfra_work_orders", "govinfra_users", ["created_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_orders_deleted_by_id", "govinfra_work_orders", "govinfra_users", ["deleted_by_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_govinfra_work_orders_updated_by_id", "govinfra_work_orders", "govinfra_users", ["updated_by_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_govinfra_additional_hour_requests_created_by_id", "govinfra_additional_hour_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_additional_hour_requests_updated_by_id", "govinfra_additional_hour_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_block_reasons_created_by_id", "govinfra_block_reasons", type_="foreignkey")
    op.drop_constraint("fk_govinfra_block_reasons_updated_by_id", "govinfra_block_reasons", type_="foreignkey")
    op.drop_constraint("fk_govinfra_blocked_dates_created_by_id", "govinfra_blocked_dates", type_="foreignkey")
    op.drop_constraint("fk_govinfra_blocked_dates_updated_by_id", "govinfra_blocked_dates", type_="foreignkey")
    op.drop_constraint("fk_govinfra_blocks_created_by_id", "govinfra_blocks", type_="foreignkey")
    op.drop_constraint("fk_govinfra_blocks_updated_by_id", "govinfra_blocks", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_deliveries_created_by_id", "govinfra_dumpster_deliveries", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_deliveries_updated_by_id", "govinfra_dumpster_deliveries", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_pickups_created_by_id", "govinfra_dumpster_pickups", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_pickups_updated_by_id", "govinfra_dumpster_pickups", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_requests_created_by_id", "govinfra_dumpster_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_requests_deleted_by_id", "govinfra_dumpster_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_requests_updated_by_id", "govinfra_dumpster_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_status_history_created_by_id", "govinfra_dumpster_status_history", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpster_status_history_updated_by_id", "govinfra_dumpster_status_history", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpsters_created_by_id", "govinfra_dumpsters", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpsters_deleted_by_id", "govinfra_dumpsters", type_="foreignkey")
    op.drop_constraint("fk_govinfra_dumpsters_updated_by_id", "govinfra_dumpsters", type_="foreignkey")
    op.drop_constraint("fk_govinfra_files_created_by_id", "govinfra_files", type_="foreignkey")
    op.drop_constraint("fk_govinfra_files_deleted_by_id", "govinfra_files", type_="foreignkey")
    op.drop_constraint("fk_govinfra_files_updated_by_id", "govinfra_files", type_="foreignkey")
    op.drop_constraint("fk_govinfra_fuel_movements_created_by_id", "govinfra_fuel_movements", type_="foreignkey")
    op.drop_constraint("fk_govinfra_fuel_movements_updated_by_id", "govinfra_fuel_movements", type_="foreignkey")
    op.drop_constraint("fk_govinfra_fuel_tanks_created_by_id", "govinfra_fuel_tanks", type_="foreignkey")
    op.drop_constraint("fk_govinfra_fuel_tanks_deleted_by_id", "govinfra_fuel_tanks", type_="foreignkey")
    op.drop_constraint("fk_govinfra_fuel_tanks_updated_by_id", "govinfra_fuel_tanks", type_="foreignkey")
    op.drop_constraint("fk_govinfra_hour_balances_created_by_id", "govinfra_hour_balances", type_="foreignkey")
    op.drop_constraint("fk_govinfra_hour_balances_updated_by_id", "govinfra_hour_balances", type_="foreignkey")
    op.drop_constraint("fk_govinfra_hour_transactions_created_by_id", "govinfra_hour_transactions", type_="foreignkey")
    op.drop_constraint("fk_govinfra_hour_transactions_updated_by_id", "govinfra_hour_transactions", type_="foreignkey")
    op.drop_constraint("fk_govinfra_inspections_created_by_id", "govinfra_inspections", type_="foreignkey")
    op.drop_constraint("fk_govinfra_inspections_deleted_by_id", "govinfra_inspections", type_="foreignkey")
    op.drop_constraint("fk_govinfra_inspections_updated_by_id", "govinfra_inspections", type_="foreignkey")
    op.drop_constraint("fk_govinfra_machine_categories_created_by_id", "govinfra_machine_categories", type_="foreignkey")
    op.drop_constraint("fk_govinfra_machine_categories_updated_by_id", "govinfra_machine_categories", type_="foreignkey")
    op.drop_constraint("fk_govinfra_machines_created_by_id", "govinfra_machines", type_="foreignkey")
    op.drop_constraint("fk_govinfra_machines_deleted_by_id", "govinfra_machines", type_="foreignkey")
    op.drop_constraint("fk_govinfra_machines_updated_by_id", "govinfra_machines", type_="foreignkey")
    op.drop_constraint("fk_govinfra_maintenance_plans_created_by_id", "govinfra_maintenance_plans", type_="foreignkey")
    op.drop_constraint("fk_govinfra_maintenance_plans_deleted_by_id", "govinfra_maintenance_plans", type_="foreignkey")
    op.drop_constraint("fk_govinfra_maintenance_plans_updated_by_id", "govinfra_maintenance_plans", type_="foreignkey")
    op.drop_constraint("fk_govinfra_maintenances_created_by_id", "govinfra_maintenances", type_="foreignkey")
    op.drop_constraint("fk_govinfra_maintenances_deleted_by_id", "govinfra_maintenances", type_="foreignkey")
    op.drop_constraint("fk_govinfra_maintenances_updated_by_id", "govinfra_maintenances", type_="foreignkey")
    op.drop_constraint("fk_govinfra_meter_readings_created_by_id", "govinfra_meter_readings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_meter_readings_updated_by_id", "govinfra_meter_readings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_operator_qualifications_created_by_id", "govinfra_operator_qualifications", type_="foreignkey")
    op.drop_constraint("fk_govinfra_operator_qualifications_deleted_by_id", "govinfra_operator_qualifications", type_="foreignkey")
    op.drop_constraint("fk_govinfra_operator_qualifications_updated_by_id", "govinfra_operator_qualifications", type_="foreignkey")
    op.drop_constraint("fk_govinfra_organizacoes_deleted_by_id", "govinfra_organizacoes", type_="foreignkey")
    op.drop_constraint("fk_govinfra_people_created_by_id", "govinfra_people", type_="foreignkey")
    op.drop_constraint("fk_govinfra_people_deleted_by_id", "govinfra_people", type_="foreignkey")
    op.drop_constraint("fk_govinfra_people_updated_by_id", "govinfra_people", type_="foreignkey")
    op.drop_constraint("fk_govinfra_person_properties_created_by_id", "govinfra_person_properties", type_="foreignkey")
    op.drop_constraint("fk_govinfra_person_properties_updated_by_id", "govinfra_person_properties", type_="foreignkey")
    op.drop_constraint("fk_govinfra_program_beneficiaries_created_by_id", "govinfra_program_beneficiaries", type_="foreignkey")
    op.drop_constraint("fk_govinfra_program_beneficiaries_deleted_by_id", "govinfra_program_beneficiaries", type_="foreignkey")
    op.drop_constraint("fk_govinfra_program_beneficiaries_updated_by_id", "govinfra_program_beneficiaries", type_="foreignkey")
    op.drop_constraint("fk_govinfra_programs_created_by_id", "govinfra_programs", type_="foreignkey")
    op.drop_constraint("fk_govinfra_programs_deleted_by_id", "govinfra_programs", type_="foreignkey")
    op.drop_constraint("fk_govinfra_programs_updated_by_id", "govinfra_programs", type_="foreignkey")
    op.drop_constraint("fk_govinfra_properties_created_by_id", "govinfra_properties", type_="foreignkey")
    op.drop_constraint("fk_govinfra_properties_deleted_by_id", "govinfra_properties", type_="foreignkey")
    op.drop_constraint("fk_govinfra_properties_updated_by_id", "govinfra_properties", type_="foreignkey")
    op.drop_constraint("fk_govinfra_refuelings_created_by_id", "govinfra_refuelings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_refuelings_deleted_by_id", "govinfra_refuelings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_refuelings_updated_by_id", "govinfra_refuelings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_regioes_created_by_id", "govinfra_regioes", type_="foreignkey")
    op.drop_constraint("fk_govinfra_regioes_updated_by_id", "govinfra_regioes", type_="foreignkey")
    op.drop_constraint("fk_govinfra_service_requests_created_by_id", "govinfra_service_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_service_requests_deleted_by_id", "govinfra_service_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_service_requests_updated_by_id", "govinfra_service_requests", type_="foreignkey")
    op.drop_constraint("fk_govinfra_service_types_created_by_id", "govinfra_service_types", type_="foreignkey")
    op.drop_constraint("fk_govinfra_service_types_updated_by_id", "govinfra_service_types", type_="foreignkey")
    op.drop_constraint("fk_govinfra_settings_created_by_id", "govinfra_settings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_settings_updated_by_id", "govinfra_settings", type_="foreignkey")
    op.drop_constraint("fk_govinfra_signatures_created_by_id", "govinfra_signatures", type_="foreignkey")
    op.drop_constraint("fk_govinfra_signatures_updated_by_id", "govinfra_signatures", type_="foreignkey")
    op.drop_constraint("fk_govinfra_status_history_created_by_id", "govinfra_status_history", type_="foreignkey")
    op.drop_constraint("fk_govinfra_status_history_updated_by_id", "govinfra_status_history", type_="foreignkey")
    op.drop_constraint("fk_govinfra_trips_created_by_id", "govinfra_trips", type_="foreignkey")
    op.drop_constraint("fk_govinfra_trips_updated_by_id", "govinfra_trips", type_="foreignkey")
    op.drop_constraint("fk_govinfra_users_deleted_by_id", "govinfra_users", type_="foreignkey")
    op.drop_constraint("fk_govinfra_users_organizacao_id", "govinfra_users", type_="foreignkey")
    op.drop_constraint("fk_govinfra_vehicles_created_by_id", "govinfra_vehicles", type_="foreignkey")
    op.drop_constraint("fk_govinfra_vehicles_deleted_by_id", "govinfra_vehicles", type_="foreignkey")
    op.drop_constraint("fk_govinfra_vehicles_updated_by_id", "govinfra_vehicles", type_="foreignkey")
    op.drop_constraint("fk_govinfra_waste_types_created_by_id", "govinfra_waste_types", type_="foreignkey")
    op.drop_constraint("fk_govinfra_waste_types_updated_by_id", "govinfra_waste_types", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_logs_created_by_id", "govinfra_work_logs", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_logs_updated_by_id", "govinfra_work_logs", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_order_equipment_created_by_id", "govinfra_work_order_equipment", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_order_equipment_updated_by_id", "govinfra_work_order_equipment", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_order_vehicles_created_by_id", "govinfra_work_order_vehicles", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_order_vehicles_updated_by_id", "govinfra_work_order_vehicles", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_orders_created_by_id", "govinfra_work_orders", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_orders_deleted_by_id", "govinfra_work_orders", type_="foreignkey")
    op.drop_constraint("fk_govinfra_work_orders_updated_by_id", "govinfra_work_orders", type_="foreignkey")
