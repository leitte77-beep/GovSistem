# Comparativo — Prompt Mestre × Estado Atual do Módulo Diário

**Data:** 2026-09-02
**Objeto:** Analisar o "Prompt Mestre" (99 itens) contra a implementação real do `modulo-diario` em `sistemaweb`.
**Método:** inspeção direta do código, modelos, API, providers, web-admin/web-public, docker-compose, worker/signer e relatórios de homologação (`RELATORIO_*`). Nenhum arquivo de código foi alterado.

**Legenda:**
- ✅ **Implementado** — existe e funciona no fluxo principal.
- 🟡 **Parcial** — existe, mas incompleto/divergente em relação ao prompt.
- ❌ **Ausente** — não existe ou não foi localizado no módulo.

---

## 0. Veredito de alto nível

O módulo **já implementa com qualidade o núcleo de ponta a ponta**: matéria → edição → diagramação (WeasyPrint) → assinatura **PAdES ICP-Brasil real (incremental, pyHanko)** → publicação imutável (snapshot) → portal público SSR premium → busca FTS → verificação/QR. A stack segue o prompt (FastAPI+PostgreSQL+Next.js+Redis+Celery+MinIO+Docker).

As **lacunas concentram-se em**: `TimestampProvider`/TSA (não existe), `MockSignatureProvider` (não existe), API de integração `POST /api/integrations/matters` (não existe), `LegacyUrlMap`/redirects 301 (não existe), sistema de **notificações** (não existe), **QR por página no PDF** (não existe), **página certificada** (não existe), **PNCP** (não existe), **Selo Eletrônico/Cloud/HSM** (só A1 implementado), **segregação FOUR_EYES** e **MFA obrigatória por papel** (aplicação incompleta), **preservação PDF/A**, **Calendar de publicação**, **favoritos/clipping/estatísticas** e **Documentação** formal.

---

## 1. Legado e contexto jurídico

| # | Item do prompt | Status | Evidência / observação |
|---|---|---|---|
| — | Lei 751/2015, status "substituição de plataforma" | 🟡 | Multitenancy + `organization` model; leis citadas apenas em docs, sem enumeração normativa no produto. |
| — | MP 2200-2, Lei 14.063/2020, LAI, LGPD, Governo Digital, 14.133, ICP-Brasil/DOC-ICP-15, PAdES, eMAG, WCAG, CONARQ/e-ARQ/RDC-Arq | 🟡 | PAdES AD-RB (DOC-ICP-15.03) aplicado; LGPD(eMAG/WCAG) em acessibilidade; **CONARQ/e-ARQ/RDC-Arq não aplicados**; **DOC-ICP-15.01/.02 não mapeados**. |
| — | Separar requisito legal × boa prática | 🟡 | Em boa parte dos relatórios; não é tratado como campo/flag no domínio. |

---

## 2. Arquitetura

| # | Item | Status | Evidência |
|---|---|---|---|
| 11 | Separação PUBLIC/ADMIN/API/WORKERS/SIGNER/DB/OBJECT/SEARCH/AUDIT/BACKUP | 🟡 | API+web-admin+web-public+signer+worker+Postgres+Redis+MinIO, em `docker-compose.yml`. **Busca** é FTS no Postgres (sem serviço dedicado); **Audit** é tabela; **Backup** é worker. |
| 11 | Stack Next.js+TS / FastAPI+Py / PostgreSQL / Redis / Celery / MinIO / Docker | ✅ | Confirmado (`RELATORIO_MODULO_DIARIO.md`). |
| 39 | Preparado para GovSistem (`organization_id`, SSO central via `app.govsistem.com.br`, OIDC futuro) | 🟡 | `organization_id` em todas as entidades; auth via SaaS central. **OIDC/OAuth2 de integração não implementado.** |
| 39 | Não misturar auth do usuário com chave privada | ✅ | Chave restrita ao signer-service; auth separada. |

---

