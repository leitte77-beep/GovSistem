-- ============================================================
-- EVOLUÇÕES — interno.md (Prioridades 1-4 + Complementares)
-- Canais internos avançados, Tarefas/Kanban, Arquivos, Reuniões,
-- Wiki, Notificações, Configurações de usuário
-- ============================================================

-- ============================================================
-- PRESENÇA E STATUS DO USUÁRIO (Prioridade 1)
-- ============================================================
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS status_presenca TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS status_mensagem TEXT;

-- ============================================================
-- CANAIS INTERNOS AVANÇADOS (Prioridade 1 - evolução grupos)
-- ============================================================
ALTER TABLE canais_internos ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE canais_internos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE canais_internos ADD COLUMN IF NOT EXISTS tipo_visibilidade TEXT NOT NULL DEFAULT 'padrao';
ALTER TABLE canais_internos ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE canais_internos ADD COLUMN IF NOT EXISTS limite_membros INTEGER NOT NULL DEFAULT 256;

-- Múltiplos administradores por canal
CREATE TABLE IF NOT EXISTS canal_admins (
    canal_id    UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    PRIMARY KEY (canal_id, operador_id)
);

-- Histórico de entradas e saídas de membros
CREATE TABLE IF NOT EXISTS canal_historico_membros (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    canal_id    UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    acao        TEXT NOT NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chm_canal ON canal_historico_membros(canal_id, criado_em);

-- ============================================================
-- MENSAGENS INTERNAS AVANÇADAS (Prioridade 1)
-- ============================================================
ALTER TABLE mensagens_internas ADD COLUMN IF NOT EXISTS respondendo_a UUID REFERENCES mensagens_internas(id);
ALTER TABLE mensagens_internas ADD COLUMN IF NOT EXISTS editada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mensagens_internas ADD COLUMN IF NOT EXISTS editada_em TIMESTAMPTZ;
ALTER TABLE mensagens_internas ADD COLUMN IF NOT EXISTS excluida BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mensagens_internas ADD COLUMN IF NOT EXISTS encaminhada_de UUID REFERENCES canais_internos(id);
ALTER TABLE mensagens_internas ADD COLUMN IF NOT EXISTS lida BOOLEAN NOT NULL DEFAULT false;

-- Reações (emojis) em mensagens internas
CREATE TABLE IF NOT EXISTS reacoes_mensagens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mensagem_id    UUID NOT NULL REFERENCES mensagens_internas(id) ON DELETE CASCADE,
    operador_id    UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    emoji          TEXT NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (mensagem_id, operador_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_rm_msg ON reacoes_mensagens(mensagem_id);

-- Mensagens fixadas nos canais
CREATE TABLE IF NOT EXISTS mensagens_fixadas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    canal_id     UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    mensagem_id  UUID NOT NULL REFERENCES mensagens_internas(id) ON DELETE CASCADE,
    fixada_por   UUID NOT NULL REFERENCES operadores(id),
    fixada_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (canal_id, mensagem_id)
);
CREATE INDEX IF NOT EXISTS idx_mf_canal ON mensagens_fixadas(canal_id);

-- Confirmação de leitura por usuário
CREATE TABLE IF NOT EXISTS leituras_mensagens (
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    canal_id    UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    lido_ate    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (operador_id, canal_id)
);

-- ============================================================
-- BUSCA GLOBAL (Prioridade 1)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_msgint_conteudo ON mensagens_internas USING gin(to_tsvector('portuguese', coalesce(conteudo, '')));

-- ============================================================
-- PROJETOS E TAREFAS / KANBAN (Prioridade 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS projetos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    descricao   TEXT DEFAULT '',
    setor_id    UUID REFERENCES departamentos(id) ON DELETE SET NULL,
    criado_por  UUID REFERENCES operadores(id) ON DELETE SET NULL,
    cor         TEXT DEFAULT '#2563EB',
    ativo       BOOLEAN NOT NULL DEFAULT true,
    grupo_chat_id UUID REFERENCES canais_internos(id) ON DELETE SET NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proj_tenant ON projetos(tenant_id);

CREATE TABLE IF NOT EXISTS colunas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    nome       TEXT NOT NULL,
    ordem      INTEGER NOT NULL DEFAULT 0,
    cor        TEXT DEFAULT '#6B7280',
    limite_wip INTEGER,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_col_projeto ON colunas(projeto_id, ordem);

CREATE TABLE IF NOT EXISTS tarefas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo          TEXT NOT NULL,
    descricao       TEXT DEFAULT '',
    projeto_id      UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    coluna_id       UUID NOT NULL REFERENCES colunas(id) ON DELETE CASCADE,
    ordem_coluna    INTEGER NOT NULL DEFAULT 0,
    criada_por      UUID REFERENCES operadores(id) ON DELETE SET NULL,
    prioridade      TEXT NOT NULL DEFAULT 'media',
    prazo           TIMESTAMPTZ,
    mensagem_origem_id UUID REFERENCES mensagens_internas(id) ON DELETE SET NULL,
    tarefa_pai_id   UUID REFERENCES tarefas(id) ON DELETE SET NULL,
    concluida_em    TIMESTAMPTZ,
    criada_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tar_projeto ON tarefas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_tar_coluna ON tarefas(coluna_id, ordem_coluna);
CREATE INDEX IF NOT EXISTS idx_tar_prazo ON tarefas(prazo);
CREATE INDEX IF NOT EXISTS idx_tar_tenant ON tarefas(tenant_id);

CREATE TABLE IF NOT EXISTS tarefa_responsaveis (
    tarefa_id   UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    PRIMARY KEY (tarefa_id, operador_id)
);

CREATE TABLE IF NOT EXISTS tarefa_etiquetas (
    tarefa_id   UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    etiqueta_id UUID NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
    PRIMARY KEY (tarefa_id, etiqueta_id)
);

CREATE TABLE IF NOT EXISTS checklist_itens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tarefa_id  UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    texto      TEXT NOT NULL,
    concluido  BOOLEAN NOT NULL DEFAULT false,
    ordem      INTEGER NOT NULL DEFAULT 0,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ci_tarefa ON checklist_itens(tarefa_id, ordem);

CREATE TABLE IF NOT EXISTS comentarios_tarefa (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tarefa_id  UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    autor_id   UUID REFERENCES operadores(id) ON DELETE SET NULL,
    texto      TEXT NOT NULL,
    editado_em TIMESTAMPTZ,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ct_tarefa ON comentarios_tarefa(tarefa_id, criado_em);

CREATE TABLE IF NOT EXISTS historico_tarefa (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tarefa_id      UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    operador_id    UUID REFERENCES operadores(id) ON DELETE SET NULL,
    campo_alterado TEXT NOT NULL,
    valor_anterior TEXT DEFAULT '',
    valor_novo     TEXT DEFAULT '',
    alterado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ht_tarefa ON historico_tarefa(tarefa_id, alterado_em);

-- ============================================================
-- ARQUIVOS (Prioridade 3)
-- ============================================================
CREATE TABLE IF NOT EXISTS pastas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome       TEXT NOT NULL,
    setor_id   UUID REFERENCES departamentos(id) ON DELETE SET NULL,
    pasta_pai_id UUID REFERENCES pastas(id) ON DELETE CASCADE,
    criada_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
    publica    BOOLEAN NOT NULL DEFAULT false,
    criada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pasta_tenant ON pastas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pasta_pai ON pastas(pasta_pai_id);

CREATE TABLE IF NOT EXISTS arquivos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome_original  TEXT NOT NULL,
    nome_storage   TEXT NOT NULL,
    tamanho        BIGINT NOT NULL,
    tipo_mime      TEXT,
    tipo           TEXT NOT NULL DEFAULT 'outro',
    enviado_por    UUID REFERENCES operadores(id) ON DELETE SET NULL,
    conversa_id    UUID REFERENCES conversas(id) ON DELETE SET NULL,
    tarefa_id      UUID REFERENCES tarefas(id) ON DELETE SET NULL,
    pasta_id       UUID REFERENCES pastas(id) ON DELETE SET NULL,
    canal_id       UUID REFERENCES canais_internos(id) ON DELETE SET NULL,
    versao_de      UUID REFERENCES arquivos(id) ON DELETE SET NULL,
    numero_versao  INTEGER NOT NULL DEFAULT 1,
    hash_md5       TEXT,
    enviado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    excluido_em    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_arq_tenant ON arquivos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arq_conversa ON arquivos(conversa_id);
CREATE INDEX IF NOT EXISTS idx_arq_pasta ON arquivos(pasta_id);
CREATE INDEX IF NOT EXISTS idx_arq_hash ON arquivos(tenant_id, hash_md5);

-- ============================================================
-- REUNIÕES (Prioridade 4)
-- ============================================================
CREATE TABLE IF NOT EXISTS reunioes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo            TEXT NOT NULL,
    pauta             TEXT DEFAULT '',
    organizador_id    UUID REFERENCES operadores(id) ON DELETE SET NULL,
    canal_id          UUID REFERENCES canais_internos(id) ON DELETE SET NULL,
    plataforma        TEXT NOT NULL DEFAULT 'google_meet',
    link_reuniao      TEXT,
    id_evento_externo TEXT,
    inicio            TIMESTAMPTZ NOT NULL,
    fim               TIMESTAMPTZ NOT NULL,
    status            TEXT NOT NULL DEFAULT 'agendada',
    gravacao_url      TEXT,
    criada_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reu_tenant ON reunioes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reu_inicio ON reunioes(inicio);

CREATE TABLE IF NOT EXISTS participantes_reuniao (
    reuniao_id  UUID NOT NULL REFERENCES reunioes(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    confirmado  BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (reuniao_id, operador_id)
);

-- OAuth2 tokens por usuário
CREATE TABLE IF NOT EXISTS usuario_oauth (
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at  TIMESTAMPTZ,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (operador_id, provider)
);

-- Configurações de integração por tenant
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS google_client_id TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS google_client_secret TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS microsoft_client_id TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS microsoft_tenant_id TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS microsoft_client_secret TEXT;

-- ============================================================
-- NOTIFICAÇÕES (Complementar)
-- ============================================================
CREATE TABLE IF NOT EXISTS notificacoes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operador_id   UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    tipo          TEXT NOT NULL,
    titulo        TEXT NOT NULL,
    mensagem      TEXT,
    link          TEXT,
    lida          BOOLEAN NOT NULL DEFAULT false,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_not_op ON notificacoes(operador_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_not_tenant ON notificacoes(tenant_id);

-- Configurações de notificação por usuário
CREATE TABLE IF NOT EXISTS config_notificacoes (
    operador_id          UUID PRIMARY KEY REFERENCES operadores(id) ON DELETE CASCADE,
    push_ativo           BOOLEAN NOT NULL DEFAULT true,
    som_ativado          BOOLEAN NOT NULL DEFAULT true,
    nao_perturbe_inicio  TEXT,
    nao_perturbe_fim     TEXT,
    resumo_email         TEXT DEFAULT 'nunca',
    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Silenciar conversas/canais específicos
CREATE TABLE IF NOT EXISTS conversas_silenciadas (
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    conversa_id UUID REFERENCES conversas(id) ON DELETE CASCADE,
    canal_id    UUID REFERENCES canais_internos(id) ON DELETE CASCADE,
    silenciar   TEXT NOT NULL DEFAULT 'tudo',
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (operador_id, conversa_id, canal_id)
);

-- ============================================================
-- BASE DE CONHECIMENTO / WIKI (Complementar)
-- ============================================================
CREATE TABLE IF NOT EXISTS artigos_wiki (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo       TEXT NOT NULL,
    conteudo     TEXT DEFAULT '',
    categoria    TEXT DEFAULT 'Geral',
    autor_id     UUID REFERENCES operadores(id) ON DELETE SET NULL,
    publico      BOOLEAN NOT NULL DEFAULT true,
    leitura_obrigatoria BOOLEAN NOT NULL DEFAULT false,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wiki_tenant ON artigos_wiki(tenant_id);

CREATE TABLE IF NOT EXISTS artigos_wiki_versoes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artigo_id   UUID NOT NULL REFERENCES artigos_wiki(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    conteudo    TEXT DEFAULT '',
    autor_id    UUID REFERENCES operadores(id) ON DELETE SET NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_awv_artigo ON artigos_wiki_versoes(artigo_id, criado_em);

-- ============================================================
-- CALENDÁRIO CORPORATIVO INTERNO (Complementar)
-- ============================================================
CREATE TABLE IF NOT EXISTS eventos_calendario (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo      TEXT NOT NULL,
    descricao   TEXT DEFAULT '',
    local       TEXT,
    inicio      TIMESTAMPTZ NOT NULL,
    fim         TIMESTAMPTZ NOT NULL,
    dia_todo    BOOLEAN NOT NULL DEFAULT false,
    recorrencia TEXT,
    setor_id    UUID REFERENCES departamentos(id) ON DELETE SET NULL,
    criado_por  UUID REFERENCES operadores(id) ON DELETE SET NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ec_tenant ON eventos_calendario(tenant_id, inicio);

-- Solicitação de ausência/férias
CREATE TABLE IF NOT EXISTS ausencias (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operador_id  UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    tipo         TEXT NOT NULL DEFAULT 'ferias',
    inicio       DATE NOT NULL,
    fim          DATE NOT NULL,
    motivo       TEXT,
    status       TEXT NOT NULL DEFAULT 'pendente',
    aprovado_por UUID REFERENCES operadores(id) ON DELETE SET NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aus_op ON ausencias(operador_id, inicio);

-- ============================================================
-- RLS para novas tabelas
-- ============================================================
ALTER TABLE canal_historico_membros  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reacoes_mensagens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens_fixadas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE projetos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE colunas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_itens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE comentarios_tarefa       ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_tarefa         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastas                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE arquivos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunioes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE artigos_wiki             ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_calendario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausencias                ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'canal_historico_membros','reacoes_mensagens','mensagens_fixadas',
            'projetos','colunas','tarefas','checklist_itens',
            'comentarios_tarefa','historico_tarefa','pastas','arquivos','reunioes',
            'notificacoes','artigos_wiki','eventos_calendario','ausencias'
        ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS iso_%s ON %I', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY iso_%s ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
            tbl, tbl
        );
    END LOOP;
END $$;
