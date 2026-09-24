"""add_govfrota_module

Revision ID: k2l3m4n5o6p7
Revises: g8h9i0j1k2l3
Create Date: 2026-08-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'k2l3m4n5o6p7'
down_revision: Union[str, None] = 'h9i0j1k2l3m4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'GovFrota',
            'govfrota',
            'Gestão de frota — veículos, motoristas, abastecimentos, estoque de combustível e manutenção em um só lugar',
            'local_shipping',
            'https://frota.govsistem.com.br',
            'https://frota.govsistem.com.br/api',
            'https://frota.govsistem.com.br',
            true,
            '1.0.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'govfrota');
    """)
    # Domínio definitivo: frota.govsistem.com.br. Se o módulo já existir,
    # apenas atualiza as URLs (não cria duplicado).
    op.execute("""
        UPDATE modules SET
            base_url = 'https://frota.govsistem.com.br',
            api_url  = 'https://frota.govsistem.com.br/api',
            admin_url = 'https://frota.govsistem.com.br',
            name = 'GovFrota',
            is_active = true
        WHERE slug = 'govfrota';
    """)


def downgrade() -> None:
    op.execute("DELETE FROM modules WHERE slug = 'govfrota'")
