"""Tarefas sobre a demanda: tipos, exigências, espera e movimentações.

A tarefa deixa de exigir convênio e etapa: em fluxo livre ela pende direto da
demanda. Ganha natureza (execução, aprovação, revisão, informação), exigências
de retorno/documento/comentário e o registro de cada passagem de mãos, que é o
que permite medir tempo por departamento.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)

NOVAS_COLUNAS = [
    ("tipo", sa.String(20), {"nullable": False, "server_default": "EXECUCAO"}),
    ("setor_origem_id", UUID, {"nullable": True}),
    ("solicitante_id", UUID, {"nullable": True}),
    ("exige_retorno", sa.Boolean(), {"nullable": False, "server_default": sa.true()}),
    ("exige_documento", sa.Boolean(), {"nullable": False, "server_default": sa.false()}),
    ("exige_comentario", sa.Boolean(), {"nullable": False, "server_default": sa.false()}),
    ("exige_aprovacao", sa.Boolean(), {"nullable": False, "server_default": sa.false()}),
    ("permite_reencaminhar", sa.Boolean(), {"nullable": False, "server_default": sa.true()}),
    ("motivo_devolucao", sa.Text(), {"nullable": True}),
    ("motivo_bloqueio", sa.Text(), {"nullable": True}),
    ("motivo_espera", sa.Text(), {"nullable": True}),
    ("resultado", sa.Text(), {"nullable": True}),
    ("concluida_por_id", UUID, {"nullable": True}),
    ("ordem", sa.Integer(), {"nullable": False, "server_default": "0"}),
]


def upgrade() -> None:
    for nome, tipo, kwargs in NOVAS_COLUNAS:
        op.add_column("tarefas", sa.Column(nome, tipo, **kwargs))

    op.create_foreign_key(
        "fk_tarefas_setor_origem", "tarefas", "setores",
        ["setor_origem_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_tarefas_solicitante", "tarefas", "users",
        ["solicitante_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_tarefas_concluida_por", "tarefas", "users",
        ["concluida_por_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_tarefas_tipo", "tarefas", ["tipo"])

    # Fluxo livre: a tarefa pende da demanda, sem convênio nem etapa.
    op.alter_column("tarefas", "convenio_id", nullable=True)
    op.alter_column("tarefas", "etapa_id", nullable=True)

    op.create_table(
        "tarefa_movimentacoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tarefa_id", UUID, sa.ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("de_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("de_setor_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("para_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("para_setor_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("prazo", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exige_retorno", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("registrado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recebido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("encerrado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ("tarefa_id", "demanda_id", "tipo", "para_user_id", "para_setor_id"):
        op.create_index(f"ix_tarefa_movimentacoes_{col}", "tarefa_movimentacoes", [col])

    # Notificação passa a apontar para a demanda; convênio vira opcional.
    op.add_column(
        "notificacoes",
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_notificacoes_demanda_id", "notificacoes", ["demanda_id"])
    op.alter_column("notificacoes", "convenio_id", nullable=True)
    op.execute(
        sa.text(
            "UPDATE notificacoes n SET demanda_id = t.demanda_id "
            "FROM tarefas t WHERE n.tarefa_id = t.id AND t.demanda_id IS NOT NULL"
        )
    )

    # Cada tarefa já existente ganha a movimentação que a originou, para que o
    # histórico não comece vazio em quem já estava trabalhando no módulo.
    op.execute(
        sa.text(
            """
            INSERT INTO tarefa_movimentacoes
                (id, tarefa_id, demanda_id, tipo, de_user_id, para_user_id,
                 para_setor_id, prazo, exige_retorno, registrado_por_id,
                 recebido_em, created_at, updated_at)
            SELECT gen_random_uuid(), t.id, t.demanda_id, 'ATRIBUICAO',
                   t.criada_por_id, t.atribuida_a_id, t.setor_destino_id,
                   t.prazo, true, t.criada_por_id, t.data_aceite,
                   t.created_at, t.created_at
            FROM tarefas t
            WHERE t.deleted_at IS NULL
            """
        )
    )


def downgrade() -> None:
    op.alter_column("notificacoes", "convenio_id", nullable=False)
    op.drop_index("ix_notificacoes_demanda_id", table_name="notificacoes")
    op.drop_column("notificacoes", "demanda_id")
    op.drop_table("tarefa_movimentacoes")
    op.alter_column("tarefas", "etapa_id", nullable=False)
    op.alter_column("tarefas", "convenio_id", nullable=False)
    op.drop_index("ix_tarefas_tipo", table_name="tarefas")
    for nome in ("fk_tarefas_concluida_por", "fk_tarefas_solicitante", "fk_tarefas_setor_origem"):
        op.drop_constraint(nome, "tarefas", type_="foreignkey")
    for nome, _, _ in reversed(NOVAS_COLUNAS):
        op.drop_column("tarefas", nome)
