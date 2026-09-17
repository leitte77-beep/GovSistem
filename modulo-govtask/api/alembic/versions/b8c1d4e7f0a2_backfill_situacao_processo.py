"""backfill da situacao dos processos criados sem trilho

Revision ID: b8c1d4e7f0a2
Revises: f7a1c2d3e4b5
Create Date: 2026-09-16

Ate agora a situacao so era gravada quando o processo tinha categoria, entao a
maioria dos convenios ficou com situacao NULL — e sem situacao o stepper, o
calculo de progresso e o filtro por situacao nao tem o que mostrar.

O backfill e deliberadamente conservador: deriva a situacao apenas do que ja
esta registrado no proprio processo, sem inventar avanco de fluxo.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b8c1d4e7f0a2'
down_revision: Union[str, Sequence[str], None] = 'f7a1c2d3e4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE convenios
           SET situacao = CASE
               WHEN status = 'CANCELADO' THEN 'CANCELADO'
               WHEN status = 'CONCLUIDO' THEN 'CONCLUIDO'
               WHEN numero_protocolo_governo IS NOT NULL
                    AND numero_protocolo_governo <> '' THEN 'EM_ANALISE_GOVERNO'
               WHEN status = 'EM_ANDAMENTO' THEN 'EM_ARTICULACAO'
               ELSE 'OPORTUNIDADE'
           END
         WHERE situacao IS NULL
        """
    )


def downgrade() -> None:
    # Nao ha como distinguir o que foi preenchido aqui do que o usuario
    # informou depois; desfazer apagaria dado legitimo.
    pass