## 3. Assinatura digital e certificado

| # | Item | Status | Evidência |
|---|---|---|---|
| 3 | `SignatureProvider` com implementações intercambiáveis | 🟡 | Existe a **abstração** (`signer/app/providers/base.py`), mas `create_provider()` **só registra `a1`**. `PfxA1SignerProvider` é a única. |
| 3 | `A1Pfx / Hsm / CloudPsc / ElectronicSeal` | ❌ | Não implementados (nem `MockSignatureProvider`). |
| 3 | Sistema só chama `sign(document, policy)` sem conhecer implementação | 🟡 | API delega ao signer via HTTP interno; mas **não há camada de política/definição de credencial por política** — a seleção é por `SIGNER_PROVIDER`. |
| 4 | Assinatura PAdES ICP-Brasil | ✅ | `a1.py` — pyHanko `IncrementalPdfFileWriter` + `PdfSigner`, `/Sig`,`/ByteRange`,`/Contents` (CMS), `ETSI.CAdES.detached` (`RELATORIO_AUDITORIA_PADES.md`). |
| 4 | PAdES AD-RT + ACT → carimbo de tempo | ❌ | **Sem TSA/ACT.** `PdfSignatureMetadata` sem `timestamper`. Carimbo de tempo **não existe**. |
| 4 | Políticas LTV/arquivamento ICP-Brasil | ❌ | Não preparado. |
| 4 | Não implementar criptografia artesanal / não simular assinatura com imagem | ✅ | Assinatura real (não mais selo FPDF). |
| 5 | Pipeline automático de validação (integridade, cadeia, cert, validade, política, timestamp, hash, status) | 🟡 | Validado por pyHanko (`intact`/`valid`, cadeia com raízes ICP-Brasil). **Sem timestamp**, **sem OCSP/CRL completa**, cadeia só valida com raízes reais (hoje `trusted=False`). |
| 5 | Estados `VALID / INVALID / INDETERMINATE / PENDING_VALIDATION` | 🟡 | O campo usa `valid \| invalid \| not_validated` (`signature_validation_status`). **Não há `INDETERMINATE`/`PENDING_VALIDATION`.** |
| 5 | `PUBLISHED` só quando checagens aprovadas | 🟡 | Afirmado nos relatórios; verificação de não-marcar-publicado em edições sem `/Sig` foi um **bug histórico** (ver §6.1 relatório). |
| 5 | Testes com Verificador de Conformidade do ITI | ❌ | Não integrado. |
| 6 | Certificado A1 criptografado, provisão via KMS/Secret/Vault/envelope | 🟡 | `SigningCredential` PFX+senha **criptografados com Fernet** (chave única derivada de `SECRET_KEY`). **Não usa KMS/Secret Manager/Vault.** |
| 6 | PFX nunca no frontend/log/DB/chave no container web público | ✅ | Portificado em restrição; `signing_credentials.py`. |
| 6 | Serviço isolado de assinatura (`signer-service`) | ✅ | Container `signer` próprio. |
| 6 | Sair senha em `.env` aberto | ❌ | **Senha do PFX e chave privada trafegam em texto claro/HTTP** interna (falha da seção 6.1); `SECRET_KEY` e `INTERNAL_API_KEY` com defaults `change-me-in-dev`. |
| 6 | Auditoria de cada operação no signer | 🟡 | Audit trail **só em memória** (perdida em restart). |
| 7 | Painel Certificação Digital (titular, autoridade, série, emissão, validade, dias, status, tipo, cadeia, última assinatura/verificação) | 🟡 | `web-admin/src/app/settings/certificates/` existe; cobertura parcial. |
| 7 | Aviso de expiração em 60/30/15/7/3/1 dia | ❌ | Não localizado (sem notificações). |
| 8 | `TimestampProvider` independente + persiste ACT/serial/horário/resposta/hash/política/status | ❌ | Não existe. |
| 85 | `MockSignatureProvider` + marcar PDFs "NOT LEGALLY SIGNED" + proibir em produção | ❌ | Não existe. Produção não aborta com provider mock (nem há mock). |
| 86 | Ambientes dev/homolog/prod, certificados independentes | 🟡 | `ENVIRONMENT` var; bancos/storages independentes. **Proteção contra cert de produção em dev não verificada.** |

