-- Adiciona colunas de recuperação de senha à tabela cidadao_contas
ALTER TABLE cidadao_contas
ADD COLUMN IF NOT EXISTS reset_token TEXT,
ADD COLUMN IF NOT EXISTS reset_token_expira_em TIMESTAMPTZ;
