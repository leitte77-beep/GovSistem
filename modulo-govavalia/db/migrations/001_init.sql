-- =====================================================================
--  govavalia — migration inicial
--  PostgreSQL 13+  (usa gen_random_uuid)
--
--  Tudo fica num schema próprio ("govavalia") para não se misturar com as
--  tabelas do sistema atual e ser fácil de auditar/manter por terceiros.
--
--  Classificação LGPD dos dados deste módulo:
--    - Pesquisa de satisfação ........ ANÔNIMA. Não é dado pessoal.
--    - Manifestação da ouvidoria ..... a mensagem pode conter dado pessoal
--      e até dado SENSÍVEL de saúde (art. 11 LGPD). O contato (nome/telefone/
--      e-mail) só existe quando o cidadão escolhe se identificar.
--    Base legal: execução de política pública (art. 7º, III) e Lei 13.460/2017.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS govavalia;

-- ---------------------------------------------------------------------
-- Unidades de saúde (UBS, postos...). Permite relatório por unidade.
-- ---------------------------------------------------------------------
CREATE TABLE govavalia.unidade (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Perguntas da pesquisa (configuráveis pela equipe, sem mexer em código).
-- ---------------------------------------------------------------------
CREATE TABLE govavalia.pergunta (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL UNIQUE,           -- identificador estável
  texto       text NOT NULL,
  ordem       int  NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Avaliação = uma resposta completa da pesquisa (anônima).
-- ---------------------------------------------------------------------
CREATE TABLE govavalia.avaliacao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  uuid REFERENCES govavalia.unidade(id),
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_avaliacao_criado_em ON govavalia.avaliacao(criado_em);

CREATE TABLE govavalia.avaliacao_resposta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id    uuid NOT NULL REFERENCES govavalia.avaliacao(id) ON DELETE CASCADE,
  pergunta_codigo text NOT NULL,
  pergunta_texto  text NOT NULL,              -- "fotografia" do texto na hora
  nota            int  NOT NULL CHECK (nota BETWEEN 1 AND 5)
);
CREATE INDEX idx_resposta_avaliacao ON govavalia.avaliacao_resposta(avaliacao_id);

-- ---------------------------------------------------------------------
-- Manifestação da ouvidoria (Lei 13.460/2017).
-- ---------------------------------------------------------------------
CREATE TABLE govavalia.manifestacao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo         text NOT NULL UNIQUE,
  tipo              text NOT NULL CHECK (tipo IN
                      ('elogio','reclamacao','sugestao','solicitacao','denuncia')),
  mensagem          text NOT NULL,            -- pode conter dado sensível
  anonimo           boolean NOT NULL DEFAULT true,
  contato           text,                     -- dado pessoal; nulo se anônimo
  contato_expira_em timestamptz,              -- retenção: quando anonimizar
  unidade_id        uuid REFERENCES govavalia.unidade(id),
  status            text NOT NULL DEFAULT 'recebida' CHECK (status IN
                      ('recebida','em_analise','respondida','concluida')),
  resposta          text,                     -- resposta da ouvidoria ao cidadão
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_manifestacao_criado_em ON govavalia.manifestacao(criado_em);
CREATE INDEX idx_manifestacao_status    ON govavalia.manifestacao(status);
CREATE INDEX idx_manifestacao_expira    ON govavalia.manifestacao(contato_expira_em)
  WHERE contato IS NOT NULL;

-- Histórico de andamento (transparência do trâmite).
CREATE TABLE govavalia.manifestacao_evento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifestacao_id  uuid NOT NULL REFERENCES govavalia.manifestacao(id) ON DELETE CASCADE,
  status           text NOT NULL,
  observacao       text,
  ator             text,                      -- id do servidor que mudou
  criado_em        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Idempotência: evita registro duplicado em duplo-toque/retry.
-- ---------------------------------------------------------------------
CREATE TABLE govavalia.idempotencia (
  chave         text PRIMARY KEY,
  recurso_tipo  text NOT NULL,
  recurso_id    text NOT NULL,
  resposta      jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Trilha de AUDITORIA — append-only, prova para órgão de controle.
-- Diferente de log de aplicação. NUNCA guardar aqui o conteúdo da
-- mensagem nem o contato; só ids, contagens e metadados.
-- ---------------------------------------------------------------------
CREATE TABLE govavalia.auditoria (
  id         bigserial PRIMARY KEY,
  ts         timestamptz NOT NULL DEFAULT now(),
  ator       text NOT NULL,         -- id do servidor, 'publico' ou 'sistema'
  acao       text NOT NULL,         -- ex.: 'manifestacao.ler', 'export.csv'
  recurso    text,                  -- ex.: 'manifestacao:<id>'
  origem     text,                  -- IP/host de origem
  detalhe    jsonb                  -- metadados não sensíveis
);
CREATE INDEX idx_auditoria_ts    ON govavalia.auditoria(ts);
CREATE INDEX idx_auditoria_ator  ON govavalia.auditoria(ator);

-- Imutabilidade: bloqueia UPDATE/DELETE na trilha de auditoria.
CREATE OR REPLACE FUNCTION govavalia.bloquear_alteracao_auditoria()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria e somente-inclusao (append-only).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON govavalia.auditoria
  FOR EACH ROW EXECUTE FUNCTION govavalia.bloquear_alteracao_auditoria();

-- ---------------------------------------------------------------------
-- Seed inicial.
-- ---------------------------------------------------------------------
INSERT INTO govavalia.unidade (nome) VALUES ('Secretaria Municipal de Saúde');

INSERT INTO govavalia.pergunta (codigo, texto, ordem) VALUES
  ('recepcao',     'Como foi o atendimento na recepção?',                 1),
  ('espera',       'O tempo de espera foi bom?',                          2),
  ('profissional', 'Como foi o atendimento do médico ou enfermeiro?',     3),
  ('ambiente',     'O local estava limpo e confortável?',                 4),
  ('geral',        'De modo geral, como foi seu atendimento de hoje?',    5);
