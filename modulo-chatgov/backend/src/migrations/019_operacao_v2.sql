-- Fundação operacional v2. Migração expansiva e idempotente:
-- não remove nem renomeia campos legados durante a adoção gradual.

ALTER TABLE conversas ADD COLUMN IF NOT EXISTS status_operacional TEXT;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS prioridade TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS prioridade_justificativa TEXT;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS spam BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS bloqueada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS arquivada_em TIMESTAMPTZ;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resolvida_em TIMESTAMPTZ;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS primeira_resposta_em TIMESTAMPTZ;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES operadores(id);
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS delete_reason TEXT;

UPDATE conversas SET status_operacional = CASE
  WHEN status = 'fila' THEN 'NA_FILA'
  WHEN status = 'aberta' AND operador_id IS NOT NULL THEN 'EM_ATENDIMENTO'
  WHEN status = 'aberta' THEN 'NA_FILA'
  WHEN status = 'resolvida' THEN 'RESOLVIDA'
  WHEN status = 'arquivada' THEN 'ARQUIVADA'
  ELSE 'NOVA'
END WHERE status_operacional IS NULL;
ALTER TABLE conversas ALTER COLUMN status_operacional SET DEFAULT 'NOVA';
ALTER TABLE conversas ALTER COLUMN status_operacional SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE conversas ADD CONSTRAINT ck_conversa_status_operacional CHECK (
    status_operacional IN ('NOVA','NA_FILA','EM_ATENDIMENTO','AGUARDANDO_CIDADAO','AGUARDANDO_SETOR','RESOLVIDA','ARQUIVADA')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE conversas ADD CONSTRAINT ck_conversa_prioridade CHECK (
    prioridade IN ('BAIXA','NORMAL','ALTA','URGENTE')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_conv_operacao_v2
  ON conversas(tenant_id, status_operacional, prioridade, ultima_mensagem_em DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS eventos_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidade TEXT NOT NULL CHECK (entidade IN ('conversa','protocolo')),
  entidade_id UUID NOT NULL,
  status_anterior TEXT,
  novo_status TEXT NOT NULL,
  operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
  justificativa TEXT,
  origem TEXT NOT NULL DEFAULT 'usuario',
  ip INET,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_status_entidade
  ON eventos_status(tenant_id, entidade, entidade_id, criado_em DESC);

ALTER TABLE contatos ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS phone_display TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS area_code TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS local_number TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES contatos(id) ON DELETE SET NULL;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE contatos SET phone_e164 = '+' || regexp_replace(COALESCE(telefone, wa_jid), '\D', '', 'g')
 WHERE phone_e164 IS NULL AND regexp_replace(COALESCE(telefone, wa_jid), '\D', '', 'g') <> '';
-- Dados legados duplicados são preservados. A unicidade só é ativada quando
-- o conjunto atual estiver limpo; caso contrário, mantém índice de diagnóstico.
CREATE INDEX IF NOT EXISTS idx_contato_phone_e164
  ON contatos(tenant_id, canal, phone_e164)
  WHERE phone_e164 IS NOT NULL AND merged_into_id IS NULL AND deleted_at IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM contatos
    WHERE phone_e164 IS NOT NULL AND merged_into_id IS NULL AND deleted_at IS NULL
    GROUP BY tenant_id, canal, phone_e164 HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_contato_phone_e164
      ON contatos(tenant_id, canal, phone_e164)
      WHERE phone_e164 IS NOT NULL AND merged_into_id IS NULL AND deleted_at IS NULL;
  END IF;
END $$;

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'atendente';
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS falha_codigo TEXT;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS falha_detalhe TEXT;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS proxima_tentativa_em TIMESTAMPTZ;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates_mensagem(id) ON DELETE SET NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagem_idempotency
  ON mensagens(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS status_operacional TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS prazo_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS resultado TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS motivo_reabertura TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE protocolos SET status_operacional = CASE
  WHEN lower(status) = 'aberto' THEN 'ABERTO'
  WHEN lower(status) IN ('em_andamento','andamento') THEN 'EM_ANDAMENTO'
  WHEN lower(status) = 'pendente' THEN 'PENDENTE'
  WHEN lower(status) IN ('concluido','encerrado') THEN 'CONCLUIDO'
  WHEN lower(status) = 'cancelado' THEN 'CANCELADO'
  ELSE 'ABERTO'
END WHERE status_operacional IS NULL;
ALTER TABLE protocolos ALTER COLUMN status_operacional SET DEFAULT 'ABERTO';
ALTER TABLE protocolos ALTER COLUMN status_operacional SET NOT NULL;

ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'sistema';
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip INET;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS entidade TEXT;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS entidade_id UUID;

ALTER TABLE eventos_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_eventos_status ON eventos_status;
CREATE POLICY iso_eventos_status ON eventos_status
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
