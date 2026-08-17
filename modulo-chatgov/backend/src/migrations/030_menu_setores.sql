-- Iris — Menu de setores (mídia no primeiro contato).
-- Guarda a ordem dos UUIDs de departamentos enviados no menu, para resolver a
-- escolha numérica do cidadão ("3" → 3º setor) de forma determinística, sem
-- depender da IA interpretar o número.
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS menu_setores JSONB;
