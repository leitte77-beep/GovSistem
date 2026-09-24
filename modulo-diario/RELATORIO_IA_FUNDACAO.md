# Incremento 1 — Fundação da integração IA (Diário Oficial Eletrônico)

Relatório do primeiro incremento executado sobre o módulo real
`modulo-diario`, seguindo o escopo acordado: **camada de dados/permissões,
configuração segura de IA por organização e serviço centralizado DeepSeek**,
com validação e auditoria. Nada de telas estáticas ou simulações: o código foi
integrado à API existente e os testes rodam de verdade (SQLite in-memory,
`Base.metadata.create_all`), sem rede e sem chave real.

> Escopo geral do produto (menus de Editais/Portarias/Leis/Ofícios/Decretos/
> Resoluções, motor de modelos documentais versionados + renderização
> determinística, motor de preenchimento, geração com editor, numeração
> transacional, revisão/assinatura/relações/publicação e o frontend Next.js)
> será entregue em incrementos subsequentes. Este documento é a base.

## 1. O que foi implementado e validado

### Permissões (RBAC de ação)
`app/core/permissions.py`: novas capacidades granulares
`ai.manage`, `ai.run`, `ai.audit`, concedidas a `ADMIN`/`SUPER_ADMIN`
(`ai.manage/run/audit`) e a `AUDITOR` (`ai.audit`). Um usuário que administra a
configuração de IA **não** recebe automaticamente permissão de assinatura.

### Enumerações
`app/models/enums.py`: `AiExecutionKind`, `AiExecutionStatus` e novas ações de
auditoria `ai.config.updated`, `ai.config.key_replaced`,
`ai.config.key_removed`, `ai.config.disabled`, `ai.config.tested`,
`ai.execution`.

### Modelos (novas tabelas)
- `AiConfig` (`ai_configs`) — uma configuração por organização (`organization_id`
  único). Chave da API **criptografada em repouso** (`api_key_ciphertext`, Fernet
  via `services/encryption.py`, chave mestra `SECRET_KEY` fora do banco e do
  repositório) + apenas dica mascarada (`api_key_masked`). Guarda `enabled`,
  `provider/model` (somente leitura por contrato), limites (`timeout_seconds`,
  `max_tokens`, `max_concurrency`, `monthly_token_limit`) e estado do último teste.
- `AiExecution` (`ai_executions`) — trilha auditável de cada operação de IA:
  `kind`, `status`, `model`, `prompt_version`, `idempotency_key`, `usage`
  (consumo informado pelo provedor), erro sanitizado e `duration_ms`.
- Registrados em `app/models/__init__.py`; relação `Organization.ai_config`.

### Migração aditiva
`alembic/versions/d4e5f6a7b8c9_add_ai_configs_and_ai_executions.py`
(`down_revision = 3e4a5b6c7d8e`, cabeça atual). Cria só as duas tabelas novas;
**não toca** documentos, numeração nem fluxos existentes. `downgrade()` apenas
droppa as duas tabelas novas. `ALEMBIC_EXPECTED_HEAD` atualizado para a nova
cabeça.

> Aplicação ao banco compartilhado/vivo **não foi executada neste passo** para
> não desalinhar o contêiner que roda com código antigo (verificação fail-closed
> no startup). O passo de deploy é: rebuild → `alembic upgrade head`.

### Configuração segura de IA por organização (Configurações → IA)
`app/api/v1/ai_config.py` (router `/ai/config`), autenticada com
`require_permission("ai.manage")` e escopada por `user.organization_id`:
- `GET /ai/config` → metadados mascarados (nunca a chave integral).
- `PUT /ai/config` → salva campos não-secretos; `api_key` vazia/ausente
  **preserva** a chave existente; se informada, define (criptografa).
- `POST /ai/config/key` → substituir chave (ação explícita, auditada).
- `DELETE /ai/config/key` → remover chave (ação explícita, auditada).
- `POST /ai/config/disable` → desativar IA (explícita).
- `POST /ai/config/test-connection` (rate-limited `12/min`) → testa uma chave
  recém-digitada **sem persistir** (efêmera) ou a chave salva; atualiza o
  `last_test_*` quando a chave salva é usada. Sempre responde `200` com
  `ok/status/mensagem` acionáveis (não expõe erro bruto). Avisa que o teste
  consome tokens.
- `GET /ai/executions` → log de uso/erros (requer `ai.audit` ou `ai.manage`).

Toda mutação e teste gravam `AuditEvent` **sem o segredo**. A chave nunca sai
do backend, não está em URL, logs, bundle ou resposta.

