"""add matter.workflow_status (Fase 5C)

Revision ID: j7k8l9m0n1o2
Revises: i6j7k8l9m0n1
Create Date: 2026-09-11

Aditiva e reversível. Adiciona ``matters.workflow_status`` para acompanhar o
fluxo de criação/revisão do documento (rascunho → gerado pela IA → revisão →
aprovado → assinatura → publicado/cancelado), sem alterar o ``status`` editorial
existente nem os dados já gravados.
"""

import sqlalchemy as sa
from alembic import op

revision = "j7k8l9m0n1o2"
down_revision = "i6j7k8l9m0n1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matters", sa.Column("workflow_status", sa.String(30), nullable=True))
    op.create_index("ix_matters_workflow_status", "matters", ["workflow_status"])


def downgrade() -> None:
    op.drop_index("ix_matters_workflow_status", table_name="matters")
    op.drop_column("matters", "workflow_status")
