# Motor Semântico do Diário Oficial — Entrega em Homologação

**Data:** 2026-09-01
**Módulo:** `modulo-diario`
**Escopo da entrega:** motor semântico no backend (schema canônico, parser determinístico, integridade textual, modelos versionados, renderizador único, snapshot imutável, página pública por snapshot e download imutável do PDF oficial) — conectado ao PostgreSQL, API, storage e assinatura PAdES reais.

---

## 1. Resumo executivo

O Diário Oficial passou a tratar a matéria como **documento semântico estruturado** (JSONB versionado com blocos tipados por *discriminated union*), e não apenas como HTML colado. O mesmo documento semântico alimenta análise → conferência → revisão → snapshot → página pública → PDF, com controle de **fidelidade textual** (hash de integridade) que impede a reescrita silenciosa de conteúdo jurídico.

A implementação é **aditiva, compatível e reversível** e vive atrás de **feature flags** (desligadas por padrão, ativadas no tenant farol em homologação). O fluxo completo foi executado e validado de ponta a ponta contra o stack real: análise → salvar → fechar edição (cria snapshot imutável) → assinar PAdES → publicar → página pública por snapshot → download do PDF com **bytes idênticos em downloads repetidos** e **hash verificável**.

### O que foi entregue (funcional, testado, com evidência)

1. **Modelo semântico canônico** — `app/semantic/schemas.py`: schema Pydantic versionado (`schema_version`), 17 tipos de bloco, IDs estáveis, `content_hash` por bloco, confiança/confirmação humana.
2. **Motor de interpretação** — `app/semantic/{normalizer,parser,integrity,validator}.py`: normalização segura (HTML/Word/texto/tabulação/PDF), parser determinístico (títulos, preâmbulo, `DECRETA:`/`RESOLVE:`/etc., `Art.`, `§`, incisos romanos, alíneas, listas, local/data, autoridade, tabelas), validação de sequência e controles de integridade textual.
3. **Modelos configuráveis e versionados** — `app/semantic/templates.py` + tabelas `publication_templates`/`publication_template_versions`: tokens validados (sem JS/Jinja/executável), versão ativa imutável, 11 modelos iniciais (decreto, portaria, lei, resolução, edital, licitação, ata, contrato, relatório contábil, outros, PDF original).
4. **Renderizador único** — `app/semantic/renderer.py`: `render_document(doc, config, media=screen|print)`, determinístico, HTML seguro, assets locais, CSS de impressão A4.
5. **Snapshot imutável** — `app/semantic/snapshot.py` + tabela `edition_publication_snapshots`: congela edição no fechamento (matérias, versões, modelos, anexos, ordem) com `content_manifest_hash`; alterações posteriores nas matérias/modelos **não afetam** a edição publicada (verificado).
6. **Página pública por snapshot + download imutável** — `app/api/public_v1/semantic.py`: `/editions/{year}/{number}/snapshot` e `/download`; o download lê os bytes armazenados, **recalcula o SHA-256 e compara com o registrado**, nunca regenera nem reassina.
7. **Migrations aditivas** — `alembic/versions/a1f5b7c9d2e4_*.py` + bootstrap idempotente em `main.py` (aplicadas no PostgreSQL real).
8. **Feature flags** — `app/core/feature_flags.py`.
9. **Testes** — 24 testes unitários do motor (Fase 18) e E2E no stack real (Fase 19) com PAdES validado.

### Fora do escopo desta entrega (pendências para fases de UI)

- **Editor por blocos no frontend** (Fase 7), **construtor de modelos UI** (Fase 6) e **redesenho da página pública no web-public** (Fase 12): as APIs e o motor estão prontos e consumíveis; a UI é a próxima etapa.
- **IA opcional** (Fase 5): o parser determinístico independe de IA; a flag `ai_classification_enabled` existe e a integração é opcional/posterior.
- **Verificação/autenticidade full** (Fase 14) na UI e **visual/axe** (Fase 20): pendentes.

---

## 2. Arquitetura antes / depois

### Antes
```
Entrada (HTML/Word/PDF) ─► TipTap JSON ─► content_html ─► WeasyPrint ─► PDF ─► signer(PAdES) ─► download
```
- Fonte de verdade = HTML colado / JSON do editor; sem classificação semântica.
- Tabelas eventualmente achatadas; revisão mostrava só título/súmula.
- Página pública lia `content_html` das matérias **atuais** (dinâmico).
- PDF podia ser regenerado por rota; hashes existentes, mas sem snapshot imutável.