---

## 4. Integridade e imutabilidade

| # | Item | Status | Evidência |
|---|---|---|---|
| 9 | Edição publicada imutável (sem editar texto/PDF/número/data/matérias/sumário/ordem) | ✅ | `EditionStatus.PUBLISHED` sem transições; snapshot imutável; edit desabilitado. |
| 9 | Errata/Retificação/Republicação + relacionar novo ato com original | ✅ | `MatterRelation` (rectifies/republishes/cancels/revokes/amends/supersedes/complements) e `publication_type` (`RELATORIO_FASE2…`). |
| 10 | SHA-256 por matéria | ✅ | `matter_content_hash` (`services/document_integrity.py`). |
| 10 | SHA-256 por arquivo | ✅ | Field `file` model + hashes. |
| 10 | SHA-256 do PDF antes e depois da assinatura | ✅ | `source_pdf_hash` e `signed_pdf_hash`. |
| 10 | `manifest.json` por edição | 🟡 | **Manifesto guardado no JSONB do snapshot** (`content`/`content_manifest_hash`), **não como `manifest.json` em storage**; porém o fluxo armazena os metadados equivalentes. |
| 10 | Cadeia de hashes (hash anterior + atual) | ❌ | Não há encadeamento entre edições. |
| 10 | Não apresentar cadeia como substituto da ICP-Brasil | ✅ | Documentado como "integridade", nunca assinatura. |
| 22 | `Edition` com campos (page_count, matters_count, etc.) | 🟡 | Modelo tem os principais; `page_count`/`matters_count` derivados, não coluna. |
| 22 | Tipos `ORDINÁRIA/EXTRA/SUPLEMENTAR/ESPECIAL` | 🟡 | Só `normal/extra/suplementar` (sem `especial`). |
| 23 | Numeração concorrente (lock/sequence/advisory) + constraint | 🟡 | **Unique constraint** `uq_edition_org_year_number_type`; auto-numbering por setting. **Sem sequence/lock transacional explícito no calculo do próximo número fora de transação.** |
| 63 | Não reassinar acervo / preservar original → `LEGACY_ORIGINAL` | 🟡 | `legacy_importer` + estados; relatórios confirmam que acervo não foi reassinado. **A label `LEGACY_ORIGINAL` / representação HTML derivada não é explícita como entidade.** |
| 75 | Publicação atômica com `PublicationSnapshot` | ✅ | `edition_publication_snapshot.py` + snapshot v1/v2. |
| 82-84 | Testes de imutabilidade, concorrência (`MAX+1` não duplica), assinatura (adulterar 1 byte) | 🟡 | Teste de adulteração e de concorrência parcial; suíte completa de imutabilidade não formalizada. |

---

## 5. Conteúdo e editor

