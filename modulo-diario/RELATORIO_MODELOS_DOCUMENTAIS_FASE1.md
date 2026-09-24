# Modelos Documentais — Reformulação (Fase 1: fundações backend)

> Documento vivo da reformulação do construtor de **Modelos Documentais** do
> Diário Oficial. Esta fase **não remove** nada da interface atual; ela prepara o
> backend e o banco para o construtor visual (WYSIWYG A4) das fases seguintes.

## Contexto e decisões

A tela atual expõe um textarea de **Config JSON** para o usuário administrativo.
O objetivo é substituí-la por um **construtor visual por blocos + layout A4**,
preservando o motor determinístico existente (modelo ativo = fonte da verdade).

Decisões aprovadas:

1. **Editor**: construtor por blocos + layout A4 (reaproveita o motor semântico).
2. **Banco**: **evoluir** as tabelas `document_models` / `document_model_versions`
   (sem criar um sistema paralelo).
3. **Execução**: faseada. Esta é a **Fase 1**.

## Auditoria da implementação atual (resumo)

- **Banco**: `document_models`, `document_model_versions` (JSONB `config_json`),
  `act_number_series`, `matters.document_type`.
- **Motor**: `app/document_model/{renderer,fill,generation,ingest,schemas}.py`.
- **API**: `app/api/v1/document_models.py` (15 rotas) + permissões
  `document_model.manage/approve/use`.
- **Frontend**: `web-admin/src/app/documentos/modelos/page.tsx` (tabela + JSON).
- **PDF**: WeasyPrint (`app/services/edition_pdf.py`), 3 layouts Jinja; município
  e brasão **hardcoded**; endereço/telefone/site **não existiam**.
- **IA**: `config_store` + `DeepSeekClient.complete_json` (`dm-extract-v1`).
- **Extração**: DOCX/PDF já existem em `app/services/importer.py`.

## O que foi alterado nesta fase

### 1. Identidade institucional (`organizations`)

Novos campos (nullable, aditivos): `state`, `address_street`, `address_number`,
`address_complement`, `address_district`, `address_city`, `address_postal_code`,
`phone`, `email`, `site`, `institutional_layout` (JSONB — layout visual padrão).

Endpoints:
- `GET  /api/v1/settings/institution`
- `PATCH /api/v1/settings/institution` (permissão `settings.manage`; audita
  `organization.institutional_updated`)

### 2. Modelo visual versionado (`document_model_versions.layout_json`)

Novo schema **`DocumentLayout`** (`app/document_model/layout.py`): tamanho de
página, orientação, margens (mm), fontes (família/tamanho/entrelinha/cor),
cabeçalho (brasão, município, endereço, CNPJ, telefone, site) e rodapé
(numeração de páginas). Validação `extra="forbid"` e limites.

`layout` agora é aceito em `POST /document-models` e
`POST /document-models/{id}/versions`, e devolvido em `GET .../versions/{v}` e
nas respostas de versão.

### 3. Herança de modelo (`document_models.parent_model_id`)

Auto-FK (`ON DELETE SET NULL`) para herdar cabeçalho/rodapé/estrutura de um
modelo base. Validado por organização (parent de outra org → 404).

### 4. Soft delete (`document_models.deleted_at`)

`DELETE /document-models/{id}` agora faz **soft delete** (histórico preservado);
listagens, detalhe, default e `_get_model` ignoram registros excluídos. Mantidas
as guardas: não exclui modelo padrão nem modelo que já gerou minutas.

### 5. Biblioteca de blocos reutilizáveis (`document_model_blocks`)

CRUD por organização:
- `GET    /document-model-blocks`
- `POST   /document-model-blocks`
- `PATCH  /document-model-blocks/{id}`
- `DELETE /document-model-blocks/{id}` (soft delete)

### 6. Documentos de referência para IA (`document_model_training_files`)

Tabela criada como fundação da Fase 4 ("Aprender com documentos"): `filename`,
`mime_type`, `size_bytes`, `storage_path`, `sha256`, `status`, `extracted_text`,
`ai_analysis`, `used_by_ai`. Sem endpoints nesta fase.

### 7. Permissões granulares e auditoria

