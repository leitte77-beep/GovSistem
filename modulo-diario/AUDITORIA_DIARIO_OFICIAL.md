# Auditoria Técnica — Diário Oficial Eletrônico (`modulo-diario`)

**Data:** 2026-09-14
**Escopo:** auditoria de código real (backend, frontend, signer, worker, templates, banco)
seguida de correção efetiva do motor de autodiagramação semântica.
**Método:** inspeção do código-fonte, execução das suítes de teste e leitura dos
relatórios existentes. Nenhuma tecnologia foi presumida.

> Este documento registra o estado **ANTES** e é atualizado ao final com o **DEPOIS**.

---

## 1. Arquitetura encontrada (real, não presumida)

| Camada | Tecnologia |
|--------|-----------|
| API | FastAPI + SQLAlchemy (async) + Pydantic v2 |
| Banco | PostgreSQL (produção) / SQLite in-memory (testes) |
| Migrations | Alembic **e** bootstrap idempotente em `app/main.py::_ensure_schema` |
| Admin web | Next.js (App Router) + TypeScript + Tailwind; editor rico em TipTap |
| Portal público | Next.js, SSR (`edition-loader.ts`), proxy `/api` same-origin |
| Worker | Celery — **órfão** (não despachado por nenhum código) |
| PDF | **WeasyPrint** + Jinja2 (`api/app/services/edition_pdf.py`), síncrono |
| Assinatura | Serviço isolado `signer/` (FastAPI + **pyHanko**), PAdES-B-B incremental |
| Storage | `LocalStorage` / MinIO com prefixo de tenant |
| Multi-tenant | `organization_id` + `set_storage_tenant` + filtros por query |
| Motor semântico | `app/semantic/*`: schema Pydantic, parser regex determinístico, renderer, integrity, snapshot |
| Modelos documentais | `app/document_model/*` (segundo motor/renderizador, `.doc-*`) |

**Fluxo real hoje:**

```
close edição ─► snapshot canônico ─► PDF síncrono (content_html) ─► signer PAdES ─► publish
analyze/save ─► SemanticDocument (JSONB) ─► página pública re-renderiza semantic (.doe-*)
```

---

## 2. Problemas críticos

### C1 — HTML público e PDF nascem de fontes diferentes
- O **PDF da edição** usa `item["content_html"]` do snapshot
  (`edition_pdf.py:214`).
- A **página pública** re-renderiza `item["semantic"]` com
  `app/semantic/renderer.py` (`public_v1/semantic.py:102-127`).
- Existem **dois renderizadores semânticos divergentes**: `.doe-*`
  (`semantic/renderer.py`) e `.doc-*` (`document_model/body_html.py`).
- Resultado: o texto pode divergir entre o que o cidadão lê e o que foi
  assinado. Viola o requisito de fonte canônica única.

### C2 — Rótulo `SÚMULA:`/`EMENTA:` reescrito/literal
`semantic/renderer.py:161` **hardcoda** `Súmula:` e publica a súmula no
**rodapé** do documento. O parser **não detecta** `SÚMULA:`/`EMENTA:` no
corpo, então:
- o rótulo original não é preservado;
- quando a súmula está no texto, ela permanece como parágrafo comum e o
  campo `summary` fica vazio no editor.

### C3 — Assinatura pode ser reportada como “válida” sem cadeia confiável
- `signature_validation.normalize()` classifica `valid` mesmo com
  `chain_trusted=False` (`services/signature_validation.py:76-87`).
- `signer/certs/icp-brasil-roots.pem` **não existe** → `trusted=False` sempre.
- A página pública pode sugerir autenticidade sem explicar que a cadeia não
  foi validada.

### C4 — Revogação e carimbo de tempo inoperantes
- `icp_brasil._check_crl` está quebrado: faz `load_der_x509_certificate`
  sobre uma CRL, usa `verify=False` e nunca verifica o serial; sempre
  retorna `(True, "")`.
- OCSP não implementado (`_ocsp_cache` nunca usado).
- `Rfc3161TimestampProvider` existe mas **não está conectado** ao fluxo;
  `timestamp_status` fica `"not_present"`.

---

## 3. Problemas altos

