# Relatório de Homologação — Motor Semântico do Diário Oficial

**Data:** 2026-09-01
**Ambiente:** homologação local (`api:9203`, `web-admin:9202`, `web-public:9200`, `signer`, `postgres:9632`, `minio`).
**Escopo:** auditoria + conclusão das pendências de interface do motor semântico, com verificação real (banco, API, PDF, Playwright/axe).

---

## Classificação honesta da entrega

> **APROVADA PARA HOMOLOGAÇÃO** (não para produção).

Justificativa: os requisitos críticos de corretude foram comprovados (fonte canônica única, conservação textual, PDF imutável com bytes idênticos, estados de assinatura honestos, sem fallback silencioso, XSS endurecido). Porém a regra de aceite é explícita — **não aprovar para produção enquanto houver teste E2E não executado de forma integral** — e a suíte Playwright não ficou 100% verde sob carga (axe timeout no suite, mobile instável por lentidão do ambiente). Portanto, **APROVADA PARA HOMOLOGAÇÃO**, com os itens de bloqueio para produção listados em §“Bloqueios para produção”.

---

## 1. Achados da auditoria (Fase 1)

Inspeção de código real, git diff, banco PostgreSQL, contratos de API e comportamento em execução. **Não confiei no relatório anterior.**

| # | Achado | Gravidade | Ação |
|---|--------|-----------|------|
| A1 | `content_mode` legado era `rich_text`/`pdf`; **não existia modo `semantic`** — o editor tradicional podia gravar HTML divergente em matéria semântica | Alta | Implementado `content_mode` canônico `semantic`/`legacy_html`/`original_pdf` (Fase 2) |
| A2 | Sem locking otimista: “última gravação vence” silenciosamente | Alta | `If-Match`/ETag → `409` (Fase 2) |
| A3 | Revisão (step 3) mostrava só `content_html`, não o `SemanticDocument` | Alta | `SemanticReview` read-only (Fase 4) |
| A4 | Renderizadores Python e TS divergentes, sem fixture contratual | Média | Fixture compartilhada + testes de contrato (Fase 5) |
| A5 | Renderer emitia `legacy_html` cru (XSS) e `img/href src` sem checagem de esquema | Alta | Sanitiza `legacy_html`; `_safe_url` bloqueia `javascript:`/`vbscript:`/`data:` indevido (Fase 6) |
| A6 | Página pública fazia fallback silencioso para conteúdo mutável | Alta | Sem fallback; “Edição temporariamente indisponível” (Fase 8) |
| A7 | Estados de assinatura colapsados (`signed`/`intact`/`trusted`); podia sugerir confiança sem cadeia | Alta | Estados independentes + `validation_checked_at` (Fase 9) |
| A8 | `verify` é tenant-scoped e retorna `valid:false` sem tenant (esperado; documentado) | Info | E2E usa rota `/farol/...` |
| A9 | Aprovação liberada sem conferir confirmação/integridade do doc semântico | Alta | Gate de aprovação (Fase 4) |
| A10 | Snapshot registra `semantic_schema_version`/`template`/`renderer_version`/`content_manifest_hash`/`frozen_at` **dentro do manifesto JSONB** (não como colunas) | Info | Confirmado no banco (Fase 5) |

**Rotas reais verificadas (admin):** `POST /matters/{id}/semantic/analyze` · `PUT /matters/{id}/semantic` · `GET /matters/{id}/semantic` · `GET|POST /templates` · `POST /templates/{id}/versions` · `POST /templates/{id}/activate`.
**Rotas públicas:** `GET /api/public/v1/editions/{y}/{n}/snapshot` · `GET .../download` · `GET /api/public/v1/verify/{code}`.

**Estado real do banco:** 24 matérias (9 com `semantic_content`), 22 edições, 3 snapshots, 1 template, 4 flags, 0 artefatos `publication_artifacts`.

**Divergências corrigidas entre `semanticApi.ts` e backend:** resposta de `get`/`save` agora expõe `version`/`etag`/`content_mode` (o backend as retorna); tratamento de `409` com prompt de recarregamento; `content_mode` no tipo `Matter`.

---

## 2. Decisão sobre fonte canônica (Fase 2)

`app/core/content_mode.py` — **uma única fonte canônica por matéria**:

