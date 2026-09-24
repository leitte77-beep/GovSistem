"""add document_models and document_model_versions

Revision ID: f1a2b3c4d5e6
Revises: d4e5f6a7b8c9
Create Date: 2026-09-09

- ``document_models``: per-organization, per-purpose modelos documentais
  (status lifecycle draft → in_approval → active → archived; ``is_default``
  marca o modelo padrão ativo por escopo; ``active_version`` aponta a versão
  imutável atualmente vigente).
- ``document_model_versions``: versões imutáveis; ``config_json`` guarda o
  ``DocumentModelConfig`` validado (campos, seções/textos fixos, condicionais)
  e ``config_hash`` o hash canônico da config.

Aditiva e segura: não altera nenhuma tabela existente. Rollback remove somente
estas duas tabelas novas; nunca apaga matérias, numeração ou publicações.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "f1a2b3c4d5e6"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_models",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("purpose", sa.String(200), nullable=False),
        sa.Column("document_type", sa.String(50), nullable=False, server_default="outro"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("active_version", sa.Integer(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "slug", name="uq_document_models_org_slug"),
    )
    op.create_index("ix_document_models_organization_id", "document_models", ["organization_id"])
    op.create_index("ix_document_models_status", "document_models", ["status"])

    op.create_table(
        "document_model_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_model_id",
            UUID(as_uuid=True),
            sa.ForeignKey("document_models.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("config_json", JSONB(), nullable=False),
        sa.Column("config_hash", sa.String(64), nullable=False),
        sa.Column("change_reason", sa.Text(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint(
            "document_model_id", "version_number", name="uq_document_model_version_number"
        ),
    )
    op.create_index(
        "ix_document_model_versions_model",
        "document_model_versions",
        ["document_model_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_model_versions_model", table_name="document_model_versions")
    op.drop_table("document_model_versions")
    op.drop_index("ix_document_models_status", table_name="document_models")
    op.drop_index("ix_document_models_organization_id", table_name="document_models")
    op.drop_table("document_models")
