"""add matters.document_type (document-model scope) for per-type listing

Revision ID: h5i6j7k8l9m0
Revises: g2a3b4c5d6e7
Create Date: 2026-09-09

Aditiva: adiciona coluna nullable ``document_type`` (edital/portaria/lei/oficio/
decreto/resolucao/outro) em ``matters`` + índice, populada para atos gerados por
modelo documental (nula em matérias legadas). Não altera dados existentes.
Rollback: apenas remove a coluna/índice.
"""

import sqlalchemy as sa
from alembic import op

revision = "h5i6j7k8l9m0"
down_revision = "g2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "matters",
        sa.Column("document_type", sa.String(50), nullable=True),
    )
    op.create_index("ix_matters_document_type", "matters", ["document_type"])


def downgrade() -> None:
    op.drop_index("ix_matters_document_type", table_name="matters")
    op.drop_column("matters", "document_type")