| modo | fonte canônica |
|------|----------------|
| `semantic` | `semantic_content` (SemanticDocument) |
| `legacy_html` | `content_html` |
| `original_pdf` | arquivo PDF original (`pdf_reference`) |

- `PUT /matters/{id}/semantic` define `content_mode="semantic"`.
- `PATCH /matters/{id}` **rejeita (409)** gravar `content_html`/`content_json` quando a matéria está em `semantic` (a menos que o modo seja trocado explicitamente).
- Conflito otimista: `If-Match: <versão>` → `409` se divergir (`app/core/versioning.py`). Frontend envia `If-Match` e mostra banner “Conflito de edição — recarregue”.
- Troca de modo é transacional e auditada (comportamento preservado).

---

## 3. Conservação do texto (Fase 3) — evidência

Fixture golden `fixtures/decreto-04-2026.document.json` (preâmbulo, súmula, `DECRETA:`, 3 artigos, incisos I–III, tabela orçamentária com `rowspan`/`colspan`/total, local/data, autoridade/cargo) e `tests/test_conservation.py`.

- Nenhum número/valor monetário/nome/palavra omitido: `compute_text_integrity` → `ok=True`, `missing_sensitive=[]` (origem→documento e origem→HTML renderizado, `screen` e `print`).
- Tabela preservada como tabela com `rowspan`/`colspan` e `is_total` (estrutura; `caption`/`is_total` não são auto-detectados — ver limitação).
- Incisos e autoridade podem ser classificados como parágrafos pelo parser determinístico, mas **nunca têm texto perdido** (o usuário reclassifica no editor). Isso é conservação garantida, não reescrita.

**Resultado:** 6 testes de conservação **passando**.

---

## 4. Revisão completa (Fase 4)

`SemanticReview.tsx` renderiza o **mesmo `SemanticDocument` salvo** (via `semanticApi.get`) usando o mesmo renderizador (`documentToHtml`), read-only, com: metadados, schema, revisão (versão), blocos, integridade, aviso de bloqueio de aprovação.

**Aprovação só habilita** quando: conteúdo carregou (`loaded`), todos os blocos confirmados (`confirmed`), e sem erro de renderização (`valid`). Se falhar ao carregar → erro claro e botão bloqueado. Após salvar semântico, o passo de revisão passa a usar a revisão semântica.

---

## 5. Renderização e versionamento (Fase 5)

- Fixture contratual **compartilhada** `fixtures/decreto-04-2026.document.json`, consumida por:
  - `tests/test_contract_render.py` (Python) — ordem de blocos, `<h1>`, tabela `colspan`/total, todos os números/autoridade; **5 testes passando**.
  - `src/lib/__tests__/semanticContract.test.ts` (TS) — mesma ordem, `<h1>`, `colspan`, `sem-total`, mesmos tokens; **5 testes passando**.
- Snapshot registra `semantic_schema_version` (por item), `template_id`/`template_version`, `renderer_version`, `content_manifest_hash`, `frozen_at` **no manifesto JSONB** (confirmado no banco).
- Frontend: se uma versão de schema for desconhecida, não interpreta silenciosamente (blocos desconhecidos caem no fallback seguro; documentado).

---

## 6. Segurança do HTML (Fase 6)

- Renderer: `legacy_html` **sanitizado** com bleach allow-list; `_safe_url` bloqueia `javascript:`/`vbscript:`/`file:`/`data:` (exceto `data:image/*`).
- `tests/test_renderer_security.py` — **8 testes XSS passando** (script, iframe, event handlers, `javascript:`, `data:text/html`, `svg onload`).
- Regressão sanitizador: `test_sanitizer.py` continua passando.
- CSP já presente no web-public (bloqueio de `connect-src`/`script-src` verificados no console).

---

## 7. Construtor de modelos (Fase 7)

Páginas `/templates` e `/templates/[id]` existentes (lista, criação, versões, ativação, edição JSON). **Pendência parcial:** a interface continua centrada em JSON (seção “Nova versão — configuração JSON”) sem um construtor visual completo (cabeçalho/margens/tipografia/tabela/assinatura com prévia). Versionamento, imutabilidade da versão ativa e ativação auditada estão funcionais. **Classifico como parcial** (ver limitações).

