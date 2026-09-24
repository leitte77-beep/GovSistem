# HANDOFF — Fase 5: Nova experiência de criação de documentos

> Documento de passagem de contexto para iniciar a **Fase 5** da reformulação de
> **Modelos Documentais** do módulo Diário Oficial, em um novo chat/sessão.
> Leia este arquivo inteiro antes de programar. O detalhamento das fases
> anteriores está em `RELATORIO_MODELOS_DOCUMENTAIS_FASE1.md`.

---

## 0. TL;DR para o próximo agente

- Projeto: reformulação de "Modelos documentais" de uma tela de **Config JSON**
  para um **construtor visual de documentos oficiais** (WYSIWYG A4 + IA).
- Fases **1 a 4 concluídas e implantadas** (backend + frontend + migration).
- A **Fase 5** entrega a **nova experiência de criação de documentos**, o
  **fluxo de estados**, a **listagem profissional de modelos**, a **biblioteca
  de blocos na UI**, a **herança na UI** e a **tela de identidade institucional**.
- Antes de codar: fazer a auditoria do estado atual (este doc + relatório),
  apresentar o plano e executar por sub-fases, sem quebrar o existente.
- Não commitar sem pedido explícito. Há alterações **não commitadas** no repo
  (todas as fases 1-4); o deploy está atualizado nos containers.

---

## 1. Contexto do produto

O usuário administrativo **não é programador**. O sistema deve tratar "modelo
documental" como um **modelo visual, estrutural e semântico** de um documento
oficial real, e não como JSON. O fluxo-alvo:

```
DOCUMENTO OFICIAL REAL
  → MODELO VISUAL (layout A4)  +  MODELO SEMÂNTICO (campos/regras)
  → IA AUXILIAR (preenche, não inventa)
  → GERAÇÃO → REVISÃO → ASSINATURA → PUBLICAÇÃO
```

A IA **não** pode inventar estrutura, alterar cabeçalho/textos fixos, nem mudar
cláusulas obrigatórias. O **modelo ativo é a fonte da verdade**. A padronização
é o objetivo.

---

## 2. O que já está pronto (Fases 1–4)

### Fase 1 — Fundações backend + migration
- `organizations`: identidade institucional (`state`, endereço completo, CEP,
  `phone`, `email`, `site`, `institutional_layout` JSONB).
- `document_model_versions.layout_json` (modelo visual versionado).
- `document_models.parent_model_id` (herança) e `deleted_at` (soft delete).
- Novas tabelas: `document_model_blocks` (biblioteca de blocos),
  `document_model_training_files` (documentos de referência).
- Permissões granulares: `document_model.view/create/edit/activate/publish/
  archive/advanced_config/train_ai` (além de `manage/approve/use`).
- Endpoints: `GET/PATCH /settings/institution`; CRUD `/document-model-blocks`.
- Migration `i6j7k8l9m0n1` (aditiva/reversível), `ALEMBIC_EXPECTED_HEAD`
  atualizado.

### Fase 2 — Construtor visual (3 painéis) + Fase 2.1
- `PATCH /document-models/{id}/versions/{v}` edita **apenas rascunho** (autosave).
- Frontend `src/components/DocumentModelBuilder/`: `ElementsPanel` (esquerda),
  `A4Canvas` (centro), `PropertiesPanel` (direita), `AdvancedConfigDrawer`
  (JSON somente leitura, ADMIN/SUPER_ADMIN), `PreviewModal`, `constants.ts`.
- Drag-and-drop, mover/duplicar/excluir, flags `fixed_text`/`locked`/
  `ai_generated`, condições (`when_field`/`when_value`), autosave com estado.

### Fase 3 — Preview/PDF unificado
- `app/document_model/render_html.py`: um HTML/CSS único para preview e PDF
  (WeasyPrint, CSS Paged Media com cabeçalho/rodapé repetidos).
- `POST /document-models/{id}/versions/{v}/render` (HTML) e `/render-pdf` (PDF).
- `PreviewModal` exibe o **PDF real** em iframe.

### Fase 4 — Aprender com documentos
- `app/document_model/learning.py` (extração PDF/DOCX + IA `dm-learn-v1` +
  reparo/normalização da resposta).
- Endpoints `/document-models/{id}/training-files` (upload/list/toggle/delete)
  e `/training-files/propose`.
- Drawer `TrainingFilesDrawer` ("Aprender com documentos") com aprovação manual.

---

## 3. Mapa de arquivos-chave

