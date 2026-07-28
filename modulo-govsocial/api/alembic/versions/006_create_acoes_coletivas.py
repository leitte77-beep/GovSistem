"""Create GovSocial FASE 6 tables (ações coletivas e SCFV)

Revision ID: 006
Revises: 005
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "acoes_coletivas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("tipo", sa.String(20), nullable=False, server_default=sa.text("'GRUPO_SCFV'")),
        sa.Column("service_type_code", sa.String(40), nullable=True),
        sa.Column("faixa_etaria", sa.String(20), nullable=True),
        sa.Column("publico_alvo", sa.Text(), nullable=True),
        sa.Column("data_inicio", sa.Date(), nullable=False),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("periodicidade", sa.String(20), nullable=True),
        sa.Column("dia_semana", sa.String(15), nullable=True),
        sa.Column("horario_inicio", sa.Time(), nullable=True),
        sa.Column("horario_fim", sa.Time(), nullable=True),
        sa.Column("local", sa.String(255), nullable=True),
        sa.Column("vagas_total", sa.Integer(), nullable=True),
        sa.Column("vagas_disponiveis", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'ATIVA'")),
        sa.Column("profissional_responsavel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ac_tenant_unit", "acoes_coletivas", ["tenant_id", "unit_id"])
    op.create_index("ix_ac_tenant_tipo", "acoes_coletivas", ["tenant_id", "tipo"])
    op.create_index("ix_ac_tenant_status", "acoes_coletivas", ["tenant_id", "status"])

    op.create_table(
        "inscricoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("acao_coletiva_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acoes_coletivas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_inscricao", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'ATIVA'")),
        sa.Column("motivo_desligamento", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_insc_tenant_acao", "inscricoes", ["tenant_id", "acao_coletiva_id"])
    op.create_index("ix_insc_tenant_person", "inscricoes", ["tenant_id", "person_id"])
    op.create_index("ix_insc_tenant_status", "inscricoes", ["tenant_id", "status"])

    op.create_table(
        "encontros_frequencia",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("acao_coletiva_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acoes_coletivas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_encontro", sa.Date(), nullable=False),
        sa.Column("tema", sa.String(255), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ef_tenant_acao", "encontros_frequencia", ["tenant_id", "acao_coletiva_id"])
    op.create_index("ix_ef_tenant_data", "encontros_frequencia", ["tenant_id", "data_encontro"])

    op.create_table(
        "registros_frequencia",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("encontro_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("encontros_frequencia.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inscricao_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inscricoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("presente", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rf_tenant_encontro", "registros_frequencia", ["tenant_id", "encontro_id"])
    op.create_index("ix_rf_tenant_inscricao", "registros_frequencia", ["tenant_id", "inscricao_id"])


def downgrade() -> None:
    op.drop_table("registros_frequencia")
    op.drop_table("encontros_frequencia")
    op.drop_table("inscricoes")
    op.drop_table("acoes_coletivas")
