"""add_govouve_module

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-06-08 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'h9i0j1k2l3m4'
down_revision: Union[str, None] = 'g8h9i0j1k2l3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'GovOuve',
            'govouve',
            'Avaliação & Ouvidoria — modelos de pesquisa, formulários públicos e ouvidoria completa em conformidade com a Lei 13.460/2017, LAI e LGPD',
            'campaign',
            'https://govouve.govsistem.com.br',
            'https://govouve.govsistem.com.br/api',
            'https://govouve.govsistem.com.br',
            true,
            '1.0.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'govouve');
    """)


def downgrade() -> None:
    op.execute("DELETE FROM modules WHERE slug = 'govouve'")