Novas permissões (`app/core/permissions.py`): `document_model.view`,
`.create`, `.edit`, `.activate`, `.publish`, `.archive`, `.advanced_config`,
`.train_ai` (mantidas as antigas `manage/approve/use`). Novas ações de auditoria:
`document_model.activated/deactivated`, `.block.created/updated/deleted`,
`.training_file.added/removed`, `organization.institutional_updated`.

## Migração

`api/alembic/versions/i6j7k8l9m0n1_add_visual_document_templates_foundation.py`
(revisa `h5i6j7k8l9m0`). **Aditiva e reversível** — nenhuma coluna existente é
alterada nem dado removido.

- `ALEMBIC_EXPECTED_HEAD` atualizado para `i6j7k8l9m0n1`.
- Aplicação: `docker compose build api` → `alembic upgrade head` → restart.
- Rollback: `alembic downgrade h5i6j7k8l9m0`.

## Testes

- `tests/test_document_template_foundation.py` (12 testes): layout, herança,
  soft delete, identidade institucional, blocos, autorização.
- Suítes existentes de modelos documentais seguem verdes (41 testes).
- Suíte completa: 589 passed; falhas restantes são **pré-existentes** (PDF de
  edição, CSV `bad delimiter`, coleta de rotas de segurança) confirmadas por
  `git stash` sem esta mudança.

## Próximas fases

2. Construtor visual (3 painéis: elementos / A4 / propriedades), campos
   dinâmicos, blocos condicionais, autosave, JSON somente leitura em
   "Configurações avançadas".
3. Preview HTML e PDF unificados + "Testar modelo".
4. Aprender com documentos (upload PDF/DOCX → IA propõe estrutura → aprovação).
5. Nova experiência de criação de documentos, estados do fluxo, listagem
   profissional, blocos reutilizáveis e herança na UI.
6. Testes de PDF/IA/regressão, builds e validação final.

---

# Fase 2 — Construtor visual (implementada)

## Objetivo

Substituir o textarea de **Config JSON** por um **construtor visual por blocos +
folha A4**, gerando a config automaticamente. O JSON passa a existir apenas
internamente e como visualização somente leitura em "Configurações avançadas".

## Backend

- `PATCH /api/v1/document-models/{id}/versions/{version}` — edita **apenas
  versões em rascunho** (autosave): atualiza `config_json`, `config_hash`,
  `layout_json` e sincroniza `purpose`/`document_type` do modelo. Versões
  ativas/em aprovação retornam `409`. Audita `document_model.updated`.
- Serviço `update_draft_version` e schema `DocumentModelVersionUpdateIn`.

## Frontend (`web-admin`)

Novo diretório `src/components/DocumentModelBuilder/`:

- `constants.ts` — rótulos, elementos, helpers de árvore (mover, duplicar,
  remover), slugify, marcadores e renomear/remover referências de campo.
- `ElementsPanel.tsx` (esquerda) — paleta de elementos (clicar para adicionar),
  sub-blocos do artigo e biblioteca de campos dinâmicos (criar, editar,
  inserir, remover) — **sem digitar `{{variavel}}`**.
- `A4Canvas.tsx` (centro) — folha A4 realista (tamanho, orientação, margens,
  fonte, cabeçalho institucional e rodapé), com seleção de blocos, ações
  (mover/duplicar/excluir) e campos renderizados como *chips*.
- `PropertiesPanel.tsx` (direita) — propriedades do documento/layout, da seção
  (texto, alinhamento, nível, número, assinatura) e do campo (rótulo, chave,
  tipo, obrigatório, opções, faixa, ajuda) + **construtor visual de condição**
  ("Exibir quando [campo] é igual a [valor]").
- `AdvancedConfigDrawer.tsx` — JSON interno **somente leitura**, exibido apenas
  para ADMIN/SUPER_ADMIN.
- `PreviewModal.tsx` — "Testar modelo" com dados fictícios e prévia canônica.
- `DocumentModelBuilder.tsx` — orquestra os 3 painéis, **autosave** com estado
  "Salvando… / Salvo / Erro ao salvar", envio para aprovação e aprovação.

Páginas:

- `src/app/documentos/modelos/[id]/page.tsx` — carrega o modelo, escolhe a
  versão editável (rascunho mais recente, senão a ativa) e abre o construtor.
  Quando a versão é ativa (somente leitura), oferece "Criar nova versão".
