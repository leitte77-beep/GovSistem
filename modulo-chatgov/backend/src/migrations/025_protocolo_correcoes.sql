-- Protocolo Digital — correções sobre a migration 024 (idempotente)
-- Não remove dados: apenas corrige defaults, nomes e adiciona estruturas ausentes.

-- ──────────────────────────────────────────────────────────────
-- 1. Origem: o DEFAULT 'whatsapp' fazia qualquer protocolo criado
--    fora de uma conversa nascer marcado como WhatsApp.
--    A origem passa a ser obrigatória e explícita.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE protocolos ALTER COLUMN origem DROP DEFAULT;

-- ──────────────────────────────────────────────────────────────
-- 2. Coluna com acento no nome (indicação_sigilo) — exigia aspas em
--    toda consulta e nunca foi usada pelo código. Renomeia para o
--    nome correto, preservando qualquer dado existente.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocolos' AND column_name = 'indicação_sigilo'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocolos' AND column_name = 'indicacao_sigilo'
  ) THEN
    ALTER TABLE protocolos RENAME COLUMN "indicação_sigilo" TO indicacao_sigilo;
  END IF;
END $$;

ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS indicacao_sigilo TEXT;

-- ──────────────────────────────────────────────────────────────
-- 3. Idempotência na criação de protocolo (protege contra clique
--    duplo e retry de requisição gerando protocolos duplicados).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS protocolo_idempotencia (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    chave         TEXT NOT NULL,
    protocolo_id  UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, chave)
);
CREATE INDEX IF NOT EXISTS idx_protidem_prot ON protocolo_idempotencia(protocolo_id);
CREATE INDEX IF NOT EXISTS idx_protidem_criado ON protocolo_idempotencia(criado_em);

-- ──────────────────────────────────────────────────────────────
-- 4. Unicidade do número de protocolo por tenant (critério de aceite:
--    "restrição única para número do protocolo por tenant").
--    Criada como índice único concorrente-safe apenas se não houver
--    duplicatas pré-existentes.
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  duplicados INT;
BEGIN
  SELECT COUNT(*) INTO duplicados FROM (
    SELECT tenant_id, numero FROM protocolos
    WHERE deleted_at IS NULL
    GROUP BY tenant_id, numero HAVING COUNT(*) > 1
  ) d;

  IF duplicados = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prot_numero_tenant
      ON protocolos(tenant_id, numero) WHERE deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'uq_prot_numero_tenant não criado: % número(s) duplicado(s) em protocolos', duplicados;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 5. Tipos de movimentação: o CHECK da 024 não previa os eventos de
--    documento, pendência, mensagem e alterações de prazo/prioridade, então
--    esses registros de histórico eram rejeitados pelo banco e se perdiam.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE protocolo_movimentacoes DROP CONSTRAINT IF EXISTS ck_protmov_tipo;
ALTER TABLE protocolo_movimentacoes DROP CONSTRAINT IF EXISTS protocolo_movimentacoes_tipo_check;

ALTER TABLE protocolo_movimentacoes ADD CONSTRAINT ck_protmov_tipo CHECK (
  tipo IN (
    -- tramitação (já existiam na 024)
    'abertura','distribuicao','encaminhamento','recebimento','aceite',
    'devolucao','redistribuicao','solicitacao_informacao','resposta_interna',
    'despacho','parecer','ciencia','assinatura','conclusao','arquivamento',
    'reabertura','cancelamento','retificacao','outro',
    -- documentos
    'documento_anexado','documento_aprovado','documento_rejeitado',
    'documento_liberado','documento_removido',
    -- pendências
    'pendencia_criada','pendencia_respondida','pendencia_aprovada','pendencia_rejeitada',
    -- comunicação
    'mensagem_enviada','mensagem_recebida','anotacao_interna',
    -- alterações administrativas
    'atribuicao','alteracao_status','alteracao_prazo','alteracao_prioridade',
    'edicao','vinculo_criado','acesso_reenviado'
  )
);

-- Distingue o que da linha do tempo pode ser mostrado ao cidadão no portal.
-- Movimentações internas (anotações, despachos entre setores) ficam ocultas.
ALTER TABLE protocolo_movimentacoes
  ADD COLUMN IF NOT EXISTS visivel_cidadao BOOLEAN NOT NULL DEFAULT false;

-- Eventos que o cidadão sempre pode acompanhar.
UPDATE protocolo_movimentacoes
   SET visivel_cidadao = true
 WHERE tipo IN ('abertura','conclusao','cancelamento','reabertura','arquivamento')
   AND visivel_cidadao = false;

-- ──────────────────────────────────────────────────────────────
-- 6. Índices de apoio à listagem/filtros que a 024 não cobriu.
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prot_cidadao ON protocolos(tenant_id, cidadao_id)
  WHERE cidadao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prot_status_op ON protocolos(tenant_id, status_operacional);
CREATE INDEX IF NOT EXISTS idx_prot_prioridade ON protocolos(tenant_id, prioridade);
CREATE INDEX IF NOT EXISTS idx_prot_criado ON protocolos(tenant_id, aberto_em DESC);
CREATE INDEX IF NOT EXISTS idx_prot_atualizado ON protocolos(tenant_id, atualizado_em DESC);
