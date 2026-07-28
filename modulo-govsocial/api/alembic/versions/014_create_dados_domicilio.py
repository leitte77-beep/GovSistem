"""Create GovSocial dados_domicilio table

Revision ID: 014
Revises: 013
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dados_domicilio",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tipo_construcao", sa.String(30), nullable=True),
        sa.Column("abastecimento_agua", sa.String(30), nullable=True),
        sa.Column("iluminacao_eletrica", sa.Boolean(), nullable=True),
        sa.Column("destino_lixo", sa.String(30), nullable=True),
        sa.Column("escoamento_sanitario", sa.String(30), nullable=True),
        sa.Column("total_comodos", sa.Integer(), nullable=True),
        sa.Column("total_dormitorios", sa.Integer(), nullable=True),
        sa.Column("tipo_domicilio", sa.String(30), nullable=True),
        sa.Column("acesso_pavimentacao", sa.Boolean(), nullable=True),
        sa.Column("material_piso", sa.String(30), nullable=True),
        sa.Column("total_pessoas", sa.Integer(), nullable=True),
        sa.Column("total_mulheres_gravidas", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_maes_amamentando", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_pessoas_deficiencia", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("total_idosos", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("dados_domicilio")