### Backend (`/home/ubuntu/sistemaweb/modulo-diario/api`)
| Arquivo | Papel |
|---|---|
| `app/models/document_model.py` | `DocumentModel`, `DocumentModelVersion`, `DocumentModelBlock`, `DocumentModelTrainingFile` |
| `app/models/organization.py` | identidade institucional |
| `app/document_model/schemas.py` | `DocumentModelConfig`, `SectionSpec`, `DocumentField`, kinds/tipos, flags |
| `app/document_model/layout.py` | `DocumentLayout` (modelo visual) |
| `app/document_model/service.py` | ciclo de vida + `update_draft_version` + soft delete |
| `app/document_model/renderer.py` | config → `SemanticDocument` (determinístico) |
| `app/document_model/render_html.py` | HTML/PDF unificado |
| `app/document_model/learning.py` | aprender com documentos (IA) |
| `app/document_model/generation.py` | extração IA (`dm-extract-v1`) |
| `app/document_model/ingest.py` | cria matéria a partir do modelo |
| `app/api/v1/document_models.py` | todos os endpoints de modelos documentais |
| `app/api/v1/settings.py` | `/settings/institution` (+ pdf-layout) |
| `app/core/permissions.py` | permissões + `ROLE_PERMISSIONS` |
| `app/models/enums.py` | `AuditAction`, `AiExecutionKind/Status` |
| `app/services/ai/*` | `config_store`, `deepseek_client`, `errors` |

### Frontend (`/home/ubuntu/sistemaweb/modulo-diario/web-admin`)
| Arquivo | Papel |
|---|---|
| `src/components/DocumentModelBuilder/DocumentModelBuilder.tsx` | orquestrador |
| `.../A4Canvas.tsx` | folha A4, seleção, DnD, badges |
| `.../ElementsPanel.tsx` | elementos + campos dinâmicos |
| `.../PropertiesPanel.tsx` | propriedades + condição + flags |
| `.../AdvancedConfigDrawer.tsx` | JSON read-only |
| `.../PreviewModal.tsx` | testar modelo (PDF real) |
| `.../TrainingFilesDrawer.tsx` | aprender com documentos |
| `src/app/documentos/modelos/page.tsx` | listagem + criação |
| `src/app/documentos/modelos/[id]/page.tsx` | rota do construtor |
| `src/app/documentos/criar/page.tsx` | fluxo IA atual de geração (a reformular na Fase 5) |
| `src/lib/api.ts` | client (todos os métodos de modelos documentais) |
| `src/types/document_model.ts` | tipos |

### Banco / deploy
- Head Alembic: **`i6j7k8l9m0n1`** (também em `app/core/config.py:ALEMBIC_EXPECTED_HEAD`).
- Containers: `modulo-diario-api-1` (9203), `modulo-diario-web-admin-1` (9202).
- Nginx: `https://diario.govsistem.com.br` → web-admin (9202) → proxy `/api/v1/*`
  → API (9203). API pública em `/api/public/v1/*` vai direto à API.

---

## 4. Comandos essenciais

```bash
# Backend — testes focados
cd /home/ubuntu/sistemaweb/modulo-diario/api
.venv/bin/python -m pytest tests/test_document_template_foundation.py -q
.venv/bin/python -m ruff check app/ tests/test_document_template_foundation.py

# Frontend
cd /home/ubuntu/sistemaweb/modulo-diario/web-admin
npx tsc --noEmit -p tsconfig.json
npm test          # vitest (86 testes)

# Build + deploy (na raiz modulo-diario)
cd /home/ubuntu/sistemaweb/modulo-diario
docker compose build api web-admin
# Se houver migration nova:
docker compose run --rm --no-deps -w /app -e PYTHONPATH=/app api alembic upgrade head
docker compose up -d api web-admin
docker ps --filter name=modulo-diario-api-1 --filter name=modulo-diario-web-admin-1
```

Token de smoke (ADMIN) para testes via nginx:
```bash
docker exec -i modulo-diario-api-1 python - <<'PY'
import asyncio
from sqlalchemy import select
from app.core.database import async_session
from app.core.security import create_access_token
from app.models.user import User
from app.models.user_role import UserRole
from app.models.role import Role
async def main():
    async with async_session() as db:
        rows=(await db.execute(select(User,Role.name).join(UserRole,UserRole.user_id==User.id).join(Role,Role.id==UserRole.role_id))).all()
        seen={}
        for u,rn in rows: seen.setdefault(u.id,(u,set()))[1].add(rn)
        for u,roles in seen.values():
            if "ADMIN" in roles or "SUPER_ADMIN" in roles:
                open("/tmp/tok.txt","w").write(create_access_token(u.id,list(roles),organization_id=u.organization_id)); print("ok"); return
asyncio.run(main())
PY
TOKEN=$(docker exec modulo-diario-api-1 cat /tmp/tok.txt)
```

> Atenção: recriar o container apaga `/tmp` — re-emitir o token após cada deploy.

---

## 5. ESCOPO DA FASE 5

Mapeado aos itens do pedido original do usuário:

