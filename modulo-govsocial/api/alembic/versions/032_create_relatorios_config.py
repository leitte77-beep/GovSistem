"""Create relatorios_config table (Fases 3.17-3.18)

Revision ID: 032
Revises: 031
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision: str = "032"
down_revision: Union[str, None] = "031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("relatorios_config",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("nome", sa.String(150), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("tags", JSON, nullable=True),
        sa.Column("grupo", sa.String(100), nullable=True),
        sa.Column("icone", sa.String(50), nullable=True),
        sa.Column("fonte_dados", JSON, nullable=False),
        sa.Column("colunas", JSON, nullable=False),
        sa.Column("filtros", JSON, nullable=True),
        sa.Column("agrupamentos", JSON, nullable=True),
        sa.Column("ordenacao", JSON, nullable=True),
        sa.Column("layout", JSON, nullable=True),
        sa.Column("permissoes", JSON, nullable=True),
        sa.Column("compartilhado", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("criado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("relatorios_config")
