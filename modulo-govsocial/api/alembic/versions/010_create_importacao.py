"""Create GovSocial FASE 11 tables (importação CadÚnico)

Revision ID: 010
Revises: 009
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "import_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'UPLOADED'")),
        sa.Column("nome_arquivo", sa.String(500), nullable=False),
        sa.Column("storage_path", sa.String(1000), nullable=True),
        sa.Column("configuracao", sa.JSON(), nullable=True),
        sa.Column("total_linhas", sa.Integer(), nullable=True),
        sa.Column("linhas_processadas", sa.Integer(), nullable=True),
        sa.Column("novos", sa.Integer(), nullable=True),
        sa.Column("atualizados", sa.Integer(), nullable=True),
        sa.Column("conflitos", sa.Integer(), nullable=True),
        sa.Column("erros", sa.Integer(), nullable=True),
        sa.Column("criado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_import_tenant_tipo", "import_jobs", ["tenant_id", "tipo"])
    op.create_index("ix_import_tenant_status", "import_jobs", ["tenant_id", "status"])

    op.create_table(
        "import_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("import_job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("linha", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("nis", sa.String(20), nullable=True),
        sa.Column("cpf", sa.String(14), nullable=True),
        sa.Column("nome", sa.String(255), nullable=True),
        sa.Column("mensagem", sa.Text(), nullable=True),
        sa.Column("dados_originais", sa.JSON(), nullable=True),
        sa.Column("family_id_match", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_imlog_tenant_job", "import_logs", ["tenant_id", "import_job_id"])
    op.create_index("ix_imlog_tenant_status", "import_logs", ["tenant_id", "status"])


def downgrade() -> None:
    op.drop_table("import_logs")
    op.drop_table("import_jobs")