- `src/app/documentos/modelos/page.tsx` — listagem reformulada e criação por
  formulário (nome, slug automático, tipo, finalidade). **Sem JSON.** Ações:
  Abrir, Arquivar, Excluir.

## Compatibilidade

- A config gerada é exatamente o `DocumentModelConfig` validado pelo servidor
  (`extra="forbid"`, marcadores referenciando campos, árvore de seções).
- O motor determinístico, o preview, a numeração e a geração de minutas
  continuam intactos.

## Verificação

- `tsc --noEmit` limpo; `vitest` 86/86; `ruff` limpo; testes backend 14/14
  (fundações + autosave).
- Deploy: `api` e `web-admin` reconstruídos e healthy.
- Smoke test via nginx: criar modelo `201` → PATCH autosave `200` (config e
  layout persistidos) → excluir `204`.

## Pendências mapeadas para as próximas fases

- Drag-and-drop nativo no canvas (hoje: adicionar por clique + mover ↑/↓).
- Flags de "texto fixo/protegido" e "gerado pela IA" por bloco.
- Prévia HTML idêntica ao PDF (unificação dos renderizadores) — Fase 3.
- Aprender com documentos e biblioteca de blocos na UI — Fases 4/5.

---

# Fase 2.1 — Pendências resolvidas

- **Drag-and-drop**: blocos são arrastáveis no canvas (HTML5 DnD) e podem ser
  reordenados entre irmãos (raiz ou dentro de artigos), com indicador visual.
- **Flags de bloco**: `fixed_text` (texto fixo), `locked` (protegido — a IA não
  altera) e `ai_generated` (redação da IA) por seção, com checkboxes no painel
  de propriedades e ícones no canvas. O renderizador determinístico considera
  `fixed_text`/`locked` para não classificar o bloco como texto livre.

# Fase 3 — Preview HTML/PDF unificado (implementada)

## Objetivo

Preview e PDF com aparência praticamente idêntica, respeitando margens, fonte,
cabeçalho, rodapé, quebras de página e alinhamentos.

## Backend

- `app/document_model/render_html.py`: **um único HTML/CSS** alimenta o preview
  e o PDF. Usa CSS Paged Media (`@page`, `position: running()` e
  `content: element(...)`) para repetir o **cabeçalho institucional** e o
  **rodapé com numeração** em todas as páginas no PDF. O cabeçalho usa a
  identidade institucional (brasão, município, endereço, CNPJ, telefone, site).
- Endpoints:
  - `POST /document-models/{id}/versions/{v}/render` → `{html, complete,
    pending, canonical_text}`.
  - `POST /document-models/{id}/versions/{v}/render-pdf` → `application/pdf`.
- Blocos: título, súmula, preâmbulo, comando, parágrafos, citação, artigos
  (com incisos/alíneas/parágrafos, numeração automática de incisos em romanos e
  alíneas em letras), assinatura e anexos.

## Frontend

- `PreviewModal` reformulado: além dos dados fictícios e do texto canônico,
  renderiza o **PDF real** (via blob autenticado) num iframe — mesma aparência
  da publicação.
- `api.renderVersionHtml` / `api.renderVersionPdf` (blob com refresh de token).

## Verificação

- Testes backend: render HTML (com `@page` e valor interpolado), render PDF
  (`%PDF` + `content-type`), 422 para campo inexistente, round-trip das flags.
- Smoke via nginx: render HTML `complete=True`; PDF válido com 1 página,
  cabeçalho institucional e rodapé "Página 1 de 1".
- `tsc` limpo · `vitest` 86/86 · `ruff` limpo · backend 44 testes focados.
- `api` e `web-admin` reconstruídos e healthy.

## Próximas fases

4. Aprender com documentos (upload PDF/DOCX → IA propõe estrutura → aprovação)
   + aba "Documentos de referência".
5. Nova experiência de criação de documentos, estados do fluxo, listagem
   profissional, blocos reutilizáveis e herança na UI.
6. Testes de PDF/IA/regressão, builds e validação final.

---

# Fase 4 — Aprender com documentos (implementada)

## Objetivo

Enviar documentos oficiais reais (PDF/DOCX), deixar a IA **propor** a estrutura
(campos, textos fixos, condicionais, assinatura) e **aprovar manualmente** antes
de qualquer uso. A IA nunca altera um modelo ativo automaticamente.