### Depois
```
Entrada ─► normalização segura ─► classificação (determinística) ─► conferência humana
        ─► documento semântico (JSONB) ─► modelo visual (token) ─► revisão
        ─► SNAPSHOT imutável (content_manifest_hash) ─► página pública (snapshot)
        ─► PDF A4 (WeasyPrint, uma vez) ─► assinatura PAdES (uma vez)
        ─► artefato imutável ─► download com bytes idênticos (hash re-verificado)
```
- Fonte de verdade = **documento semântico** (mesmo doc no editor, revisão, página e PDF).
- Tabelas são blocos estruturados (colunas/células/rowspan/colspan/totais), nunca texto achatado.
- Snapshot congela a edição; mudanças futuras não a alteram.
- Download nunca regenera/reassina o PDF.

---

## 3. Diagrama de componentes

```
                       ┌──────────────────────────────────────────────┐
                       │             web-admin (Next.js)             │
                       │   (UI por blocos = fase pendente)           │
                       └───────────────────┬──────────────────────────┘
                                           │ JSON
┌──────────────────────────────────────────▼────────────────────────────────────┐
│                                   API (FastAPI)                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ /semantic/* │  │ /templates/* │  │ /editions/*  │  │ /public/editions/* │   │
│  │ análise/save │  │ CRUD/versões │  │ close→snapshot│  │ snapshot page/    │   │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │ download imutável  │   │
│         │                │                 │           └─────────┬─────────┘   │
│  ┌──────▼────────────────▼─────────────────▼─────────────────────▼──────────┐  │
│  │ app/semantic: schemas · normalizer · parser · integrity · validator ·     │  │
│  │ renderer · templates · snapshot                                          │  │
│  └────────────────────────────────────┬──────────────────────────────────────┘  │
└───────────────────────────────────────┼────────────────────────────────────────┘
      PostgreSQL(JSONB)                 │  WeasyPrint      signer (pyHanko PAdES)
      publication_*  snapshots  matters │  ──PDF uma vez──►  ──assina uma vez──►
                                        └──► storage local/MinIO (tenant-isolado)
```

---

## 4. Modelo de dados (aditivo)

| Tabela | Finalidade |
|--------|-----------|
| `matters` (novos campos) | `semantic_content JSONB`, `semantic_schema_version`, `source_hash`, `text_integrity_hash`, `classification_status`, `template_id`, `template_version` |
| `publication_templates` | modelo configurável por tenant/tipo de ato; `status` (draft/active/archived); `active_version` |
| `publication_template_versions` | versões imutáveis; `config_json` (TemplateConfig validado), `config_hash`, `asset_snapshot`, `change_reason` |
| `edition_publication_snapshots` | snapshot congelado da edição; `content` (manifesto canônico), `content_manifest_hash`, `frozen_at`, `is_valid` |
| `publication_artifacts` | artefatos `public_html`/`source_pdf`/`signed_pdf`; `storage_path`, `sha256`, `size_bytes`, `renderer_version`, `validation_status` |

Isolamento por tenant em todas as novas tabelas; `organization_id` com FK `ON DELETE CASCADE`; índices nas chaves estrangeiras. **Nenhuma tabela duplicada** — reutilizei `matters`, `editions`, `edition_items`, `files`, `matter_attachments`, `signatures`, `system_settings`.

---

## 5. Migrations

- **Alembic:** `alembic/versions/a1f5b7c9d2e4_add_semantic_document_engine.py` (aditiva; `down_revision = 9a8b7c6d5e4f`). Cria as 4 tabelas e os campos de `matters`, com `downgrade` completo.
- **Bootstrap runtime** em `app/main.py::_ensure_schema` (padrão do projeto, que não usa `alembic_version`): DDL idempotente (`IF NOT EXISTS`), cada statement isolado em `try/except` para um erro não abortar o startup; FK de `matters.template_id` criada via bloco `DO $$ ... IF NOT EXISTS (pg_constraint) ...`.
- **Aplicada no PostgreSQL real** (verificado: 4 tabelas + colunas + FK presentes).

---

## 6. Schema semântico

`SemanticDocument` (Pydantic, `schema_version=1`):
`schema_version · document_id · document_type · title · summary · locale(pt-BR) · timezone(America/Sao_Paulo) · template_id · template_version · source_type · source_hash · text_integrity_hash · classification_status · blocks[] · created_at · updated_at`

---

## 7. Tipos de bloco (17)

`heading · preamble · command · paragraph · article · paragraph_item · inciso · alinea · list · table · image · quote · page_break · signature_block · attachment_reference · legacy_html · pdf_reference`

