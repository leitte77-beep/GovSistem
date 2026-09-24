-- Entidades configuráveis da Central Municipal. Migração expansiva e idempotente.

CREATE TABLE IF NOT EXISTS canais_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('whatsapp_baileys','whatsapp_cloud_api','webchat','outro')),
  numero TEXT,
  situacao TEXT NOT NULL DEFAULT 'desconectado',
  horario_id UUID,
  conectado_em TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ,
  webhook_url TEXT,
  erro_codigo TEXT,
  erro_detalhe TEXT,
  segredo_criptografado TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canais_atendimento_tenant ON canais_atendimento(tenant_id, ativo);

CREATE TABLE IF NOT EXISTS canal_departamentos (
  canal_id UUID NOT NULL REFERENCES canais_atendimento(id) ON DELETE CASCADE,
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  PRIMARY KEY (canal_id, departamento_id)
);
CREATE TABLE IF NOT EXISTS canal_operadores (
  canal_id UUID NOT NULL REFERENCES canais_atendimento(id) ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
  PRIMARY KEY (canal_id, operador_id)
);
CREATE TABLE IF NOT EXISTS canal_eventos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canal_id UUID NOT NULL REFERENCES canais_atendimento(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  motivo TEXT,
  operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
  detalhe JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS horarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  periodos JSONB NOT NULL DEFAULT '{}'::jsonb,
  mensagem_ausencia TEXT,
  repeticao_minutos INTEGER NOT NULL DEFAULT 720,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS horario_excecoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  horario_id UUID NOT NULL REFERENCES horarios_atendimento(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('feriado','ponto_facultativo','excecao','plantao')),
  periodos JSONB,
  mensagem TEXT,
  UNIQUE (horario_id, data)
);

CREATE TABLE IF NOT EXISTS sla_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  departamento_id UUID REFERENCES departamentos(id) ON DELETE CASCADE,
  primeira_resposta_minutos INTEGER NOT NULL DEFAULT 30,
  resolucao_minutos INTEGER NOT NULL DEFAULT 480,
  usar_horario_util BOOLEAN NOT NULL DEFAULT true,
  horario_id UUID REFERENCES horarios_atendimento(id) ON DELETE SET NULL,
  alerta_percentual INTEGER NOT NULL DEFAULT 80,
  escalonamento JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, departamento_id)
);
CREATE TABLE IF NOT EXISTS sla_eventos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  motivo TEXT,
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim_em TIMESTAMPTZ,
  operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS roteamento_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  departamento_id UUID REFERENCES departamentos(id) ON DELETE CASCADE,
  estrategia TEXT NOT NULL DEFAULT 'menor_carga',
  limite_carga_padrao INTEGER NOT NULL DEFAULT 10,
  regras JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, departamento_id)
);
CREATE TABLE IF NOT EXISTS roteamento_eventos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
  departamento_id UUID REFERENCES departamentos(id) ON DELETE SET NULL,
  estrategia TEXT,
  motivo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contatos_bloqueados ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
ALTER TABLE contatos_bloqueados ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE contatos_bloqueados ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ;
ALTER TABLE contatos_bloqueados ADD COLUMN IF NOT EXISTS desbloqueado_em TIMESTAMPTZ;
ALTER TABLE contatos_bloqueados ADD COLUMN IF NOT EXISTS desbloqueado_por UUID REFERENCES operadores(id);
ALTER TABLE contatos_bloqueados ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS bloqueio_tentativas (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bloqueio_id UUID REFERENCES contatos_bloqueados(id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL,
  provider_message_id TEXT,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'resposta_rapida';
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS idioma TEXT NOT NULL DEFAULT 'pt_BR';
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS variaveis JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS exemplo JSONB;
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT 'rascunho';
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES operadores(id);
ALTER TABLE templates_mensagem ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE templates_mensagem SET nome = titulo WHERE nome IS NULL;
CREATE TABLE IF NOT EXISTS template_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES templates_mensagem(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  variaveis JSONB NOT NULL DEFAULT '[]'::jsonb,
  operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, versao)
);

CREATE TABLE IF NOT EXISTS chatbot_fluxos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'rascunho',
  versao_publicada INTEGER,
  canal_id UUID REFERENCES canais_atendimento(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chatbot_fluxo_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fluxo_id UUID NOT NULL REFERENCES chatbot_fluxos(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  definicao JSONB NOT NULL,
  validacao JSONB,
  publicado_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
  publicado_em TIMESTAMPTZ,
  UNIQUE (fluxo_id, versao)
);

CREATE TABLE IF NOT EXISTS iris_prompt_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  instrucoes_sistema TEXT NOT NULL,
  fontes_autorizadas JSONB NOT NULL DEFAULT '[]'::jsonb,
  limite_confianca REAL NOT NULL DEFAULT 0.7,
  situacao TEXT NOT NULL DEFAULT 'rascunho',
  criado_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
  aprovado_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_em TIMESTAMPTZ,
  UNIQUE (tenant_id, versao)
);
CREATE TABLE IF NOT EXISTS iris_execucoes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id UUID REFERENCES conversas(id) ON DELETE SET NULL,
  prompt_versao_id UUID REFERENCES iris_prompt_versoes(id) ON DELETE SET NULL,
  modelo TEXT NOT NULL,
  fontes JSONB NOT NULL DEFAULT '[]'::jsonb,
  confianca REAL,
  duracao_ms INTEGER,
  custo NUMERIC(14,6),
  resposta TEXT,
  decisao TEXT,
  motivo TEXT,
  avaliacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mensagens_dead_letter (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mensagem_id UUID REFERENCES mensagens(id) ON DELETE SET NULL,
  payload JSONB,
  erro_codigo TEXT,
  erro_detalhe TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID REFERENCES operadores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS politicas_retencao (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  dias_conversas INTEGER,
  dias_midias INTEGER,
  dias_auditoria INTEGER,
  modo TEXT NOT NULL DEFAULT 'arquivar',
  ativo BOOLEAN NOT NULL DEFAULT false,
  atualizado_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE operadores ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS dois_fatores_ativo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS sessao_versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS limite_conversas INTEGER;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS ultimo_acesso_em TIMESTAMPTZ;

DO $$
DECLARE tabela TEXT;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'canais_atendimento','canal_eventos','horarios_atendimento','horario_excecoes',
    'sla_configuracoes','sla_eventos','roteamento_configuracoes','roteamento_eventos',
    'bloqueio_tentativas','template_versoes','chatbot_fluxos','chatbot_fluxo_versoes',
    'iris_prompt_versoes','iris_execucoes','mensagens_dead_letter','politicas_retencao'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'iso_' || tabela, tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      'iso_' || tabela, tabela
    );
  END LOOP;
END $$;

