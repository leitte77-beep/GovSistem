-- ============================================================
-- AVISOS GLOBAIS — CIÊNCIA POR OPERADOR
-- ============================================================
-- Sem isso, um aviso "único" (sem duração) continuava sendo devolvido por
-- GET /api/avisos/ativo a cada login/refresh — o único filtro era o
-- localStorage do navegador, que expirava a cada dia. O aviso reaparecia
-- eternamente para quem já tinha fechado o popup.
--
-- Aqui guardamos, por operador, quando ele fechou cada aviso. A regra de
-- exibição no login passa a ser:
--   - recorrencia = 'unico'  -> nunca mais mostra para quem já fechou;
--   - recorrencia = 'diario' -> volta a mostrar no dia seguinte até encerra_em.

CREATE TABLE IF NOT EXISTS avisos_globais_visualizados (
    aviso_id       UUID NOT NULL REFERENCES avisos_globais(id) ON DELETE CASCADE,
    operador_id    UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    visualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (aviso_id, operador_id)
);

-- Consulta do login: "este operador já fechou este aviso?".
CREATE INDEX IF NOT EXISTS idx_avisos_visualizados_operador
  ON avisos_globais_visualizados(tenant_id, operador_id, aviso_id);

-- Isolamento por tenant, no mesmo padrão das demais tabelas do módulo.
ALTER TABLE avisos_globais_visualizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_avisos_visualizados ON avisos_globais_visualizados;
CREATE POLICY iso_avisos_visualizados ON avisos_globais_visualizados
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