## Backend

- `app/document_model/learning.py`:
  - `extract_text` (PDF via pdfminer, DOCX via python-docx).
  - Prompt versionado `dm-learn-v1`; a IA devolve JSON no formato do
    `DocumentModelConfig`.
  - `_repair_config`: normaliza a resposta (valida kinds/tipos, gera ids,
    cria campos para marcadores ausentes) antes da validação estrita.
  - `analyze_documents`: `DeepSeekClient.complete_json` + validação.
- Tabela `document_model_training_files` (criada na Fase 1): arquivo em object
  storage (isolamento por tenant), `sha256`, texto extraído e status.
- Endpoints:
  - `GET/POST /document-models/{id}/training-files` (multipart; PDF/DOCX;
    antivírus; extração síncrona).
  - `PATCH/DELETE /document-models/{id}/training-files/{file_id}` (marcar
    "usado pela IA" e remover — soft delete).
  - `POST /document-models/{id}/training-files/propose` → proposta da IA
    (`ok/status/message/config/sources/prompt_version`). Falhas de IA (sem
    chave, timeout, indisponível) retornam **200 com `ok=false`** e mensagem
    clara — nunca 500; dados preservados, retry permitido.
  - Auditoria: `document_model.training_file.added/removed`.
  - Rastreabilidade: grava `AiExecution` (`propose_structure`, `dm-learn-v1`,
    usage, latência) em sucesso e falha.
- Permissão `document_model.train_ai` (ADMIN/SUPER_ADMIN/AUTOR).

## Frontend

- `TrainingFilesDrawer` ("Aprender com documentos") no construtor: upload
  múltiplo PDF/DOCX, lista com status/tamanho, toggle "Usado pela IA", remover,
  botão **Analisar com IA** e prévia **"Modelo identificado pela IA"** com
  botão **Aprovar modelo** (cria uma nova versão em rascunho pelo fluxo normal).
- `api`: `listTrainingFiles`, `uploadTrainingFile`, `updateTrainingFile`,
  `deleteTrainingFile`, `proposeFromTrainingFiles`.
- Tipos `TrainingFile` e `LearnProposal`.

## Verificação

- Testes backend: upload/list/toggle/delete, rejeição de formato, proposta sem
  documentos marcados (409), falha tipada sem chave e reparo de marcadores com
  IA simulada (MockTransport).
- Smoke real via nginx:
  - upload DOCX `201`, list `analyzed/has_text=true`, toggle `200`, remover `204`.
  - **IA real (org com chave)**: `ok=true`, `dm-learn-v1`, campos
    `[numero_portaria, ano_portaria, dias_ferias, servidor_nome, matricula,
    data_inicio]` e blocos `heading/preamble/command/article/paragraph`.
  - Sem chave: `ok=false, status=not_configured` com mensagem clara.
- `tsc` limpo · `vitest` 86/86 · `ruff` limpo · 22 testes focados.
- `api` e `web-admin` reconstruídos e healthy.

---

# Fase 5A — Identidade institucional, ciclo de vida e listagem

Sub-fase inicial da Fase 5: UI de identidade institucional + desativar/reativar,
duplicar, histórico e listagem profissional de modelos.

## Backend

- Novo status `inactive` (`DM_STATUS_INACTIVE`) no ciclo de vida do modelo.
  Modelos inativos não são escolhidos para geração (`active_models_for_scope`,
  `pick_active_model`, `GET /document-models/default`) e deixam de ser padrão.
- `service.py`: `deactivate_model`, `reactivate_model` e `duplicate_model`
  (copia config/layout da versão ativa ou da última, cria v1 rascunho e liga o
  original como `parent_model_id`). Transições inválidas → `ModelTransitionError`
  → HTTP 409.
- Endpoints novos:
  - `POST /document-models/{id}/deactivate` e `/reactivate`
    (`document_model.manage`/`activate`).
  - `POST /document-models/{id}/duplicate` — slug único gerado
    (`-copia`, `-copia-2`, …), 201.
  - `GET /document-models/{id}/history` — eventos de `audit_events`
    (`entity_type="document_model"`), com nome do autor.
