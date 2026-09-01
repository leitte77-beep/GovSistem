# Relatório do Módulo Diário Oficial

**Data:** 2026-09-01
**Escopo:** Análise do estado atual, fluxos, stack, funcionalidades, assinaturas e erros conhecidos.

---

## 1. Visão geral

O módulo **Diário Oficial Eletrônico (DOE)** é um sistema completo de publicação de diários oficiais, com fluxo editorial de matérias (atos), montagem de edições, geração de PDF, assinatura digital **ICP-Brasil (PAdES)** e publicação pública com busca full-text. É multi-tenant (por organização/órgão) e foi integrado a um portal SaaS (`app.govsistem.com.br`) que faz a autenticação centralizada.

É composto por **5 serviços** em containers:

| Serviço | Stack | Papel |
|---------|-------|-------|
| `api` | Python + FastAPI + SQLAlchemy async + PostgreSQL | Backend principal, CRUD, fluxo de publicação, indexação |
| `web-admin` | Next.js 14 + React 18 + Tailwind + TipTap | Painel administrativo (autores, revisores, diagramadores, assinadores) |
| `web-public` | Next.js 14 + React | Site público (busca, acervo, verificação de autenticidade) |
| `signer` | Python + FastAPI + pyOpenSSL/cryptography + FPDF | Serviço de assinatura PAdES ICP-Brasil |
| `worker` | Celery + Redis | Tarefas assíncronas (geração de PDF, backups) |

Infraestrutura auxiliar: **PostgreSQL 16**, **Redis 7**, **MinIO** (armazenamento de objetos, `doe-publicacoes`). Orquestração por `docker-compose.yml`.

---

## 2. Stack técnica (detalhe)

### 2.1 API (`api/`)
- **Framework:** FastAPI com rotas async (`api/app/main.py`).
- **ORM:** SQLAlchemy 2.0 async (`asyncpg`); migrações com **Alembic**.
- **Validação:** Pydantic v2 (`api/app/schemas/*`).
- **Auth:** JWT (`HS256`) access token (30 min) + refresh token (7 dias, hash SHA-256 armazenado); MFA disponível (`mfa.py`).
- **Rate limit:** `slowapi` (200 req/min por IP).
- **Segurança:** middlewares de auditoria, headers de segurança, logging JSON, sanitização de HTML (DOMPurify no cliente; `html_sanitizer.py` no servidor).
- **Observabilidade:** Sentry (opcional), middleware `json_logging`.
- **Busca:** PostgreSQL full-text com `unaccent` + `portuguese` (`search_indexer.py`), com abstração para futuro OpenSearch.
- **Armazenamento:** backend plugável `local` (disco) ou `minio`, com isolamento por tenant (`core/storage.py`).
- **Criptografia:** Fernet simétrico derivado de `SECRET_KEY` (`services/encryption.py`) para PFX e senhas em repouso.

### 2.2 Frontend admin (`web-admin/`)
- Next.js 14 App Router, páginas 100% client-side.
- Editor **TipTap** com tabelas, formatação inline, link, imagens; limpeza de colagem Word/Excel; autoformatação (heurística + **IA** via endpoint `ai_formatter`).
- Autenticação via **SaaS externo** (`app.govsistem.com.br`) com token injetado por query (`?token=`); o app admin é protegido pelo `AdminShell`.
- Token: `access_token` em `sessionStorage`, `refresh_token` em `localStorage`.
- Importação legado via wizard de PDFs.

### 2.3 Frontend público (`web-public/`)
- Busca de matérias, acervo por ano/edição, página de matéria, verificação de autenticidade (`/verificar/[codigo]`), páginas institucionais.
- Consome a **Public API v1** (`/api/v1/public/*` e `/public/v1/*`).

