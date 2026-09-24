"""add_govtask_module

Revision ID: g8h9i0j1k2l3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-03 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'g8h9i0j1k2l3'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'GovTask',
            'govtask',
            'Gestão de Convênios Públicos — digitalize o processo de convênios, etapas, tarefas e prazos com linha do tempo',
            'assignment_turned_in',
            'https://govtask.govsistem.com.br',
            'https://govtask.govsistem.com.br/api',
            'https://govtask.govsistem.com.br',
            true,
            '1.0.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'govtask');
    """)


def downgrade() -> None:
    op.execute("DELETE FROM modules WHERE slug = 'govtask'")
