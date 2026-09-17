"""Assinatura de documento: ciclo de vida e evidência do assinador (§78).

Migração aditiva. Uma linha por grupo de documentos. A transição para
`ASSINADO` depende da rota interna que recebe referência e hash do módulo de
assinatura — não há caminho de usuário que a produza.

Revision ID: b2c3d4e5f6a7
Revises: f1a2b3c4d5e6
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "documento_assinaturas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organization_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "demanda_id",
            UUID,
            sa.ForeignKey("demandas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("documento_grupo_id", UUID, nullable=False),
        sa.Column(
            "anexo_id",
            UUID,
            sa.ForeignKey("anexos.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="RASCUNHO",
        ),
        sa.Column("solicitado_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("solicitado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revisado_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revisado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assinado_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assinado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referencia_externa", sa.String(255), nullable=True),
        sa.Column("provedor", sa.String(60), nullable=True),
        sa.Column("hash_assinado", sa.String(128), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("documento_grupo_id", name="uq_assinatura_documento_grupo"),
    )
    op.create_index("ix_documento_assinaturas_organization_id", "documento_assinaturas", ["organization_id"])
    op.create_index("ix_documento_assinaturas_demanda_id", "documento_assinaturas", ["demanda_id"])


def downgrade() -> None:
    op.drop_index("ix_documento_assinaturas_demanda_id", table_name="documento_assinaturas")
    op.drop_index("ix_documento_assinaturas_organization_id", table_name="documento_assinaturas")
    op.drop_table("documento_assinaturas")
