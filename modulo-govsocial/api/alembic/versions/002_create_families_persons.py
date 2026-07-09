"""Create GovSocial FASE 2 tables (famílias e pessoas)

Revision ID: 002
Revises: 001
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── persons ───────────────────────────────────────────
    op.create_table(
        "persons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome_civil", sa.String(255), nullable=False),
        sa.Column("nome_social", sa.String(255), nullable=True),
        sa.Column("busca", sa.String(600), nullable=True),
        sa.Column("cpf", sa.String(11), nullable=True),
        sa.Column("nis", sa.String(11), nullable=True),
        sa.Column("data_nascimento", sa.Date(), nullable=True),
        sa.Column("sexo", sa.String(20), nullable=True),
        sa.Column("escolaridade", sa.String(30), nullable=True),
        sa.Column("ocupacao", sa.String(120), nullable=True),
        sa.Column("tipo_deficiencia", sa.String(30), nullable=True),
        sa.Column("deficiencia_detalhe_enc", sa.Text(), nullable=True),
        sa.Column("documentos", postgresql.JSON(), nullable=True),
        sa.Column("is_falecido", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "cpf", name="uq_person_tenant_cpf"),
        sa.UniqueConstraint("tenant_id", "nis", name="uq_person_tenant_nis"),
    )
    op.create_index("ix_persons_tenant_busca", "persons", ["tenant_id", "busca"])
    op.create_index("ix_persons_tenant_nasc", "persons", ["tenant_id", "data_nascimento"])

    # ── families ──────────────────────────────────────────
    op.create_table(
        "families",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("codigo", sa.Integer(), nullable=False),
        sa.Column("responsavel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nis_responsavel", sa.String(11), nullable=True),
        sa.Column("cep", sa.String(8), nullable=True),
        sa.Column("logradouro", sa.String(255), nullable=True),
        sa.Column("numero", sa.String(20), nullable=True),
        sa.Column("complemento", sa.String(120), nullable=True),
        sa.Column("bairro", sa.String(120), nullable=True),
        sa.Column("municipio", sa.String(120), nullable=True),
        sa.Column("uf", sa.String(2), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("geocode_status", sa.String(20), nullable=False, server_default=sa.text("'PENDENTE'")),
        sa.Column("territorio", sa.String(120), nullable=True),
        sa.Column("faixa_renda", sa.String(20), nullable=True),
        sa.Column("no_cadunico", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cadunico_atualizado_em", sa.Date(), nullable=True),
        sa.Column("beneficiaria_pbf", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("possui_bpc", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("inseguranca_alimentar", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("observacoes", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_family_tenant_codigo"),
    )
    op.create_index("ix_families_tenant_codigo", "families", ["tenant_id", "codigo"])
    op.create_index("ix_families_tenant_territorio", "families", ["tenant_id", "territorio"])

    # ── person_family_memberships ─────────────────────────
    op.create_table(
        "person_family_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parentesco", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'ATIVO'")),
        sa.Column("data_entrada", sa.Date(), nullable=False),
        sa.Column("data_saida", sa.Date(), nullable=True),
        sa.Column("motivo_saida", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_membership_tenant_person", "person_family_memberships", ["tenant_id", "person_id"])
    op.create_index("ix_membership_tenant_family", "person_family_memberships", ["tenant_id", "family_id"])
    op.create_index("ix_membership_tenant_status", "person_family_memberships", ["tenant_id", "status"])


def downgrade() -> None:
    op.drop_table("person_family_memberships")
    op.drop_table("families")
    op.drop_table("persons")
