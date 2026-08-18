-- Fila pessoal: preserva quem o cidadão pediu e a última posição informada.
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS operador_solicitado_id UUID REFERENCES operadores(id) ON DELETE SET NULL;
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS fila_operador_entrou_em TIMESTAMPTZ;
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS fila_operador_posicao_notificada INTEGER;

CREATE INDEX IF NOT EXISTS idx_conversas_fila_operador
  ON conversas (tenant_id, operador_solicitado_id, fila_operador_entrou_em, id)
  WHERE operador_id IS NULL AND deleted_at IS NULL AND status_operacional = 'NA_FILA';