- Listagem/detalhe passam a expor `usage_count` (nº de minutas geradas,
  contadas por `DOCUMENT_MODEL_MATERIAL_CREATED`), `created_by` e
  `created_by_name`, `created_at`.
- Ações de auditoria `document_model.deactivated` / `document_model.activated`
  já existentes são emitidas.

## Frontend

- **`Configurações → Identidade institucional`** (`/settings/institution`):
  nome, CNPJ, UF, brasão (URL + prévia), endereço completo, CEP, telefone,
  e-mail, site e padrão visual (margens, fonte do corpo, toggles de
  cabeçalho/rodapé, formato de numeração). Item de menu e card na página de
  Configurações.
- **Listagem profissional** de modelos: uso ("N documentos"), criado por,
  última alteração, badges de estado/padrão e menu de ações — Editar,
  Pré-visualizar/Testar (PDF real via `PreviewModal`), Histórico (drawer),
  Duplicar, Desativar/Reativar, Arquivar e Excluir.
- `api`/tipos: `updateInstitution`, `deactivateDocumentModel`,
  `reactivateDocumentModel`, `duplicateDocumentModel`,
  `getDocumentModelHistory`, `DocumentModelHistoryEntry` e campos novos do
  `DocumentModelSummary`.

## Verificação

- Backend: +5 testes (desativar/reativar e efeito no default, desativar exige
  ativo, duplicar copia versão ativa e gera slug único, histórico, uso/criador
  na listagem). 42 testes focados passando; `ruff` limpo nos arquivos alterados.
- Frontend: `tsc` limpo · `vitest` 86/86.
- Smoke real via nginx (org ADMIN): institution `200`; ciclo completo em modelo
  descartável — create → submit → approve → duplicate (parent correto, slug
  `-copia`) → history (3 eventos) → deactivate (`inactive`, default `false`) →
  reactivate (`active`) → delete. Rotas novas confirmadas (`422` para UUID
  inválido / `405` para método incorreto).
- `api` e `web-admin` reconstruídos e healthy.

---

# Fase 5B — Biblioteca de blocos e herança na UI

## Biblioteca de blocos reutilizáveis (item 23)

- `BlocksDrawer` (biblioteca de blocos) aberto pelo painel de elementos:
  - **Inserir** bloco no documento (clona as seções com novos ids).
  - **Salvar seleção atual como bloco** (nome + `content_json.sections`).
  - **Criar bloco de texto** simples (nome, tipo de elemento, texto com
    `{{campos}}`).
  - **Excluir** bloco da biblioteca.
- `ElementsPanel` ganhou a seção "Blocos reutilizáveis" (Botões *Biblioteca* e
  *Salvar seleção*; este último habilita só com elemento selecionado e
  permissão de gestão).
- Formato canônico do bloco: `content_json = { sections: DocumentSection[] }`,
  o que permite salvar trechos com um ou vários elementos (cabeçalho,
  assinatura, comando) e reinseri-los fielmente.
- `api`/tipos: `listDocumentModelBlocks`, `createDocumentModelBlock`,
  `updateDocumentModelBlock`, `deleteDocumentModelBlock`, `DocumentModelBlock`
  e `DocumentModelBlockContent`.

## Herança na UI (item 24)

- No formulário de criação (listagem) há o seletor **"Modelo base (opcional)"**;
  o `parent_model_id` é enviado ao criar.
- Ao abrir o construtor de um modelo filho com rascunho **vazio**, o pai
  (versão ativa ou última) é carregado e a estrutura (`sections`), os campos e o
  layout padrão são herdados; o autosave persiste a herança. Falha ao carregar
  o pai não impede abrir o filho.

## Verificação

- `tsc` limpo · `vitest` 86/86 · build do `web-admin` OK.
- Smoke real via nginx: criação de bloco (`201`), listagem com o bloco, criação
  de filho com `parent_model_id` correto; exclusões `204`. Páginas
  `/documentos/modelos` e `/settings/institution` respondendo `200`.
- `web-admin` reconstruído e healthy. Backend inalterado nesta sub-fase.

---

# Fase 5C — Criação por finalidade e estados do fluxo

## Nova experiência de criação (itens 19 e 20)

