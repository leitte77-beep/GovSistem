"""audit_trail.tenant_id nullable (eventos de login sem tenant)

Revision ID: 037
Revises: 036
Create Date: 2026-08-08

Eventos de LOGIN falho (credenciais invalidas de usuario nao identificado)
sao legitimamente sem tenant: o usuario/tenant ainda nao foi resolvido.
A coluna NOT NULL quebrava o fluxo com 500 em vez de 401/423. As demais
escritas seguem exigindo tenant via aplicacao (fail-closed); a trilha
registra o evento mesmo assim para investigacao de seguranca.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "037"
down_revision: Union[str, None] = "036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("audit_trail", "tenant_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    # Reversão destrutiva: registros sem tenant precisam ser tratados antes.
    op.execute(
        "DELETE FROM audit_trail WHERE tenant_id IS NULL "
        "AND action IN ('LOGIN')"
    )
    op.alter_column("audit_trail", "tenant_id", existing_type=sa.Uuid(), nullable=False)
