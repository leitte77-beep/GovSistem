-- Exclusão administrativa de conversa: a conversa apagada deixa de ocupar o par
-- (tenant, contato).
--
-- Antes desta migração, o UNIQUE (tenant_id, contato_id) obrigava toda mensagem
-- futura do mesmo cidadão a cair na conversa já excluída: o UPSERT do gateway
-- reabria a conversa (status volta para 'fila') sem limpar deleted_at, e o
-- resultado era uma conversa zumbi — invisível na lista, impossível de responder
-- ("Conversa não encontrada") e engolindo as mensagens do cidadão.
--
-- Com o índice único parcial, o cidadão que volta a escrever depois da exclusão
-- ou do encerramento abre um atendimento novo e limpo. Como o runner reaplica
-- todas as migrations a cada inicialização, este arquivo também precisa usar o
-- predicado atual; caso contrário tentaria recriar a restrição antiga antes da
-- migration 029 e falharia quando já existissem ciclos encerrados do contato.

ALTER TABLE conversas DROP CONSTRAINT IF EXISTS conversas_tenant_id_contato_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS conversas_tenant_contato_ativa_uk
  ON conversas (tenant_id, contato_id)
  WHERE deleted_at IS NULL
    AND status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA');

-- Consultas de atendimento sempre descartam as excluídas.
CREATE INDEX IF NOT EXISTS idx_conv_nao_excluidas
  ON conversas (tenant_id, ultima_mensagem_em DESC)
  WHERE deleted_at IS NULL;
