-- Rollback conservador: preserva os dados e remove apenas constraints/índices.
-- Colunas permanecem para que rollback de aplicação não destrua histórico novo.
DROP INDEX IF EXISTS uq_mensagem_idempotency;
DROP INDEX IF EXISTS uq_contato_phone_e164;
DROP INDEX IF EXISTS idx_contato_phone_e164;
DROP INDEX IF EXISTS idx_conv_operacao_v2;
DROP INDEX IF EXISTS idx_eventos_status_entidade;
ALTER TABLE conversas DROP CONSTRAINT IF EXISTS ck_conversa_status_operacional;
ALTER TABLE conversas DROP CONSTRAINT IF EXISTS ck_conversa_prioridade;
