-- ============================================================
-- Protocolo Digital — Fundação (migration idempotente)
-- Expande protocolos existentes com modelo completo de
-- tramitação, cidadãos, documentos, pendências, SLAs e RBAC.
-- ============================================================

-- 1. EXPANSÃO DA TABELA protocolos (campos novos, sem quebrar existentes)
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS uuid_publico UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS servico_id UUID;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS tipo_id UUID;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS categoria_id UUID;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS setor_atual_id UUID REFERENCES departamentos(id);
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES operadores(id);
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS nivel_acesso TEXT NOT NULL DEFAULT 'restrito_cidadao';
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS sla_regra_id UUID;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS prazo_original_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS prazo_pausado_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS prazo_total_pausa INTERVAL DEFAULT '0 seconds';
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS reaberto_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS indicação_sigilo TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS externo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS precisa_cadastro BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS precisa_assinatura BOOLEAN NOT NULL DEFAULT false;

UPDATE protocolos SET origem = 'whatsapp' WHERE origem IS NULL;
UPDATE protocolos SET externo = true WHERE externo IS NULL;
UPDATE protocolos SET nivel_acesso = 'restrito_cidadao' WHERE nivel_acesso IS NULL;
UPDATE protocolos SET uuid_publico = gen_random_uuid() WHERE uuid_publico IS NULL;

