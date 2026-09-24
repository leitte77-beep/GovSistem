-- Rollback do direcionamento dos avisos globais.
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS operador_ids;
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS departamento_ids;
ALTER TABLE avisos_globais DROP COLUMN IF EXISTS destino;
