"""Registro de uso de veículos (diário de bordo): saída/chegada com foto do painel.

Revision ID: 026
Revises: 025
Create Date: 2026-10-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usos_veiculo",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("veiculo_id", UUID(as_uuid=True), sa.ForeignKey("veiculos.id"), nullable=False),
        sa.Column("motorista_id", UUID(as_uuid=True), sa.ForeignKey("motoristas.id"), nullable=False),
        sa.Column("unidade_id", UUID(as_uuid=True), sa.ForeignKey("unidades.id"), nullable=True),
        sa.Column("finalidade", sa.Text(), nullable=False),
        sa.Column("destino", sa.String(255), nullable=False),
        sa.Column("usa_horimetro", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("saida_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("medicao_saida", sa.Numeric(14, 1), nullable=False),
        sa.Column("foto_saida_url", sa.String(500), nullable=True),
        sa.Column("chegada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("medicao_chegada", sa.Numeric(14, 1), nullable=True),
        sa.Column("foto_chegada_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), server_default="EM_USO", nullable=False),
        sa.Column("origem", sa.String(20), server_default="APP_MOTORISTA", nullable=False),
        sa.Column("registrado_por_usuario_id", UUID(as_uuid=True), nullable=True),
        sa.Column("encerrado_por_usuario_id", UUID(as_uuid=True), nullable=True),
        sa.Column("motivo_encerramento", sa.Text(), nullable=True),
        sa.Column("alertas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_usos_veiculo_organization_id", "usos_veiculo", ["organization_id"])
    op.create_index("ix_usos_veiculo_unidade_id", "usos_veiculo", ["unidade_id"])
    op.create_index("ix_uso_org_saida", "usos_veiculo", ["organization_id", "saida_em"])
    op.create_index("ix_uso_org_status", "usos_veiculo", ["organization_id", "status"])
    op.create_index("ix_uso_veiculo", "usos_veiculo", ["veiculo_id"])
    op.create_index("ix_uso_motorista", "usos_veiculo", ["motorista_id"])
    # Um uso aberto por veículo e por motorista — garantido no banco, não só na API.
    op.execute("CREATE UNIQUE INDEX uq_uso_aberto_veiculo ON usos_veiculo (veiculo_id) WHERE status = 'EM_USO'")
    op.execute("CREATE UNIQUE INDEX uq_uso_aberto_motorista ON usos_veiculo (motorista_id) WHERE status = 'EM_USO'")


def downgrade() -> None:
    op.drop_table("usos_veiculo")
