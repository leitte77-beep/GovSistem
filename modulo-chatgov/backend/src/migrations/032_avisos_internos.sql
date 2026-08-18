CREATE TABLE IF NOT EXISTS avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo VARCHAR(120) NOT NULL,
  mensagem TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'informativo'
    CHECK (prioridade IN ('informativo', 'importante', 'urgente')),
  publico TEXT NOT NULL DEFAULT 'todos'
    CHECK (publico IN ('todos', 'setores')),
  exige_confirmacao BOOLEAN NOT NULL DEFAULT true,
  ativo BOOLEAN NOT NULL DEFAULT true,
  publicado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ,
  criado_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aviso_departamentos (
  aviso_id UUID NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (aviso_id, departamento_id)
);

CREATE TABLE IF NOT EXISTS aviso_leituras (
  aviso_id UUID NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_em TIMESTAMPTZ,
  PRIMARY KEY (aviso_id, operador_id)
);

CREATE INDEX IF NOT EXISTS idx_avisos_tenant_publicados
  ON avisos (tenant_id, ativo, publicado_em DESC);
CREATE INDEX IF NOT EXISTS idx_aviso_leituras_operador
  ON aviso_leituras (tenant_id, operador_id, aviso_id);
CREATE INDEX IF NOT EXISTS idx_aviso_departamentos_setor
  ON aviso_departamentos (tenant_id, departamento_id, aviso_id);

ALTER TABLE avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aviso_departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aviso_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_avisos ON avisos;
CREATE POLICY iso_avisos ON avisos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS iso_aviso_departamentos ON aviso_departamentos;
CREATE POLICY iso_aviso_departamentos ON aviso_departamentos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS iso_aviso_leituras ON aviso_leituras;
CREATE POLICY iso_aviso_leituras ON aviso_leituras
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
