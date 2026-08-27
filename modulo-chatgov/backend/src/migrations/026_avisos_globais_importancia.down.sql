-- Rollback da importância/agendamento/duração dos avisos.
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS enviado_em;
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS expiracao_em;
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS agendar_em;
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS importancia;
