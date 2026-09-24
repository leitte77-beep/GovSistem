"""Imagens e endereço na área de combustíveis + anexos múltiplos por entrada.

- Combustivel.foto_url (ícone/imagem do tipo de combustível)
- Tanque.foto_url (foto do tanque)
- Fornecedor.foto_url (logotipo) + campos de endereço estruturado (CEP/logradouro
  /número/complemento/bairro/cidade/UF) + site
- Tabela entrada_anexos (N:N entre entradas e anexos de NF/XML/foto)

Revision ID: 004
Revises: 003
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("combustiveis", sa.Column("foto_url", sa.String(500), nullable=True))
    op.add_column("tanques", sa.Column("foto_url", sa.String(500), nullable=True))

    op.add_column("fornecedores", sa.Column("foto_url", sa.String(500), nullable=True))
    op.add_column("fornecedores", sa.Column("site", sa.String(255), nullable=True))
    op.add_column("fornecedores", sa.Column("cep", sa.String(10), nullable=True))
    op.add_column("fornecedores", sa.Column("logradouro", sa.String(255), nullable=True))
    op.add_column("fornecedores", sa.Column("numero", sa.String(20), nullable=True))
    op.add_column("fornecedores", sa.Column("complemento", sa.String(100), nullable=True))
    op.add_column("fornecedores", sa.Column("bairro", sa.String(100), nullable=True))
    op.add_column("fornecedores", sa.Column("cidade", sa.String(100), nullable=True))
    op.add_column("fornecedores", sa.Column("uf", sa.String(2), nullable=True))

    op.create_table(
        "entrada_anexos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entrada_id", sa.Uuid(), sa.ForeignKey("entradas_combustivel.id", ondelete="CASCADE"), nullable=False),
        sa.Column("anexo_id", sa.Uuid(), sa.ForeignKey("anexos.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_entrada_anexos_entrada", "entrada_anexos", ["entrada_id"])


def downgrade() -> None:
    op.drop_table("entrada_anexos")

    for col in ("uf", "cidade", "bairro", "complemento", "numero", "logradouro", "cep", "site", "foto_url"):
        op.drop_column("fornecedores", col)

    op.drop_column("tanques", "foto_url")
    op.drop_column("combustiveis", "foto_url")
