"""Migration final: limites de beneficios, assinatura docs, comprovante agendamento

Revision ID: 019
Revises: 018
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Limites de concessao por beneficiario
    op.create_table(
        "limites_beneficio",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("benefit_type_code", sa.String(40), nullable=False),
        sa.Column("tipo_limite", sa.String(20), nullable=False, comment="QUANTITATIVO | FINANCEIRO"),
        sa.Column("valor_maximo", sa.Numeric(12, 2), nullable=False),
        sa.Column("periodo_dias", sa.Integer(), nullable=False, default=365),
        sa.Column("por_familia", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("bloquear_concessao", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_limites_tenant_benefit", "limites_beneficio", ["tenant_id", "benefit_type_code"])

    # SMS config no organization
    op.add_column("organizations", sa.Column("sms_provider", sa.String(30), nullable=True))
    op.add_column("organizations", sa.Column("sms_api_key", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("sms_sender_id", sa.String(20), nullable=True))

    # Comprovante agendamento
    op.add_column("appointments", sa.Column("documentos_necessarios", sa.Text(), nullable=True))
    op.add_column("appointments", sa.Column("local_atendimento", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("appointments", "local_atendimento")
    op.drop_column("appointments", "documentos_necessarios")
    op.drop_column("organizations", "sms_sender_id")
    op.drop_column("organizations", "sms_api_key")
    op.drop_column("organizations", "sms_provider")
    op.drop_table("limites_beneficio")
