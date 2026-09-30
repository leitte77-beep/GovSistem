"""SIM-AM/TCE-PR: cadastros, medidores, saídas extraordinárias, competências.

Revision ID: 022
Revises: 021
Create Date: 2026-09-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def _base():
    return [
        sa.Column("id", UUID, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
    ]


def upgrade() -> None:
    op.add_column("govfrota_configuracoes", sa.Column("simam_id_pessoa", sa.Integer(), nullable=True))
    op.add_column("govfrota_configuracoes", sa.Column("simam_cpf_responsavel", sa.String(11), nullable=True))

    op.add_column("veiculos", sa.Column("simam_informar", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("veiculos", sa.Column("simam_cd_modelo_fipe", sa.String(12), nullable=True))
    op.add_column("veiculos", sa.Column("simam_propriedade", sa.String(10), server_default="PROPRIO", nullable=False))
    op.add_column("veiculos", sa.Column("simam_tipo_medidor", sa.Integer(), nullable=True))

    op.add_column("combustiveis", sa.Column("simam_informar", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("combustiveis", sa.Column("simam_categoria", sa.Integer(), nullable=True))
    op.add_column("combustiveis", sa.Column("simam_objeto", sa.Integer(), nullable=True))

    for nome, tipo in [
        ("tipo_entrada", sa.String(20)),
        ("simam_numero", sa.Integer()),
        ("repassador_nome", sa.String(150)),
        ("repassador_cpf_cnpj", sa.String(14)),
        ("responsavel_cpf", sa.String(11)),
        ("lei_ato_numero", sa.String(20)),
        ("lei_ato_ano", sa.Integer()),
        ("convenio_numero", sa.String(20)),
        ("convenio_ano", sa.Integer()),
        ("convenio_objeto", sa.String(250)),
        ("nota_explicativa", sa.String(250)),
    ]:
        kw = {"server_default": "ORCAMENTARIA", "nullable": False} if nome == "tipo_entrada" else {"nullable": True}
        op.add_column("entradas_combustivel", sa.Column(nome, tipo, **kw))

    op.create_table(
        "veiculo_medidores",
        *_base(),
        sa.Column("veiculo_id", UUID, sa.ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sequencial", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.Integer(), nullable=False),
        sa.Column("data_inicio", sa.Date(), nullable=False),
        sa.Column("leitura_inicial", sa.Numeric(14, 3), nullable=False),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("leitura_final", sa.Numeric(14, 3), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("anexo_id", UUID, nullable=True),
        sa.Column("usuario_id", UUID, nullable=True),
        sa.UniqueConstraint("veiculo_id", "sequencial", name="uq_veiculo_medidor_seq"),
    )
    op.create_table(
        "medicoes_declaradas",
        *_base(),
        sa.Column("veiculo_id", UUID, sa.ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("medidor_id", UUID, sa.ForeignKey("veiculo_medidores.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_referencia", sa.Date(), nullable=False),
        sa.Column("quantidade", sa.Numeric(14, 3), nullable=False),
        sa.Column("justificativa", sa.String(250), nullable=False),
        sa.Column("anexo_id", UUID, nullable=False),
        sa.Column("usuario_id", UUID, nullable=True),
        sa.Column("cancelada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
    )
    op.create_table(
        "saidas_extra_combustivel",
        *_base(),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("tanque_id", UUID, sa.ForeignKey("tanques.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("combustivel_id", UUID, sa.ForeignKey("combustiveis.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("tipo_saida", sa.Integer(), nullable=False),
        sa.Column("data_saida", sa.Date(), nullable=False),
        sa.Column("quantidade", sa.Numeric(14, 3), nullable=False),
        sa.Column("responsavel_cpf", sa.String(11), nullable=False),
        sa.Column("nota_explicativa", sa.String(250), nullable=True),
        sa.Column("recebedor_nome", sa.String(150), nullable=True),
        sa.Column("recebedor_cpf_cnpj", sa.String(14), nullable=True),
        sa.Column("convenio_numero", sa.String(20), nullable=True),
        sa.Column("convenio_ano", sa.Integer(), nullable=True),
        sa.Column("convenio_objeto", sa.String(250), nullable=True),
        sa.Column("anexo_id", UUID, nullable=True),
        sa.Column("inventario_id", UUID, nullable=True),
        sa.Column("movimentacao_id", UUID, nullable=True),
        sa.Column("usuario_id", UUID, nullable=True),
        sa.UniqueConstraint("organization_id", "ano", "numero", name="uq_saida_extra_numero"),
    )
    op.create_index("ix_saidas_extra_org_data", "saidas_extra_combustivel", ["organization_id", "data_saida"])
    op.create_table(
        "simam_competencias",
        *_base(),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(15), nullable=False),
        sa.Column("retrato_json", sa.Text(), nullable=True),
        sa.Column("fechada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fechada_por_id", UUID, nullable=True),
        sa.Column("exportada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exportada_por_id", UUID, nullable=True),
        sa.Column("arquivo_sha256", sa.String(64), nullable=True),
        sa.Column("historico_json", sa.Text(), nullable=True),
        sa.UniqueConstraint("organization_id", "ano", "mes", name="uq_simam_competencia"),
    )
    op.create_table(
        "simam_consumos",
        *_base(),
        sa.Column("sequencial", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("veiculo_id", UUID, sa.ForeignKey("veiculos.id"), nullable=False),
        sa.Column("combustivel_id", UUID, sa.ForeignKey("combustiveis.id"), nullable=False),
        sa.Column("cd_bem", sa.String(10), nullable=False),
        sa.Column("categoria", sa.Integer(), nullable=False),
        sa.Column("objeto", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(14, 3), nullable=False),
        sa.UniqueConstraint("organization_id", "sequencial", name="uq_simam_consumo_seq"),
        sa.UniqueConstraint("organization_id", "ano", "mes", "veiculo_id", "combustivel_id", name="uq_simam_consumo_chave"),
    )
    op.create_table(
        "simam_estornos",
        *_base(),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("consumo_id", UUID, sa.ForeignKey("simam_consumos.id"), nullable=False),
        sa.Column("quantidade", sa.Numeric(14, 3), nullable=False),
        sa.Column("motivo", sa.String(250), nullable=False),
        sa.Column("abastecimento_id", UUID, nullable=True),
        sa.Column("usuario_id", UUID, nullable=True),
        sa.UniqueConstraint("organization_id", "ano", "numero", name="uq_simam_estorno_numero"),
    )
    op.create_table(
        "simam_referencias",
        sa.Column("tabela", sa.String(40), primary_key=True),
        sa.Column("codigo", sa.String(20), primary_key=True),
        sa.Column("descricao", sa.String(250), nullable=False),
        sa.Column("extra", sa.String(250), nullable=True),
    )


def downgrade() -> None:
    for t in (
        "simam_referencias", "simam_estornos", "simam_consumos", "simam_competencias",
        "saidas_extra_combustivel", "medicoes_declaradas", "veiculo_medidores",
    ):
        op.drop_table(t)
    for c in (
        "nota_explicativa", "convenio_objeto", "convenio_ano", "convenio_numero", "lei_ato_ano",
        "lei_ato_numero", "responsavel_cpf", "repassador_cpf_cnpj", "repassador_nome", "simam_numero",
        "tipo_entrada",
    ):
        op.drop_column("entradas_combustivel", c)
    for c in ("simam_objeto", "simam_categoria", "simam_informar"):
        op.drop_column("combustiveis", c)
    for c in ("simam_tipo_medidor", "simam_propriedade", "simam_cd_modelo_fipe", "simam_informar"):
        op.drop_column("veiculos", c)
    for c in ("simam_cpf_responsavel", "simam_id_pessoa"):
        op.drop_column("govfrota_configuracoes", c)
