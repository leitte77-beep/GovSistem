"""Gestão avançada: relacionamentos, marcos, riscos, campos customizados, SLA e webhooks.

Fecha as lacunas de §205/§206, §211, §213, §220–§222, §152–§154 e §196 sobre o
núcleo v2. Nenhuma tabela existente é alterada além de receber
`demandas.demanda_pai_id`.

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f9a0b1c2d3e4"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # ── Hierarquia pai/filha (§221, §222) ───────────────────────────────────
    op.add_column(
        "demandas",
        sa.Column(
            "demanda_pai_id",
            UUID,
            sa.ForeignKey("demandas.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_demandas_demanda_pai_id", "demandas", ["demanda_pai_id"])

    # ── Relacionamentos laterais (§220) ─────────────────────────────────────
    op.create_table(
        "demanda_relacionamentos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relacionada_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False, server_default="RELACIONADA"),
        sa.Column("descricao", sa.Text()),
        sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.UniqueConstraint("demanda_id", "relacionada_id", "tipo", name="uq_demanda_relacionamento"),
        sa.CheckConstraint("demanda_id <> relacionada_id", name="ck_relacionamento_nao_self"),
    )
    op.create_index("ix_demanda_relacionamentos_org", "demanda_relacionamentos", ["organization_id"])
    op.create_index("ix_demanda_relacionamentos_demanda_id", "demanda_relacionamentos", ["demanda_id"])
    op.create_index("ix_demanda_relacionamentos_relacionada_id", "demanda_relacionamentos", ["relacionada_id"])

    # ── Marcos (§213) ───────────────────────────────────────────────────────
    op.create_table(
        "demanda_marcos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text()),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDENTE"),
        sa.Column("data_prevista", sa.DateTime(timezone=True)),
        sa.Column("data_realizada", sa.DateTime(timezone=True)),
        sa.Column("responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_demanda_marcos_org", "demanda_marcos", ["organization_id"])
    op.create_index("ix_demanda_marcos_demanda", "demanda_marcos", ["demanda_id", "ordem"])
    op.create_index("ix_demanda_marcos_data_prevista", "demanda_marcos", ["data_prevista"])

    # ── Riscos (§211) ───────────────────────────────────────────────────────
    op.create_table(
        "demanda_riscos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("categoria", sa.String(60)),
        sa.Column("probabilidade", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("impacto", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("mitigacao", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="IDENTIFICADO"),
        sa.Column("previsao", sa.Date()),
        sa.Column("resolvido_em", sa.DateTime(timezone=True)),
        sa.Column("responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.CheckConstraint("probabilidade BETWEEN 1 AND 5", name="ck_risco_probabilidade"),
        sa.CheckConstraint("impacto BETWEEN 1 AND 5", name="ck_risco_impacto"),
    )
    op.create_index("ix_demanda_riscos_org", "demanda_riscos", ["organization_id"])
    op.create_index("ix_demanda_riscos_demanda", "demanda_riscos", ["demanda_id", "status"])

    # ── Campos customizados (§205, §206) ────────────────────────────────────
    op.create_table(
        "campos_customizados",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo_demanda_id", UUID, sa.ForeignKey("demanda_tipos.id", ondelete="SET NULL")),
        sa.Column("chave", sa.String(60), nullable=False),
        sa.Column("rotulo", sa.String(120), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("obrigatorio", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ajuda", sa.Text()),
        sa.Column("opcoes", sa.JSON()),
        sa.Column("validacao", sa.JSON()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.UniqueConstraint("organization_id", "chave", name="uq_campo_customizado_chave"),
    )
    op.create_index("ix_campos_customizados_org", "campos_customizados", ["organization_id"])
    op.create_index("ix_campos_customizados_tipo", "campos_customizados", ["tipo_demanda_id"])

    # ── SLA interno (§152–§154) ─────────────────────────────────────────────
    op.create_table(
        "sla_config",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo_demanda_id", UUID, sa.ForeignKey("demanda_tipos.id", ondelete="SET NULL")),
        sa.Column("setor_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL")),
        sa.Column("prioridade", sa.String(15)),
        sa.Column("valor", sa.Integer(), nullable=False),
        sa.Column("contagem", sa.String(20), nullable=False, server_default="DIAS_UTEIS"),
        sa.Column("descricao", sa.Text()),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_sla_config_org", "sla_config", ["organization_id"])

    # ── Webhooks (§196) ─────────────────────────────────────────────────────
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("descricao", sa.String(255)),
        sa.Column("secret", sa.String(128), nullable=False),
        sa.Column("eventos", sa.JSON()),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ultima_entrega_em", sa.DateTime(timezone=True)),
        sa.Column("ultimo_status", sa.String(20)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_webhook_endpoints_org", "webhook_endpoints", ["organization_id"])

    op.create_table(
        "webhook_entregas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint_id", UUID, sa.ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evento", sa.String(60), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="SET NULL")),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDENTE"),
        sa.Column("tentativas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("http_status", sa.Integer()),
        sa.Column("resposta", sa.Text()),
        sa.Column("erro", sa.Text()),
        sa.Column("entregue_em", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_webhook_entregas_endpoint", "webhook_entregas", ["endpoint_id", "status"])
    op.create_index("ix_webhook_entregas_org", "webhook_entregas", ["organization_id"])
    op.create_index("ix_webhook_entregas_evento", "webhook_entregas", ["evento"])


def downgrade() -> None:
    op.drop_table("webhook_entregas")
    op.drop_table("webhook_endpoints")
    op.drop_table("sla_config")
    op.drop_table("campos_customizados")
    op.drop_table("demanda_riscos")
    op.drop_table("demanda_marcos")
    op.drop_table("demanda_relacionamentos")
    op.drop_index("ix_demandas_demanda_pai_id", table_name="demandas")
    op.drop_column("demandas", "demanda_pai_id")
