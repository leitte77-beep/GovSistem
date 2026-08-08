-- Sessão de conta do cidadão (login/cadastro no portal) não nasce presa a um
-- protocolo: criarSessaoPublica passa protocolo_id = NULL nesse caso, e o
-- NOT NULL original derrubava login e cadastro com 500.
ALTER TABLE protocolo_sessoes_acesso ALTER COLUMN protocolo_id DROP NOT NULL;

-- Toda sessão continua tendo dono: ou um protocolo (acesso por código) ou uma
-- conta de cidadão (login no portal).
DO $$ BEGIN
  ALTER TABLE protocolo_sessoes_acesso ADD CONSTRAINT ck_protses_vinculo CHECK (
    protocolo_id IS NOT NULL OR cidadao_conta_id IS NOT NULL
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
