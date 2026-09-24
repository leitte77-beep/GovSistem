"""Motivo da parada, relógio da situação, emenda e ajustes da prefeitura.

O Prefeito pergunta sempre a mesma coisa: onde está, há quanto tempo e por
quê. `situacao_desde` responde o "há quanto tempo" sem varrer a timeline;
`motivo_parada` responde o "por quê" de forma estruturada.

Revision ID: 0007_parada_ajustes
Revises: 0006_vai_e_vem
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_parada_ajustes"
down_revision = "0006_vai_e_vem"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pedidos", sa.Column("emenda", sa.String(80), nullable=True))
    op.add_column(
        "pedidos", sa.Column("situacao_desde", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("pedidos", sa.Column("motivo_parada", sa.String(20), nullable=True))
    op.add_column("pedidos", sa.Column("motivo_parada_texto", sa.Text(), nullable=True))
    op.add_column(
        "pedidos", sa.Column("motivo_parada_em", sa.DateTime(timezone=True), nullable=True)
    )

    # Relógio inicial: no setor, desde que o encaminhamento aberto nasceu;
    # fora dele, desde a última movimentação.
    op.execute(
        """
        UPDATE pedidos p SET situacao_desde = COALESCE(
            (SELECT max(e.created_at) FROM encaminhamentos e
              WHERE e.pedido_id = p.id
                AND e.status IN ('AGUARDANDO','EM_EXECUCAO','AGUARDANDO_COMPLEMENTO')),
            p.ultima_movimentacao_em,
            p.created_at
        )
        """
    )
    # Quem já estava esperando terceiro está, por definição, esperando o governo.
    op.execute(
        """
        UPDATE pedidos SET motivo_parada = 'GOVERNO', motivo_parada_em = situacao_desde
         WHERE situacao = 'AGUARDANDO_TERCEIRO'
        """
    )

    op.create_table(
        "ajustes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("dias_alerta_parado", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("resumo_diario", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", name="uq_ajustes_org"),
    )


def downgrade() -> None:
    op.drop_table("ajustes")
    for coluna in (
        "motivo_parada_em",
        "motivo_parada_texto",
        "motivo_parada",
        "situacao_desde",
        "emenda",
    ):
        op.drop_column("pedidos", coluna)
