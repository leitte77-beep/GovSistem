"""foundations for visual/semantic document templates (Fase 1)

Revision ID: i6j7k8l9m0n1
Revises: h5i6j7k8l9m0
Create Date: 2026-09-11

Aditiva e reversível. Cria as fundações do construtor visual de modelos:

* ``organizations``: identidade institucional (endereço, CEP, telefone, site,
  UF) + ``institutional_layout`` (layout visual padrão em JSON).
* ``document_models``: ``parent_model_id`` (herança de modelo base) e
  ``deleted_at`` (soft delete).
* ``document_model_versions``: ``layout_json`` (modelo visual versionado).
* ``document_model_blocks``: biblioteca de blocos reutilizáveis.
* ``document_model_training_files``: documentos de referência para treinar a IA.

Nenhuma coluna existente é alterada e nenhum dado é removido. Rollback remove
tudo o que foi criado.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "i6j7k8l9m0n1"
down_revision = "h5i6j7k8l9m0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Identidade institucional ────────────────────────────────────────────
    op.add_column("organizations", sa.Column("state", sa.String(2), nullable=True))
    op.add_column("organizations", sa.Column("address_street", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("address_number", sa.String(20), nullable=True))
    op.add_column("organizations", sa.Column("address_complement", sa.String(120), nullable=True))
    op.add_column("organizations", sa.Column("address_district", sa.String(120), nullable=True))
    op.add_column("organizations", sa.Column("address_city", sa.String(120), nullable=True))
    op.add_column("organizations", sa.Column("address_postal_code", sa.String(10), nullable=True))
    op.add_column("organizations", sa.Column("phone", sa.String(40), nullable=True))
    op.add_column("organizations", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("site", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("institutional_layout", JSONB(), nullable=True))

    # ── DocumentModel: herança + soft delete ────────────────────────────────
    op.add_column(
        "document_models",
        sa.Column("parent_model_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column("document_models", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_document_models_parent_model_id",
        "document_models",
        "document_models",
        ["parent_model_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_document_models_parent_model_id", "document_models", ["parent_model_id"])

    # ── DocumentModelVersion: layout visual ─────────────────────────────────
    op.add_column("document_model_versions", sa.Column("layout_json", JSONB(), nullable=True))

    # ── Biblioteca de blocos reutilizáveis ──────────────────────────────────
    op.create_table(
        "document_model_blocks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False, server_default="text"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content_json", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "name", name="uq_document_model_blocks_org_name"),
    )
    op.create_index(
        "ix_document_model_blocks_organization_id", "document_model_blocks", ["organization_id"]
    )

    # ── Documentos de referência (treinar IA) ───────────────────────────────
    op.create_table(
        "document_model_training_files",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_model_id",
            UUID(as_uuid=True),
            sa.ForeignKey("document_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(120), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("storage_path", sa.String(500), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="uploaded"),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("ai_analysis", JSONB(), nullable=True),
        sa.Column("used_by_ai", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_document_model_training_files_organization_id",
        "document_model_training_files",
        ["organization_id"],
    )
    op.create_index(
        "ix_document_model_training_files_document_model_id",
        "document_model_training_files",
        ["document_model_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_model_training_files_document_model_id",
        table_name="document_model_training_files",
    )
    op.drop_index(
        "ix_document_model_training_files_organization_id",
        table_name="document_model_training_files",
    )
    op.drop_table("document_model_training_files")

    op.drop_index("ix_document_model_blocks_organization_id", table_name="document_model_blocks")
    op.drop_table("document_model_blocks")

    op.drop_column("document_model_versions", "layout_json")

    op.drop_index("ix_document_models_parent_model_id", table_name="document_models")
    op.drop_constraint(
        "fk_document_models_parent_model_id", "document_models", type_="foreignkey"
    )
    op.drop_column("document_models", "deleted_at")
    op.drop_column("document_models", "parent_model_id")

    op.drop_column("organizations", "institutional_layout")
    op.drop_column("organizations", "site")
    op.drop_column("organizations", "email")
    op.drop_column("organizations", "phone")
    op.drop_column("organizations", "address_postal_code")
    op.drop_column("organizations", "address_city")
    op.drop_column("organizations", "address_district")
    op.drop_column("organizations", "address_complement")
    op.drop_column("organizations", "address_number")
    op.drop_column("organizations", "address_street")
    op.drop_column("organizations", "state")