| # | Item | Status | Evidência |
|---|---|---|---|
| 14-15 | Unidades/Secretarias configuráveis + Tipos de Ato configuráveis | ✅ | `org_units`, `act_types` (cadastro/DRF-like) + `web-admin/src/app/tipos-ato/`. |
| 16 | Matéria como entidade estruturada (`canonical_content_json`, versions) | 🟡 | `Matter` com `content_mode` (semantic/legacy_html/original_pdf) e `semantic_content`; **`MatterVersion` não localizado** (conteúdo em snapshot/edge, sem tabela de versionamento por matéria). |
| 17 | Editor profissional (TipTap) com todos os efeitos + colagem Word | ✅ | TipTap; tabelas, formatação inline, paste sanitization; sanitizer ampliado. |
| 18 | Importação DOC/DOCX/ODT/RTF/TXT/PDF + pipeline antivírus→identificação→extração→normalização→preview→revisão | 🟡 | Pipeline de importação de **PDF** (wizard legado); `providers/antivirus.py`; **formatos DOCX/ODT/RTF/TXT não cobertos na normalização**; sem etapa de identificação/normalização semântica completa. |
| 18 | Preservar original assinado + nunca afirmar que assinatura vale após alterar bytes | ✅ | Documentado. |
| 19 | IA assistente com ORIGINAL/SUGESTÃO/DIFF e confirmação humana; nunca alterar silenciosamente; não inventar | 🟡 | `ai_formatter`/endpoints de análise; **sem UI de DIFF e sem invenção proibida implementada como regra** (documentado que IA não reescreve). |
| 20 | Workflow editorial (14 estados) com transição auditada (usuário/data/IP/ação/motivo/versão/hash) | 🟡 | Matéria: `DRAFT→REVIEW→APPROVED→PUBLISHED` (+reject/archived). Edição: `DRAFT→REVIEWING→SCHEDULED→CLOSED→PDF_GENERATED→SIGNED→PUBLISHED`. **Não segue a máquina de 14 estados do prompt; auditoria de cada transição com hashes apenas parcial.** |
| 21 | Conferência (ORIGINAL × DIAGRAMADO), registro usuário/horário/versão/hash, anular ao mudar | 🟡 | `SemanticReview` read-only. **Sem tela dedicada "Conferência" com anulação automática.** |
| 24 | Montagem da edição: drag-and-drop, agrupar por poder/secretaria/tipo, sumário automático | 🟡 | Drag-and-drop de matérias aprovadas + seções; **sem hierarquia "Poder→Secretaria→Tipo" automática**. |
| 25-26 | Diagramação automática (A4, margens, cabeçalho/rodapé, brasão, seções, sumário, tipografia, quebras) | ✅ | WeasyPrint + layouts `classico|moderno|minimalista`; paginação "Página X de Y". |
| 25-26 | Evitar órfãos/quebras inadequadas/tabelas cortadas/rodapé sobre conteúdo | 🟡 | Tratado parcialmente via CSS; sem motor dedicado de controle de órfãos de tabela. |
| 26 | Design premium de Imprensa Oficial (brasão, Lei 751/2015, edição/ano/data/páginas, rodapé com código/QR) | 🟡 | Layout institucional; **rodapé sem QR; Lei 751/2015 e nº de páginas no cabeçalho configuráveis**; visual técnico confirmado. |
| 27 | QR Code por página apontando `/verificar/{codigo}` (sem dados no QR) | 🟡 | QR **só na página web** de verificação (via qrserver) e pontualmente; **não por página no PDF** (pendência registro §Fase2). |
| 28 | Código verificador formato `XXXX-XXXX-XXXX-XXXX` | 🟡 | Formato atual `{ano}{numero:04d}-{hash8}` (`20260023-296CD414`); **dife do padrão do prompt**. Verificação e QR ok. |
| 28 | Página de verificação (autêntico vs não localizado) com dados e links | ✅ | `/verificar/{codigo}` SSR (public_v1/v2). |
| 29 | Edição certificada original (nunca modificar após assinatura; processamento antes) | ✅ | Assinatura incremental; processamento pré-assinatura; download re-valida hash. |
| 30 | Página certificada (baixar página com comprovação de origem) | ❌ | Não implementado. |
| 36-37 | Sumário clicável + localização (`#materia-{uuid}` + página) | 🟡 | Sumário clicável na web; `#materia-…` âncoras; **links do PDF para páginas corretas não confirmados**. |

---

## 6. Portal público e dado aberto