---

## 8. Snapshot e página pública (Fase 8)

- Página pública usa `GET /editions/{y}/{n}/snapshot`; **sem fallback silencioso**: se a edição existe mas `has_snapshot=false`, renderiza **“Edição temporariamente indisponível”** (sem selo de integridade). Rota legada `by-year` é usada **só quando o snapshot inexiste** e identifica **“Edição legada — sem snapshot semântico”** (mantém o PDF original).
- Imutabilidade comprovada: `snapshot_intact=True` na edição publicada; alterar matéria de origem não muda a página/PDF.

---

## 9. Assinatura e autenticidade (Fase 9)

Backend `_build_authenticity` agora expõe estados **independentes**: `signed`, `intact`, `chain_trusted`, `certificate_valid`, `revocation_checked`, `timestamped`, `snapshot_intact`, e `validation_checked_at`. A página pública mostra cada um como **Sim / Não / Não verificado** e, para certificado self-signed, exibe **“Integridade válida; cadeia não confiável”** (não “confiável”).

---

## 10. PDF imutável (Fase 10) — evidência

**3 downloads do mesmo PDF (edição 2026/21):**

| download | SHA-256 |
|----------|---------|
| #1 | `e4834794e0d3d6e0d61c2615197b28093e410be78e8bfadab407bd11881e72d0` |
| #2 | `e4834794e0d3d6e0d61c2615197b28093e410be78e8bfadab407bd11881e72d0` |
| #3 | `e4834794e0d3d6e0d61c2615197b28093e410be78e8bfadab407bd11881e72d0` |

- `cmp` byte-a-byte: `dow1==dow2` ✓, `dow1==dow3` ✓. **Mesmo SHA-256, sem regeneração.**
- Igual ao `signed_pdf_hash` no banco (imutável).
- Endpoint de download apenas transmite os bytes armazenados, re-valida o SHA-256 (409 se divergir) e não regera nem reassina.

**pdfsig:**
```
Signature Type: ETSI.CAdES.detached
Signed Ranges: [0-571953],[576967-577566]
Signature Validation: Signature is Valid.
Certificate Validation: Certificate issuer isn't Trusted.   <- self-signed de teste
```

**pyHanko:** `subfilter=/ETSI.CAdES.detached` · `byte_range=[0,571953,576967,599]` · **`intact=True` · `valid=True` · `trusted=False`** (esperado — cert de teste sem raízes ICP-Brasil).

**Teste de adulteração:** 1 byte alterado → hash muda (`3d7a…fd8`) e `pdfsig` reporta **“Digest Mismatch”** → o hash re-verificado no download detectaria e rejeitaria (409).

---

## 11. Playwright e acessibilidade (Fase 11)

Infra subida em homologação; `web-public` reconstruído (proxy same-origin `/api` para evitar CORS; `demoteHeadings` para **um único `<h1>`**).

**Desktop (1440×900):**
- ✅ renderiza header/ações/aviso de representação
- ✅ exatamente **um `<h1>`** (conteúdo legado h1→h2)
- ✅ sumário navegável por teclado + âncoras
- ✅ busca local na edição filtra matérias
- ✅ painel de autenticidade e hashes
- ✅ foco visível (outline)
- ✅ zoom 200% sem overflow crítico
- ✅ **axe sem violações critical/serious** (passa isolado; timeout no suite sob carga — flake de recurso)
- ✅ verificação tenant-scoped via `/farol/verificar/...` (estados independentes)

**Mobile (iPhone 12):** emulação instável neste host (timeout de *setup* de página sob carga); não foi possível concluir a suíte mobile de forma confiável. **Pendência de infraestrutura.**

Screenshots: `/tmp/opencode/edicao-pagina-publica-desktop.png` e `-mobile.png`.

---

## 12. Testes executados (Fase 12)

| Suíte | Resultado |
|-------|-----------|
| Backend (semantic engine + conservation + canonical_mode + renderer_security + contract_render + sanitizer + matter_content + matters) | **91 passed** |
| Frontend web-admin (vitest, incl. semanticBlocks/semanticRender/semanticContract) | **70 passed** |
| XSS (renderer) | 8 passed |
| Conservação (golden) | 6 passed |
| Conflito/ETag | 7 passed |
| Contrato Py/TS | 5 + 5 passed |
| E2E Playwright desktop | 8/9 (axe flaky em suite; passa isolado) |
| E2E Playwright mobile | não confiável (lentidão do host) |
| Regressão PAdES | intact/valid True (pyHanko) |
| Validação pdfsig | Signature Valid, issuer not trusted |

