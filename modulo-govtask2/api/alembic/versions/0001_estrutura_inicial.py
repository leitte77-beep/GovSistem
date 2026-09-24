"""Estrutura inicial do GovTask v2: pedido, fases, anexos e andamentos.

Revision ID: 0001_inicial
Revises:
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_inicial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Identidade (espelho do SaaS, preenchido pelo /internal/sync-*) ──
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("cnpj", sa.String(18), nullable=True, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("public_url", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_roles_name", "roles", ["name"], unique=True)

    op.create_table(
        "role_permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"])
    op.create_index("ix_role_permissions_permission", "role_permissions", ["permission"])

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_organization_id", "users", ["organization_id"])

    op.create_table(
        "user_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Domínio ──
    op.create_table(
        "pedidos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("numero", sa.String(20), nullable=False),
        sa.Column("exercicio", sa.Integer(), nullable=False),
        sa.Column("sequencial", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("origem", sa.String(20), nullable=False, server_default="PREFEITO"),
        sa.Column("origem_nome", sa.String(180), nullable=True),
        sa.Column("valor_previsto", sa.Numeric(14, 2), nullable=True),
        sa.Column("prioridade", sa.String(10), nullable=False, server_default="NORMAL"),
        sa.Column("situacao", sa.String(20), nullable=False, server_default="EM_ANDAMENTO"),
        sa.Column("fase_atual_codigo", sa.String(40), nullable=False),
        sa.Column("setor_atual", sa.String(30), nullable=True),
        sa.Column("responsavel_atual_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo_atual", sa.Date(), nullable=True),
        sa.Column("protocolo_externo", sa.String(80), nullable=True),
        sa.Column("criado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("concluido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "exercicio", "sequencial", name="uq_pedido_org_exercicio_sequencial"),
        sa.UniqueConstraint("organization_id", "numero", name="uq_pedido_org_numero"),
    )
    op.create_index("ix_pedidos_organization_id", "pedidos", ["organization_id"])
    op.create_index("ix_pedidos_numero", "pedidos", ["numero"])
    op.create_index("ix_pedidos_exercicio", "pedidos", ["exercicio"])
    op.create_index("ix_pedidos_tipo", "pedidos", ["tipo"])
    op.create_index("ix_pedidos_situacao", "pedidos", ["situacao"])
    op.create_index("ix_pedidos_fase_atual_codigo", "pedidos", ["fase_atual_codigo"])
    op.create_index("ix_pedidos_org_situacao", "pedidos", ["organization_id", "situacao"])
    op.create_index("ix_pedidos_org_responsavel", "pedidos", ["organization_id", "responsavel_atual_id"])
    op.create_index("ix_pedidos_org_setor", "pedidos", ["organization_id", "setor_atual"])
    op.create_index("ix_pedidos_org_prazo", "pedidos", ["organization_id", "prazo_atual"])

    op.create_table(
        "fases_pedido",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("pedido_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("codigo", sa.String(40), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(120), nullable=False),
        sa.Column("setor", sa.String(30), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDENTE"),
        sa.Column("responsavel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column("iniciada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("devolucoes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("pedido_id", "ordem", name="uq_fase_pedido_ordem"),
    )
    op.create_index("ix_fases_pedido_pedido_id", "fases_pedido", ["pedido_id"])
    op.create_index("ix_fases_responsavel", "fases_pedido", ["responsavel_id", "status"])

    op.create_table(
        "anexos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("pedido_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fases_pedido.id", ondelete="SET NULL"), nullable=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("nome_original", sa.String(255), nullable=False),
        sa.Column("caminho", sa.String(500), nullable=False),
        sa.Column("tamanho_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_type", sa.String(120), nullable=True),
        sa.Column("descricao", sa.String(255), nullable=True),
        sa.Column("enviado_por_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_anexos_pedido_id", "anexos", ["pedido_id"])
    op.create_index("ix_anexos_organization_id", "anexos", ["organization_id"])
    op.create_index("ix_anexos_pedido_fase", "anexos", ["pedido_id", "fase_id"])

    op.create_table(
        "andamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("pedido_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fases_pedido.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("texto", sa.Text(), nullable=True),
        sa.Column("autor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("autor_nome", sa.String(180), nullable=False, server_default=""),
        sa.Column("interno", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_andamentos_pedido_id", "andamentos", ["pedido_id"])
    op.create_index("ix_andamentos_pedido_data", "andamentos", ["pedido_id", "created_at"])


def downgrade() -> None:
    op.drop_table("andamentos")
    op.drop_table("anexos")
    op.drop_table("fases_pedido")
    op.drop_table("pedidos")
    op.drop_table("user_roles")
    op.drop_table("users")
    op.drop_table("role_permissions")
    op.drop_table("roles")
    op.drop_table("organizations")