| # | Item | Status | Evidência |
|---|---|---|---|
| 31 | Portal premium com busca em destaque "O que você procura?" + última edição + botões | 🟡 | Home e redesenhos premium; **busca de destaque "O que você procura?" e bloco "última edição" com botões específicos não confirmados** (busca atual em `/buscar`). |
| 32 | Busca avançada (frase exata, nº/ato/processo/CNPJ/PNCP/departamento/tipo/ano/datas) sem acento | 🟡 | FTS `pt` + `unaccent`; filtros parciais. **Sem filtros por processo/CNPJ/PNCP/CPF; busca pública em `/matters q=` é `ilike`, não FTS.** `SearchProvider` para migrar a OpenSearch existe. |
| 33 | Indexação por matéria na publicação (normalizado, título, meta, página inicial/final) | 🟡 | `SearchIndex` na publicação; **página inicial/final da matéria não indexada**. |
| 34 | Matéria individual pública SSR com botões | ✅ | `/materias/[id]` SSR; ações. |
| 35 | Página da edição amigável, tabs JORNAL/HTML/PDF | 🟡 | `/edicoes/{ano}/{numero}` SSR premium; **tabs explícitas JORNAL/HTML/PDF não confirmadas**; conteúdo exibido em folha. |
| 38 | SEO (title/description/canonical/OG/JSON-LD/sitemap/robots) | 🟡 | Metadata + JSON-LD + canonical. **sitemap.xml/sitemap de edições/matérias e robots.txt não confirmados**; existe página `mapa-do-site`. |
| 39 | Dados abertos `/api/public` JSON (+avaliar CSV/XML) + OpenAPI | 🟡 | `api/public/v1/*` e `/public/v1` + v2. **Sem CSV/XML; OpenAPI presente via FastAPI, sem documentação dedicada.** |
| 40 | API de integração `POST /api/integrations/matters` (OAuth2/API key, sistema externo não publica) | ❌ | Não existe. |
| 41 | PNCP (campos + link "Consultar contratação no PNCP") | ❌ | Não localizado. |
| 64 | Redirects `LegacyUrlMap` + 301 de links antigos | ❌ | Não existe tabela/rota de redirect. |
| 65 | Retificação relacionada (exibir "possui retificação" + link) | 🟡 | Camada `matter_relations` e API; **renderização pública bidirecional completa pendente** (§13.4 Fase2). |
| 66 | Legislação consolidada (vigência/alterações/revogações) como integração | ❌ | Não implementado. |
| 68-69 | Clipping / Favoritos / acompanhar termo | ❌ | Ausente (apenas comentário em `MatterDocument.tsx`). |
| 70 | Estatísticas (edições por mês, matérias por secretaria/tipo, tempo de aprovação, downloads, atos acessados) | 🟡 | `api/v1/metrics.py` parcial. |

---

## 7. Administração, segurança e operação

