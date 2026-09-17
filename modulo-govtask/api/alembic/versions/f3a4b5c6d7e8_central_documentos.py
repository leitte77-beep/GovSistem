"""Central de documentos: tipo real do arquivo e agrupamento de versões.

As colunas de versionamento (hash, pasta, grupo, versão vigente) vieram com o
núcleo de demandas; aqui entra o tipo real conferido na validação e o backfill
que transforma cada anexo antigo em um documento de versão única.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("anexos", sa.Column("mime_type", sa.String(120), nullable=True))

    # Anexos anteriores viram documentos de grupo próprio: sem isso ficariam
    # com grupo nulo e o versionamento não os alcançaria.
    op.execute(
        sa.text(
            "UPDATE anexos SET documento_grupo_id = gen_random_uuid(),"
            " versao_atual = true WHERE documento_grupo_id IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("anexos", "mime_type")
