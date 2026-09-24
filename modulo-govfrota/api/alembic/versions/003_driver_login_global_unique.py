"""Login do motorista globalmente único (case-insensitive).

Revision ID: 003
Revises: 002
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # 1) Nova coluna normalizada (trim + lowercase) — chave de unicidade global.
    op.add_column(
        "acessos_motorista",
        sa.Column("login_normalized", sa.String(60), nullable=True),
    )

    # 2) Backfill a partir do login existente.
    op.execute(
        "UPDATE acessos_motorista SET login_normalized = lower(trim(login)) "
        "WHERE login_normalized IS NULL"
    )

    # 3) Detectar logins duplicados APÓS normalização. Nunca perder cadastro
    #    silenciosamente: se houver duplicados, aborta a migration com uma
    #    mensagem explícita para resolução manual.
    dup = op.get_bind().execute(
        sa.text(
            "SELECT login_normalized, count(*) FROM acessos_motorista "
            "GROUP BY login_normalized HAVING count(*) > 1"
        )
    ).fetchall()
    if dup:
        detalhes = ", ".join(f"{r[0]!r} ({r[1]}x)" for r in dup)
        raise RuntimeError(
            "Logins de motorista duplicados encontrados (normalizados): "
            f"{detalhes}. Resolva as duplicidades antes de aplicar a "
            "unicidade global do login."
        )

    # 4) NOT NULL + unicidade global.
    op.alter_column("acessos_motorista", "login_normalized", nullable=False)
    op.create_index(
        "uq_acessos_login_normalized",
        "acessos_motorista",
        ["login_normalized"],
        unique=True,
    )
    # Garante que a aplicação sempre grave o login já normalizado.
    op.create_check_constraint(
        "ck_acesso_login_normalizado",
        "acessos_motorista",
        "login_normalized = lower(login)",
    )

    # 5) O índice antigo (não-único) sobre `login` torna-se redundante —
    #    a busca de autenticação passa a usar `login_normalized`.
    if is_postgres:
        op.drop_index("ix_acessos_motorista_login", table_name="acessos_motorista")


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.create_index("ix_acessos_motorista_login", "acessos_motorista", ["login"])
    op.drop_constraint("ck_acesso_login_normalizado", "acessos_motorista")
    op.drop_index("uq_acessos_login_normalized", table_name="acessos_motorista")
    op.drop_column("acessos_motorista", "login_normalized")
