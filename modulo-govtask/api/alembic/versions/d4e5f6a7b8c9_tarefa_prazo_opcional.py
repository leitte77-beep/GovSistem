"""Tarefa sem prazo: `tarefas.prazo` passa a aceitar nulo (§4, §158).

A v2 promoveu a Tarefa a entidade de fluxo livre: ela pode pender direto da
demanda, sem convênio nem etapa, e sem prazo definido no momento da criação
(§114, criação rápida; §204, campos dinâmicos). O modelo e os testes já tratavam
`prazo` como opcional, mas a migração do núcleo tornou nulos apenas
`convenio_id` e `etapa_id` — a coluna `prazo` continuou `NOT NULL` desde a v1.

O efeito era um erro de banco ao criar tarefa sem prazo, que a suíte em SQLite
não via porque o schema lá é montado pelos metadados. Descoberto ao rodar a suíte
contra PostgreSQL.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "tarefas", "prazo", existing_type=sa.DateTime(timezone=True), nullable=True
    )


def downgrade() -> None:
    # Reverter exige que nenhuma tarefa esteja sem prazo; se houver, o banco
    # recusa e o operador decide o que fazer — não inventamos uma data.
    op.alter_column(
        "tarefas", "prazo", existing_type=sa.DateTime(timezone=True), nullable=False
    )