### 5.1 Nova experiência de criação de documentos (itens 19 e 20)
Hoje `src/app/documentos/criar/page.tsx` é um fluxo técnico (prompt IA →
campos → material). Reformular para:

- Navegação: **Documentos Oficiais → Portarias → Nova Portaria**.
- Perguntar a **finalidade** (Exoneração, Nomeação, Férias, Designação,
  Gratificação, Outros) e mostrar **somente os campos necessários** do modelo
  semântico ativo daquele tipo/finalidade.
- Botão **"Gerar com IA"** → preenche campos variáveis via `POST
  /document-models/ai/extract` (já existe) **ou** preenchimento manual.
- Após gerar, **abrir o documento completo no editor para revisão** (usar o
  editor TipTap existente `components/Editor` ou o render HTML/PDF).
- **Estados do fluxo** (item 20): `RASCUNHO`, `GERADO_PELA_IA`, `EM_REVISAO`,
  `APROVADO`, `AGUARDANDO_ASSINATURA`, `ASSINADO`, `PUBLICADO`, `CANCELADO`.
  Registrar toda mudança (auditoria/status history).
  - Observação: o `Matter` já tem `status` (draft/review/approved/...). É preciso
    mapear/estender para incluir "gerado pela IA" e os demais estados, sem
    quebrar o fluxo editorial existente. **Auditar `app/models/matter.py` e
    `app/models/enums.py` (MatterStatus) antes de alterar.**

### 5.2 Listagem profissional de modelos (item 25)
Reformular `src/app/documentos/modelos/page.tsx` (ou cards) com:
- Nome, Tipo, Finalidade, Versão ativa, Status, Última alteração, Criado por,
  **"Usado em X documentos"** (contar `AiExecution`? melhor: contar matérias com
  `metadata_json.source_model_id == model.id` — ver §6).
- Ações: Editar, Duplicar, Criar nova versão, Pré-visualizar, Testar,
  **Histórico**, Ativar, **Desativar**, Arquivar.
- Backend provavelmente precisa de:
  - `GET /document-models/{id}` já traz `versions`; falta contagem de uso.
  - **Desativar** (status `inactive`) — item 15 pede INATIVO. Hoje há
    `archive` mas não `deactivate`. Adicionar `POST /document-models/{id}/deactivate`
    + `reactivate` (ou reusar `enabled`?). Definir com cuidado.
  - **Duplicar** modelo (`POST /document-models/{id}/duplicate`).
  - **Histórico** (`GET /document-models/{id}/history` a partir de
    `audit_events` com `entity_type="document_model"`).

### 5.3 Biblioteca de blocos reutilizáveis na UI (item 23)
- Backend pronto (`/document-model-blocks` CRUD + soft delete).
- Falta UI: no `ElementsPanel`/`PropertiesPanel`, permitir:
  - Inserir um bloco da biblioteca no documento.
  - "Salvar seleção como bloco" (nome + kind).
  - Gerenciar biblioteca (listar/excluir).
- Exemplos: "Cabeçalho Prefeitura de Farol", "Assinatura Prefeito",
  "Registre-se e Publique-se", "Paço Municipal", "Cláusula de vigência",
  "Fundamentação Lei Orgânica".

### 5.4 Modelos herdados na UI (item 24)
- Backend pronto (`parent_model_id`, validado por organização).
- Falta UI: ao criar um modelo, escolher **modelo base** e herdar
  cabeçalho/rodapé/assinatura/fonte/margens/estrutura básica; sobrescrever só o
  necessário. Sugestão: no `create` da listagem, seletor de "modelo base"; ao
  abrir o construtor, aplicar `layout`/`sections` do pai quando o filho estiver
  vazio.

### 5.5 Identidade institucional — UI (item 22) — **lacuna atual**
- Backend pronto (`GET/PATCH /settings/institution`).
- Falta a página **Configurações → Identidade institucional** para editar
  brasão/logo, nome do município, UF, endereço, CEP, CNPJ, telefone, site,
  fonte/margens padrão, cabeçalho/rodapé padrão.
- O cabeçalho do PDF já consome esses dados; sem a UI, ficam `null`.

### 5.6 UX/A11y/responsividade (itens 26, 27, 28)
- Design institucional/limpo; drawers em vez de excesso de modais; tooltips;
  labels/`aria-label`; foco visível; contraste WCAG AA; editor é desktop-first.

---

## 6. Notas técnicas importantes

- **Contagem de uso do modelo**: a criação de minuta grava
  `Matter.metadata_json = {source: "document_model", source_model_id, ...}`
  (`app/document_model/ingest.py:60`). Para "Usado em X documentos", filtrar
  matérias por `metadata_json["source_model_id"]`. Em PostgreSQL use
  `Matter.metadata_json["source_model_id"].astext == str(model_id)`; nos testes
  (SQLite) isso pode exigir uma varredura em memória — cuidado com dialetos.
  Alternativa robusta: contar `AuditEvent` `action == DOCUMENT_MODEL_MATERIAL_CREATED`
  e `entity_id == model.id` (já é o critério do guard de exclusão).
