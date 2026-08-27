-- ============================================================
-- AVISOS GLOBAIS — direcionamento (todos / departamentos / usuários)
-- ============================================================
-- O aviso pode ser enviado para todos os atendentes online, ou apenas para
-- os de determinados departamentos, ou para usuários específicos. O destino
-- é persistido para que quem logar depois (GET /api/avisos/ativo) só receba
-- o aviso se for um dos destinatários.

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS destino TEXT NOT NULL DEFAULT 'todos';
-- destino: 'todos' | 'departamentos' | 'usuarios'

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS departamento_ids JSONB NOT NULL DEFAULT '[]';
ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS operador_ids JSONB NOT NULL DEFAULT '[]';

-- Consulta de "aviso ativo para este usuário" filtra por tenant + destino.
CREATE INDEX IF NOT EXISTS idx_avisos_destino ON avisos_globais(tenant_id, destino);