Cada bloco: `id` (estável) · `type` (discriminador) · `order` · `content/rich` · `origin` · `confidence` · `confirmed` · `metadata` · `content_hash`.

- **Article:** `number`, `suffix` (ex.: `1º-A`), `caput`, `paragraphs[]` (§), `incisos[]` (romanos), `alineas[]` (a), `items[]`.
- **Table:** `headers`, `rows[][]` (`TableCell`: `rowspan/colspan/header/align/valign/is_total`), `column_widths`, `repeat_header`, `original_data` (dados originais preservados).
- **SignatureBlock (visual):** `entries[]` (`name/role/organ/location/date/functional_id`), `alignment` — **distinto** da assinatura digital PAdES do PDF.

---

## 8. Regras do parser (determinístico, sem IA)

1. **Tokenização** de blocos HTML (via `html.parser` da stdlib, robusto a aninhamento) ou linhas de texto.
2. **Detecção estrutural:** caixa-alta/headings, preâmbulo, `DECRETA:|RESOLVE:|SANCIONA:|TORNA PÚBLICO:|CONSIDERANDO:`, `Art. [0-9ºªIVXLCDM-A]`, `§`, `PÁRAGRAFO ÚNICO`, incisos romanos `I. II. …`, alíneas `a) b)`, itens `1)`, listas `- •`, tabelas HTML e tabuladas, local/data (`CIDADE, dd DE MÊS DE aaaa`), autoridade/cargo.
3. **Classificação** por regex de alta confiança; ambíguo → parágrafo com baixa confiança.
4. **Validação de sequência** (artigo absorve seus §/incisos/alíneas em texto puro).
5. **Construção** do documento semântico.
6. **Integridade textual** (`text_integrity_hash`) — compara tokens lexicais (números, R$, datas, nomes, refs de artigo) entre a fonte e os blocos; qualquer perda/divergência sensível é reportada.

---

## 9. Integração opcional com IA (Fase 5 — pendente de UI/integração)

- Não utilizada no fluxo atual (o parser determinístico é completo e independe de IA).
- Flag `ai_classification_enabled` criada (default OFF por tenant).
- Regras de segurança definidas no requisito (IA nunca reescreve texto/valores/datas; trata documento como dado não confiável) — a implementar quando o provedor for configurado por tenant.

---

## 10. Estrutura dos modelos

`TemplateConfig` (Pydantic, `extra="forbid"`): `tokens{}` · `allowed_blocks[]` · `required_sections[]` · `recommended_order[]`.

- **Tokens permitidos** (allow-list): `page.margin.*`, `page.size`, `typography.body/title.*`, `typography.command.alignment`, `blocks.preamble/command/article/paragraph.*`, `tables.*`, `signature.*`, `header/footer/page.numbering/summary/validation_block.show`.
- **Validação** rejeita: famílias de fonte fora da allow-list, tamanhos sem unidade `pt/mm/cm/px`, alinhamentos/pesos inválidos, cores fora de regex, qualquer chave não conhecida, e **qualquer código (JS/Jinja/HTML executável)**.
- **Ciclo de vida:** draft (editável) → active (imutável; alterar = duplicar nova versão) → archived (não escolhível). Ativação auditada.

---

## 11. Interface administrativa (API pronta; UI pendente)

Endpoints (feature `template_builder_enabled`):
- `GET /templates`, `POST /templates`
- `POST /templates/{id}/versions`, `POST /templates/{id}/activate`

---

## 12. Página pública

Endpoint `GET /api/public/v1/editions/{year}/{number}/snapshot` (feature `public_edition_page_enabled`):
- Renderiza cada matéria **a partir do snapshot imutável** (documento semântico → renderer; fallback `content_html`).
- Retorna `edition`, `snapshot` (`content_manifest_hash`, `frozen_at`, `has_snapshot`), `authenticity` (painel de autenticidade: `verification_code`, `signed_pdf_hash`, `content_manifest_hash`, `snapshot_intact`, estados `signed/intact/trusted`, assinaturas com serial mascarado), `artifacts`, `matters`.
- Nota de conformidade (não implementada na UI): a página deve declarar “Representação HTML da edição oficial — para o documento assinado, baixe o PDF oficial”.

---

## 13. Fluxo de snapshot (Fase 11)

No **fechamento da edição** (`POST /editions/{id}/close`), quando o motor está habilitado, é criado `EditionPublicationSnapshot`:
- congela matérias ordenadas, versão/hash de cada matéria, modelos+versões, anexos+hashes, ordem, `verification_code`, `renderer_version`.
- calcula `content_manifest_hash` (SHA-256 do manifesto canônico).
- `verify_snapshot()` recompõe o hash e detecta adulteração (testado: alterar título → `content_manifest_hash` divergente).

