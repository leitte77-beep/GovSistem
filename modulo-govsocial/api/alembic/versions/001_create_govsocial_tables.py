"""Create GovSocial FASE 1 tables (fundação multi-tenant)

Revision ID: 001
Revises:
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _domain_columns() -> list:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("source", sa.String(10), nullable=False, server_default=sa.text("'NACIONAL'")),
        sa.Column("vigencia_inicio", sa.Date(), nullable=False),
        sa.Column("vigencia_fim", sa.Date(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # ── Auth ──────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("cnpj", sa.String(18), unique=True, nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("brasao_url", sa.String(500), nullable=True),
        sa.Column("theme_config", postgresql.JSON(), nullable=True),
        sa.Column("public_url", sa.String(255), nullable=True),
        sa.Column("settings", postgresql.JSON(), nullable=True),
        sa.Column("suporte_consentido", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("cpf", sa.String(11), nullable=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("mfa_secret", sa.Text(), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_failures", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "cpf", name="uq_user_org_cpf"),
    )

    op.create_table(
        "user_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Units ─────────────────────────────────────────────
    op.create_table(
        "units",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("cnpj", sa.String(18), nullable=True),
        sa.Column("telefone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("cep", sa.String(8), nullable=True),
        sa.Column("logradouro", sa.String(255), nullable=True),
        sa.Column("numero", sa.String(20), nullable=True),
        sa.Column("complemento", sa.String(120), nullable=True),
        sa.Column("bairro", sa.String(120), nullable=True),
        sa.Column("municipio", sa.String(120), nullable=True),
        sa.Column("uf", sa.String(2), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("territorios", postgresql.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_units_tenant_tipo", "units", ["tenant_id", "tipo"])
    op.create_index("ix_units_tenant_nome", "units", ["tenant_id", "nome"])

    # ── Professionals ─────────────────────────────────────
    op.create_table(
        "professionals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("cpf", sa.String(11), nullable=False),
        sa.Column("funcao_nob_rh", sa.String(120), nullable=True),
        sa.Column("conselho_classe_tipo", sa.String(20), nullable=True),
        sa.Column("conselho_classe_numero", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("telefone", sa.String(20), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "cpf", name="uq_professional_tenant_cpf"),
    )
    op.create_index("ix_professionals_tenant_nome", "professionals", ["tenant_id", "nome"])

    op.create_table(
        "professional_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("professional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("funcao_no_local", sa.String(120), nullable=True),
        sa.Column("data_inicio", sa.Date(), nullable=False),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_assignments_tenant_prof", "professional_assignments", ["tenant_id", "professional_id"])
    op.create_index("ix_assignments_tenant_unit", "professional_assignments", ["tenant_id", "unit_id"])

    # ── Domínios versionados ──────────────────────────────
    op.create_table("service_types", *_domain_columns(),
        sa.Column("sigla", sa.String(30), nullable=True),
        sa.Column("protecao", sa.String(20), nullable=True),
        sa.UniqueConstraint("tenant_id", "code", "vigencia_inicio", name="uq_service_type_vigencia"),
    )
    op.create_index("ix_service_types_tenant_ativo", "service_types", ["tenant_id", "ativo"])

    op.create_table("access_forms", *_domain_columns(),
        sa.UniqueConstraint("tenant_id", "code", "vigencia_inicio", name="uq_access_form_vigencia"),
    )
    op.create_index("ix_access_forms_tenant_ativo", "access_forms", ["tenant_id", "ativo"])

    op.create_table("referral_codes", *_domain_columns(),
        sa.Column("area", sa.String(30), nullable=True),
        sa.UniqueConstraint("tenant_id", "code", "vigencia_inicio", name="uq_referral_code_vigencia"),
    )
    op.create_index("ix_referral_codes_tenant_ativo", "referral_codes", ["tenant_id", "ativo"])

    op.create_table("benefit_types", *_domain_columns(),
        sa.Column("categoria", sa.String(20), nullable=True),
        sa.Column("unidade_medida", sa.String(30), nullable=True),
        sa.Column("exige_parecer", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("periodicidade_max_dias", sa.Integer(), nullable=True),
        sa.UniqueConstraint("tenant_id", "code", "vigencia_inicio", name="uq_benefit_type_vigencia"),
    )
    op.create_index("ix_benefit_types_tenant_ativo", "benefit_types", ["tenant_id", "ativo"])

    # ── Audit trail (append-only) ─────────────────────────
    op.create_table(
        "audit_trail",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_role", sa.String(60), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("access_type", sa.String(20), nullable=False, server_default=sa.text("'WRITE'")),
        sa.Column("entity", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.String(60), nullable=True),
        sa.Column("ip_address", sa.String(60), nullable=True),
        sa.Column("origin", sa.String(255), nullable=True),
        sa.Column("request_id", sa.String(60), nullable=True),
        sa.Column("diff_summary", postgresql.JSON(), nullable=True),
    )
    op.create_index("ix_audit_tenant_occurred", "audit_trail", ["tenant_id", "occurred_at"])
    op.create_index("ix_audit_tenant_entity", "audit_trail", ["tenant_id", "entity", "entity_id"])
    op.create_index("ix_audit_tenant_actor", "audit_trail", ["tenant_id", "actor_user_id"])

    # Proteção append-only: bloqueia UPDATE/DELETE via trigger (defesa em profundidade).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION govsocial_audit_block_mutations()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_trail é append-only: % não permitido', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_block_mutations
        BEFORE UPDATE OR DELETE ON audit_trail
        FOR EACH ROW EXECUTE FUNCTION govsocial_audit_block_mutations();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_block_mutations ON audit_trail;")
    op.execute("DROP FUNCTION IF EXISTS govsocial_audit_block_mutations();")
    op.drop_table("audit_trail")
    op.drop_table("benefit_types")
    op.drop_table("referral_codes")
    op.drop_table("access_forms")
    op.drop_table("service_types")
    op.drop_table("professional_assignments")
    op.drop_table("professionals")
    op.drop_table("units")
    op.drop_table("refresh_tokens")
    op.drop_table("user_roles")
    op.drop_table("users")
    op.drop_table("roles")
    op.drop_table("organizations")