- **Status dos modelos**: hoje `draft`, `in_approval`, `active`, `archived`
  (`app/document_model/schemas.py`). O item 15 pede também `inactive`. Defina a
  transição e o efeito no `is_default`/`pick_active_model` (modelos inativos não
  devem ser escolhidos para geração).
- **Multi-tenant**: sempre resolver `org_id = user.organization_id` e filtrar
  `organization_id == org_id` em toda query. Não há filtro global.
- **Auditoria**: `log_audit_event` já faz `commit` internamente; o padrão da casa
  chama `await db.commit()` depois (inofensivo).
- **IA**: use `config_store.get_active_key` + `DeepSeekClient`. Bump de
  `PROMPT_VERSION` quando mudar prompt. Falhas viram `200 {ok:false}` (nunca 500).
- **Versionamento**: versão ativa é imutável; alterações criam nova versão.
  `PATCH` de versão só em `draft`.
- **Migration**: se adicionar coluna/tabela, criar migration com
  `down_revision = "i6j7k8l9m0n1"` e atualizar `ALEMBIC_EXPECTED_HEAD`; rodar
  `alembic upgrade head` antes de subir a API (fail-closed no startup).

---

## 7. Lacunas/pendências conhecidas — RESOLVIDAS

- [x] UI de identidade institucional (§5.5) — Fase 5A.
- [x] Status `INATIVO`/desativar modelo (§5.2) — Fase 5A.
- [x] Duplicar modelo e Histórico na UI/backend (§5.2) — Fase 5A.
- [x] Blocos reutilizáveis e herança apenas no backend (§5.3/§5.4) — Fase 5B.
- [x] Assinatura: seleção de autoridade/certificado/posição visual (item 21)
  — `SignatureEntrySpec.authority_id/credential_id/position`, UI no
  `PropertiesPanel`, render por entrada.
- [x] Unificação de renderizadores: o corpo semântico agora usa uma fonte única
  (`app/document_model/body_html.py`) no preview de modelos e no
  `content_html` consumido pelo PDF de edições, com o mesmo CSS injetado nos
  templates (`classico`/`moderno`/`minimalista`). O pipeline de edição
  (capa/sumário/selo/hash/PAdES) foi preservado.

---

## 8. Convenções e qualidade

- Backend: Python 3.12, FastAPI, SQLAlchemy async, Pydantic v2 (`extra="forbid"`
  na config do modelo). Lint: `ruff` (line-length 100). Testes: `pytest` (SQLite
  em memória via `tests/conftest.py`, `Base.metadata.create_all`).
- Frontend: Next.js (App Router, `"use client"`), TypeScript strict, Tailwind,
  `react-hot-toast`, `notifyError` de `@/lib/error-handler`, `material-symbols`.
- Sem comentários supérfluos; siga o estilo dos arquivos vizinhos.
- Ao final de cada sub-fase: rodar testes + lint + typecheck, buildar, deployar
  e fazer **smoke test via nginx** com token ADMIN.

## 9. Checklist de aceite da Fase 5 — CONCLUÍDA

- [x] Criar documento por finalidade, com campos corretos e "Gerar com IA" (5C).
- [x] Revisão no editor e fluxo de estados registrado (item 20) (5C).
- [x] Listagem de modelos com uso, versão, status e ações completas (5A).
- [x] Desativar/Reativar e Duplicar modelo funcionando (backend + UI) (5A).
- [x] Histórico de alterações visível (5A).
- [x] Biblioteca de blocos inserir/salvar/gerenciar na UI (5B).
- [x] Criar modelo filho a partir de um modelo base (herança) na UI (5B).
- [x] Página de Identidade institucional editável e refletida no PDF (5A).
- [x] Testes (backend + frontend), lint, typecheck, build e deploy OK (5A–5D).
- [x] Documentar as mudanças no relatório (seções 5A–5D + Fase 6).

> Validação final e resultados em `RELATORIO_MODELOS_DOCUMENTAIS_FASE1.md`
> (seção **Fase 6**). Pendências futuras: item 21 (assinatura) e unificação
> dos renderizadores de PDF de edições.

## 10. Sugestão de sub-fases (ordem recomendada)

1. **5A** — Identidade institucional (UI) + Desativar/Reativar + Duplicar +
   Histórico (backend + UI da listagem). *Base para o resto.*
2. **5B** — Biblioteca de blocos e herança na UI (construtor).
3. **5C** — Nova criação de documentos por finalidade + estados do fluxo.
4. **5D** — Polimento de UX/A11y/responsividade e testes de regressão.

Cada sub-fase deve terminar com build+deploy+smoke e atualização do relatório.
