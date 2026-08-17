-- Um contato pode ter vários atendimentos encerrados, mas somente um ciclo
-- operacional ativo por tenant. Assim, uma nova mensagem após resolução ou
-- arquivamento cria outra conversa e não mistura mensagens/participantes.

DROP INDEX IF EXISTS conversas_tenant_contato_ativa_uk;

CREATE UNIQUE INDEX IF NOT EXISTS conversas_tenant_contato_em_andamento_uk
  ON conversas (tenant_id, contato_id)
  WHERE deleted_at IS NULL
    AND status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA');