- `src/app/documentos/criar/page.tsx` reformulado:
  - Trilha **Documentos oficiais → {Tipo} → Nova {Tipo}** (aceita `?tipo=`).
  - Passo 1: escolha do **tipo** e da **finalidade** (Exoneração, Nomeação,
    Férias, Designação, Gratificação, Outros). Cada finalidade resolve o modelo
    ativo correspondente (match por `purpose`); "Outros" permite escolher
    qualquer modelo ativo.
  - Passo 2: **Gerar com IA** (usa `POST /document-models/ai/extract`) ou
    preenchimento manual; exibe **somente os campos** do modelo escolhido.
  - Passo 3: pré-visualização e **"Gerar e abrir no editor"** — cria a matéria
    via `POST /document-models/{id}/versions/{v}/material` e redireciona para
    `/matters/{id}/edit` (editor TipTap) para revisão.
- Botão "Nova {Tipo}" na listagem por tipo; `?tipo=` pré-seleciona o tipo.
- `useSearchParams` protegido por `Suspense` (build estático).

## Estados do fluxo (item 20)

- Novo campo aditivo `matters.workflow_status` (nullable, `String(30)`) com os
  estados `rascunho`, `gerado_pela_ia`, `em_revisao`, `aprovado`,
  `aguardando_assinatura`, `assinado`, `publicado`, `cancelado`
  (`MatterWorkflowStatus`), **sem alterar** o `status` editorial existente.
- Minutas geradas por modelo nascem como `gerado_pela_ia`; matérias manuais como
  `rascunho`.
- Endpoints:
  - `POST /matters/{id}/workflow-status` — transição validada (409 em transição
    inválida, 422 em estado desconhecido), auditada com `from`/`to`.
  - `GET /matters/{id}/workflow-history` — histórico (workflow + status
    editorial + criação) a partir de `audit_events`.
- `WorkflowStatusPanel` no editor da matéria: badge do estado atual, botões das
  transições permitidas e histórico expansível.
- `MatterResponse`/`MatterListResponse` expõem `workflow_status`.
- Migration `j7k8l9m0n1o2` (`down_revision = i6j7k8l9m0n1`);
  `ALEMBIC_EXPECTED_HEAD` atualizado; `MIGRATION.md` atualizado.

## Verificação

- Backend: +6 testes (`test_matter_workflow_status.py`) e asserção de
  `gerado_pela_ia` na geração por modelo. 176 testes de matéria/documento
  passando; `ruff` sem novos avisos.
- Frontend: `tsc` limpo · `vitest` 86/86 · build OK.
- **Bug real encontrado e corrigido no smoke**: `aguardando_assinatura` (21
  caracteres) excedia `varchar(20)`; coluna ampliada para `String(30)` e
  migration reaplicada (downgrade/upgrade).
- Smoke real (nginx, ADMIN): criação manual → `rascunho`; caminho completo
  `gerado_pela_ia → em_revisao → aprovado → aguardando_assinatura → assinado →
  publicado` (`200` cada); transição inválida `409`; histórico registrado;
  exclusão da matéria `204`.
- `api` e `web-admin` reconstruídos e healthy.

---

# Fase 5D — UX, A11y, responsividade e regressão

## Acessibilidade

- Hook `useEscapeKey` aplicado a todos os drawers/modais (`BlocksDrawer`,
  `TrainingFilesDrawer`, `AdvancedConfigDrawer`, `PreviewModal`) e ao painel de
  histórico/menu da listagem — **Escape fecha**.
- `aria-modal="true"` em todos os diálogos (alinhado ao padrão da casa em
  `ActTypePicker`/`PublishSection`).
- Botões de ação com `focus-visible:outline` (painel de fluxo, menu de ações,
  itens do menu) e `aria-expanded`/`aria-pressed` onde aplicável.
- Contraste: textos de dica `text-gray-400` → `text-gray-500` (≥4,5:1 sobre
  branco) nos componentes das fases 5A–5C.

## Responsividade

- Tabela da listagem por tipo com `overflow-x-auto` + `min-w-[720px]` (sem
  quebra em telas estreitas); listagem de modelos já rolável.
- Drawers/modais `w-full max-w-*` e grids `sm:grid-cols-2`; editor permanece
  desktop-first (conforme escopo).

## Regressão

