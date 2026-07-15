"""add_govsocial_module

Registra o módulo GovSocial (Assistência Social / SUAS) e o habilita para os
órgãos que já possuem o GovTask (mesma base de adesão inicial).

Revision ID: govsocial01
Revises: c3p4f5p6a7r8
Create Date: 2026-07-10 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "govsocial01"
down_revision: Union[str, None] = "c3p4f5p6a7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'GovSocial',
            'govsocial',
            'Assistência Social (SUAS) — cadastro único municipal, prontuário eletrônico, benefícios, RMA e vigilância socioassistencial',
            'diversity_3',
            'https://govsocial.govsistem.com.br',
            'https://govsocial.govsistem.com.br/api/govsocial/v1',
            'https://govsocial.govsistem.com.br',
            true,
            '1.0.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'govsocial');
        """
    )
    # Habilita o GovSocial para os órgãos que já têm o GovTask ativo.
    op.execute(
        """
        INSERT INTO organization_modules (id, organization_id, module_id, is_active)
        SELECT gen_random_uuid(), om.organization_id, gs.id, true
        FROM organization_modules om
        JOIN modules gt ON gt.id = om.module_id AND gt.slug = 'govtask'
        CROSS JOIN modules gs
        WHERE gs.slug = 'govsocial'
          AND om.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM organization_modules x
              WHERE x.organization_id = om.organization_id AND x.module_id = gs.id
          );
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM organization_modules WHERE module_id IN (SELECT id FROM modules WHERE slug = 'govsocial')"
    )
    op.execute("DELETE FROM modules WHERE slug = 'govsocial'")
