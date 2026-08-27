-- ============================================================
-- AVISOS GLOBAIS — RECORRÊNCIA DIÁRIA
-- ============================================================
-- Permite que um aviso reapareça todo dia (popup) até uma data/hora de
-- encerramento, sem precisar reenviar manualmente.
--   recorrencia: 'unico' (padrão, comportamento atual) | 'diario'
--   encerra_em: data/hora final da exibição (obrigatória quando diario)
--   ultimo_emitido_em: controla a re-emissão de 1x por dia no loop de avisos.

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS recorrencia TEXT NOT NULL DEFAULT 'unico';
ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS encerra_em TIMESTAMPTZ;
ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS ultimo_emitido_em TIMESTAMPTZ;

-- Avisa diário só segue ativo enquanto não vencer encerra_em.
CREATE INDEX IF NOT EXISTS idx_avisos_globais_recorrencia
  ON avisos_globais(tenant_id, ativo)
  WHERE recorrencia = 'diario';
