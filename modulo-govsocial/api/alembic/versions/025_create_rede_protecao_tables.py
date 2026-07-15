"""Create notificacoes_intersetoriais, revelacoes_espontaneas, acompanhamentos_rede_protecao (Fases 3.19-3.21)

Revision ID: 025
Revises: 024
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("notificacoes_intersetoriais",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("attendance_id", sa.UUID(), nullable=True),
        sa.Column("person_id", sa.UUID(), nullable=True),
        sa.Column("family_id", sa.UUID(), nullable=True),
        sa.Column("descricao_caso", sa.Text(), nullable=False),
        sa.Column("acoes_realizadas", sa.Text(), nullable=True),
        sa.Column("area_origem", sa.String(100), nullable=False),
        sa.Column("area_destino", sa.String(100), nullable=False),
        sa.Column("sensivel", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("especialidades_permitidas", ARRAY(sa.String), nullable=True),
        sa.Column("unidades_permitidas", ARRAY(sa.String), nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("revelacoes_espontaneas",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("unit_id", sa.UUID(), nullable=False),
        sa.Column("profissional_id", sa.UUID(), nullable=True),
        sa.Column("data_hora", sa.DateTime(timezone=True), nullable=False),
        sa.Column("vitima_id", sa.UUID(), nullable=True),
        sa.Column("vitima_nome", sa.String(200), nullable=True),
        sa.Column("matriculada_ensino", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("suposto_indicador_violencia", sa.Text(), nullable=True),
        sa.Column("vinculo_suposto_autor", sa.String(100), nullable=True),
        sa.Column("encaminhamentos", ARRAY(sa.String), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table("acompanhamentos_rede_protecao",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.String(36), nullable=False, index=True),
        sa.Column("person_id", sa.UUID(), nullable=True),
        sa.Column("family_id", sa.UUID(), nullable=True),
        sa.Column("data_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_fim", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("registrado_por_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("acompanhamentos_rede_protecao")
    op.drop_table("revelacoes_espontaneas")
    op.drop_table("notificacoes_intersetoriais")
