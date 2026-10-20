-- Acervo de atos — etapa 2: ato "somente registro" (não vai ao Diário).
-- Idempotente; aplicar manualmente.
ALTER TABLE matters
    ADD COLUMN IF NOT EXISTS gazette_publication boolean NOT NULL DEFAULT true;