- Novo módulo compartilhado `src/lib/workflowStatus.ts` (rótulos, estilos e
  transições) consumido pelo `WorkflowStatusPanel` e testável.
- +9 testes frontend: `workflowStatus.test.ts` (rótulos/transições/estado
  desconhecido) e `WorkflowStatusPanel.test.tsx` (estado atual, avanço de
  fluxo, terminal sem ações, histórico).
- `tsc` limpo · `vitest` **95/95** · build do `web-admin` OK.
- Smoke via nginx: páginas `200` e marcador do novo painel presente no bundle
  implantado. `web-admin` reconstruído e healthy; backend inalterado.

---

# Fase 6 — Validação final

Validação de ponta a ponta das Fases 5A–5D, sem novas funcionalidades.

## Suítes

- **Backend**: `pytest tests/` → **609 passed, 7 failed**. Os 7 não têm
  relação com a Fase 5: os 6 reproduzem-se de forma idêntica no `HEAD`
  (worktree limpo) — `test_editions` (2), `test_imports` CSV (2),
  `test_public_v1` (1), `test_security` (1, introspecção de rotas) — e o 7º
  (`test_sign_pdf`) é flaky por ordem (passa isolado). Nenhuma regressão
  introduzida.
- **Frontend**: `tsc` limpo · `vitest` **95/95**.
- **Lint**: `ruff` sem novos avisos nos arquivos alterados.
- **Build**: `api` e `web-admin` OK.

## Smoke E2E (nginx, ADMIN)

Instituição → criação de modelo (layout + campos) → submit/approve → bloco
reutilizável → filho com herança → render HTML (`complete`, valor, `@page`) e
PDF (`%PDF`, `application/pdf`) → histórico (3 eventos) → duplicação (parent
correto) → desativar/reativar → limpeza total (`0` modelos restantes).
Páginas `/documentos`, `/documentos/modelos`, `/documentos/criar`,
`/documentos/tipos/portaria`, `/settings/institution`, `/matters` → `200`.
Containers `api` e `web-admin` healthy.

## Conclusão

Checklist da Fase 5 totalmente atendido; fases 5A–5D implantadas e validadas.

---

# Pendências §7 — corrigidas

## 1. Assinatura: autoridade/certificado/posição (item 21)

- `SignatureEntrySpec` ganhou `authority_id`, `credential_id` e `position`
  (`left|center|right`, validado); `semantic.SignatureEntry` ganhou `position`.
- O renderizador propaga `position`; `body_html.signature_html` (e o preview no
  `A4Canvas`) alinha cada entrada individualmente.
- UI (`PropertiesPanel`): seleção de **autoridade** (cadastro de autoridades,
  preenche nome/cargo e grava `authority_id`), **certificado de assinatura**
  (credenciais ativas) e **posição visual** por entrada; adicionar/remover
  assinaturas.
- Testes: roundtrip de `authority_id`/`credential_id`/`position`, rejeição de
  posição inválida (422) e render aplicando `text-align` da entrada.

## 2. Unificação dos renderizadores

- Novo `app/document_model/body_html.py`: **fonte única** do HTML do corpo
  semântico (`blocks_to_html`, `signature_html`, `article_html`) + o CSS
  `DOCUMENT_BODY_CSS` (escopo `.doc-body`).
- `render_html.py` (preview/PDF de modelos) e `ingest.semantic_to_html`
  (conteúdo persistido da matéria) agora usam o **mesmo** gerador. O
  `content_html` de matérias geradas por modelo passa a ser idêntico ao do
  preview.
- O PDF de edições injeta o mesmo CSS (`extra_css=DOCUMENT_BODY_CSS`) nos três
  templates (`classico`, `moderno`, `minimalista`) e marca o wrapper como
  `matter-content doc-body`, de modo que o corpo semântico publicado tem a
  mesma apresentação do preview. Snapshots já congelados permanecem válidos
  (CSS é aditivo; o markup antigo continua estilizado pelas regras genéricas).
- O pipeline de edição (capa, sumário, selo de autenticidade, hash canônico,
  PAdES) foi **preservado** — a unificação cobre o corpo semântico.

## Verificação

- Backend: 77 testes focados de modelos/documentos + `test_editions` (28 passed,
  2 falhas pré-existentes inalteradas); `ruff` limpo nos arquivos novos.
