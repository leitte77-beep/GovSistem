CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome      TEXT NOT NULL,
    slug      TEXT UNIQUE NOT NULL,
    ativo     BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departamentos (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome      TEXT NOT NULL,
    cor       TEXT DEFAULT '#00A884',
    ativo     BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dep_tenant ON departamentos(tenant_id);

CREATE TABLE IF NOT EXISTS operadores (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome         TEXT NOT NULL,
    email        TEXT NOT NULL,
    senha_hash   TEXT NOT NULL,
    papel        TEXT NOT NULL DEFAULT 'operador',
    avatar_url   TEXT,
    online       BOOLEAN NOT NULL DEFAULT false,
    ultimo_visto TIMESTAMPTZ,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_op_tenant ON operadores(tenant_id);

CREATE TABLE IF NOT EXISTS operador_departamentos (
    operador_id     UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    PRIMARY KEY (operador_id, departamento_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_sessoes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    numero        TEXT,
    status        TEXT NOT NULL DEFAULT 'desconectado',
    creds         JSONB,
    keys          JSONB,
    conectado_em  TIMESTAMPTZ,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contatos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wa_jid     TEXT NOT NULL,
    nome       TEXT,
    telefone   TEXT,
    avatar_url TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, wa_jid)
);
CREATE INDEX IF NOT EXISTS idx_contato_tenant ON contatos(tenant_id);

CREATE TABLE IF NOT EXISTS contato_aliases (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contato_id UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    alias_jid  TEXT NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, alias_jid)
);
CREATE INDEX IF NOT EXISTS idx_contato_alias_contato ON contato_aliases(contato_id);

CREATE TABLE IF NOT EXISTS conversas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contato_id         UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    departamento_id    UUID REFERENCES departamentos(id),
    operador_id        UUID REFERENCES operadores(id),
    status             TEXT NOT NULL DEFAULT 'fila',
    nao_lidas          INTEGER NOT NULL DEFAULT 0,
    ultima_mensagem    TEXT,
    ultima_mensagem_em TIMESTAMPTZ,
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, contato_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_dep    ON conversas(departamento_id);

CREATE TABLE IF NOT EXISTS mensagens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversa_id   UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    wa_message_id TEXT,
    direcao       TEXT NOT NULL,
    operador_id   UUID REFERENCES operadores(id),
    tipo          TEXT NOT NULL DEFAULT 'texto',
    conteudo      TEXT,
    media_url     TEXT,
    media_mime    TEXT,
    status        TEXT DEFAULT 'enviado',
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_conversa ON mensagens(conversa_id, criado_em);
-- Remove duplicatas de mensagens recebidas (mesmo wa_message_id) mantendo a mais antiga.
DELETE FROM mensagens m
  USING mensagens d
  WHERE m.tenant_id = d.tenant_id
    AND m.wa_message_id = d.wa_message_id
    AND m.wa_message_id IS NOT NULL
    AND m.ctid > d.ctid;
-- Garante unicidade de wa_message_id por tenant (evita duplicação em corrida).
CREATE UNIQUE INDEX IF NOT EXISTS uq_msg_wa_id
  ON mensagens(tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS canais_internos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome       TEXT,
    tipo       TEXT NOT NULL DEFAULT 'dm',
    criado_por UUID REFERENCES operadores(id),
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canal_tenant ON canais_internos(tenant_id);

CREATE TABLE IF NOT EXISTS canal_membros (
    canal_id    UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    PRIMARY KEY (canal_id, operador_id)
);

CREATE TABLE IF NOT EXISTS mensagens_internas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    canal_id     UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    remetente_id UUID NOT NULL REFERENCES operadores(id),
    tipo         TEXT NOT NULL DEFAULT 'texto',
    conteudo     TEXT,
    media_url    TEXT,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msgint_canal ON mensagens_internas(canal_id, criado_em);

CREATE TABLE IF NOT EXISTS auditoria (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    operador_id UUID,
    acao        TEXT NOT NULL,
    detalhe     JSONB,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON auditoria(tenant_id, criado_em);

ALTER TABLE conversas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contatos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessoes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_conversas          ON conversas;
DROP POLICY IF EXISTS iso_mensagens          ON mensagens;
DROP POLICY IF EXISTS iso_mensagens_internas ON mensagens_internas;
DROP POLICY IF EXISTS iso_contatos           ON contatos;
DROP POLICY IF EXISTS iso_whatsapp_sessoes   ON whatsapp_sessoes;

CREATE POLICY iso_conversas ON conversas
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY iso_mensagens ON mensagens
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY iso_mensagens_internas ON mensagens_internas
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY iso_contatos ON contatos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY iso_whatsapp_sessoes ON whatsapp_sessoes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================
-- Colunas complementares em tabelas existentes (idempotente)
-- (sem FK para novas tabelas)
-- ============================================================
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS status_atendente TEXT NOT NULL DEFAULT 'disponivel';
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS capacidade_maxima INTEGER NOT NULL DEFAULT 5;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS bairro TEXT;

-- ============================================================
-- Enterprise: Secretarias > Departamentos + Participantes de conversa
-- (append idempotente — seguro para rodar em bancos já existentes)
-- ============================================================

CREATE TABLE IF NOT EXISTS secretarias (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome      TEXT NOT NULL,
    cor       TEXT DEFAULT '#2563EB',
    ativo     BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sec_tenant ON secretarias(tenant_id);

ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS secretaria_id UUID REFERENCES secretarias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dep_secretaria ON departamentos(secretaria_id);

-- Quem participa de uma conversa de atendimento (privacidade).
-- papel: 'dono' (assumiu) | 'anexado' (convidado por outro)
CREATE TABLE IF NOT EXISTS conversa_participantes (
    conversa_id   UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    operador_id   UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    papel         TEXT NOT NULL DEFAULT 'anexado',
    adicionado_por UUID REFERENCES operadores(id),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversa_id, operador_id)
);
CREATE INDEX IF NOT EXISTS idx_part_operador ON conversa_participantes(operador_id);
CREATE INDEX IF NOT EXISTS idx_part_conversa ON conversa_participantes(conversa_id);

-- Backfill: todo operador_id já atribuído numa conversa vira 'dono' participante.
INSERT INTO conversa_participantes (conversa_id, operador_id, papel, tenant_id, adicionado_por)
SELECT c.id, c.operador_id, 'dono', c.tenant_id, c.operador_id FROM conversas c
WHERE c.operador_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM conversa_participantes cp
    WHERE cp.conversa_id = c.id AND cp.operador_id = c.operador_id
  );

-- Configurações do ChatGov por órgão (conexão, API oficial, atendimento).
CREATE TABLE IF NOT EXISTS tenant_config (
    tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    provider           TEXT NOT NULL DEFAULT 'baileys',  -- 'baileys' (QR) | 'oficial' (Cloud API)
    wa_api_phone_id    TEXT,
    wa_api_token       TEXT,   -- criptografado
    wa_api_verify_token TEXT,
    wa_api_business_id TEXT,
    saudacao           TEXT,
    mensagem_ausencia  TEXT,
    horario_inicio     TEXT,   -- 'HH:MM'
    horario_fim        TEXT,
    dias_atendimento   TEXT DEFAULT '1,2,3,4,5',  -- 0=Dom ... 6=Sáb
    fora_horario_ativo BOOLEAN NOT NULL DEFAULT false,
    assinatura_ativa   BOOLEAN NOT NULL DEFAULT true,   -- prefixa mensagens com o nome do atendente
    assinatura_modo    TEXT NOT NULL DEFAULT 'completo', -- 'completo' | 'primeiro'
    atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Colunas adicionadas em instalações já existentes.
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS assinatura_ativa BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS assinatura_modo TEXT NOT NULL DEFAULT 'completo';

-- Contatos/números bloqueados por órgão.
CREATE TABLE IF NOT EXISTS contatos_bloqueados (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    telefone    TEXT NOT NULL,
    motivo      TEXT,
    bloqueado_por UUID REFERENCES operadores(id),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, telefone)
);
CREATE INDEX IF NOT EXISTS idx_bloq_tenant ON contatos_bloqueados(tenant_id);

-- ============================================================
-- NOVAS TABELAS — Protocolos, Chatbot, FAQ, Templates, Etiquetas,
-- Notas Internas, NPS, LGPD (imp.md Fase 1)
-- ============================================================

-- PROTOCOLOS — Número único ANO-MES-SEQUENCIAL
CREATE TABLE IF NOT EXISTS protocolos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    numero           TEXT NOT NULL,
    conversa_id      UUID REFERENCES conversas(id) ON DELETE SET NULL,
    contato_id       UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    departamento_id  UUID REFERENCES departamentos(id),
    operador_id      UUID REFERENCES operadores(id),
    assunto          TEXT,
    status           TEXT NOT NULL DEFAULT 'aberto',
    prioridade       TEXT NOT NULL DEFAULT 'normal',
    aberto_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fechado_em       TIMESTAMPTZ,
    nps_nota         INTEGER CHECK (nps_nota >= 0 AND nps_nota <= 10),
    nps_comentario   TEXT,
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_prot_tenant ON protocolos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prot_numero ON protocolos(numero);
CREATE INDEX IF NOT EXISTS idx_prot_conversa ON protocolos(conversa_id);
CREATE INDEX IF NOT EXISTS idx_prot_contato ON protocolos(contato_id);

-- ANDAMENTOS DO PROTOCOLO — Histórico de mudanças de status
CREATE TABLE IF NOT EXISTS andamentos_protocolo (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id  UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    status        TEXT NOT NULL,
    descricao     TEXT,
    operador_id   UUID REFERENCES operadores(id),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_and_prot ON andamentos_protocolo(protocolo_id, criado_em);

-- PALAVRAS-CHAVE — Respostas automáticas por keyword
CREATE TABLE IF NOT EXISTS palavras_chave (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    palavras   TEXT[] NOT NULL,
    resposta   TEXT NOT NULL,
    departamento_id UUID REFERENCES departamentos(id) ON DELETE SET NULL,
    prioridade INTEGER NOT NULL DEFAULT 0,
    ativo      BOOLEAN NOT NULL DEFAULT true,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_tenant ON palavras_chave(tenant_id);

-- FAQ — Perguntas e respostas frequentes
CREATE TABLE IF NOT EXISTS faqs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pergunta   TEXT NOT NULL,
    resposta   TEXT NOT NULL,
    categoria  TEXT DEFAULT 'Geral',
    ativo      BOOLEAN NOT NULL DEFAULT true,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faq_tenant ON faqs(tenant_id);

-- TEMPLATES DE MENSAGEM — Respostas rápidas para atendentes
CREATE TABLE IF NOT EXISTS templates_mensagem (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo     TEXT NOT NULL,
    conteudo   TEXT NOT NULL,
    categoria  TEXT DEFAULT 'Geral',
    ativo      BOOLEAN NOT NULL DEFAULT true,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tmpl_tenant ON templates_mensagem(tenant_id);

-- ETIQUETAS — Tags para categorizar conversas
CREATE TABLE IF NOT EXISTS etiquetas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome       TEXT NOT NULL,
    cor        TEXT DEFAULT '#6B7280',
    ativo      BOOLEAN NOT NULL DEFAULT true,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_etiq_tenant ON etiquetas(tenant_id);

-- CONVERSA_ETIQUETAS — N:N conversas <-> etiquetas
CREATE TABLE IF NOT EXISTS conversa_etiquetas (
    conversa_id UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    etiqueta_id UUID NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversa_id, etiqueta_id)
);
CREATE INDEX IF NOT EXISTS idx_cet_tenant ON conversa_etiquetas(tenant_id);

-- NOTAS INTERNAS — Observações visíveis apenas para atendentes
CREATE TABLE IF NOT EXISTS notas_internas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversa_id  UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    operador_id  UUID NOT NULL REFERENCES operadores(id),
    conteudo     TEXT NOT NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ni_conversa ON notas_internas(conversa_id, criado_em);

-- PESQUISAS NPS — Satisfação pós-atendimento
CREATE TABLE IF NOT EXISTS pesquisas_nps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id  UUID REFERENCES protocolos(id) ON DELETE SET NULL,
    conversa_id   UUID REFERENCES conversas(id) ON DELETE SET NULL,
    departamento_id UUID REFERENCES departamentos(id),
    operador_id   UUID REFERENCES operadores(id),
    nota          INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 10),
    comentario    TEXT,
    enviada_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    respondida_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nps_tenant ON pesquisas_nps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nps_dep ON pesquisas_nps(departamento_id);
CREATE INDEX IF NOT EXISTS idx_nps_op ON pesquisas_nps(operador_id);

-- CONSENTIMENTOS LGPD — Registro de aceite do cidadão
CREATE TABLE IF NOT EXISTS consentimentos_lgpd (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contato_id    UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    aceito        BOOLEAN NOT NULL DEFAULT true,
    ip            TEXT,
    data_aceite   TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_exclusao TIMESTAMPTZ,
    UNIQUE (tenant_id, contato_id)
);
CREATE INDEX IF NOT EXISTS idx_lgpd_tenant ON consentimentos_lgpd(tenant_id);

-- CONFIG_CHATBOT — Configuração do chatbot por tenant
CREATE TABLE IF NOT EXISTS config_chatbot (
    tenant_id         UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    ativo             BOOLEAN NOT NULL DEFAULT false,
    mensagem_boas_vindas TEXT DEFAULT 'Olá! Bem-vindo(a) ao atendimento da prefeitura. Como posso ajudar?',
    menu_principal    JSONB,
    usar_keywords     BOOLEAN NOT NULL DEFAULT true,
    usar_faq          BOOLEAN NOT NULL DEFAULT true,
    usar_llm          BOOLEAN NOT NULL DEFAULT false,
    threshold_faq     REAL NOT NULL DEFAULT 0.6,
    llm_provider      TEXT DEFAULT 'openai',
    llm_api_key       TEXT,
    llm_model         TEXT DEFAULT 'gpt-4o-mini',
    llm_system_prompt TEXT,
    mensagem_fallback TEXT DEFAULT 'Desculpe, não consegui entender sua solicitação. Um atendente humano irá ajudá-lo(a) em breve.',
    atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IRIS — Assistente virtual com IA (DeepSeek)
CREATE TABLE IF NOT EXISTS config_iris (
    tenant_id     UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    ativo         BOOLEAN NOT NULL DEFAULT false,
    api_key       TEXT,
    model         TEXT DEFAULT 'deepseek-chat',
    system_prompt TEXT,
    temperatura   REAL NOT NULL DEFAULT 0.7,
    max_tokens    INTEGER NOT NULL DEFAULT 1024,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS para novas tabelas
-- ============================================================

-- FK adiada: conversas.protocolo_id só pode ser criada depois de protocolos existir
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS protocolo_id UUID REFERENCES protocolos(id) ON DELETE SET NULL;

ALTER TABLE protocolos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE andamentos_protocolo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE palavras_chave          ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_mensagem      ENABLE ROW LEVEL SECURITY;
ALTER TABLE etiquetas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa_etiquetas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_internas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pesquisas_nps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE consentimentos_lgpd     ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_chatbot          ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_iris             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_protocolos          ON protocolos;
DROP POLICY IF EXISTS iso_andamentos_protocolo ON andamentos_protocolo;
DROP POLICY IF EXISTS iso_palavras_chave      ON palavras_chave;
DROP POLICY IF EXISTS iso_faqs                ON faqs;
DROP POLICY IF EXISTS iso_templates_mensagem  ON templates_mensagem;
DROP POLICY IF EXISTS iso_etiquetas           ON etiquetas;
DROP POLICY IF EXISTS iso_conversa_etiquetas  ON conversa_etiquetas;
DROP POLICY IF EXISTS iso_notas_internas      ON notas_internas;
DROP POLICY IF EXISTS iso_pesquisas_nps       ON pesquisas_nps;
DROP POLICY IF EXISTS iso_consentimentos_lgpd ON consentimentos_lgpd;
DROP POLICY IF EXISTS iso_config_chatbot      ON config_chatbot;
DROP POLICY IF EXISTS iso_config_iris         ON config_iris;

CREATE POLICY iso_protocolos          ON protocolos          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_andamentos_protocolo ON andamentos_protocolo USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_palavras_chave      ON palavras_chave      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_faqs                ON faqs                USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_templates_mensagem  ON templates_mensagem  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_etiquetas           ON etiquetas           USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_conversa_etiquetas  ON conversa_etiquetas  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_notas_internas      ON notas_internas      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_pesquisas_nps       ON pesquisas_nps       USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_consentimentos_lgpd ON consentimentos_lgpd USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_config_chatbot      ON config_chatbot      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY iso_config_iris         ON config_iris         USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================
-- Tenant isolation for junction tables (idempotent)
-- ============================================================

-- conversa_participantes
ALTER TABLE conversa_participantes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
-- Remove NOT NULL constraint if it exists (may have been applied in a previous failed migration)
ALTER TABLE conversa_participantes ALTER COLUMN tenant_id DROP NOT NULL;
-- Remove orphan rows that don't have a matching conversa (prevents NOT NULL failure)
DELETE FROM conversa_participantes WHERE conversa_id NOT IN (SELECT id FROM conversas);
UPDATE conversa_participantes cp SET tenant_id = c.tenant_id
  FROM conversas c WHERE c.id = cp.conversa_id AND cp.tenant_id IS NULL;
-- Only add NOT NULL if all rows are populated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM conversa_participantes WHERE tenant_id IS NULL) THEN
    ALTER TABLE conversa_participantes ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_part_tenant ON conversa_participantes(tenant_id);
ALTER TABLE conversa_participantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_conversa_participantes ON conversa_participantes;
CREATE POLICY iso_conversa_participantes ON conversa_participantes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- operador_departamentos
ALTER TABLE operador_departamentos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE operador_departamentos ALTER COLUMN tenant_id DROP NOT NULL;
DELETE FROM operador_departamentos WHERE operador_id NOT IN (SELECT id FROM operadores);
UPDATE operador_departamentos od SET tenant_id = o.tenant_id
  FROM operadores o WHERE o.id = od.operador_id AND od.tenant_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM operador_departamentos WHERE tenant_id IS NULL) THEN
    ALTER TABLE operador_departamentos ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_opdep_tenant ON operador_departamentos(tenant_id);
ALTER TABLE operador_departamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_operador_departamentos ON operador_departamentos;
CREATE POLICY iso_operador_departamentos ON operador_departamentos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- canal_membros
ALTER TABLE canal_membros ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE canal_membros ALTER COLUMN tenant_id DROP NOT NULL;
DELETE FROM canal_membros WHERE canal_id NOT IN (SELECT id FROM canais_internos);
UPDATE canal_membros cm SET tenant_id = ci.tenant_id
  FROM canais_internos ci WHERE ci.id = cm.canal_id AND cm.tenant_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canal_membros WHERE tenant_id IS NULL) THEN
    ALTER TABLE canal_membros ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_canmemb_tenant ON canal_membros(tenant_id);
ALTER TABLE canal_membros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_canal_membros ON canal_membros;
CREATE POLICY iso_canal_membros ON canal_membros
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================
-- whatsapp_keys: armazena cada chave de criptografia (Signal) do Baileys
-- em sua própria linha (sessões, prekeys, sender-keys, app-state, etc.).
-- Substitui o blob único em whatsapp_sessoes.keys, evitando que gravações
-- concorrentes (vários cidadãos ao mesmo tempo) sobrescrevam umas às outras
-- e corrompam a sessão — causa de "Aguardando mensagem" no aparelho do cidadão.
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_keys (
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_type      TEXT NOT NULL,
    key_id        TEXT NOT NULL,
    value         JSONB NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, key_type, key_id)
);
CREATE INDEX IF NOT EXISTS idx_wakeys_tenant_type ON whatsapp_keys(tenant_id, key_type);

ALTER TABLE whatsapp_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_whatsapp_keys ON whatsapp_keys;
CREATE POLICY iso_whatsapp_keys ON whatsapp_keys
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================
-- conversa_transferencias: transferência de uma conversa de um atendente
-- para outro, com aceite/recusa. Uma transferência fica 'pendente' até o
-- destinatário aceitar (vira dono) ou recusar (volta ao dono anterior).
-- ============================================================
CREATE TABLE IF NOT EXISTS conversa_transferencias (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversa_id      UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    de_operador_id   UUID REFERENCES operadores(id) ON DELETE SET NULL,
    para_operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pendente', -- pendente | aceita | rejeitada | cancelada
    motivo           TEXT,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvido_em     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_transf_conversa ON conversa_transferencias(conversa_id);
CREATE INDEX IF NOT EXISTS idx_transf_para ON conversa_transferencias(para_operador_id, status);
-- No máximo uma transferência pendente por conversa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transf_pendente ON conversa_transferencias(conversa_id) WHERE status = 'pendente';

ALTER TABLE conversa_transferencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_conversa_transferencias ON conversa_transferencias;
CREATE POLICY iso_conversa_transferencias ON conversa_transferencias
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