### 2.4 Signer (`signer/`)
- Assinatura **PAdES** com certificado **A1 ICP-Brasil** (PKCS#12/PFX).
- pyOpenSSL `PKCS7SignatureBuilder` (SHA-256, detached + binary), merge de elementos visuais (selo rotacionado + página de manifesto + QR Code) via **FPDF**.
- Validação de cadeia com raízes ICP-Brasil, checagem CRL, política AD-RB `2.16.76.1.7.1.11.1.3`.

### 2.5 Worker (`worker/`)
- Celery + Redis Beat. Tarefas: `generate_edition_pdf` (delega ao endpoint interno da API), `backup_scheduler`, `health`.

---

## 3. Fluxo editorial principal

### 3.1 Fluxo da Matéria (ato normativo)
```
DRAFT → REVIEW → APPROVED → PUBLISHED
                    ↘ REJECTED → DRAFT
DRAFT/APPROVED → ARCHIVED
```
1. **Autor** cria a matéria (`POST /matters`), em 3 etapas (Informações → Conteúdo → Revisão). Título numerado automaticamente (`getNextMatterTitle`, ex. `LEI – 03/2026`).
2. Conteúdo pode ser **HTML digitado** (TipTap) ou **upload de PDF** que é convertido página a página em imagens (`pdf_content.py`, limite 100 págs).
3. Autor envia para revisão (`submit-review`). O botão rotulado **"Publicar"** no front na verdade envia para revisão (UX enganosa).
4. **Revisor** aprova ou rejeita (`approve`/`reject`), com transição de status auditada.
5. Anexos podem ser adicionados em estados editáveis (draft/review/rejected).

### 3.2 Fluxo da Edição
```
DRAFT → REVIEWING → SCHEDULED → CLOSED → PDF_GENERATED → SIGNED → PUBLISHED
   ↘ CANCELLED        ↘ DRAFT ↘ DRAFT/PDF_GENERATED ↘ CANCELLED
```
1. **Diagramador** cria edição (`POST /editions`), com numeração automática ou manual (configurável por setting `edition.auto_numbering`). Tipos: `normal`, `extra`, `suplementar`.
2. Adiciona matérias **APROVADAS** (`add_item`), define seções (`section_title`) e ordena (drag & drop, `reorder`).
3. **Fechar** (`close`) → gera PDF automaticamente via WeasyPrint (Jinja2, layouts `classico`/`moderno`/`minimalista`; duas passagens para paginação "Página X de Y").
4. **Gerar PDF** pode ser reexecutado (`generate-pdf`) em CLOSED/PDF_GENERATED.
5. **Assinar** (`sign`) → PDF_GENERATED, exige certificado.
6. **Publicar** (`publish`) → SIGNED, exige assinatura e matérias em APPROVED; marca matérias como PUBLISHED e indexa na busca.
7. Reopen permitido de CLOSED/PDF_GENERATED se ainda não assinado.

### 3.3 Publicação pública
- Matéria publicada é indexada no PostgreSQL FTS (`SearchIndex`).
- Site público serve edições via `/api/download/[...path]` (endpoint de download com path protegido contra traversal).
- Verificação de autenticidade via `verification_code` e `immutability_hash` (`/verificar/[codigo]`).
- **Public API v1** expõe apenas dados publicados, com paginação e rate-limit.

---

## 4. Assinatura digital (detalhe)

### 4.1 Modelo de dados
- **`SigningCredential`** (`signing_credentials`): PFX + senha **criptografados** (Fernet) em `config` JSON; guarda metadados do certificado (serial, subject, validade); soft delete.
- **`Signature`** (`signatures`): liga edição↔usuário↔credencial; `signature_data` guarda apenas os **primeiros 1000 chars** do PDF assinado (truncado); `certificate_info` (JSON) com subject, serial, thumbprint, issuer, validade, OID de política, formato, SHA-256 do PDF original/assinado e código de verificação; `is_valid=True` fixo.

### 4.2 Fluxo de assinatura (`POST /editions/{id}/sign`)
1. Valida que a edição está em `PDF_GENERATED` e possui `pdf_path`/`pdf_hash`.
2. Gera `verification_code` se ausente (`SHA-256(id+ano+número)` → `{ano}{n:04d}-{hash8}`).
3. Obtém o certificado: **credencial salva** (descriptografa `pfx_encrypted` do banco) **ou upload direto** do PFX + senha no request.
4. Reenvia o PDF para o `signer` via HTTP interno (`SIGNER_URL`, header `X-Internal-Key`) com o PFX e senha.
5. O signer decodifica, valida validade do cert, executa o pipeline PAdES (selo + manifesto + `/Sig` com `ByteRange` e CMS).
6. A API recebe o PDF assinado (base64), **armazena em MinIO/disco** com isolamento de tenant, grava a `Signature`, atualiza `signed_pdf_path`, sobrescreve `pdf_hash` para o hash do PDF assinado, calcula `immutability_hash` e transita para `SIGNED`.
7. **Validação** (`validate-signature`): apenas recomputa e compara o `immutability_hash`; **não revalida criptograficamente o CMS**.

### 4.3 Formato do hash de imutabilidade
`SHA-256( str(id) + year + number + pdf_hash + verification_code )`.
> **Divergência:** o comentário do campo promete incluir "conteúdo + itens ordenados", mas a implementação real **não os inclui** — depende apenas do `pdf_hash` do PDF assinado.

---

## 5. Funcionalidades por área

**Autenticação/Acesso:** registro de organização + admin, login JWT + refresh + MFA, controle de papéis (AUTOR, REVISOR, DIAGRAMADOR, ASSINADOR, PUBLICADOR, AUDITOR, ADMIN, SUPER_ADMIN), isolamento por tenant (slug).

**Matérias:** CRUD, numeração automática, 3 etapas, HTML rico + editor, upload PDF→imagens, anexos, histórico de status (auditoria), busca/filtros, autosave em localStorage, IA de formatação.

**Edições:** CRUD, tipos, numeração auto/manual, kanban de matérias aprovadas, seções, reordenação, estados com máquina de transições, geração de PDF, assinatura, publicação, cancelamento, reabertura.

**Busca pública:** full-text em português, snippet com `<mark>`, filtros por data/órgão/tipo, paginação.

**Verificação:** código de verificação + hash de imutabilidade + página pública de conferência.

**Importação legado:** wizard de PDFs nomeados `AAAA-MM-DD__EDICAO.pdf` → validação → importação de edições PUBLISHED.

**Infra:** audit trail (tabela `audit_events`), rate-limit, backup agendado, Sentry, storage multi-tenant.

---

## 6. Erros, bugs e fragilidades conhecidos

### 6.1 Segurança (críticos)
| # | Risco | Local |
|---|-------|-------|
| 1 | **Senha do PFX e chave privada trafegam em texto claro / HTTP** na rede interna (`http://signer:8100`), sem TLS | `editions.py:683`, `signing_credentials.py:228`, `signer/internal.py:52`, `config.py:78` |
| 2 | **Sem `X-Internal-Key`, o signer aceita qualquer requisição** ("No key configured — allow in dev mode") | `signer/internal.py:31-32` |
| 3 | `verify`/`verify_detailed` **não validam criptograficamente** o CMS (só checam estrutura) | `signer/a1.py:597-611,667-708` |
| 4 | CRL com `verify=False` (MITM) e parsing incorreto (trata CRL como certificado) | `signer/icp_brasil.py:171,174` |
| 5 | `_sanitize_log` definido mas **nunca usado**; `LOG_LEVEL=DEBUG` por padrão | `signer/internal.py:37-41`, `config.py:10` |
| 6 | Chave Fernet deriva **apenas de `SECRET_KEY`** (single master key p/ todos os tenants) | `services/encryption.py:21-27` |
| 7 | `_is_a1_certificate` aceita certificados sem política OID (modo dev) | `signer/a1.py:167,172`, `icp_brasil.py:132-133` |

### 6.2 Integridade / funcionalidade
| # | Problema | Local |
|---|----------|-------|
| 8 | `immutability_hash` não inclui conteúdo/itens como o comentário afirma | `models/edition.py:120-122` |
| 9 | `signature_data` guardado truncado (1000 chars) → não reconstrói a assinatura | `editions.py:716` |
| 10 | Botão **"Publicar"** na etapa 3 da matéria na verdade envia para **revisão** | `MatterForm.tsx:681` |
| 11 | Endpoints públicos do signer `sign`/`verify` **não implementados** | `signer/routes.py:23,32` |
| 12 | Trilha de auditoria do signer **só em memória** (perdida em restart) | `signer/internal.py:25` |
| 13 | `verify_pdf_signature` usa `__new__` (dummy sem init) — uso frágil | `signer/internal.py:248-250` |
| 14 | FPDF ausente → assinatura ocorre **sem selo/manifesto silenciosamente** | `signer/a1.py:273,325` |

### 6.3 Frontend / integração
| # | Problema | Local |
|---|----------|-------|
| 15 | URLs de API com fallback `http://localhost:9201` e rewrite `http://api:8000` → quebram em produção sem `NEXT_PUBLIC_API_URL` | `MatterForm.tsx:18,21-23`, `verify/page.tsx:32`, `certificates/sign/page.tsx:44` |
| 16 | `ProtectedRoute.tsx` com URL **hardcoded** `app.govsistem.com.br/login`; componente **morto** (nunca importado) | `ProtectedRoute.tsx:14` |
| 17 | `MatterKanban.tsx` é **código morto** (lógica duplicada dentro de `EditionForm`) | `MatterKanban.tsx` |
| 18 | Importação legado, `verify` e `certificates/sign` leem token de `localStorage` e chamam fetch direto, **ignorando o wrapper `api`** (sessionStorage + refresh) | `Wizard.tsx:43,60`, `verify/page.tsx:31`, `sign/page.tsx:43` |
| 19 | Imagens decorativas hardcoded de `lh3.googleusercontent.com` (contra `images.remotePatterns`) | `editions/page.tsx:330`, `operacoes/page.tsx:250` |
| 20 | Filtro de status de edições omite `reviewing` e `scheduled` | `editions/page.tsx` |
| 21 | Botões "Mais Filtros"/"Filtros" decorativos (sem handler) | `matters/page.tsx:162`, `editions/page.tsx:195` |
| 22 | Uso de `alert()`/`confirm()` nativos em vez de `ConfirmModal`/toasts | vários componentes |
| 23 | Senha do certificado mantida em estado React durante o fluxo de assinatura | `EditionForm.tsx` |
| 24 | TODO: migrar tokens para cookies httpOnly + CSRF | `lib/api.ts:7` |

### 6.4 Comentários gerais
- **Risco de concurso de numeração de matéria:** `next-title` computa o próximo número no cliente/request sem trava de banco; dois autores simultâneos podem gerar o mesmo título.
- **URLs de imagem geradas** apontam para `http://api:8000/api/v1/matter-content/...` (hostname interno); só são reescritas para `file://` na geração do PDF de edição, e para o `API_HOST` do front em edição de matéria — dependente de env.
- **Validação de assinatura** não é criptográfica no backend; é uma conferência de hashes armazenados.
- **Multi-tenant:** senhas/certificados criptografados com uma chave mestra global; isolamento de storage por slug (com proteção contra path traversal no slug).

---

## 7. Resumo executivo

O módulo está **funcional e completo do ponto de vista de fluxo**: o ciclo matéria → edição → PDF → assinatura ICP-Brasil → publicação → busca/verificação está implementado de ponta a ponta, com multi-tenancy, auditoria e um site público. A stack é sólida (FastAPI + PostgreSQL + Next.js + Celery + WeasyPrint + pyOpenSSL).

Os pontos de atenção concentram-se em **segurança da assinatura** (senha/PFX em trânsito sem TLS, validação criptográfica fraca, comportamento "dev mode" sem chave interna), **divergências de integridade** (hash de imutabilidade incompleto, assinatura truncada), **código morto/duplicado** no front (MatterKanban, ProtectedRoute), e **URLs/config hardcoded** que dependem de variáveis de ambiente para funcionar em produção.

### Prioridades sugeridas
1. **TLS interno + exigir `X-Internal-Key`** entre API↔signer (risco crítico).
2. **Validação criptográfica real** do CMS/PAdES e correção da checagem CRL.
3. Alinhar `immutability_hash` e armazenar a assinatura completa (não truncada).
4. Remover/religar código morto e corrigir URL hardcoded no front.
5. Unificar camada de token (eliminar acesso direto a `localStorage`/fetch fora do wrapper `api`).
