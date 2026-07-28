"""Create acolhimentos and vagas_acolhimento (Fase 3.10)

Revision ID: 027
Revises: 026
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("acolhimentos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("unit_id", sa.UUID(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", sa.UUID(), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=True),
        sa.Column("family_id", sa.UUID(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("publico", sa.String(30), nullable=True),
        sa.Column("motivo_acolhimento_id", sa.UUID(), nullable=True),
        sa.Column("motivo_encerramento_id", sa.UUID(), nullable=True),
        sa.Column("instituicao", sa.String(150), nullable=True),
        sa.Column("data_inicio", sa.DateTime(), nullable=False),
        sa.Column("data_fim", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ATIVO"),
        sa.Column("reincidente", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("motivo_reincidencia", sa.String(200), nullable=True),
        sa.Column("detalhamento", sa.Text(), nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("vagas_acolhimento",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("unit_id", sa.UUID(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("vagas_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("vagas_ocupadas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("vagas_acolhimento")
    op.drop_table("acolhimentos")