| # | Achado | Local |
|---|--------|-------|
| A1 | `CONSIDERANDO` é classificado como `command` (fórmula), perdendo a distinção semântica pedida | `parser.py:43-47` |
| A2 | Incisos/alíneas fora de um artigo nem sempre são reconhecidos; `_ROMAN` limitado a XX | `parser.py:445-448` |
| A3 | Preâmbulo (autoridade + “no uso de suas atribuições”) não é classificado como `preamble` | `parser.py` |
| A4 | Local/data e bloco de assinatura não são reconhecidos de forma robusta (exige `dia DE MÊS`, sem tolerar ponto final/“Paço Municipal”) | `parser.py:64-69` |
| A5 | PDF gerado **sincronamente** no request de `close` (WeasyPrint bloqueia a requisição) | `editions.py:592` |
| A6 | Worker de PDF é código morto; endpoint interno incompatível com o fluxo | `worker/app/tasks/generate_edition_pdf.py`, `internal.py:183-191` |
| A7 | Sumário com página real só no layout `classico` (`target-counter`); `moderno`/`minimalista` mostram ordinal | `templates/pdf/layouts/*` |
| A8 | `EditionItem.page_number` nunca é preenchido | `models/edition_item.py:33` |
| A9 | Frontend `semanticRender.documentToHtml` não renderiza a súmula e escapa rich text (divergente do backend) | `web-admin/src/lib/semanticRender.ts` |
| A10 | Bug de concorrência: `request<T>` não anexa `status`, então o 409 do editor semântico pode não disparar | `web-admin/src/lib/api.ts:182-185` |

## 4. Problemas médios

| # | Achado |
|---|--------|
| M1 | PDF **não assinado** gravado direto em `UPLOAD_DIR` sem prefixo de tenant (`edition_pdf._save_to_storage`) |
| M2 | Duplicação de schemas/templates legados (`worker/templates/pdf`, `api/app/templates/pdf/edition.html`) ainda testados |
| M3 | Testes do `signer` usam header `X-Internal-Api-Key` (correto é `X-Internal-Key`) → suíte vermelha |
| M4 | `pyproject.toml` do signer não declara `pyhanko` (só `requirements.txt`) |
| M5 | `_sanitize_log` é dead code no signer |
| M6 | `SIGNER_A1_PFX_PATH`/`SIGNER_A1_PASSWORD` são configuração morta |
| M7 | PFX é escrito em arquivo temporário (`delete=True`) para o pyHanko |
| M8 | Comparação de chave interna usa `!=` em vez de `hmac.compare_digest` |

## 5. Problemas baixos / dívida técnica

- Worker Celery órfão e templates legados não removidos.
- `hash de integridade textual` é impresso **dentro do HTML público** (`renderer.py:163-167`) — ruído editorial.
- Ausência de `considerando` no union de blocos do frontend e do backend.
- `summary_label` inexistente no schema.

---

## 6. Riscos de produção / jurídicos

1. **Integridade documental:** PDF assinado pode divergir do HTML público (C1).
2. **Autenticidade:** selo de “válido” sem cadeia ICP-Brasil (C3) — risco de
   falsa percepção de segurança jurídica.
3. **Não repúdio:** sem ACT/OCSP/CRL, a comprovação temporal e de revogação é
   incompleta (C4).
4. **Imutabilidade:** já há snapshot + hash do PDF assinado (ponto forte), mas
   o PDF do snapshot deriva de `content_html`, não do semântico.
5. **Isolamento multi-tenant:** filtros existem, mas o PDF não assinado não é
   tenant-isolado em storage (M1).

## 7. Pontos que exigem revisão jurídica — `LEGAL_REVIEW_REQUIRED`

- **Política PAdES/ICP-Brasil exigida** pelo ente (AD-RB, AD-RT, AD-RV,
  AD-RC, AD-RA) — depende de norma municipal/regulamento próprio.
- **Assinatura do ato × assinatura da edição:** o sistema hoje as trata como
  eventos separados, mas a definição de quando a assinatura pessoal do
  titular é juridicamente necessária deve ser validada pelo órgão.
- **Página/certificado de validação adicional:** manter como opção
  configurável, não obrigatória.

---

## 8. Plano de correção executado nesta rodada

