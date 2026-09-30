"""Padrão now() em created_at/updated_at de veiculos_tanques.

A 006 criou a tabela sem server_default; o ORM conta com o default do banco
(TimestampMixin usa server_default=func.now()), então todo reservatório criado
pela aplicação — ex.: informar o combustível de um veículo que não tinha —
falhava com NotNullViolation. Só o backfill da própria 006 (que passa NOW()
explícito) funcionava.

Revision ID: 008
Revises: 007
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for coluna in ("created_at", "updated_at"):
        op.alter_column(
            "veiculos_tanques", coluna,
            existing_type=sa.DateTime(timezone=True), server_default=sa.text("now()"),
        )


def downgrade() -> None:
    for coluna in ("created_at", "updated_at"):
        op.alter_column(
            "veiculos_tanques", coluna,
            existing_type=sa.DateTime(timezone=True), server_default=None,
        )
