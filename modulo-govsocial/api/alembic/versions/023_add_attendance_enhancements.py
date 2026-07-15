"""Add anonimo, recusado, motivo_recusa to attendances; attendance_encaminhamentos; abordagens_rua (Fase 3.8)

Revision ID: 023
Revises: 022
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attendances", sa.Column("anonimo", sa.Boolean(), nullable=False, server_default="false", comment="Atendimento sem identificacao"))
    op.add_column("attendances", sa.Column("recusado", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("attendances", sa.Column("motivo_recusa", sa.String(200), nullable=True))

    op.create_table(
        "attendance_encaminhamentos",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("attendance_id", sa.UUID(), sa.ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("encaminhamento_id", sa.UUID(), sa.ForeignKey("encaminhamentos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "abordagens_rua",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("unit_id", sa.UUID(), sa.ForeignKey("units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_abordagem", sa.DateTime(timezone=True), nullable=False),
        sa.Column("local", sa.String(255), nullable=True),
        sa.Column("situacao_encontrada", sa.Text(), nullable=True),
        sa.Column("informacoes_parentes", sa.Text(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("anonimo", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("person_id", sa.UUID(), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("registrado_por_user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # PIA: horas MSE (CCXXII)
    op.add_column("pias", sa.Column("horas_totais", sa.Integer(), nullable=True, comment="Horas totais da medida"))
    op.add_column("pias", sa.Column("horas_mensais", sa.Integer(), nullable=True, comment="Horas mensais"))
    op.add_column("pias", sa.Column("horas_cumpridas", sa.Integer(), server_default="0", nullable=True, comment="Horas cumpridas"))
    op.add_column("pias", sa.Column("horas_restantes", sa.Integer(), nullable=True, comment="Horas restantes"))


def downgrade() -> None:
    op.drop_column("pias", "horas_restantes")
    op.drop_column("pias", "horas_cumpridas")
    op.drop_column("pias", "horas_mensais")
    op.drop_column("pias", "horas_totais")
    op.drop_table("abordagens_rua")
    op.drop_table("attendance_encaminhamentos")
    op.drop_column("attendances", "motivo_recusa")
    op.drop_column("attendances", "recusado")
    op.drop_column("attendances", "anonimo")
