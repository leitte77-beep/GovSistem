"""Migrate: add foto_url to persons, is_itinerante, auto_acompanhamento config

Revision ID: 016
Revises: 015
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("foto_url", sa.String(1000), nullable=True))
    op.add_column("persons", sa.Column("is_itinerante", sa.Boolean(), nullable=True, server_default=sa.text("false")))

    op.add_column("service_types", sa.Column("auto_incluir_acompanhamento", sa.Boolean(), nullable=True, server_default=sa.text("false")))
    op.add_column("service_types", sa.Column("tipo_acompanhamento_auto", sa.String(20), nullable=True, comment="PAIF | PAEFI"))

    op.add_column("attendances", sa.Column("nome_nao_cadastrado", sa.String(255), nullable=True))
    op.add_column("attendances", sa.Column("incluir_acompanhamento", sa.Boolean(), nullable=True, server_default=sa.text("false")))

    op.add_column("professional_assignments", sa.Column("is_default", sa.Boolean(), nullable=True, server_default=sa.text("false")))

    op.add_column("acoes_coletivas", sa.Column("auto_incluir_acompanhamento", sa.Boolean(), nullable=True, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("acoes_coletivas", "auto_incluir_acompanhamento")
    op.drop_column("professional_assignments", "is_default")
    op.drop_column("attendances", "incluir_acompanhamento")
    op.drop_column("attendances", "nome_nao_cadastrado")
    op.drop_column("service_types", "tipo_acompanhamento_auto")
    op.drop_column("service_types", "auto_incluir_acompanhamento")
    op.drop_column("persons", "is_itinerante")
    op.drop_column("persons", "foto_url")