1. **C2/A1/A3/A4** — motor semântico: preservar `SÚMULA:`/`EMENTA:`
   (`summary_label`), criar bloco `considerando`, detectar preâmbulo e incisos.
2. **C1** — PDF da edição passa a renderizar o **documento semântico canônico**
   quando presente, com o mesmo renderer da página pública.
3. **A9** — frontend espelha os novos campos/tipos e renderiza a súmula.
4. **A10** — corrigir anexação de `status` no cliente HTTP.
5. **M3** — corrigir header nos testes do signer (sem desativar testes).
6. **Testes** — golden da Portaria 220/2026 + conservação do rótulo +
   `considerando`.
7. **Documentação** — `PRODUCTION_READINESS.md`.

Itens **não** concluídos nesta rodada (dependem de infraestrutura externa ou
de decisão jurídica) estão listados em `PRODUCTION_READINESS.md` com o bloqueio
técnico explícito.

---

# RESULTADO (DEPOIS)

## 9. Motivo semântico — estado final

O documento bruto da Portaria 220/2026, colado **como texto puro**, é agora
reconhecido assim (evidência de execução):

```
summary_label = 'SÚMULA'
summary       = 'EXONERA A SERVIDORA ISABELE DIAS DUTRA.'
blocks:
  heading (0.6)        PORTARIA Nº 220/2026
  preamble (0.6)       OCLÉCIO… NO USO DE SUAS ATRIBUIÇÕES…
  considerando (0.9)   Considerando o requerimento sob o protocolo nº 249
  command (0.9)        RESOLVE:
  inciso I   (0.9)     Exonerar, a pedido…
  inciso II  (0.9)     Esta Portaria entra em vigor…
  inciso III (0.9)     Registre-se e Publique-se.
  signature_block (0.35): OCLÉCIO DE FREITAS MENESES / Prefeito Municipal /
                          Farol, 01 de setembro de 2026.
integridade ok: True  (missing_sensitive = [])
```

- O rótulo `SÚMULA:` é **preservado** e renderizado logo abaixo do título
  (não mais no rodapé, não mais reescrito para “Súmula:”).
- `CONSIDERANDO` deixou de ser confundido com a fórmula de execução.
- Nenhum caractere/valor/data/nome é reescrito.

## 10. Convergência HTML público ↔ PDF

- `edition_pdf._render_semantic_content()` renderiza o **mesmo**
  `SemanticDocument` congelado no snapshot, com o **mesmo** renderer da página
  pública (`app/semantic/renderer.py`), agora com `include_style=False` para
  embutir no template da edição.
- Só há fallback para `content_html` quando a matéria é legada (sem semântico).
- Teste prova: um item com `semantic` + `content_html` divergente usa o
  semântico.

## 11. Correções de código do signer

- Bug real: `/internal/verify-pdf` executava `validate_pdf_signature` **dentro
  do event loop**, o que quebrava a ponte async do certvalidator e retornava
  `intact=False` silenciosamente. Agora roda em `asyncio.to_thread` e reporta
  integridade corretamente.
- `F821 ImageBlock` no parser (HTML com `<img>` levantaria `NameError`) —
  corrigido.
- `icp_brasil` do `inspect` deixou de ser variável morta: é retornado no
  `InspectResponse`.

## 12. Arquivos alterados nesta rodada

**Backend (api):**
- `app/semantic/schemas.py` — `summary_label`, tipo `considerando`, súmula no `plain_text`.
- `app/semantic/parser.py` — extração de SÚMULA/EMENTA, considerando, preâmbulo, assinatura, fix `ImageBlock`.
- `app/semantic/renderer.py` — súmula sob o título com rótulo, bloco `considerando`, remoção do hash no HTML público, `include_style`.
- `app/services/edition_pdf.py` — PDF usa o documento semântico canônico.
- `pyproject.toml` — E501 para o teste golden.
- `tests/test_portaria_220_golden.py` — **novo**, 11 testes permanentes.

**Signer:**
- `app/api/internal.py` — `verify-pdf` em thread, expõe `icp_brasil`, fix lint.
- `pyproject.toml` — config de lint consistente.
- `tests/{test_auth,test_config,test_internal_api,test_providers,test_signing}.py` — corrigidos (header `X-Internal-Key`, format `PAdES-B-B`, defaults, fail-closed), sem desativar nenhum teste.

