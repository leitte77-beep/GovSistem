"""add_govsaude_module

Registra o módulo GovSaúde (Gestão da Saúde Pública Municipal) e o habilita
para os órgãos que já utilizam o GovTask (mesma base de adesão inicial).

Revision ID: govsaude01
Revises: govsocial01
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op

revision: str = "govsaude01"
down_revision: Union[str, None] = "govsocial01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO modules (id, name, slug, description, icon, base_url, api_url, admin_url, is_active, version)
        SELECT
            gen_random_uuid(),
            'GovSaúde',
            'govsaude',
            'Gestão da Saúde Pública Municipal — cadastro único, PEC, território, agenda, programas, odontologia, estoque, imunização, laboratório, regulação, faturamento, vigilância sanitária e indicadores da APS',
            'health_and_safety',
            'https://saude.govsistem.com.br',
            'https://saude.govsistem.com.br/api/govsaude/v1',
            'https://saude.govsistem.com.br',
            true,
            '0.1.0'
        WHERE NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'govsaude');
        """
    )
    op.execute(
        """
        INSERT INTO organization_modules (id, organization_id, module_id, is_active)
        SELECT gen_random_uuid(), om.organization_id, gs.id, true
        FROM organization_modules om
        JOIN modules gt ON gt.id = om.module_id AND gt.slug = 'govtask'
        CROSS JOIN modules gs
        WHERE gs.slug = 'govsaude'
          AND om.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM organization_modules x
              WHERE x.organization_id = om.organization_id AND x.module_id = gs.id
          );
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM organization_modules WHERE module_id IN "
        "(SELECT id FROM modules WHERE slug = 'govsaude')"
    )
    op.execute("DELETE FROM modules WHERE slug = 'govsaude'")