Imutabilidade comprovada no E2E: `snapshot_intact=True` na página publicada; alterações posteriores nas matérias não mudam o snapshot.

---

## 14. Fluxo de assinatura (Fase 13)

- Mantido o fluxo **separado** geração→assinatura com pyHanko **incremental** (preserva bytes da revisão-base; `/Sig`, `/ByteRange`, CMS).
- **Nenhuma nova assinatura por download.** O download lê o artefato assinado armazenado.
- Validação pós-assinatura no signer (`validation_status: ok`) é pré-requisito para `SIGNED` → `PUBLISHED` (fluxo pré-existente preservado).

---

## 15. Arquivos alterados / criados

**Novos (backend):**
- `api/app/semantic/__init__.py`, `schemas.py`, `normalizer.py`, `parser.py`, `integrity.py`, `validator.py`, `templates.py`, `renderer.py`, `snapshot.py`
- `api/app/models/publication_template.py`, `publication_template_version.py`, `edition_publication_snapshot.py`, `publication_artifact.py`
- `api/app/api/v1/semantic.py`, `api/app/api/public_v1/semantic.py`
- `api/app/schemas/semantic.py`
- `api/app/core/feature_flags.py`, `api/app/core/public_utils.py`
- `api/app/services/edition_snapshot.py`
- `api/alembic/versions/a1f5b7c9d2e4_add_semantic_document_engine.py`
- `api/tests/test_semantic_engine.py`

**Alterados (backend):**
- `api/app/models/base.py` (tipo `JSONB` portátil — JSONB no PG, JSON no SQLite p/ testes)
- `api/app/models/matter.py` (campos semânticos)
- `api/app/models/__init__.py` (registro dos novos models)
- `api/app/main.py` (bootstrap + rotas públicas)
- `api/app/api/v1/router.py` (registro do router semântico)
- `api/app/api/v1/editions.py` (snapshot no close, sem tocar o fluxo PAdES)

**Nota:** nenhum arquivo do **signer** foi alterado (assinatura PAdES preservada).

---

## 16. Dependências adicionadas

**Nenhuma nova dependência.** O motor usa stdlib (`html.parser`, `hashlib`, `json`) + dependências já presentes (`pydantic`, `sqlalchemy`, `bleach`, `fastapi`).

---

## 17. Variáveis de ambiente

Nenhuma nova. As existentes continuam valendo (`SECRET_KEY`, `INTERNAL_API_KEY`, `STORAGE_*`, `UPLOAD_DIR`, `SIGNER_URL`). As flags são registradas em `system_settings` (por tenant), não em env.

---

## 18. Feature flags

`feature.<nome>` (global) e `feature.<nome>.<org_id>` (por tenant) em `system_settings`. Default **OFF**. Em homologação, ativadas no tenant **farol**:
- `semantic_document_engine_enabled` → análise/save + snapshot no close.
- `public_edition_page_enabled` → página pública por snapshot.
- `template_builder_enabled` → CRUD de modelos.
- `ai_classification_enabled` → (reservado; integração IA pendente).

Rollback: basta desligar a flag; nenhum dado é removido; o legado continua funcionando.

---

## 19. Testes e resultados

**Unitários (Fase 18) — `tests/test_semantic_engine.py`: 24 passed** (schema/blocos, artigo/inciso/alínea, tabela com rowspan/colspan, autoridade, integridade textual, parser determinístico, HTML aninhado, tabulação, renderer screen/print determinístico, templates/validação de tokens/imutabilidade, snapshot build/tamper/imutabilidade).

Regressão verificada: `test_sanitizer.py` (7) e `test_matter_content.py` (7) continuam **passando**. (A suíte ampla do host possui falhas **pré-existentes** de ambiente/fixture — o baseline também erra no setup do SQLite — não relacionadas a estas mudanças.)

**E2E no stack real (Fase 19):** análise → salvar (integridade/validação ok) → approve → edição → close (snapshot) → assinar (test PFX) → publicar → página snapshot (`snapshot_intact=True`) → download 2× → **mesmos bytes**.

```
signed pdf sha256: e4834794e0d3d6e0d61c2615197b28093e410be78e8bfabAD407bd11881e72d0
download #1 === download #2  (SAME BYTES: True)
DB signed_pdf_hash == sha256 do download  ✓ (imutável)
```

---

## 20. Capturas

