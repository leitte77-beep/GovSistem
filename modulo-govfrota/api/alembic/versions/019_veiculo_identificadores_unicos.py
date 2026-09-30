"""Placa, RENAVAM e chassi únicos por organização (veículos não excluídos).

Até aqui a duplicidade era barrada só pela API, o que deixava passar dois
cadastros simultâneos. Índices parciais ignoram veículos excluídos e valores
vazios, então reaproveitar a placa de um veículo baixado continua possível.

Reverter em produção = restaurar o dump feito antes do upgrade.

Revision ID: 019
Revises: 018
Create Date: 2026-09-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDICES = ("placa", "renavam", "chassi")


def upgrade() -> None:
    for campo in _INDICES:
        op.execute(
            f"CREATE UNIQUE INDEX uq_veiculos_org_{campo}_ativo ON veiculos (organization_id, {campo}) "
            f"WHERE deleted_at IS NULL AND {campo} IS NOT NULL AND {campo} <> ''"
        )


def downgrade() -> None:
    for campo in _INDICES:
        op.execute(f"DROP INDEX IF EXISTS uq_veiculos_org_{campo}_ativo")
