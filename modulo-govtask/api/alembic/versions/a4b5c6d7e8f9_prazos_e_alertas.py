"""Motor de prazos: calendário municipal, central de alertas e escalonamento.

Cria os feriados (nacionais fixos já semeados), a central de alertas e a
configuração por organização, e dá chefia e hierarquia ao setor — sem isso o
escalonamento não teria a quem subir.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "feriados",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column("tipo", sa.String(25), nullable=False, server_default="MUNICIPAL"),
        sa.Column("data", sa.Date(), nullable=True),
        sa.Column("dia", sa.Integer(), nullable=True),
        sa.Column("mes", sa.Integer(), nullable=True),
        sa.Column("recorrente_anual", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("conta_como_util", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "data", "nome", name="uq_feriado_org_data_nome"),
    )
    op.create_index("ix_feriados_organization_id", "feriados", ["organization_id"])
    op.create_index("ix_feriados_data", "feriados", ["data"])

    op.create_table(
        "alertas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chave", sa.String(200), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("severidade", sa.String(20), nullable=False, server_default="AVISO"),
        sa.Column("titulo", sa.String(300), nullable=False),
        sa.Column("detalhe", sa.Text(), nullable=True),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tarefa_id", UUID, sa.ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=True),
        sa.Column("responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("setor_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolvido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolvido_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("motivo_resolucao", sa.Text(), nullable=True),
        sa.Column("metadados", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "chave", name="uq_alerta_org_chave"),
    )
    for col in ("organization_id", "chave", "tipo", "severidade", "demanda_id",
                "tarefa_id", "responsavel_id", "resolvido_em"):
        op.create_index(f"ix_alertas_{col}", "alertas", [col])

    op.create_table(
        "alerta_config",
        # `id` vem do TimestampMixin do modelo; usar a organização como chave
        # primária formaria uma PK composta e deixaria passar duas
        # configurações para o mesmo município. A unicidade abaixo é o que
        # sustenta o `scalar_one_or_none` do serviço.
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("marcos_prazo", sa.JSON(), nullable=False),
        sa.Column("escalonamento", sa.JSON(), nullable=False),
        sa.Column("inatividade_dias", sa.JSON(), nullable=False),
        sa.Column("dias_sem_aceite", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("ponto_facultativo_e_util", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ultima_varredura_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultima_varredura_data", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", name="uq_alerta_config_org"),
    )
    op.create_index("ix_alerta_config_organization_id", "alerta_config", ["organization_id"])

    # Escalonamento precisa saber a quem subir; sem chefia, o degrau do setor
    # simplesmente não teria destinatário.
    op.add_column("setores", sa.Column("setor_pai_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True))
    op.add_column("setores", sa.Column("responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))

    _semear_feriados_nacionais()

    # Migra a configuração antiga de escalonamento para a nova escada.
    op.execute(
        sa.text(
            """
            INSERT INTO alerta_config
                (id, organization_id, ativo, marcos_prazo, escalonamento,
                 inatividade_dias, dias_sem_aceite, ponto_facultativo_e_util)
            SELECT gen_random_uuid(), c.organization_id, c.ativo,
                   CAST('[30, 15, 10, 7, 5, 3, 1, 0]' AS JSON),
                   CAST(
                     '[{"dias": ' || c.dia_responsavel || ', "alvo": "RESPONSAVEL"},'
                     || '{"dias": ' || c.dia_coordenador || ', "alvo": "CHEFE_SETOR"},'
                     || '{"dias": ' || c.dia_gestor || ', "alvo": "RESPONSAVEL_GERAL"}]'
                   AS JSON),
                   CAST('[3, 7, 15, 30]' AS JSON), 2, false
            FROM escalonamento_config c
            WHERE c.deleted_at IS NULL
            ON CONFLICT (organization_id) DO NOTHING
            """
        )
    )


def _semear_feriados_nacionais() -> None:
    """Feriados nacionais de data fixa, recorrentes todo ano.

    Os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são calculados a
    partir da Páscoa em `app/services/calendario.py`, e por isso não entram
    como linha de tabela.
    """
    from app.services.calendario import NACIONAIS_FIXOS

    conn = op.get_bind()
    for mes, dia, nome in NACIONAIS_FIXOS:
        conn.execute(
            sa.text(
                "INSERT INTO feriados (id, organization_id, nome, tipo, dia, mes,"
                " recorrente_anual, ativo)"
                " VALUES (gen_random_uuid(), NULL, :nome, 'NACIONAL', :dia, :mes,"
                " true, true)"
            ),
            {"nome": nome, "dia": dia, "mes": mes},
        )


def downgrade() -> None:
    op.drop_column("setores", "responsavel_id")
    op.drop_column("setores", "setor_pai_id")
    op.drop_table("alerta_config")
    op.drop_table("alertas")
    op.drop_table("feriados")
