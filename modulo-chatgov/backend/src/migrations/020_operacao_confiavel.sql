-- Confiabilidade operacional: somente adições compatíveis com os dados legados.

CREATE TABLE IF NOT EXISTS protocolo_sequencias (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ultimo_numero BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, ano, mes)
);

-- Inicializa os contadores sem renumerar protocolos existentes.
INSERT INTO protocolo_sequencias (tenant_id, ano, mes, ultimo_numero)
SELECT tenant_id,
       split_part(numero, '-', 1)::int,
       split_part(numero, '-', 2)::int,
       MAX(split_part(numero, '-', 3)::bigint)
FROM protocolos
WHERE numero ~ '^\d{4}-\d{2}-\d+$'
GROUP BY tenant_id, split_part(numero, '-', 1), split_part(numero, '-', 2)
ON CONFLICT (tenant_id, ano, mes)
DO UPDATE SET ultimo_numero = GREATEST(
  protocolo_sequencias.ultimo_numero, EXCLUDED.ultimo_numero
);

ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'sistema';
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS arquivada_em TIMESTAMPTZ;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS entidade TEXT;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS entidade_id UUID;
CREATE INDEX IF NOT EXISTS idx_notificacoes_central
  ON notificacoes(tenant_id, operador_id, lida, criado_em DESC)
  WHERE arquivada_em IS NULL;

ALTER TABLE contatos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_contatos_ativos
  ON contatos(tenant_id, lower(nome), phone_e164)
  WHERE deleted_at IS NULL AND merged_into_id IS NULL;

CREATE TABLE IF NOT EXISTS contato_nomes_alternativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contato_id, nome)
);

CREATE TABLE IF NOT EXISTS contato_merge_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contato_origem_id UUID NOT NULL REFERENCES contatos(id),
  contato_destino_id UUID NOT NULL REFERENCES contatos(id),
  operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS hash_integridade TEXT;

CREATE OR REPLACE FUNCTION impedir_mutacao_auditoria()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são imutáveis';
END $$;

DROP TRIGGER IF EXISTS auditoria_imutavel_update ON auditoria;
CREATE TRIGGER auditoria_imutavel_update
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_auditoria();