### Serviço centralizado DeepSeek
`app/services/ai/` — único caminho para o provedor:
- `deepseek_client.py` — `DeepSeekClient`, modelo `deepseek-v4-flash`, base
  oficial `https://api.deepseek.com`, `POST /chat/completions` (compatível
  OpenAI), `response_format=json_object`. Timeout, semáforo de concorrência,
  retentativas limitadas com backoff exponencial (somente falhas transitórias:
  408/429/5xx/connect/timeout) e validação de resposta contra schema Pydantic.
  Erros tipados com códigos estáveis. **Sem fallback silencioso** para outro
  modelo. `transport` injetável (testes sem rede/chave).
- `errors.py` — `AiNotConfiguredError`, `AiDisabledError`, `AiAuthError`,
  `AiRateLimitError`, `AiProviderUnavailableError`, `AiInvalidRequestError`,
  `AiTimeoutError`, `AiInvalidResponseError`, `AiUsageLimitExceededError`.
- `config_store.py` — carrega/salva a config por organização, criptografa a
  chave, mascara (`****wxyz`), recupera a chave ativa (apenas uso interno) e
  registra o último teste. Nunca retorna a chave a clientes.

### Config (server-side)
`app/core/config.py`: defaults de servidor `DEEPSEEK_API_BASE`,
`DEEPSEEK_MODEL`, `AI_DEFAULT_TIMEOUT_SECONDS`, `AI_MAX_TOKENS`,
`AI_MAX_CONCURRENCY`, `AI_MAX_RETRIES`. Endpoint/modelo efetivos vêm do servidor,
não de config editável por tenant (não há chamadas a destinos arbitrários).

## 2. Testes (realmente executados, sem chave)

`tests/test_ai_config_api.py` (15 testes, todos verdes): autorização (sem
`ai.manage` → 403 em todos os endpoints); `GET` nunca devolve a chave; `PUT`
define a chave e a mascara sem vazar; chave em branco preserva a existente;
substituição/remoção/desativação auditadas sem o segredo nos eventos; cliente
DeepSeek parseia/valida JSON estruturado, rejeita violação de schema, mapeia
401/403→auth, 429→rate, 5xx→unavailable, re-tenta falhas transitórias, converte
timeout; `config_store` lança `AiNotConfiguredError`/`AiDisabledError`.

Suite completa do módulo: **534 passed**. As 7 falhas existentes são
**pré-existentes e ambientais** (editions/PDF/weasyprint/signer, imports CSV,
security/publica) — confirmado rodando-as no mesmo commit sem minhas mudanças
(6 falham idêntico no árbol limpo; a 7ª é flaky do assinador). **0 regressões
introduzidas.**

## 3. Como cadastrar a chave (interface atual, antes da tela web)

Sem rede/chave no ambiente, usei o contrato real; a tela (Configurações →
Inteligência artificial) virá no incremento de frontend. Por enquanto a chave é
cadastrada via API autenticada de um usuário `ADMIN` da organização:

```
PUT /api/v1/ai/config
Authorization: Bearer <token>
{ "api_key": "sk-...", "timeout_seconds": 60, "max_tokens": 4096 }
# resposta: config metadados com key_masked=****xxxx (chave nunca retorna)
```

Substituir: `POST /api/v1/ai/config/key  {"api_key":"sk-..."}`
Remover: `DELETE /api/v1/ai/config/key`
Testar (sem persistir): `POST /api/v1/ai/config/test-connection {"api_key":"sk-..."}`
Testar a chave salva: mesmo endpoint sem `api_key`.

## 4. Limitações e dependências reais

- Teste de conexão real contra `api.deepseek.com` **não foi executado** (sem
  chave disponível; o teste de integração opcional fica para quando o usuário
  fornecer a chave pelo ambiente). Os testes automatizados usam transporte
  simulado e cobrem o contrato.
- A migração aditiva **não foi aplicada** ao banco compartilhado vivo; o passo
  de deploy (rebuild + `alembic upgrade head`) está documentado e pendente de
  execução autorizada.
- Faltam os incrementos seguintes (document models/renderização, geração+editor,
  numeração transacional, relações, revisão/assinatura/publicação e o frontend
  com os seis menus e a tela de Configurações → IA).

## 5. Arquivos tocados (apenas aditivos; não pisa mudanças em curso de editions)

Novos: `models/ai_config.py`, `models/ai_execution.py`, `schemas/ai_config.py`,
`api/v1/ai_config.py`, `services/ai/{__init__,errors,deepseek_client,config_store}.py`,
`alembic/versions/d4e5f6a7b8c9_*.py`, `tests/test_ai_config_api.py`.
Editados: `core/permissions.py`, `models/enums.py`, `models/__init__.py`,
`models/organization.py` (relação `ai_config`), `core/config.py`,
`api/v1/router.py` (registro), `.env.example` (docs).
