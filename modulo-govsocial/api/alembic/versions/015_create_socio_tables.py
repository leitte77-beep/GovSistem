"""Create GovSocial FASE 2 socio tables

Revision ID: 015
Revises: 014
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Renda por membro
    op.create_table(
        "rendas_membro",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("valor", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("data_inicio", sa.Date(), nullable=True),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("comprovante_path", sa.String(500), nullable=True),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rendas_tenant_family", "rendas_membro", ["tenant_id", "family_id"])

    # Despesas familiares
    op.create_table(
        "despesas_familiares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("valor", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("data_referencia", sa.Date(), nullable=True),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_despesas_tenant_family", "despesas_familiares", ["tenant_id", "family_id"])

    # Situacao de rua
    op.create_table(
        "dados_rua",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("pessoa_referencia_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tempo_em_situacao_rua", sa.String(30), nullable=True),
        sa.Column("motivo", sa.String(30), nullable=True),
        sa.Column("local_pernoite", sa.String(30), nullable=True),
        sa.Column("possui_acompanhamento_institucional", sa.Boolean(), nullable=True),
        sa.Column("instituicao_acompanhamento", sa.String(255), nullable=True),
        sa.Column("tempo_permanencia_municipio", sa.String(30), nullable=True),
        sa.Column("origem_municipio", sa.String(120), nullable=True),
        sa.Column("origem_uf", sa.String(2), nullable=True),
        sa.Column("referencias_familiares", sa.String(500), nullable=True),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Condicoes de saude
    op.create_table(
        "condicoes_saude",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_coleta", sa.Date(), nullable=False),
        sa.Column("profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("presenca_gestantes", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("quantidade_gestantes", sa.Integer(), server_default=sa.text("0")),
        sa.Column("presenca_nutrizes", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("quantidade_nutrizes", sa.Integer(), server_default=sa.text("0")),
        sa.Column("pessoas_deficiencia_cuidado_terceiros", sa.Integer(), server_default=sa.text("0")),
        sa.Column("pessoas_doencas_cronicas", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("descricao_doencas_cronicas", sa.String(500), nullable=True),
        sa.Column("pessoas_transtornos_mentais", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("descricao_transtornos", sa.String(500), nullable=True),
        sa.Column("uso_substancias", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("descricao_uso_substancias", sa.String(500), nullable=True),
        sa.Column("acesso_servicos_saude", sa.String(30), nullable=True),
        sa.Column("uso_medicamentos_controlados", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_condsau_tenant_family", "condicoes_saude", ["tenant_id", "family_id"])

    # Condicoes educacionais
    op.create_table(
        "condicoes_educacionais",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_coleta", sa.Date(), nullable=False),
        sa.Column("profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("alfabetizacao_familiar", sa.String(30), nullable=True),
        sa.Column("membros_distorcao_idade_serie", sa.Integer(), server_default=sa.text("0")),
        sa.Column("membros_fora_escola", sa.Integer(), server_default=sa.text("0")),
        sa.Column("detalhe_fora_escola", sa.String(500), nullable=True),
        sa.Column("membros_creche_pre_escola", sa.Integer(), server_default=sa.text("0")),
        sa.Column("acesso_educacao_infantil", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_condedu_tenant_family", "condicoes_educacionais", ["tenant_id", "family_id"])

    # Convivência familiar
    op.create_table(
        "convivencia_familiar",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_coleta", sa.Date(), nullable=False),
        sa.Column("profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("relacionamento_familiar", sa.String(30), nullable=True),
        sa.Column("presenca_violencia_domestica", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("presenca_trabalho_infantil", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("medidas_protetivas", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("detalhe_medidas_protetivas", sa.String(500), nullable=True),
        sa.Column("participacao_comunitaria", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("detalhe_participacao", sa.String(500), nullable=True),
        sa.Column("vinculos_comunitarios", sa.String(30), nullable=True),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_convfam_tenant_family", "convivencia_familiar", ["tenant_id", "family_id"])

    # Vulnerabilidades familiares
    op.create_table(
        "vulnerabilidades_familiares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("data_inicio", sa.Date(), nullable=False),
        sa.Column("data_saida", sa.Date(), nullable=True),
        sa.Column("profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("observacoes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vulnfam_tenant_family", "vulnerabilidades_familiares", ["tenant_id", "family_id"])

    # Potencialidades familiares
    op.create_table(
        "potencialidades_familiares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("descricao", sa.String(500), nullable=False),
        sa.Column("data_identificacao", sa.Date(), nullable=False),
        sa.Column("profissional_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("professionals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_potfam_tenant_family", "potencialidades_familiares", ["tenant_id", "family_id"])

    # Adicionar tipo_familia na tabela families
    op.add_column("families", sa.Column("tipo_familia", sa.String(40), nullable=True,
                                          comment="Nuclear_Conjugal | Ampliada_Extensa | Monoparental_Feminina | "
                                                  "Monoparental_Masculina | Unipessoal | Reconstituida | Fraterna | Institucional"))
    op.add_column("families", sa.Column("situacao_rua", sa.Boolean(), nullable=True, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("families", "situacao_rua")
    op.drop_column("families", "tipo_familia")
    op.drop_table("potencialidades_familiares")
    op.drop_table("vulnerabilidades_familiares")
    op.drop_table("convivencia_familiar")
    op.drop_table("condicoes_educacionais")
    op.drop_table("condicoes_saude")
    op.drop_table("dados_rua")
    op.drop_table("despesas_familiares")
    op.drop_table("rendas_membro")