| # | Item | Status | Evidência |
|---|---|---|---|
| 13 | RBAC real com perfis e permissões granulares | 🟡 | Papéis existem (AUTOR/REVISOR/DIAGRAMADOR/ASSINADOR/PUBLICADOR/AUDITOR/ADMIN/SUPER_ADMIN) + `roles`/`permissions`/`user_roles`. **Permissões granulares `matter.create/edit_own/…` e `edition.sign/publish/…` não confirmadas como regras por ação** — autorização por `role`/`is_admin`. |
| 47 | Segurança (CSRF/CORS/rate-limit/CSP/HSTS/Secure/SameSite/httpOnly/XSS/SQL param/upload MIME/antivírus/path traversal/SSRF/brute-force) | 🟡 | CORS, rate-limit (slowapi), CSP/hsts/security headers, sanitização XSS, antivírus, path traversal no download. **Senha/PFX HTTP sem TLS (crítico), CRL `verify=False` corrigido, `LOG_LEVEL=DEBUG` default, chave master única.** |
| 47 | MFA para perfis críticos (ADMIN/SIGNATARIO/SUPER_ADMIN) | 🟡 | `mfa.py` + MFA API; **aplicação obrigatória por papel não confirmada**. |
| 48 | Segregação FOUR_EYES_APPROVAL | ❌ | Não implementado como política. |
| 49 | Modal sério + MFA/reautenticação na publicação | 🟡 | Modal de confirmação; **reautenticação/MFA no publish não confirmada**. |
| 45 | `audit_events` append-only | ✅ | Modelo + ações; interface sem remove confirmada. |
| 46 | Logs técnicos separados + `correlation_id`; não logar segredos | 🟡 | json_logging; segredos guardados (embora `_sanitize_log` não usado). |
| 73 | Migrations reais (Alembic), constraints, FKs, indexes; não `create_all()` | 🟡 | Alembic presente; **relatórios indicam "schema gerenciado manualmente, sem `alembic_version`" e **multi-head WIP**→bloqueia `upgrade head`; DDL idempotente entregue.** |
| 74 | Entidades (`edition_signatures`, `timestamp_records`, `publication_records`, `verification_codes`, `legacy_url_maps`, `system_settings`, `notifications`) | 🟡 | Faltam: `timestamp_records`, `publication_records`, `legacy_url_maps`, `notifications`, `verification_codes`(coluna na edição). `settings` = `setting.py`; `SigningCredential` cobre `certificate_configs`. |
| 50 | Backup 3-2-1, PITR, incremental, versão storage, off-site, criptografado, teste de restauração, Object Lock/WORM | 🟡 | Worker de backup + `backup.py`; **PITR/incremental/off-site/encrypt/restore test/Object Lock não confirmados**. |
| 51 | Preservação arquivística (PDF/A antes da assinatura, e-ARQ, CONARQ, RDC-Arq) | ❌ | PDF/A não gerado. |
| 52 | Disponibilidade 99,9% + health/readiness/monitoramento/alertas | 🟡 | Health checks; **readiness/monitoramento/alertas parciais**. |
| 53 | Performance (home<1,5s, busca<1s, CDN, cache) | 🟡 | Objetivos; **caching/CDN agressivo de conteúdo imutável não confirmado**; PDFs via MinIO (não necessariamente CDN). |
| 54 | Acessibilidade eMAG/WCAG AA + página `/acessibilidade` + testes ax/axe/Lighthouse | ✅ | Forte; `/acessibilidade`; axe/Playwright. `eMAG` implícito. |
| 55 | LGPD (minimização, privacy by design; não "apagar matéria" como solução genérica) | 🟡 | Sanitização de payload público; **privacidade by design/logs/operações como processo não formalizado**. |
| 56-59 | UX/UI admin 2026 (dashboard, telas, 4 etapas, autosave, dashboard da edição, preview real) | 🟡 | Dashboard, tabelas, etapas, preview com o mesmo motor; **autosave é `localStorage` (não servidor)**; "Salvo há 10 segundos" não confirmado. |
| 77 | CDN/cache immutable + admin não cacheado publicamente | 🟡 | Parcial; headers não confirmados. |
| 78 | Horário UTC, exibir America/Sao_Paulo, separar datas | 🟡 | Timezone em `America/Sao_Paulo` no signer; **armazenamento UTC completo não confirmado**. |
| 79 | Observabilidade (metrics/logs/tracing/alertas) | 🟡 | Mirrors `metrics.py`, Sentry (opcional), health. **tracing não**. |
| 80 | Disaster recovery (RPO/RTO, restore-db/storage/config/rebuild-search) | 🟡 | Planos/reports fora do módulo; **procedimento formal de rebuild do índice não localizado**. |
| 87 | CI/CD (lint/typecheck/tests/build/security/migration/deploy homolog/smoke/aprovação/prod) | 🟡 | `.github` presente. **Fluxo completo com segurança+aprov manual não confirmado.** |
| 88-89 | Documentação (README/ARCHITECTURE/SECURITY/SIGNATURES/BACKUP_RESTORE/MIGRATION/DEPLOYMENT/API/RUNBOOK) + manual do usuário | 🟡 | Relatórios extensos no módulo; **arquivos formais da lista não confirmados** (README raiz existe). Manual do usuário não. |
| 90 | Checklist de publicação com bloqueio | 🟡 | Checks parciais; **bloqueio automático por checklist não confirmado**. |
| 91 | Proibições (sem assinatura fake/imagem, sem alterar PDF pós-assinatura, sem PFX exposto, etc.) | ✅ | Em sua maioria atendidas; **exceção: PFX/senha em HTTP sem TLS** e `SIGNER_PROVIDER` dev fallback. |