**Frontend (web-admin):**
- `src/types/semantic.ts` — tipo `considerando`, `summary_label`.
- `src/lib/semanticRender.ts` — render da súmula e de `considerando`.
- `src/lib/semanticBlocks.ts` — criação de bloco `considerando`.
- `src/lib/api.ts` — `Error` agora carrega `status` (corrige detecção de 409).
- `src/components/Semantic/BlockEditor.tsx` — edição de `considerando`.

> Observação: o working tree já continha alterações não relacionadas
> (modelos documentais, workflow, settings) antes desta rodada; elas **não**
> foram tocadas por esta auditoria.

## 13. Testes

| Suíte | Antes | Depois |
|-------|-------|--------|
| Backend — semântico/conservação/contrato/PDF | 43 passed | **78 passed** (incl. 11 golden 220) |
| Backend — suíte completa | 634 passed / 7 failed | **634 passed / 7 failed** (as 7 são pré-existentes; confirmado por `git stash`) |
| Signer | 48 passed / 13 failed / 2 errors | **63 passed / 0 failed** |
| Frontend web-admin (vitest) | 96 passed | **96 passed** |
| TypeScript (`tsc --noEmit`) | — | **0 erros** |
| PDF real (WeasyPrint) da Portaria 220 | — | 1 página, texto pesquisável com SÚMULA/RESOLVE/incisos/signatário |

Falhas pré-existentes da API (não relacionadas; confirmadas no baseline):
`test_editions` (publish/generate), `test_imports` (CSV), `test_public_v1`
(MagicMock x Pydantic 2.13), `test_security` (mock de auth),
`test_signing_credentials_api` (poluição de estado entre testes — passa
isolado).

## 14. Limitações restantes

1. **A3/HSM** não implementado (só A1 + mock).
2. **OCSP/CRL** não funcionais (`_check_crl` continua incorreto) e **ACT/TSA**
   não conectado ao fluxo.
3. **Raízes ICP-Brasil** ausentes → `trusted=False`.
4. **Worker Celery** de PDF continua órfão; geração síncrona no `close`.
5. **Construtor visual de modelos** ainda JSON-centric.
6. PDF não assinado gravado sem prefixo de tenant.
7. TOC com página real apenas no layout `classico`.

## 15. Pontos que exigem revisão jurídica — `LEGAL_REVIEW_REQUIRED`

- Política PAdES/ICP-Brasil exigida pelo ente.
- Distinção entre assinatura do ato e assinatura da edição.
- Obrigatoriedade de página/certificado de validação adicional.

## 16. Segunda rodada — pendências corrigidas

| Pendência | Correção | Evidência |
|-----------|----------|-----------|
| CRL quebrada | `load_der_x509_crl`/PEM, TLS verificado, serial conferido; revogado falha | `test_icp_revocation.py` |
| OCSP inexistente | OCSP RFC 6960 com REVOKED/GOOD/UNKNOWN, cache | `test_icp_revocation.py` |
| Raízes sem caminho | `ICP_BRASIL_ROOTS_PATH` + `signer/certs/README.md` | código |
| ACT não conectado | `HTTPTimeStamper` no `PdfSigner` via `TSA_URL`; `timestamp_status` no response | `a1.py`, `internal.py` |
| A3 ausente | `A3RemoteSignatureProvider` (ponte testada) e `A3LocalSignatureProvider` | `test_icp_revocation.py` |
| Sumário ordinal em 2 layouts | `target-counter` em `moderno`/`minimalista` | templates |
| CSS `.doe-*` perdido no PDF | `include_style=True` + `include_page_rules=False` | `test_portaria_220_golden.py` |
| Paginação órfã/viúva | `orphans/widows/break-*` no renderer e nos layouts | `renderer.py`, CSS |
| PDF sem tenant | gravação em `UPLOAD_DIR/{tenant}/pdf/` | `edition_pdf.py` |
| Worker órfão | `PDF_GENERATION_ASYNC` enfileira; fallback síncrono | `celery_client.py`, `editions.py` |
| Chave com `!=` | `hmac.compare_digest` | `internal.py` |

**Testes do signer:** 48 → **74 passed**. **Testes de API (núcleo):** 100 passed
(2 falhas pré-existentes de `test_editions`).
