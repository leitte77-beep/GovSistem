"""Create GovSocial FASE 7 tables (encaminhamentos e rede)

Revision ID: 007
Revises: 006
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "encaminhamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("case_files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(15), nullable=False),
        sa.Column("unidade_destino_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="SET NULL"), nullable=True),
        sa.Column("profissional_destino_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_aceite", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_devolutiva", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referral_code", sa.String(40), nullable=True),
        sa.Column("instituicao_destino", sa.String(255), nullable=True),
        sa.Column("numero_oficio", sa.Integer(), nullable=True),
        sa.Column("profissional_origem_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_encaminhamento", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'PENDENTE'")),
        sa.Column("devolutiva_enc", sa.Text(), nullable=True),
        sa.Column("motivo_recusa", sa.Text(), nullable=True),
        sa.Column("oficio_gerado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_enc_tenant_casefile", "encaminhamentos", ["tenant_id", "case_file_id"])
    op.create_index("ix_enc_tenant_origem", "encaminhamentos", ["tenant_id", "unit_id"])
    op.create_index("ix_enc_tenant_destino", "encaminhamentos", ["tenant_id", "unidade_destino_id"])
    op.create_index("ix_enc_tenant_status", "encaminhamentos", ["tenant_id", "status"])
    op.create_index("ix_enc_tenant_tipo", "encaminhamentos", ["tenant_id", "tipo"])


def downgrade() -> None:
    op.drop_table("encaminhamentos")
