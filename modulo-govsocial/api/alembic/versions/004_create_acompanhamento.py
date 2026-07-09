"""Create GovSocial FASE 4 tables (acompanhamento, planos, PIA)

Revision ID: 004
Revises: 003
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── acompanhamentos ───────────────────────────────────
    op.create_table(
        "acompanhamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("data_inicio", sa.Date(), nullable=False),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("motivo_desligamento", sa.String(40), nullable=True),
        sa.Column("situacao", sa.String(20), nullable=False, server_default=sa.text("'ATIVO'")),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("profissional_responsavel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_acomp_tenant_casefile", "acompanhamentos", ["tenant_id", "case_file_id"])
    op.create_index("ix_acomp_tenant_tipo", "acompanhamentos", ["tenant_id", "tipo"])
    op.create_index("ix_acomp_tenant_situacao", "acompanhamentos", ["tenant_id", "situacao"])

    # ── planos_acompanhamento ─────────────────────────────
    op.create_table(
        "planos_acompanhamento",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("acompanhamento_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acompanhamentos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("case_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("diagnostico", sa.Text(), nullable=True),
        sa.Column("vulnerabilidades", sa.Text(), nullable=True),
        sa.Column("potencialidades", sa.Text(), nullable=True),
        sa.Column("objetivos", sa.Text(), nullable=True),
        sa.Column("data_proxima_avaliacao", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plano_tenant_acomp", "planos_acompanhamento", ["tenant_id", "acompanhamento_id"])

    # ── acoes_plano ───────────────────────────────────────
    op.create_table(
        "acoes_plano",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("plano_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("planos_acompanhamento.id", ondelete="CASCADE"), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("responsavel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'PENDENTE'")),
        sa.Column("data_conclusao", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_acao_tenant_plano", "acoes_plano", ["tenant_id", "plano_id"])

    # ── avaliacoes_plano ──────────────────────────────────
    op.create_table(
        "avaliacoes_plano",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("plano_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("planos_acompanhamento.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_avaliacao", sa.Date(), nullable=False),
        sa.Column("avaliador_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("evolucao_enc", sa.Text(), nullable=True),
        sa.Column("resultado", sa.String(20), nullable=False, server_default=sa.text("'PARCIAL'")),
        sa.Column("nova_data_avaliacao", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_aval_tenant_plano", "avaliacoes_plano", ["tenant_id", "plano_id"])

    # ── pias ──────────────────────────────────────────────
    op.create_table(
        "pias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("acompanhamento_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acompanhamentos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("numero_processo", sa.String(120), nullable=False),
        sa.Column("vara", sa.String(120), nullable=True),
        sa.Column("comarca", sa.String(120), nullable=True),
        sa.Column("medida_socioeducativa", sa.String(30), nullable=False),
        sa.Column("prazo_medida", sa.Integer(), nullable=True),
        sa.Column("data_inicio_medida", sa.Date(), nullable=True),
        sa.Column("data_fim_medida", sa.Date(), nullable=True),
        sa.Column("frequencia_cumprimento", sa.String(20), nullable=True),
        sa.Column("dias_cumprimento", postgresql.JSON(), nullable=True),
        sa.Column("objetivos", sa.Text(), nullable=True),
        sa.Column("acoes", postgresql.JSON(), nullable=True),
        sa.Column("proximo_relatorio_judiciario", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pia_tenant_casefile", "pias", ["tenant_id", "case_file_id"])

    # ── relatorios_pia ────────────────────────────────────
    op.create_table(
        "relatorios_pia",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("pia_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pias.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_relatorio", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("elaborado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("texto_enc", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_relpia_tenant_pia", "relatorios_pia", ["tenant_id", "pia_id"])


def downgrade() -> None:
    op.drop_table("relatorios_pia")
    op.drop_table("pias")
    op.drop_table("avaliacoes_plano")
    op.drop_table("acoes_plano")
    op.drop_table("planos_acompanhamento")
    op.drop_table("acompanhamentos")
