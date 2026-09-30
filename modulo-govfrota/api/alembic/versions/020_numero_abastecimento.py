"""Número do abastecimento por organização e ano (AB-2026/000123).

Gerado por gatilho no banco, então vale para todo caminho de cadastro (app do
motorista, lançamento administrativo, importações). O contador fica numa
tabela própria, travada pela linha (org, ano): dois cadastros simultâneos
nunca recebem o mesmo número. Cancelados mantêm o número; nada é reaproveitado.

Os abastecimentos existentes são numerados por ordem de data.
Reverter em produção = restaurar o dump feito antes do upgrade.

Revision ID: 020
Revises: 019
Create Date: 2026-09-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FUSO = "America/Sao_Paulo"


def upgrade() -> None:
    op.execute("ALTER TABLE abastecimentos ADD COLUMN numero_ano integer, ADD COLUMN numero_seq integer")
    op.execute(
        """
        CREATE TABLE abastecimento_numeracao (
            organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            ano integer NOT NULL,
            ultimo integer NOT NULL,
            PRIMARY KEY (organization_id, ano)
        )
        """
    )
    op.execute(
        f"""
        UPDATE abastecimentos a SET numero_ano = n.ano, numero_seq = n.seq
        FROM (
            SELECT id,
                   EXTRACT(YEAR FROM data_abastecimento AT TIME ZONE '{FUSO}')::int AS ano,
                   ROW_NUMBER() OVER (
                       PARTITION BY organization_id, EXTRACT(YEAR FROM data_abastecimento AT TIME ZONE '{FUSO}')
                       ORDER BY data_abastecimento, created_at, id
                   )::int AS seq
            FROM abastecimentos
        ) n
        WHERE a.id = n.id
        """
    )
    op.execute(
        """
        INSERT INTO abastecimento_numeracao (organization_id, ano, ultimo)
        SELECT organization_id, numero_ano, MAX(numero_seq) FROM abastecimentos GROUP BY 1, 2
        """
    )
    op.execute(
        f"""
        CREATE FUNCTION fn_numerar_abastecimento() RETURNS trigger AS $$
        BEGIN
            IF NEW.numero_seq IS NULL THEN
                NEW.numero_ano := EXTRACT(YEAR FROM COALESCE(NEW.data_abastecimento, now()) AT TIME ZONE '{FUSO}')::int;
                INSERT INTO abastecimento_numeracao AS c (organization_id, ano, ultimo)
                VALUES (NEW.organization_id, NEW.numero_ano, 1)
                ON CONFLICT (organization_id, ano) DO UPDATE SET ultimo = c.ultimo + 1
                RETURNING ultimo INTO NEW.numero_seq;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        "CREATE TRIGGER trg_numerar_abastecimento BEFORE INSERT ON abastecimentos "
        "FOR EACH ROW EXECUTE FUNCTION fn_numerar_abastecimento()"
    )
    op.execute("ALTER TABLE abastecimentos ALTER COLUMN numero_ano SET NOT NULL, ALTER COLUMN numero_seq SET NOT NULL")
    op.execute("CREATE UNIQUE INDEX uq_abast_org_numero ON abastecimentos (organization_id, numero_ano, numero_seq)")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_numerar_abastecimento ON abastecimentos")
    op.execute("DROP FUNCTION IF EXISTS fn_numerar_abastecimento()")
    op.execute("DROP INDEX IF EXISTS uq_abast_org_numero")
    op.execute("DROP TABLE IF EXISTS abastecimento_numeracao")
    op.execute("ALTER TABLE abastecimentos DROP COLUMN IF EXISTS numero_seq, DROP COLUMN IF EXISTS numero_ano")
