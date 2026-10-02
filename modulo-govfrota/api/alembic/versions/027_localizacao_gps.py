"""Localização (GPS do celular) nos registros do app do motorista.

Abastecimento e problema guardam onde foram registrados; o uso do veículo,
onde foi a saída e a chegada. Opcional: o motorista pode negar a permissão.

Revision ID: 027
Revises: 026
Create Date: 2026-10-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUNAS = {
    "abastecimentos": ["latitude", "longitude"],
    "ocorrencias": ["latitude", "longitude"],
    "usos_veiculo": ["saida_latitude", "saida_longitude", "chegada_latitude", "chegada_longitude"],
}


def upgrade() -> None:
    for tabela, colunas in COLUNAS.items():
        for coluna in colunas:
            op.add_column(tabela, sa.Column(coluna, sa.Numeric(9, 6), nullable=True))


def downgrade() -> None:
    for tabela, colunas in COLUNAS.items():
        for coluna in reversed(colunas):
            op.drop_column(tabela, coluna)
