-- Rollback: volta a unicidade global (tenant, contato).
-- Só é possível se não houver mais de uma conversa por contato — o que exige
-- remover fisicamente as conversas excluídas cujo contato já abriu outra.
DROP INDEX IF EXISTS conversas_tenant_contato_ativa_uk;
DROP INDEX IF EXISTS idx_conv_nao_excluidas;
ALTER TABLE conversas ADD CONSTRAINT conversas_tenant_id_contato_id_key
  UNIQUE (tenant_id, contato_id);
