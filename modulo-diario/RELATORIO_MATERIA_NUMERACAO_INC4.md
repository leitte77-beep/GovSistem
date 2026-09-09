# Incremento 4 — Minuta → matéria real + numeração transacional

Quarto incremento no módulo real `modulo-diario`, em português, integrado à API
e validado por testes (SQLite in-memory), sem chave/rede. **Não** tocou em
`matters.py`/`editions.py` (que têm mudanças em andamento do cliente) — tudo
aditivo.

## O que foi implementado e validado

### A) Persistir a minuta gerada como matéria real
`app/document_model/ingest.py` + `POST .../material`:
- `semantic_to_html(document)` → HTML canônico/determinístico derivado dos blocos
  (`content_html` para busca/prévia); `plain_text` vindo do documento canônico.
- `create_rendered_matter(...)` → cria `Matter` **rascunho** (`content_mode`
  `semantic`), gravando `semantic_content` (documento canônico), título/ementa e
  metadados de origem (`source=document_model`, `source_model_id`,
  `source_model_version`, `model_slug`). **Sem número** (usa id de rascunho).
- Endpoint exige preenchimento **completo**: com pendências → `409` + lista de
  pendências (não se finge sucesso). Autorização: `document_model.use`.
- Auditoria (`AuditAction.document_model.material.created`).

### B) Numeração transacional confiável
`app/services/document_numbering.py` + tabela `act_number_series` +
`POST /numbering/issue`:
- Série por (organização, tipo de ato, ano) com **`SELECT … FOR UPDATE`** (row
  lock) — nunca `MAX+1` sem proteção. Contador **monotônico**: número atribuído
  e depois cancelado **não** é reutilizado.
- **Reenvio idempotente**: mesma matéria, mesmo ano → devolve o mesmo número
  (`already_assigned=true`) sem consumir outro.
- Ano institucional (`America/Sao_Paulo`); séries independentes por ano (virada
  de ano recomeça em 1). `act_number`/`act_year`/`act_date` gravados na matéria.
- Endpoint exige permissão de quem encaminha/aprova
  (`matter.approve`|`matter.publish`|`document_model.approve`) — **autor não
  emite número** (403). Auditoria (`AuditAction.act.number.issued`).

## Reuso (sem subsistema concorrente)
- A matéria criada é a mesma entidade `Matter` do fluxo editorial existente
  (estados editoriais, edição/publicação continuam valendo).
- Formato canônico = `SemanticDocument`; numeração usa as colunas estruturadas
  `act_number/act_year/act_date` já existentes em `matters`.

## Testes (executados de verdade)
`tests/test_document_models_material_number.py` (5): matéria draft sem número;
pendência bloqueia a criação (409, não-falso-sucesso); numeração idempotente e
sequencial; série independente por ano (virada); autor não emite número (403).

Suíte completa do módulo: **570 passed**; as 7 falhas são as mesmas
pré-existentes/ambientais (PDF/weasyprint/signer, imports CSV, security/publica)
— **0 regressões**. Ruff limpo (check + format).

## Limitações e pendências reais (não fingidas)
- A **corrida real** de concorrência na mesma série (postgres advisory/row lock)
  não é reproduzível no SQLite dos testes; o lock transacional garante em
  produção, mas o teste de disputa de verdade fica para ambiente postgres.
- O número é emitido por endpoint explícito (marco de "preparar/enviar"): a
  **amarração automática** ao ponto exato de aprovação/primeira assinatura e o
  fluxo de assinatura da matéria ficam para integrar quando os arquivos em
  andamento de `matters`/`editions` forem consolidados (para não conflitar).
- Migrações (d4e5f6a7b8c9, f1a2b3c4d5e6, g2a3b4c5d6e7) **não aplicadas** ao banco
  vivo (rebuild + `alembic upgrade head`).
- Sem tela ainda; os endpoints são o contrato.

## Arquivos
Novos: `app/models/numbering.py`, `app/services/document_numbering.py`,
`app/document_model/ingest.py`,
`alembic/versions/g2a3b4c5d6e7_add_act_number_series.py`,
`tests/test_document_models_material_number.py`.
Editados: `app/api/v1/document_models.py` (material + numbering),
`app/schemas/document_model.py`, `app/models/enums.py` (AuditAction),
`app/core/config.py` (head alembic), `app/models/__init__.py`.
