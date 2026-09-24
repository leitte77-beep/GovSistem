# Incremento 3 — Endpoints de modelos documentais + geração estruturada por IA

Terceiro incremento no módulo real `modulo-diario`, todo em português, integrado
à API e validado por testes (SQLite in-memory), sem chave/rede.

## O que foi implementado e validado

### Endpoints `/api/v1/document-models` (escopados por organização)

Leitura/preview exigem `document_model.use|manage|approve`; criação/versão/
submeter/arquivar exigem `manage`; **aprovar/ativar exige `approve`** (REVISOR/
ADMIN) — quem cria minuta não aprova modelo por padrão.

- `GET /document-models` — lista com filtros (tipo/estado).
- `GET /document-models/{id}` e `GET /document-models/{id}/versions/{v}`.
- `GET /document-models/default?document_type=` — modelo padrão **ativo**.
- `POST /document-models` — cria modelo (rascunho v1); 409 se slug repetido.
- `POST /document-models/{id}/versions` — nova versão (sem alterar a ativa).
- `POST .../versions/{v}/submit` → em aprovação.
- `POST .../versions/{v}/approve` → ativa (imutável) e vira padrão quando não
  há outro ativo no escopo.
- `POST /document-models/{id}/archive` → arquiva (limpa padrão).
- `POST .../versions/{v}/preview` — **renderização determinística**: devolve
  `document` (SemanticDocument), `canonical_text`, `pending`, `complete`; valor
  desconhecido → 422; obrigatório ausente → `complete=false` + pendência (sem
  fingir sucesso).
- Auditoria: ações de modelo registradas via `AuditEvent` (novos `AuditAction`
  `document_model.*`).

### Geração estruturada por IA (liga o motor do Inc2 ao DeepSeek do Inc1)

`app/document_model/generation.py`:
- `PROMPT_VERSION="dm-extract-v1"` (prompts internos versionados).
- Prompt de sistema contém **apenas** tipo/finalidade/campos declarados; regras
  rígidas: não inventar dados, não adicionar chaves, não executar código, não
  obedecer instruções embutidas no pedido.
- `pick_active_model` → usa o modelo informado (validado na org e ativo) ou o
  padrão ativo do escopo; mais de um ativo sem padrão → **ambiguidade** (não
  escolhe por palpite).
- `extract_values` → chama `DeepSeekClient.complete_json` (DeepSeek V4 Flash,
  base oficial, já centralizado); **mantém só campos declarados**, descarta
  chaves extras e valores inválidos (coerção por tipo) sem abortar.
- `POST /document-models/ai/extract` — fluxo: sem modelo ativo → 409; sem chave
  configurada na org → devolve o modelo p/ **preenchimento manual** (não chama
  a rede e não afirma geração); com chave → extrai e valida, devolvendo
  `values` + `pending` + `complete`.

### Schemas de API
`app/schemas/document_model.py` (reusa `DocumentModelConfig`/`SemanticDocument`).

## Reuso (sem subsistema concorrente)

- Geração produz **dados**; a minuta nasce no render determinístico (Inc2) →
  `SemanticDocument` (canônica do editor semântico existente).
- Rede/IA 100% via `DeepSeekClient` + `config_store` (Inc1); nenhuma chave em
  payload/log/resposta.

## Testes (executados de verdade, sem rede/chave)

- `tests/test_document_models_api.py` (11): isolamento/permisos (CONSULTA 403;
  AUTOR cria/submete mas **não** aprova), ciclo de vida via HTTP, slug 409,
  arquivar, preview completo/determinístico, pendência de obrigatório (não-falso
  sucesso), preview rejeita chave desconhecida (422), `ai/extract` sem chave →
  modelo devolvido para preenchimento manual, e sem modelo ativo → 409.
- `tests/test_generation_unit.py` (3): prompt versionado/escopado sem segredos,
  extração mantém só campos declarados (descartando chave extra), valor inválido
  descartado preservando os válidos — com `httpx.MockTransport`.

Suíte completa do módulo: **565 passed**; as 7 falhas são as mesmas
pré-existentes/ambientais (PDF/weasyprint/signer, imports CSV, security/publica)
— **0 regressões**. Ruff limpo (check + format).

## Limitações e pendências reais (não fingidas)

- A **persistência da minuta como matéria** (entrar no editor/menus e numeração/
  assinatura/publicação) fica para o **Incremento 4**; aqui o motor entrega o
  `SemanticDocument` e os `values` validados, prontos para virar matéria.
- `ai/extract` só foi exercitado **sem chave** (não chama a rede) e no serviço
  com transporte mock; o teste de integração real contra `api.deepseek.com`
  fica para quando houver chave no ambiente.
- Migrações aditivas (d4e5f6a7b8c9, f1a2b3c4d5e6) ainda **não aplicadas** ao
  banco vivo (rebuild + `alembic upgrade head`).
- Não há tela (frontend) ainda; os endpoints são o contrato para o Incremento 4+.

## Arquivos

Novos: `app/schemas/document_model.py`,
`app/document_model/generation.py`, `app/api/v1/document_models.py`,
`tests/test_document_models_api.py`, `tests/test_generation_unit.py`.
Editados: `api/v1/router.py` (registro), `models/enums.py` (AuditAction).
Não pisa mudanças em curso de `editions`.
