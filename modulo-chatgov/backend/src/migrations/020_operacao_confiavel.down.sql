-- Rollback conservador: remove estruturas executáveis, preservando dados.
DROP TRIGGER IF EXISTS auditoria_imutavel_update ON auditoria;
DROP FUNCTION IF EXISTS impedir_mutacao_auditoria();
DROP INDEX IF EXISTS idx_contatos_ativos;
DROP INDEX IF EXISTS idx_notificacoes_central;
-- As colunas e sequências não são removidas para evitar perda de dados.
