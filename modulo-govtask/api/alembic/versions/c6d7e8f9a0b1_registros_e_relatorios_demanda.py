"""Registros auditáveis de contato, reunião e follow-up.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c6d7e8f9a0b1"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None
UUID = postgresql.UUID(as_uuid=True)

def upgrade():
    op.create_table("demanda_registros",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False), sa.Column("ocorrido_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resumo", sa.Text(), nullable=False), sa.Column("contato", sa.String(255)), sa.Column("proxima_acao", sa.Text()),
        sa.Column("proximo_followup", sa.DateTime(timezone=True)), sa.Column("participantes", sa.JSON()), sa.Column("decisoes", sa.Text()), sa.Column("metadados", sa.JSON()),
        sa.Column("registrado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    for c in ("organization_id","demanda_id","tipo","proximo_followup"): op.create_index(f"ix_demanda_registros_{c}","demanda_registros",[c])
def downgrade(): op.drop_table("demanda_registros")
