-- ============================================================
-- AVISOS GLOBAIS (popup do admin para atendentes online)
-- ============================================================
-- O admin do órgão escreve uma mensagem que aparece como popup em tempo real
-- para todos os atendentes online do mesmo tenant. `ativo` marca o aviso
-- vigente; `titulo` é opcional (ex.: "TI"). Histórico fica na própria tabela.

CREATE TABLE IF NOT EXISTS avisos_globais (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo        TEXT,
    mensagem      TEXT NOT NULL,
    ativo         BOOLEAN NOT NULL DEFAULT true,
    criado_por    UUID REFERENCES operadores(id) ON DELETE SET NULL,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consulta típica: "último aviso do tenant" e "aviso ativo para quem logou".
CREATE INDEX IF NOT EXISTS idx_avisos_globais_tenant
  ON avisos_globais(tenant_id, criado_em DESC);

-- Isolamento por tenant, no mesmo padrão das demais tabelas do módulo.
ALTER TABLE avisos_globais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_avisos_globais ON avisos_globais;
CREATE POLICY iso_avisos_globais ON avisos_globais
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