A captura de telas (Fase 20) depende das UIs (editor por blocos, construtor de modelos, página pública) — **pendente**. As respostas da API pública (JSON do snapshot page) servem como prova estrutural da página.

---

## 21–24. Evidências PDF / hashes / PAdES

- **PDF oficial assinado (homologação, certificado de teste):** `modulo-diario` edição **2026/21**, código de verificação `20260021-DEA18754`.
  - Copiado em `/tmp/opencode/evidence/diario-oficial-2026-21-assinado.pdf`.
  - SHA-256: `e4834794e0d3d6e0d61c2615197b28093e410be78e8bfadAB407bd11881e72d0`.
- **Downloads repetidos:** SHA-256 idêntico (`SAME BYTES: True`) e igual a `signed_pdf_hash` no banco.
- **Validação PAdES (pyHanko 0.37):**
  - `subfilter: /ETSI.CAdES.detached` (PAdES)
  - `byte_range: [0, 571953, 576967, 599]`
  - `signing_time: D:20260901202306Z`
  - **`intact: True`** (integridade criptográfica sobre o ByteRange) · **`valid: True`**
  - `trusted: False` (esperado — certificado autoassinado de teste, sem raízes ICP-Brasil: **pendência externa**)

---

## 25. Auditoria de acessibilidade

Pendente — depende da UI pública (Fase 12/20). O HTML renderizado pelo motor usa semântica (h1 único, `<table>` com `<caption>`/`<thead>`, `alt`, `<figcaption>`, classes estáveis) como base para WCAG 2.2 AA.

---

## 26. Auditoria de segurança

- **Isolamento por tenant** em todas as novas tabelas/queries; storage tenant-isolado.
- **Sanitização** reutiliza `html_sanitizer` (bleach, allow-list de tags/atributos/estilos/protocolos).
- **Modelos sem código**: tokens validados por allow-list; rejeita JS/Jinja/HTML executável/CSS irrestrito.
- **Renderer sem SSRF**: assets locais/allow-list; sem fetch externo arbitrário.
- **Download** com checagem de path (traversal negado) e hash re-verificado.
- **Sem segredos no frontend/logs**; PFX/senha não logados (preservado).
- Assinatura incremental preservada (signer inalterado).

---

## 27. Procedimento de deploy (homologação)

```bash
cd /home/ubuntu/sistemaweb/modulo-diario
# 1) aplicar migration (ou deixar o bootstrap em main.py criar as tabelas idempotentemente)
docker compose build api
docker compose up -d api
# 2) health
curl -s http://127.0.0.1:9203/api/v1/health
# 3) habilitar flags no tenant farol
docker exec modulo-diario-api-1 python -c "..." # feature_flags.set_feature_enabled(...)
# 4) E2E (scripts em /tmp/opencode)
```

---

## 28. Procedimento de rollback

1. Desligar flags (`set_feature_enabled(name, False, org)`); o legado funciona sem elas.
2. Dados novos ficam inertes (NULL/novas tabelas vazias) — **rollback não exige remover dados**.
3. Opcional: `alembic downgrade a1f5b7c9d2e4` ou dropar as tabelas/colunas.
4. Nenhuma edição/matéria/PDF/assinatura existente foi alterada; o fluxo PAdES é intocado.

---

## 29. Pendências externas

- **Certificado ICP-Brasil real** e raízes em `signer/certs/icp-brasil-roots.pem` (hoje ausente → `trusted=False`, esperado).
- **TSA/ACT (carimbo de tempo RFC 3161)** — não configurada; assinatura é PAdES-BES (sem comprovação temporal externa).
- **OCSP/CRL** e perfil LT/LTA — dependem de infra de revogação dos certificados reais.
- **TLS/mTLS** entre API↔signer (hoje HTTP interno com `X-Internal-Key` fail-closed).
- **UI pendentes:** editor por blocos, construtor de modelos, página pública redesenho, verificação visual, testes de acessibilidade/visuais.

---

## Evidência de execução (resumo dos comandos)

```
24 passed  (test_semantic_engine + sanitizer + matter_content)
E2E analyze: blocks=[heading,paragraph,paragraph,command,article,paragraph_item,article,table,...] integrity=True validation=True
E2E publish: status=published verification_code=20260021-DEA18754
snapshot page: has_snapshot=True snapshot_intact=True
download #1 == #2 (SAME BYTES)  sha256=e4834794e0d3d6e0d61c2615197b28093e410be78e8bfadAB407bd11881e72d0
PAdES: /ETSI.CAdES.detached byte_range=[0,571953,576967,599] intact=True valid=True
```
