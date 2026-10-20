-- Acervo de atos — etapa 1: numeração separada por entidade (Prefeitura/Câmara).
-- Idempotente. Aplicar manualmente (a stack modulo-diario não roda migrations).
BEGIN;

ALTER TABLE act_number_series
    ADD COLUMN IF NOT EXISTS org_unit_id uuid
    REFERENCES org_units(id) ON DELETE RESTRICT;

ALTER TABLE act_number_series
    DROP CONSTRAINT IF EXISTS uq_act_number_series_org_type_year;

CREATE UNIQUE INDEX IF NOT EXISTS uq_act_number_series_org_unit_type_year
    ON act_number_series (
        organization_id,
        act_type_id,
        year,
        COALESCE(org_unit_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- Consulta do acervo: pastas por tipo/entidade/ano.
CREATE INDEX IF NOT EXISTS ix_matters_acervo
    ON matters (organization_id, act_type_id, org_unit_id, act_year);

COMMIT;