DO $$ BEGIN
  ALTER TABLE protocolos ADD CONSTRAINT ck_prot_origem CHECK (
    origem IN ('whatsapp','portal','presencial','telefone','email','app','interno','importacao','api','assistente_virtual','outro')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE protocolos ADD CONSTRAINT ck_prot_nivel_acesso CHECK (
    nivel_acesso IN ('publico_administrativo','restrito_cidadao','restrito_setor','restrito_usuarios','confidencial','sigiloso')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_prot_origem ON protocolos(tenant_id, origem);
CREATE INDEX IF NOT EXISTS idx_prot_setor_atual ON protocolos(tenant_id, setor_atual_id);
CREATE INDEX IF NOT EXISTS idx_prot_responsavel ON protocolos(tenant_id, responsavel_id);
CREATE INDEX IF NOT EXISTS idx_prot_prazo ON protocolos(tenant_id, prazo_em) WHERE prazo_em IS NOT NULL AND status_operacional NOT IN ('CONCLUIDO','CANCELADO');
CREATE INDEX IF NOT EXISTS idx_prot_uuid_publico ON protocolos(tenant_id, uuid_publico);

-- 2. CIDADÃOS
CREATE TABLE IF NOT EXISTS cidadaos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contato_id UUID REFERENCES contatos(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    nome_social TEXT,
    cpf TEXT,
    cnpj TEXT,
    data_nascimento DATE,
    telefone TEXT,
    email TEXT,
    tipo_pessoa TEXT NOT NULL DEFAULT 'fisica',
    representante_legal TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cidadao_tenant ON cidadaos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cidadao_cpf ON cidadaos(tenant_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cidadao_telefone ON cidadaos(tenant_id, telefone) WHERE telefone IS NOT NULL;

-- 2b. CONTAS DE CIDADÃO (login no portal)
CREATE TABLE IF NOT EXISTS cidadao_contas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cidadao_id UUID NOT NULL REFERENCES cidadaos(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    senha_hash TEXT NOT NULL,
    email_verificado BOOLEAN NOT NULL DEFAULT false,
    telefone_verificado BOOLEAN NOT NULL DEFAULT false,
    mfa_ativo BOOLEAN NOT NULL DEFAULT false,
    mfa_secret TEXT,
    conta_ativa BOOLEAN NOT NULL DEFAULT true,
    ultimo_login_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_cconta_tenant ON cidadao_contas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cconta_cidadao ON cidadao_contas(cidadao_id);

-- 2c. ENDEREÇOS DO CIDADÃO
CREATE TABLE IF NOT EXISTS cidadao_enderecos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cidadao_id UUID NOT NULL REFERENCES cidadaos(id) ON DELETE CASCADE,
    cep TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    municipio TEXT,
    estado TEXT DEFAULT 'SP',
    principal BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cend_cidadao ON cidadao_enderecos(cidadao_id);

-- 3. SEQUENCIADOR (já existe, mas garantir índices)
CREATE INDEX IF NOT EXISTS idx_protseq_tenant_ano_mes ON protocolo_sequencias(tenant_id, ano, mes);

-- 4. TIPOS DE PROTOCOLO
CREATE TABLE IF NOT EXISTS protocolo_tipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    prazo_padrao_dias INTEGER,
    externo BOOLEAN NOT NULL DEFAULT true,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prottip_tenant ON protocolo_tipos(tenant_id);

-- 5. CATEGORIAS DE PROTOCOLO
CREATE TABLE IF NOT EXISTS protocolo_categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    departamento_id UUID REFERENCES departamentos(id),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protcat_tenant ON protocolo_categorias(tenant_id);

-- 6. SERVIÇOS (catálogo)
CREATE TABLE IF NOT EXISTS protocolo_servicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    secretaria_id UUID REFERENCES secretarias(id),
    departamento_id UUID REFERENCES departamentos(id),
    categoria_id UUID REFERENCES protocolo_categorias(id),
    prazo_estimado_dias INTEGER,
    custo TEXT,
    publico_alvo TEXT,
    forma_atendimento TEXT,
    base_legal TEXT,
    instrucoes TEXT,
    mensagem_conclusao TEXT,
    nivel_autenticacao TEXT NOT NULL DEFAULT 'nenhum',
    precisa_cadastro BOOLEAN NOT NULL DEFAULT false,
    precisa_assinatura BOOLEAN NOT NULL DEFAULT false,
    prioridade_padrao TEXT NOT NULL DEFAULT 'NORMAL',
    disponivel BOOLEAN NOT NULL DEFAULT true,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protsrv_tenant ON protocolo_servicos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_protsrv_dep ON protocolo_servicos(departamento_id);

-- 7. CAMPOS DE FORMULÁRIO DE SERVIÇO
CREATE TABLE IF NOT EXISTS protocolo_servico_campos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    servico_id UUID NOT NULL REFERENCES protocolo_servicos(id) ON DELETE CASCADE,
    nome_campo TEXT NOT NULL,
    rotulo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    obrigatorio BOOLEAN NOT NULL DEFAULT false,
    opcoes JSONB,
    placeholder TEXT,
    ajuda TEXT,
    validacao_regex TEXT,
    validacao_erro_msg TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protsrvcamp_servico ON protocolo_servico_campos(servico_id);

-- 8. RESPOSTAS DO FORMULÁRIO
CREATE TABLE IF NOT EXISTS protocolo_campo_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    campo_id UUID NOT NULL REFERENCES protocolo_servico_campos(id) ON DELETE CASCADE,
    valor TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protcampresp_prot ON protocolo_campo_respostas(protocolo_id);

-- 9. MOVIMENTAÇÕES (TRAMITAÇÕES)
CREATE TABLE IF NOT EXISTS protocolo_movimentacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    setor_origem_id UUID REFERENCES departamentos(id),
    setor_destino_id UUID REFERENCES departamentos(id),
    operador_id UUID REFERENCES operadores(id),
    status_anterior TEXT,
    status_posterior TEXT,
    observacao TEXT,
    justificativa TEXT,
    prazo_dias INTEGER,
    prazo_ate TIMESTAMPTZ,
    confirmado_em TIMESTAMPTZ,
    lido_em TIMESTAMPTZ,
    ip INET,
    user_agent TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protmov_prot ON protocolo_movimentacoes(protocolo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_protmov_setor_destino ON protocolo_movimentacoes(tenant_id, setor_destino_id, criado_em DESC);

DO $$ BEGIN
  ALTER TABLE protocolo_movimentacoes ADD CONSTRAINT ck_protmov_tipo CHECK (
    tipo IN (
      'abertura','distribuicao','encaminhamento','recebimento','aceite',
      'devolucao','redistribuicao','solicitacao_informacao','resposta_interna',
      'despacho','parecer','ciencia','assinatura','conclusao','arquivamento',
      'reabertura','cancelamento','retificacao','outro'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. MENSAGENS PÚBLICAS
CREATE TABLE IF NOT EXISTS protocolo_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    direcao TEXT NOT NULL,
    operador_id UUID REFERENCES operadores(id),
    conteudo TEXT NOT NULL,
    lida BOOLEAN NOT NULL DEFAULT false,
    lida_em TIMESTAMPTZ,
    tem_anexo BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protmsg_prot ON protocolo_mensagens(protocolo_id, criado_em DESC);

-- 11. ANOTAÇÕES INTERNAS (nunca visíveis ao cidadão)
CREATE TABLE IF NOT EXISTS protocolo_anotacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id),
    tipo TEXT NOT NULL DEFAULT 'anotacao',
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protanot_prot ON protocolo_anotacoes(protocolo_id, criado_em DESC);

DO $$ BEGIN
  ALTER TABLE protocolo_anotacoes ADD CONSTRAINT ck_protanot_tipo CHECK (
    tipo IN ('anotacao','despacho','parecer','movimentacao_automatica','notificacao')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 12. PENDÊNCIAS
CREATE TABLE IF NOT EXISTS protocolo_pendencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT NOT NULL DEFAULT 'documento',
    prazo_em TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_por UUID REFERENCES operadores(id),
    resolvido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protpend_prot ON protocolo_pendencias(protocolo_id);

DO $$ BEGIN
  ALTER TABLE protocolo_pendencias ADD CONSTRAINT ck_protpend_tipo CHECK (
    tipo IN ('documento','informacao','correcao','assinatura','pagamento','comparecimento','confirmacao')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 13. DOCUMENTOS
CREATE TABLE IF NOT EXISTS protocolo_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    pendencia_id UUID REFERENCES protocolo_pendencias(id) ON DELETE SET NULL,
    nome_amigavel TEXT NOT NULL,
    nome_interno TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    sha256 TEXT,
    tipo_documental TEXT,
    status TEXT NOT NULL DEFAULT 'recebido',
    nivel_acesso TEXT NOT NULL DEFAULT 'restrito_cidadao',
    origem TEXT NOT NULL DEFAULT 'interno',
    data_documento DATE,
    autor TEXT,
    departamento_id UUID REFERENCES departamentos(id),
    versao INTEGER NOT NULL DEFAULT 1,
    versao_atual_id UUID,
    enviado_por UUID REFERENCES operadores(id),
    rejeitado_motivo TEXT,
    liberado_em TIMESTAMPTZ,
    expira_em TIMESTAMPTZ,
    qrcode_validacao TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protdoc_prot ON protocolo_documentos(protocolo_id);
CREATE INDEX IF NOT EXISTS idx_protdoc_pendencia ON protocolo_documentos(pendencia_id);

DO $$ BEGIN
  ALTER TABLE protocolo_documentos ADD CONSTRAINT ck_protdoc_status CHECK (
    status IN ('recebido','em_analise','aprovado','rejeitado','substituido','emitido','assinado','liberado_cidadao','restrito','arquivado')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE protocolo_documentos ADD CONSTRAINT ck_protdoc_origem CHECK (
    origem IN ('interno','cidadao','sistema','whatsapp','email','api')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 14. VERSÕES DE DOCUMENTOS
CREATE TABLE IF NOT EXISTS protocolo_documento_versoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    documento_id UUID NOT NULL REFERENCES protocolo_documentos(id) ON DELETE CASCADE,
    versao INTEGER NOT NULL,
    nome_interno TEXT NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    sha256 TEXT,
    criado_por UUID REFERENCES operadores(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protdocver_doc ON protocolo_documento_versoes(documento_id);

-- 15. DOWNLOADS DE DOCUMENTOS (auditoria)
CREATE TABLE IF NOT EXISTS protocolo_documento_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    documento_id UUID NOT NULL REFERENCES protocolo_documentos(id) ON DELETE CASCADE,
    baixado_por TEXT,
    cidadao_id UUID REFERENCES cidadaos(id),
    ip INET,
    user_agent TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protdocdl_doc ON protocolo_documento_downloads(documento_id);

-- 16. ASSINATURAS
CREATE TABLE IF NOT EXISTS protocolo_assinaturas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    documento_id UUID NOT NULL REFERENCES protocolo_documentos(id) ON DELETE CASCADE,
    signatario_tipo TEXT NOT NULL,
    signatario_id UUID,
    signatario_nome TEXT NOT NULL,
    tipo_assinatura TEXT NOT NULL DEFAULT 'simples',
    certificado TEXT,
    hash_documento TEXT,
    hash_assinatura TEXT,
    cadeia_assinatura JSONB,
    resultado_validacao TEXT,
    evidencia_tecnica JSONB,
    assinado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protass_doc ON protocolo_assinaturas(documento_id);

-- 17. CREDENCIAIS DE ACESSO (senha/código para consulta pública)
CREATE TABLE IF NOT EXISTS protocolo_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    acesso_hash TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'senha',
    tentativas_restantes INTEGER NOT NULL DEFAULT 5,
    bloqueado_ate TIMESTAMPTZ,
    expira_em TIMESTAMPTZ,
    redefinido_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, protocolo_id)
);
CREATE INDEX IF NOT EXISTS idx_protcred_prot ON protocolo_credenciais(protocolo_id);

-- 18. SESSÕES DE ACESSO PÚBLICO
CREATE TABLE IF NOT EXISTS protocolo_sessoes_acesso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    cidadao_conta_id UUID REFERENCES cidadao_contas(id),
    token TEXT NOT NULL,
    ip INET,
    user_agent TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours')
);
CREATE INDEX IF NOT EXISTS idx_protses_token ON protocolo_sessoes_acesso(token);
CREATE INDEX IF NOT EXISTS idx_protses_prot ON protocolo_sessoes_acesso(protocolo_id);

-- 19. ETIQUETAS (TAGS) DE PROTOCOLO
CREATE TABLE IF NOT EXISTS protocolo_etiquetas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cor TEXT DEFAULT '#6B7280',
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protetq_tenant ON protocolo_etiquetas(tenant_id);

CREATE TABLE IF NOT EXISTS protocolo_etiqueta_relacoes (
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    etiqueta_id UUID NOT NULL REFERENCES protocolo_etiquetas(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (protocolo_id, etiqueta_id)
);
CREATE INDEX IF NOT EXISTS idx_protetqrel_tenant ON protocolo_etiqueta_relacoes(tenant_id);

-- 20. RELAÇÕES ENTRE PROTOCOLOS
CREATE TABLE IF NOT EXISTS protocolo_relacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_origem_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    protocolo_destino_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'complementar',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, protocolo_origem_id, protocolo_destino_id, tipo)
);
CREATE INDEX IF NOT EXISTS idx_protrel_origem ON protocolo_relacoes(protocolo_origem_id);
CREATE INDEX IF NOT EXISTS idx_protrel_destino ON protocolo_relacoes(protocolo_destino_id);

DO $$ BEGIN
  ALTER TABLE protocolo_relacoes ADD CONSTRAINT ck_protrel_tipo CHECK (
    tipo IN ('principal','complementar','resposta','recurso','renovacao','duplicado','dependente','desmembrado','apensado')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 21. NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS protocolo_notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    canal TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    template_id UUID,
    assunto TEXT,
    conteudo TEXT,
    status_envio TEXT NOT NULL DEFAULT 'pendente',
    provedor_id TEXT,
    entregue BOOLEAN,
    lido BOOLEAN,
    falha_detalhe TEXT,
    tentativas INTEGER NOT NULL DEFAULT 0,
    ultima_tentativa_em TIMESTAMPTZ,
    enviado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protnotif_prot ON protocolo_notificacoes(protocolo_id);
CREATE INDEX IF NOT EXISTS idx_protnotif_status ON protocolo_notificacoes(tenant_id, status_envio) WHERE status_envio = 'pendente';

DO $$ BEGIN
  ALTER TABLE protocolo_notificacoes ADD CONSTRAINT ck_protnotif_canal CHECK (
    canal IN ('whatsapp','email','sms','push','portal','interno')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 22. SATISFAÇÃO
CREATE TABLE IF NOT EXISTS protocolo_satisfacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    nota INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 5),
    comentario TEXT,
    avaliacao_prazo INTEGER CHECK (avaliacao_prazo >= 1 AND avaliacao_prazo <= 5),
    avaliacao_atendimento INTEGER CHECK (avaliacao_atendimento >= 1 AND avaliacao_atendimento <= 5),
    solicitacao_resolvida BOOLEAN,
    anonima BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, protocolo_id)
);
CREATE INDEX IF NOT EXISTS idx_protsat_tenant ON protocolo_satisfacao(tenant_id);

-- 23. REGRAS DE SLA
CREATE TABLE IF NOT EXISTS sla_regras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    departamento_id UUID REFERENCES departamentos(id),
    servico_id UUID REFERENCES protocolo_servicos(id),
    prioridade TEXT NOT NULL DEFAULT 'NORMAL',
    prazo_horas INTEGER NOT NULL,
    considera_dias_uteis BOOLEAN NOT NULL DEFAULT true,
    suspende_ao_pendenciar BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_tenant ON sla_regras(tenant_id);

-- 24. FERIADOS E PONTOS FACULTATIVOS
CREATE TABLE IF NOT EXISTS feriados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    data DATE NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'feriado',
    recorrente BOOLEAN NOT NULL DEFAULT false,
    municipio TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, data, municipio)
);
CREATE INDEX IF NOT EXISTS idx_feriado_data ON feriados(tenant_id, data);

-- 25. TEMPLATES DE NOTIFICAÇÃO
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    canal TEXT NOT NULL DEFAULT 'whatsapp',
    assunto TEXT,
    corpo TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notiftmpl_tenant ON notification_templates(tenant_id, evento, canal);

-- 26. TEMPLATES DE DOCUMENTOS
CREATE TABLE IF NOT EXISTS document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'certidao',
    conteudo_html TEXT NOT NULL,
    formato TEXT NOT NULL DEFAULT 'pdf',
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctmpl_tenant ON document_templates(tenant_id);

-- 27. CONFIGURAÇÕES DE PROTOCOLO POR TENANT
CREATE TABLE IF NOT EXISTS tenant_protocolo_config (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    formato_numeracao TEXT NOT NULL DEFAULT 'ANO-MES-SEQUENCIAL',
    sequencia_anual BOOLEAN NOT NULL DEFAULT false,
    prazo_padrao_dias INTEGER NOT NULL DEFAULT 30,
    tamanho_max_arquivo_mb INTEGER NOT NULL DEFAULT 10,
    formatos_permitidos TEXT NOT NULL DEFAULT 'pdf,doc,docx,xls,xlsx,odt,ods,jpg,jpeg,png,webp',
    modo_geracao TEXT NOT NULL DEFAULT 'manual',
    exige_confirmacao_auto BOOLEAN NOT NULL DEFAULT true,
    verifica_duplicidade BOOLEAN NOT NULL DEFAULT true,
    senha_expiracao_dias INTEGER,
    max_tentativas_senha INTEGER NOT NULL DEFAULT 5,
    bloqueio_tentativas_minutos INTEGER NOT NULL DEFAULT 30,
    otp_segundo_fator BOOLEAN NOT NULL DEFAULT false,
    retencao_protocolo_dias INTEGER,
    retencao_documento_dias INTEGER,
    termos_uso TEXT,
    politica_privacidade TEXT,
    dados_encarregado TEXT,
    canais_oficiais JSONB,
    primary_color TEXT DEFAULT '#2563EB',
    logo_url TEXT,
    brasao_url TEXT,
    portal_titulo TEXT DEFAULT 'Protocolo Digital',
    portal_descricao TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 28. PARTICIPANTES DO PROTOCOLO (operadores com acesso)
CREATE TABLE IF NOT EXISTS protocolo_participantes (
    protocolo_id UUID NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    papel TEXT NOT NULL DEFAULT 'colaborador',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (protocolo_id, operador_id)
);
CREATE INDEX IF NOT EXISTS idx_protpart_op ON protocolo_participantes(operador_id);

-- ============================================================
-- RLS para todas as novas tabelas
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'cidadaos','cidadao_contas','cidadao_enderecos',
            'protocolo_tipos','protocolo_categorias','protocolo_servicos',
            'protocolo_servico_campos','protocolo_campo_respostas',
            'protocolo_movimentacoes','protocolo_mensagens','protocolo_anotacoes',
            'protocolo_pendencias','protocolo_documentos','protocolo_documento_versoes',
            'protocolo_documento_downloads','protocolo_assinaturas',
            'protocolo_etiquetas','protocolo_etiqueta_relacoes',
            'protocolo_relacoes','protocolo_notificacoes','protocolo_satisfacao',
            'sla_regras','feriados','notification_templates','document_templates',
            'tenant_protocolo_config','protocolo_participantes'
          )
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS iso_%I ON %I', t, t);
        EXECUTE format(
            'CREATE POLICY iso_%I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
            t, t
        );
    END LOOP;
END $$;

-- protocolo_sessoes_acesso e protocolo_credenciais NÃO têm RLS:
-- são consultadas por token/senha globais (UUID único) antes de se conhecer o tenant.
ALTER TABLE protocolo_sessoes_acesso DISABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_credenciais DISABLE ROW LEVEL SECURITY;

-- contato_id agora pode ser NULL (protocolos internos sem cidadão)
ALTER TABLE protocolos ALTER COLUMN contato_id DROP NOT NULL;
