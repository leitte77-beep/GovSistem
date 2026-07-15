"""Create FASE 2 additional tables (questionarios, notificacoes, filtros, documentos, exportadores)

Revision ID: 017
Revises: 016
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Questionarios
    op.create_table(
        "questionarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("service_type_code", sa.String(40), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "questoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("questionario_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questionarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("enunciado", sa.String(500), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("obrigatorio", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("opcoes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "respostas_questionario",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("questionario_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questionarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("attendance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("attendances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_preenchimento", sa.Date(), nullable=False),
        sa.Column("profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "respostas_questao",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("resposta_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("respostas_questionario.id", ondelete="CASCADE"), nullable=False),
        sa.Column("questao_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("questoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("valor", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Notificacoes
    op.create_table(
        "notificacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("mensagem", sa.Text(), nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("lida", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notif_tenant_user", "notificacoes", ["tenant_id", "user_id"])

    # Filtros salvos
    op.create_table(
        "filtros_salvos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entidade", sa.String(30), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("configuracao", sa.JSON(), nullable=False),
        sa.Column("compartilhado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_filtros_tenant_user_entity", "filtros_salvos", ["tenant_id", "user_id", "entidade"])

    # Documentos autenticaveis
    op.create_table(
        "documentos_autenticaveis",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(50), nullable=False),
        sa.Column("entidade_origem", sa.String(40), nullable=False),
        sa.Column("entidade_id", sa.String(100), nullable=False),
        sa.Column("dados_snapshot", sa.JSON(), nullable=False),
        sa.Column("qrcode_uuid", sa.String(36), nullable=False, unique=True, index=True),
        sa.Column("data_emissao", sa.Date(), nullable=False),
        sa.Column("emitido_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Exportadores de dados
    op.create_table(
        "exportadores_dados",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("query_sql", sa.Text(), nullable=False),
        sa.Column("parametros", sa.JSON(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("global", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "exportacoes_execucoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("exportador_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("exportadores_dados.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("executado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'EXECUTANDO'")),
        sa.Column("parametros_usados", sa.JSON(), nullable=True),
        sa.Column("resultado_path", sa.String(500), nullable=True),
        sa.Column("erro", sa.Text(), nullable=True),
        sa.Column("total_linhas", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("exportacoes_execucoes")
    op.drop_table("exportadores_dados")
    op.drop_table("documentos_autenticaveis")
    op.drop_table("filtros_salvos")
    op.drop_table("notificacoes")
    op.drop_table("respostas_questao")
    op.drop_table("respostas_questionario")
    op.drop_table("questoes")
    op.drop_table("questionarios")
