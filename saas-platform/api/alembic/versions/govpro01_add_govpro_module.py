"""add_govpro_module

Registra o módulo GovPro (Processo Administrativo Eletrônico) na plataforma.

Revision ID: govpro01
Revises: govsocial01
Create Date: 2026-08-13 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "govpro01"
down_revision: Union[str, None] = "govsocial01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'GovPro',
            'govpro',
            'Processo Administrativo Eletrônico (SPE) — autuação, assinatura, tramitação, sigilo e arquivo',
            'account_balance',
            'https://govpro.govsistem.com.br',
            'https://govpro.govsistem.com.br/api/govpro/v1',
            'https://govpro.govsistem.com.br',
            true,
            '1.0.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'govpro');
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM organization_modules WHERE module_id IN (SELECT id FROM modules WHERE slug = 'govpro')")
    op.execute("DELETE FROM modules WHERE slug = 'govpro'")
