"""govpro01 - stub de reconciliação

O head real do banco `saas_platform` é `govpro01` (aplicado em produção, fora
deste branch). Como o arquivo desta migration não está presente no workspace,
este stub apenas registra a revisão no mapa do Alembic para que migrations
aditivas subsequentes possam encadear a partir dela. É uma no-op: nada a aplicar.

OBS: não alterar. Serve exclusivamente para o Alembic resolver `down_revision`.
"""
from typing import Sequence, Union

revision: str = "govpro01"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
