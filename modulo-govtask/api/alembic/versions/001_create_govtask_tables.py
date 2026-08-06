"""Create GovTask tables

Revision ID: 001
Revises:
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Auth tables ──────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("cnpj", sa.String(18), unique=True, nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("theme_config", postgresql.JSON(), nullable=True),
        sa.Column("public_url", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("mfa_secret", sa.Text(), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_failures", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "user_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )

    # ── Refresh Tokens ──────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Setores ──────────────────────────────────────────
    op.create_table(
        "setores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("nome", sa.String(255), nullable=False, index=True),
        sa.Column("sigla", sa.String(20), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Templates de Fluxo ───────────────────────────────
    op.create_table(
        "templates_fluxo",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("tipo_convenio", sa.String(20), nullable=False),
        sa.Column("descricao", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "templates_etapa",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("template_fluxo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates_fluxo.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("natureza", sa.String(20), nullable=False, server_default=sa.text("'INTERNA'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Convênios ────────────────────────────────────────
    op.create_table(
        "convenios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("titulo", sa.String(500), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("tipo", sa.String(20), nullable=False, server_default=sa.text("'OUTRO'")),
        sa.Column("origem", sa.String(255), nullable=True),
        sa.Column("numero_protocolo_governo", sa.String(100), nullable=True, index=True),
        sa.Column("valor", sa.Numeric(15, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'RASCUNHO'")),
        sa.Column("data_protocolo", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsavel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("template_fluxo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates_fluxo.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Etapas ───────────────────────────────────────────
    op.create_table(
        "etapas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("convenio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("convenios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("natureza", sa.String(20), nullable=False, server_default=sa.text("'INTERNA'")),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'PENDENTE'")),
        sa.Column("prazo_governo", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resposta_governo", sa.Text(), nullable=True),
        sa.Column("data_inicio", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_conclusao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Tarefas ──────────────────────────────────────────
    op.create_table(
        "tarefas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("convenio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("convenios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("etapa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("etapas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("titulo", sa.String(500), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("criada_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("atribuida_a_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("setor_destino_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("prioridade", sa.String(10), nullable=False, server_default=sa.text("'NORMAL'")),
        sa.Column("prazo", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'AGUARDANDO_ACEITE'")),
        sa.Column("tarefa_pai_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tarefas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_aceite", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_entrega", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_conclusao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recorrente", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("intervalo_recorrencia_dias", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Anexos ───────────────────────────────────────────
    op.create_table(
        "anexos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("convenio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("convenios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("etapa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("etapas.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("tarefa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tarefas.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("nome_arquivo", sa.String(500), nullable=False),
        sa.Column("tipo_documento", sa.String(20), nullable=False, server_default=sa.text("'OUTRO'")),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("tamanho_bytes", sa.BigInteger(), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("enviado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Eventos Timeline (append-only) ───────────────────
    op.create_table(
        "eventos_timeline",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("convenio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("convenios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tarefa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tarefas.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("tipo_evento", sa.String(50), nullable=False, index=True),
        sa.Column("ator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("metadados", postgresql.JSON(), nullable=True),
        sa.Column("ocorrido_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Contestações ─────────────────────────────────────
    op.create_table(
        "contestacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tarefa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("solicitado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("novo_prazo_solicitado", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'PENDENTE'")),
        sa.Column("decidido_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("justificativa_decisao", sa.Text(), nullable=True),
        sa.Column("data_decisao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Notificações ─────────────────────────────────────
    op.create_table(
        "notificacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("destinatario_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(30), nullable=False, index=True),
        sa.Column("convenio_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("convenios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tarefa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tarefas.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("mensagem", sa.Text(), nullable=False),
        sa.Column("canal", sa.String(10), nullable=False, server_default=sa.text("'IN_APP'")),
        sa.Column("lida", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("lida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Comentários ──────────────────────────────────────
    op.create_table(
        "comentarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tarefa_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tarefas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("autor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Índices adicionais ───────────────────────────────
    op.create_index("ix_tarefas_prazo_status", "tarefas", ["prazo", "status"])
    op.create_index("ix_eventos_convenio_ocorrido", "eventos_timeline", ["convenio_id", "ocorrido_em"])


def downgrade() -> None:
    op.drop_table("comentarios")
    op.drop_table("notificacoes")
    op.drop_table("contestacoes")
    op.drop_table("eventos_timeline")
    op.drop_table("anexos")
    op.drop_table("tarefas")
    op.drop_table("etapas")
    op.drop_table("convenios")
    op.drop_table("templates_etapa")
    op.drop_table("templates_fluxo")
    op.drop_table("setores")
    op.drop_table("refresh_tokens")
    op.drop_table("user_roles")
    op.drop_table("users")
    op.drop_table("roles")
    op.drop_table("organizations")