- Frontend: `tsc` limpo · `vitest` 95/95 · build OK.
- Smoke real (ADMIN): modelo com bloco de assinatura → render com
  `text-align:right` e nome da autoridade; material gerado com `content_html`
  em `.doc-*` (`doc-signature`) e `workflow_status=gerado_pela_ia`; bundle do
  web-admin contém a UI de certificado de assinatura.
- `api` e `web-admin` reconstruídos e healthy.

---

# Correções pós-validação (feedback de uso)

## "A IA retornou uma resposta inesperada" ao analisar modelo

- Causa: `DeepSeekClient.complete_json` só aceitava JSON "puro"; respostas com
  cercas de markdown (```json … ```) ou texto ao redor viravam
  `AiInvalidResponseError` (mensagem genérica), apesar de conterem JSON válido.
- Correção: `_parse_json_object` remove cercas de markdown e recorta o objeto
  (`{ … }`) antes de validar; JSON realmente inválido continua gerando erro
  tipado. `analyze_documents` passou a mapear `ValidationError` da proposta para
  erro tipado (nunca 500) e `_repair_config` descarta sub-blocos inválidos na
  raiz (`inciso`/`alinea`/`paragraph_item`).
- Testes: +5 (fence, fence sem linguagem, texto ao redor, conteúdo não-JSON e
  descarte de sub-bloco na raiz). Verificado no container implantado.

### Causa raiz do aviso persistente: truncamento por tokens de raciocínio

- `deepseek-v4-flash` é um **modelo de raciocínio**: consome o orçamento em
  `reasoning_tokens` antes de produzir conteúdo. Com `max_tokens=8192`, o
  raciocínio consumia **todos** os tokens e o conteúdo voltava vazio
  (`finish_reason=length`) → "resposta inesperada".
- Correções: `AI_MAX_TOKENS` 4096 → **16384**; `analyze_documents` usa 16384;
  o cliente passa a distinguir **truncamento** (`AiTruncatedResponseError`,
  código `truncated`) de resposta malformada, com mensagem clara ("atingiu o
  limite de tamanho… use um documento mais curto").
- Verificado no container com o documento real (`exonera isabele.pdf`): proposta
  gerada com 11 campos, 12 blocos e `signature_block` (completion 8830 tokens).
- Testes: +2 (truncamento com conteúdo vazio e com JSON parcial).

## Menu de ações da listagem escondido

- Causa: dropdown com `position: absolute` dentro do contêiner `overflow-x-auto`
  da tabela era recortado.
- Correção: menu com `position: fixed` ancorado no botão (`getBoundingClientRect`),
  abertura acima quando falta espaço, fechamento em scroll/resize/clique-fora e
  Escape.

## Layout do construtor "quebrando" (footer empurrava o painel)

- Causa: o construtor usava `h-[calc(100vh-4rem)]`, assumindo apenas o header
  (4rem). O `AdminShell` também tem **footer** (~3.5rem), então o conteúdo
  estourava a viewport e o rodapé/últimos painéis ficavam cortados.
- Correção: a área de conteúdo do `AdminShell` virou o contêiner de rolagem
  (`h-screen` + `main` com `flex-1 min-h-0 overflow-y-auto`) e o construtor usa
  `h-full`, preenchendo exatamente o espaço disponível entre header e footer.
  Demais páginas continuam rolando normalmente (agora dentro de `main`).

## iframe do PDF de teste não abria

- Causa: a CSP do web-admin (`next.config.js`) não definia `frame-src`, então
  `default-src 'self'` bloqueava o `blob:` do PDF gerado no navegador.
- Correção: adicionados `frame-src 'self' blob:`, `object-src 'self' blob:` e
  `worker-src 'self' blob:`. Header verificado no nginx após o deploy.

## 409 em "Aprender com documentos"

- Causa: `propose` exige ao menos um documento marcado como "Usado pela IA"
  (aprovação manual). A UI permitia clicar sem marcação.
- Correção: botão "Marcar todos como usados", aviso para arquivos sem texto
  extraído, botão desabilitado com dica e mensagem client-side específica.

---

> **Próxima fase:** ver `HANDOFF_FASE5.md` (contexto, escopo, sub-fases e checklist para iniciar a Fase 5 em novo chat).
