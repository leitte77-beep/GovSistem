"""Personalização do PDF dos relatórios: cabeçalho (logo e textos), cores e rodapé.

Revision ID: 028
Revises: 027
Create Date: 2026-10-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUNAS = [
    ("pdf_titulo", sa.String(120)),
    ("pdf_subtitulo", sa.String(150)),
    ("pdf_linha_extra", sa.String(250)),
    ("pdf_rodape", sa.String(300)),
    ("pdf_cor_primaria", sa.String(7)),
    ("pdf_cor_secundaria", sa.String(7)),
    ("pdf_logo", sa.LargeBinary()),
    ("pdf_logo_tipo", sa.String(30)),
]


def upgrade() -> None:
    for nome, tipo in COLUNAS:
        op.add_column("govfrota_configuracoes", sa.Column(nome, tipo, nullable=True))


def downgrade() -> None:
    for nome, _ in reversed(COLUNAS):
        op.drop_column("govfrota_configuracoes", nome)
