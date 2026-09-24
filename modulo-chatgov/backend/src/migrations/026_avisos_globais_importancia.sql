-- ============================================================
-- AVISOS GLOBAIS — importância, agendamento e duração
-- ============================================================
-- Importância define como o popup se comporta:
--   'alta'  -> modal em tela cheia (requer ação)
--   'media' -> popup no canto, não bloqueia
--   'baixa' -> popup no canto, discreto
-- Agendamento (agendar_em) permite programar o envio para o futuro; o backend
-- emite quando vence. Duração (expiracao_em) é o instante em que o aviso deixa
-- de ser ativo (ex.: hora do envio + duração em minutos).

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS importancia TEXT NOT NULL DEFAULT 'media';

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS agendar_em TIMESTAMPTZ;

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS expiracao_em TIMESTAMPTZ;

ALTER TABLE avisos_globais ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ;

-- Garante valores válidos de importância (idempotente).
ALTER TABLE avisos_globais DROP CONSTRAINT IF EXISTS avisos_importancia_chk;
ALTER TABLE avisos_globais ADD CONSTRAINT avisos_importancia_chk
  CHECK (importancia IN ('baixa', 'media', 'alta'));

-- Índices do loop de agendamento/expiração.
CREATE INDEX IF NOT EXISTS idx_avisos_pendentes
  ON avisos_globais(ativo, enviado_em, agendar_em)
  WHERE agendar_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_expiracao
  ON avisos_globais(ativo, expiracao_em)
  WHERE expiracao_em IS NOT NULL;
