# Incremento 2 — Motor de modelos documentais (Diário Oficial Eletrônico)

Segundo incremento executado no módulo real `modulo-diario`, seguindo o escopo
acordado: **dados/modelo dos modelos documentais, validação estrutural e
renderização determinística**. Tudo em português; código integrado à API real e
validado por testes que rodam de verdade (SQLite in-memory), sem rede/chave.

## O que foi implementado e validado

Novo pacote **`app/document_model/`** (backend puro, sem IA ainda):

- **`schemas.py`** — `DocumentModelConfig` (Pydantic `extra="forbid"`) validado:
  finalidade/escopo (`purpose`, `scope_document_type`), `document_title`/`summary`
  com marcadores, **campos** (`DocumentField`: texto/data/inteiro/decimal/
  dinheiro/select/referência, obrigatório, opcionalmente condicional
  `required_when`) e **seções** (`SectionSpec`: árvore de blocos com textos fixos
  e marcadores `{{campo}}`, condicionais declarativas `when_field == when_value`,
  área de assinatura). Constantes de ciclo de vida
  (draft → em aprovação → ativo → arquivado).
- **`fill.py`** — coerção/validação de valores por tipo (datas ISO/pt-BR,
  números pt-BR `1.234,56`, select dentro de options, limites min/max, regex);
  **rejeita chaves inesperadas**; computa **pendências** de obrigatórios
  (recuperáveis, sem fingir sucesso).
- **`renderer.py`** — **renderização determinística** para o `SemanticDocument`
  já existente do editor semântico. Textos fixos são inseridos pelo renderizador
  (nunca reescritos pela IA); para os mesmos modelo+versão+dados o resultado é
  **idêntico** (mesmos `content_hash`). Blocos de redação livre são identificados.
- **`service.py`** — persistência versionada + ciclo de vida: criar, nova
  versão, submeter para aprovação, **aprovar/ativar (imutável)**, arquivar;
  `is_default` só é marcado quando não há outro modelo padrão **ativo** no mesmo
  escopo (nada é sobrescrito silenciosamente).
- **`errors.py`** — erros tipados e `Pending` com códigos estáveis.

Modelos/migração (padrão `PublicationTemplate` da casa, por organização):

- `DocumentModel` (`document_models`) e `DocumentModelVersion`
  (`document_model_versions`, `config_json` JSONB + `config_hash`).
- Migração aditiva `f1a2b3c4d5e6` (down = `d4e5f6a7b8c9`); cabeça alembic
  atualizada. Rollback só droppa as duas tabelas novas.
- Registrados em `models/__init__.py`; relação `Organization.document_models`.

Permissões (RBAC de ação, reutilizando papéis existentes):

- `document_model.manage` (criar/editar/importar) → AUTOR, ADMIN, SUPER_ADMIN.
- `document_model.approve` (aprovar/ativar versão) → REVISOR, ADMIN, SUPER_ADMIN.
- `document_model.use` (gerar minuta a partir de modelo aprovado) → AUTOR,
  ADMIN, SUPER_ADMIN.
- **Quem aprova modelo ≠ quem assina**: nenhuma dessas permissões concede
  assinatura.

## Reuso (sem subsistema concorrente)

- **Saída** do motor é o `SemanticDocument` (editor semântico existente) — não
  criei formato canônico novo.
- **Persistência/versão imutável** espelha `PublicationTemplate`/Version já
  existente.
- **Layout visual** (brasão/fontes/margens) continua a cargo do
  `PublicationTemplate`; o modelo documental define **estrutura de conteúdo**,
  que é conceito distinto e complementar.
- Camada IA (chave/config) do Incremento 1 não foi duplicada.

## Testes (realmente executados, sem chave/rede)

- `tests/test_document_model_engine.py` (12): determinismo idêntico, textos
  fixos preservados entre preenchimentos distintos, pendência por obrigatório
  ausente, rejeição de chave desconhecida e valores inválidos (data/inteiro/
  select), condicional `when_field`, config rejeita marcador inexistente e
  estrutura inválida (inciso na raiz).
- `tests/test_document_model_db.py` (5): ciclo de vida (criar→submeter→aprovar→
  ativo), **versão nova não altera a ativa**, apenas versão em aprovação pode
  ser ativada, segundo modelo no mesmo escopo não sobrescreve o padrão, arquivar
  limpa `is_default`.

Suíte completa do módulo: **551 passed**; as 7 falhas são as mesmas
pré-existentes/ambientais (PDF/weasyprint/signer, imports CSV, security/publica)
— **0 regressões**. Ruff limpo.

## Limitações e pendências reais (não fingidas)

- Este incremento cobre o **motor de preenchimento determinístico**; a geração
  por IA (identificar modelo, extrair campos, redigir blocos livres) e o
  "aprender modelo a partir de DOCX/PDF" virão em incrementos seguintes, usando
  o serviço centralizado DeepSeek já pronto.
- Suporte a **listas repetíveis** (ex.: vários incisos dinâmicos) ainda não
  implementado no render (adiado; modelado no config para evolução).
- Não há ainda router HTTP público dos modelos nem tela; o `service` é o
  contrato usado pelos próximos passos.
- Migrações aditivas (d4e5f6a7b8c9 e f1a2b3c4d5e6) **não foram aplicadas** ao
  banco compartilhado vivo (conforme acordado; passo: rebuild + `alembic
  upgrade head`).

## Arquivos

Novos: `app/document_model/{__init__,schemas,fill,renderer,service,errors}.py`,
`app/models/document_model.py`,
`alembic/versions/f1a2b3c4d5e6_add_document_models_and_versions.py`,
`tests/test_document_model_{engine,db}.py`.
Editados: `core/config.py` (head alembic), `core/permissions.py`,
`models/__init__.py`, `models/organization.py` (relação `document_models`).
Não pisa mudanças em curso de `editions`.