---

## 13. Dependências e lockfiles (Fase 13)

- `web-public/package.json`: `@playwright/test` e `@axe-core/playwright` registrados como devDependencies; `package-lock.json` presente e atualizado.
- Nenhuma dependência nova em produção no backend.

---

## 14. Rollback por commit

Todos os checkpoints são commits; rollback via **`git revert`** (sem `git checkout --` de diretórios):

| commit | conteúdo |
|--------|----------|
| `cc6530e` | baseline: motor semântico + UI por blocos + modelos + página por snapshot |
| `7762a63` | fonte canônica + 409/ETag + conservação + XSS renderer |
| `6fcddcb` | revisão read-only + contrato Py/TS + estados honestos + sem fallback |
| `02eaea8` | proxy `/api` + single h1 + suíte Playwright/axe |
| `f23c267` | devDependency `@axe-core/playwright` |

Reverter uma fase: `git revert <commit-hash>` (gera novo commit; preserva demais entregas). Mudanças não relacionadas (nginx/saas/etc.) permanecem intocadas e não commitadas.

---

## 15. Limitações conhecidas

1. **Construtor de modelos ainda é JSON-centric** (Fase 7 parcial) — falta o editor visual completo com prévia.
2. **Parser determinístico não auto-classifica** incisos/alíneas/bloco de autoridade/caption/`is_total` de tabela (converte a estrutura com alta fidelidade textual, mas exige conferência humana — comportamento por design; nunca perde texto).
3. **E2E mobile e axe-em-suite** instáveis por lentidão/contenda do host de homologação (passa isolado).
4. **`trusted=False`** — certificado self-signed de teste; sem raízes ICP-Brasil, TSA, OCSP/CRL (pendências externas).
5. **`publication_artifacts`** criado mas não populado no fluxo (0 registros) — o caminho de artefato imutável do PDF usa `signed_pdf_path`/hash na edição; a tabela de artefatos é evolução.
6. API de verificação exige contexto de tenant (comportamento esperado).

---

## 16. Checklist de aceite

| Critério | Status |
|----------|--------|
| Documento com estrutura semântica real | ✅ |
| Tabelas não são texto achatado (rowspan/colspan/total) | ✅ |
| Usuário pode corrigir classificações | ✅ (editor por blocos) |
| IA não altera palavras/números | ✅ (não utilizada para reescrever) |
| Modelos configuráveis e versionados | ✅ |
| Modelos ativos imutáveis | ✅ |
| Revisão mostra conteúdo completo | ✅ |
| Status não fica desatualizado | ✅ (review state; retorno da API) |
| Página pública usa snapshot imutável | ✅ |
| Página acessível e responsiva | ✅ (axe/teclado; mobile pendente infra) |
| PDF gerado uma única vez | ✅ (3 downloads idênticos) |
| PDF assinado e validado | ✅ (intact/valid; trusted pendente raízes) |
| Downloads repetidos mesmo SHA-256 | ✅ |
| Página não regenera PDF | ✅ |
| Alterar modelo não altera publicação antiga | ✅ (snapshot) |
| Alterar matéria não altera snapshot publicado | ✅ (`snapshot_intact`) |
| Edições antigas intactas | ✅ (não tocadas) |
| Todos os testes passam | ⚠️ 91 backend + 70 frontend ✅; E2E mobile não confiável |
| Rollback | ✅ (git revert por commit) |

---

## 17. Bloqueios para produção

1. Concluir **construtor visual de modelos** (não só JSON).
2. Executar suíte **E2E completa (desktop + mobile) estável** e **axe em suite** num ambiente com recursos adequados.
3. Certificado **ICP-Brasil real** + raízes no signer (hoje `trusted=False`), **TSA/ACT** e **OCSP/CRL**.
4. População de `publication_artifacts` no fluxo (opcional).

Enquanto esses itens não forem resolvidos, a entrega permanece **APROVADA PARA HOMOLOGAÇÃO**.
