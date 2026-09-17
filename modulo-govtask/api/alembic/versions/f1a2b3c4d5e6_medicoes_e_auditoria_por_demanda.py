"""Medições sob a demanda e auditoria com vínculo de demanda (§58, §104).

Migração aditiva. `medicoes.convenio_id` passa a aceitar nulo e `demanda_id` é
adicionado, com a restrição que garante que toda medição tenha um dos dois pais —
o mesmo desenho de `obras`. A auditoria ganha `demanda_id` para que o registro
técnico aponte a demanda, e não apenas o convênio.

Revision ID: f1a2b3c4d5e6
Revises: f0a1b2c3d4e5
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # ── Auditoria por demanda (§104) ─────────────────────────────────────────
    op.add_column("auditoria", sa.Column("demanda_id", UUID, nullable=True))
    op.create_index("ix_auditoria_demanda_id", "auditoria", ["demanda_id"])

    # ── Medições sob a demanda (§58) ─────────────────────────────────────────
    op.alter_column("medicoes", "convenio_id", existing_type=UUID, nullable=True)
    op.add_column(
        "medicoes",
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_medicoes_demanda_id", "medicoes", ["demanda_id"])
    op.create_check_constraint(
        "ck_medicoes_tem_pai",
        "medicoes",
        "convenio_id IS NOT NULL OR demanda_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_medicoes_tem_pai", "medicoes", type_="check")
    op.drop_index("ix_medicoes_demanda_id", table_name="medicoes")
    op.drop_column("medicoes", "demanda_id")
    # Só volta a NOT NULL porque toda medição pré-existente tinha convênio.
    op.alter_column("medicoes", "convenio_id", existing_type=UUID, nullable=False)

    op.drop_index("ix_auditoria_demanda_id", table_name="auditoria")
    op.drop_column("auditoria", "demanda_id")
