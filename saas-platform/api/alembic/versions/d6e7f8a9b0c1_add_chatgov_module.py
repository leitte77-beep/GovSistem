"""add_chatgov_module

Revision ID: d6e7f8a9b0c1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-02 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'ChatGov',
            'chatgov',
            'Módulo de atendimento via WhatsApp com chat interno para equipes de governo',
            'smart_toy',
            'https://chatgov.govsistem.com.br',
            'https://chatgov.govsistem.com.br/api',
            'https://chatgov.govsistem.com.br',
            true,
            '1.0.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'chatgov');
    """)


def downgrade() -> None:
    op.execute("DELETE FROM modules WHERE slug = 'chatgov'")
