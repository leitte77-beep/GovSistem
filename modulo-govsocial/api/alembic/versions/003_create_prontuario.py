"""Create GovSocial FASE 3 tables (prontuário e atendimentos)

Revision ID: 003
Revises: 002
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── case_files ────────────────────────────────────────
    op.create_table(
        "case_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_type_code", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'ATIVO'")),
        sa.Column("acolhida_data", sa.Date(), nullable=True),
        sa.Column("acolhida_access_form_code", sa.String(40), nullable=True),
        sa.Column("acolhida_motivo", sa.Text(), nullable=True),
        sa.Column("acolhida_profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("aberto_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "family_id", "unit_id", "service_type_code", name="uq_case_file_family_unit_service"),
    )
    op.create_index("ix_case_files_tenant_family", "case_files", ["tenant_id", "family_id"])
    op.create_index("ix_case_files_tenant_unit", "case_files", ["tenant_id", "unit_id"])

    # ── attendances ───────────────────────────────────────
    op.create_table(
        "attendances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_type_code", sa.String(40), nullable=False),
        sa.Column("data_atendimento", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("evolution_text_enc", sa.Text(), nullable=True),
        sa.Column("sigiloso_reforcado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("registrado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("registrado_por_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_attendances_tenant_casefile", "attendances", ["tenant_id", "case_file_id"])
    op.create_index("ix_attendances_tenant_data", "attendances", ["tenant_id", "data_atendimento"])
    op.create_index("ix_attendances_tenant_unit", "attendances", ["tenant_id", "unit_id"])

    # ── attendance_members ────────────────────────────────
    op.create_table(
        "attendance_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("attendance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_att_members_tenant_att", "attendance_members", ["tenant_id", "attendance_id"])

    # ── attendance_professionals ──────────────────────────
    op.create_table(
        "attendance_professionals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("attendance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("professional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_att_profs_tenant_att", "attendance_professionals", ["tenant_id", "attendance_id"])

    # ── reception_log ─────────────────────────────────────
    op.create_table(
        "reception_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nome_informado", sa.String(255), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'AGUARDANDO'")),
        sa.Column("senha", sa.String(20), nullable=True),
        sa.Column("atendido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_reception_tenant_unit_data", "reception_log", ["tenant_id", "unit_id", "data"])
    op.create_index("ix_reception_tenant_status", "reception_log", ["tenant_id", "status"])

    # ── case_file_attachments ─────────────────────────────
    op.create_table(
        "case_file_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attendance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("attendances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nome_arquivo", sa.String(500), nullable=False),
        sa.Column("tipo_documento", sa.String(30), nullable=False, server_default=sa.text("'OUTRO'")),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=True),
        sa.Column("tamanho_bytes", sa.BigInteger(), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("enviado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_attachments_tenant_casefile", "case_file_attachments", ["tenant_id", "case_file_id"])
    op.create_index("ix_attachments_tenant_attendance", "case_file_attachments", ["tenant_id", "attendance_id"])


def downgrade() -> None:
    op.drop_table("case_file_attachments")
    op.drop_table("reception_log")
    op.drop_table("attendance_professionals")
    op.drop_table("attendance_members")
    op.drop_table("attendances")
    op.drop_table("case_files")