---

## 8. Testes e homologação

| # | Item | Status | Evidência |
|---|---|---|---|
| 81 | Testes unit/integração/API/E2E/segurança/PDF/migração/assinatura + E2E obrigatório | 🟡 | Muitas suítes (api ~90+, signer, web-public/web-admin vitest, e2e SSR/a11y). **E2E completo de ponta-a-ponta e suíte de assinatura em certificado real pendentes**; E2E mobile instável. |
| 84 | Teste de assinatura com certificado real (validar com ferramenta, carimbo, adulterar 1 byte) | 🟡 | Teste PAdES passa (self-signed); `trusted=False`; **sem cert ICP-Brasil real, TSA, OCSP/CRL**. |
| 86 | Ambientes e certificados independentes | 🟡 | Ver §3. |

---

## 9. Sugestão de prioridades de implementação (lacunas com maior impacto)

1. **Criptografia em trânsito interna (API↔signer) + segredos**: TLS/mTLS + `X-Internal-Key` fail-closed; remover senha em `.env`/defaults. (crítico)
2. **`MockSignatureProvider`** para dev (marcar "NOT LEGALLY SIGNED", abortar em prod) — desbloqueia testes locais sem cert real.
3. **`TimestampProvider` / TSA-ACT** (PAdES AD-RT + LTV) e estados `INDETERMINATE/PENDING_VALIDATION`.
4. **`generateVerificationCode` no formato `XXXX-XXXX-XXXX-XXXX`** mais forte (hash de 16 chars) e QR **por página no PDF**.
5. **API de integração** `POST /api/integrations/matters` (OAuth2/API key) e artefatos **PNCP + `LegacyUrlMap`/redirects 301**.
6. **Sistema de notificações** (expiração de certificado, timestamp falhou, backup, retorno de matéria, publicação concluída).
7. **`MatterVersion`** (versionamento diário por matéria), tabela **`timestamp_records`/`publication_records`/`verification_codes`/`notifications`/`legacy_url_maps`**.
8. **Permissões granulares por ação** (RBAC fino) + **MFA obrigatória por papel** + **FOUR_EYES_APPROVAL**.
9. **Workflow editorial de 14 estados** da matéria (ex.: `SUBMITTED/UNDER_REVIEW/QUEUED/LOCKED/COMPOSING/READY_FOR_SIGNATURE`) + tela dedicada **Conferência** (anula ao mudar).
10. **Preservação PDF/A** (conversão ANTES da assinatura) e **estratégia 3-2-1 com teste de restauração**.
11. **Página certificada** por página; **sumário com links de PDF**; **sitemap.xml/robots.txt**; **calendário + publicação agendada confiável** (compose→sign→timestamp→publish no servidor).
12. **Consolidar heads do Alembic** (hoje multi-head) e migrar schema para gestão por `alembic_version`.
13. **Autosave no servidor** (não só localStorage) e remover código morto do admin (MatterKanban, ProtectedRoute) + correção do botão "Publicar" que envia para revisão.
14. **Estatísticas completas** e **documentação formal** (lista do §88) + `ARCHITECTURE.md`/`SECURITY.md`/`SIGNATURES.md` etc.

> Parágrafo de cautela: **nenhuma alteração foi feita neste comparativo.** A decisão de priorizar/repriorizar e o início da implementação dependem de sua autorização explícita.
