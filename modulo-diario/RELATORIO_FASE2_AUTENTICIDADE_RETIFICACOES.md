# Relatório — Fase 2: Snapshot v2, autenticidade por matéria, verificação, QR e retificações

**Escopo entregue:** aditivo, backend (`modulo-diario/api`) + web público (`modulo-diario/web-public`).
**Não altera** edições/PDFs/snapshots publicados nem regride a Fase 1.

---

## 1. Auditoria inicial (achados concretos)

- **Assinatura:** nível de **edição** (`Signature` → `certificate_info`: subject/issuer/valid_from/valid_to/timestamp). Hashes em `Edition`: `pdf_hash`, `source_pdf_hash`, `signed_pdf_hash`, `content_manifest_hash`, `immutability_hash`. ICP-Brasil/PAdES. **Não existe assinatura por matéria.**
- **Código público:** já existe por edição (`Edition.verification_code`, ex. `20260023-296CD414`), gerado por `generate_verification_code()` (SHA-256 → 8 hex), coluna `unique=True`. **Reutilizado** (não crio código concorrente).
- **Snapshot imutável** (`EditionPublicationSnapshot.content`, `schema_version:1`) **já congela campos estruturados por matéria**: `act_number`, `act_year`, `act_date`, `act_type_id`, `org_unit_id`, `publication_type` (normal|rectification|republication), `references_matter_id`, `responsible`, `metadata`, `semantic`, `semantic_hash`, `content_html`. O serializador público v1 **descartava** esses campos.
- **Limitações:** (a) sem tabela de relações jurídicas (revoga/altera/supera/complementa); (b) `/verificar/[codigo]` era **client-only** e QR via serviço externo; (c) sem hash canônico público por matéria; (d) migração alembic do tree está **multi-head (WIP)** (`3e4a5…` e `9z9z9…`).

## 2. Snapshot Público v2

Novo endpoint **aditivo** `GET /api/public/v1/editions/{year}/{number}/v2` (`app/api/public_v2.py`). View-model puro sobre o snapshot v1 já congelado (sem escrever nada):
- `schema_version: 2`, `edition` (ref+verification_code+status), `publisher` (org: name/slug/logo/description — sem path/segredo), `publication` (situation, has_snapshot, frozen_at), `authenticity`, `integrity` (hashes), `links`, `source_snapshot_version`.
- `matters[]` com campos estruturados **reais do snapshot**: `id/public_id`, `act_type`, `act_number`, `act_year`, `act_date`, `org_unit`, `responsible`, `section`, `order`, `title/summary`, `publication_type`, `references_matter_id`, `content_html`, `attachments`, `semantic_hash`, **`matter_content_hash`**, `publication_status`, `legal_status` (vindo de relações), `relations`.
- Compatibilidade: o v1 não é tocado; o leitor normaliza qualquer snapshot (mesmo sem os novos campos) → view-model. Nada de `if old… if veryOld` no frontend (adaptação centralizada no backend).

## 3. Autenticidade

- `matter_content_hash` = SHA-256 canônico determinístico (`app/services/document_integrity.py`) sobre `{matter_id, organization_id, act_type, act_number, act_year, act_date, title, summary, content(semantic|content_json|content_html)}`. É **integridade**, nunca "assinatura da matéria" (documentado no código e na UI).
- Cadeia: **Matéria → snapshot da edição (manifesto) → hash `content_manifest_hash`/`signed_pdf_hash` → assinatura PAdES da edição**. A UI da matéria afirma "esta matéria integra a Edição nº X, publicada oficialmente em …".
- Sanitização: certificado público expõe apenas CN + emissor + janela de validade + timestamp; **não** expõe serial completo, CPF não mascarado, chave, storage, token.

## 4. Verificação pública

`GET /api/public/v1/verification/{code}` (novo, `app/api/public_v2.py`):
- Normalização case-insensitive e tolerante a espaços/hífen; isolamento por tenant.
- Retorna `found/kind/valid/message/document/matters/matter/total_matters`. Documento contém ente, edição, data, situação, integridade, autenticidade, assinatura (resumo público), `links` (edition/pdf/verify). Aceita `?matter_id=` para focar em uma matéria da edição.
- A página pública `/verificar/[codigo]` foi convertida para **Server Component SSR** (indexável), com `<h1>`, resultado, estados e lista de publicações da edição.

## 5. QR Code

- Na página SSR `/verificar/{codigo}`, o QR **aponta sempre para a URL permanente do tenant** (`origin/verificar/{code}`, `origin` derivado do request — nunca hardcoded `farol`).
- Reutilizado o gerador já whitelisted no projeto (`api.qrserver.com`, presente em CSP + `images.remotePatterns`) — zero dependência nova; o conteúdo do QR é a URL do tenant. (Ver pendências: troca futura por gerador local.)

## 6. Relações jurídicas- Modelo novo **aditivo** `MatterRelation` (`app/models/matter_relation.py`): `organization_id`, `source_matter_id`, `target_matter_id`, `relation_type`, `notes`, `created_by` + timestamps; UniqueConstraint por org/source/target/type; CheckConstraint `source<>target`.
- Tipos (`MatterRelationType`): `rectifies, republishes, cancels, revokes, amends, supersedes, complements` (+ labels e inversos para exibição bidirecional).
- Camada **viva**: relações podem ser criadas após a publicação (ex.: Decreto de junho revoga Portaria de janeiro) **sem adulterar** o snapshot original — princípio de imutabilidade preservado.
- `legal_status_flags()` deriva a situação "por/para" a partir das relações recebidas da matéria (bi-direcional via origem/destino, embora armazenada unidirecionalmente).

## 7. Retificação / republicação / cancelamento

- **Retificação/Republicação:** já existiam nativamente em `Matter.publication_type` + `references_matter_id` (congelados no snapshot). Reforçado no modelo de relações e exposto.
- **Cancelamento:** modelável por relação `cancels`; em edição o status `CANCELLED` já existe. **Revogação/Alteração/Superação/Complemento:** novos, via `matter_relations`. O texto original nunca é removido; a UI pode mostrar "Revogado/Cancelado por …" via `legal_status`.

## 8. Migrations

- **Não foi adicionado revision alembic** por segurança: o grafo de heads do tree está multi-head (WIP). Foi fornecida **DDL idempotente** em `modulo-diario/api/sql/fase2_matter_relations.sql` para aplicação no passo de deploy (após consolidação das heads). Nenhuma migration destrutiva; nada de backfill que toque documento oficial.

## 9. APIs

Públicas (sem auth, tenant-scoped):
- `GET /api/public/v1/editions/{year}/{number}/v2` → Snapshot Público v2.
- `GET /api/public/v1/verification/{code}?matter_id=` → verificação.

Admin (bearer + RBAC `ADMIN`/`SUPER_ADMIN`, tenant pelo usuário):
- `GET /api/v1/matter-relations?matter_id=`
- `GET /api/v1/matter-relations/search-matters?q=`
- `GET /api/v1/matter-relations/{matter_id}/legal-status`
- `POST /api/v1/matter-relations`
- `DELETE /api/v1/matter-relations/{relation_id}`
Criação/remoção gravam `AuditEvent` (user/timestamp/tenant/type/origem/destino) — sem edição silenciosa.

## 10. Segurança
- Tenant isolation: todos os endpoints novos filtram por `organization_id` (código de tenant A nunca resolve/relaciona publicações de B — testado).
- Validação de relação: proíbe self, duplicata exata, cross-tenant, matéria inexistente e laço inverso (A↔B).
- Payload público minimalista (sem storage path, created_by interno, serial/cert privado).
- Rate limit herdado do app (default limiter).

## 10b. UI administrativa "Relacionar publicações" (web-admin)
Nova rota `/matters/[id]/relacoes` (sob `AdminShell`, autenticada): lista relações (saída/entrada,
bidirecional) com títulos/labels, remove relações (admin) e cria relações com: sentido (esta/publicação
atua sobre outra **ou** outra atua sobre esta), tipo (retifica/revoga/altera/substitui/complementa/
cancela/republica), busca de publicação por nº/ano/título/texto, observações. Ações de escrita
somente para papéis `ADMIN`/`SUPER_ADMIN` (UI oculta + RBAC no backend). Link de acesso adicionado no
topo da tela de edição da matéria (`/matters/[id]/edit`). Aditivo — não altera o fluxo de criação.

## 11. Testes executados
- Backend: `tests/test_document_integrity.py` (9), `tests/test_matter_relations_db.py` (2), `tests/test_public_v2.py` (4) → **15 novos, passando**; regressão `test_public_v1` + `test_models` → **75 passando**. `ruff check` limpo.
- Web: `tsc --noEmit` OK; `next lint` OK (1 warning pré-existente em `buscar/page.tsx`); vitest **38 OK**; `next build` OK (`/edicoes/[ano]/[numero]`, `/materias/[id]`, `/verificar/[codigo]` = SSR dinâmico).
- Web-admin (UI relações): `tsc --noEmit` OK; `next lint` OK (apenas warnings pré-existentes; novos arquivos sem erro).
- Multi-tenant / hash / verificação / relações / SSR cobertos. SSR edição já provado em Fase 1 (relatório anterior).

## 12. Compatibilidade
- Edições existentes continuam acessíveis; snapshots v1 continuam a ser lidos (v2 é view-model); PDFs históricos intactos; rota antiga `/edicoes/…` e `/materias/[id]` mantidas; links já divulgados inalterados.

## 13. Pendências (não entregues — e por quê)
1. **QR no pipeline do PDF (novas edições):** não alterado. Requer leitura/edição segura de `services/edition_pdf.py` (reportlab) + assinatura pré-final; arriscado regenerar sem validação contra o signer. Recomendado como tranche própria. A página web já oferece código + QR.
2. **Migration alembic commitável:** a DDL foi fornecida; o revision deve ser criado quando o grafo de heads estiver consolidado (evita quebrar `upgrade head`).
3. **Backfill de código/QR para históricos:** código já existe; QR é metadado exibido na web (não no PDF antigo) — coerente com a regra de imutabilidade.
4. **Listagem rica de relações na UI pública individual da matéria** (links bidirecionais completos): a camada e a API existem; a renderização pública está parcial (asserção de integração + código). Completar em tranche de UI pública.

## 14. Deploy executado (homologação, live)
- **Banco (PostgreSQL `modulo_diario`):** aplicada a tabela aditiva `matter_relations`
  (`sql/fase2_matter_relations.sql`, 9 colunas, índices, constraint `source<>target`).
  Migrada a migração aditiva **`3e4a5b6c7d8e`** (authorities + `matters.metadata`/
  `review_reason`/`responsible_id`) — requerida pelo head esperado no código;
  DB agora em `3e4a5b6c7d8e` (era `c5a7e9f1b3d5`).
- **Imagens recompiladas e containers recriados (health OK):** `api`, `web-admin`, `web-public`.
- **Verificação ao vivo (domínio real `farol.govsistem.com.br`):**
  - `/edicoes/2026/23` SSR → "Edição nº 23", "PREFEITURA DE FAROL", matéria "PORTARIA…", canonical, 1 `<h1>`.
  - `/verificar/20260023-296CD414` SSR → "Documento localizado", PREFEITURA, QR (conteúdo = URL do tenant), `noindex`.
  - `/verificar/<código-inválido>` SSR → "Código não encontrado".
  - `/api/public/v1/editions/2026/23/v2` → schema_version 2, publisher, 1 matéria.
  - `/api/public/v1/verification/20260023-296CD414` → found/valid.
  - `/api/v1/matter-relations*` → **401** sem auth (rota ativa, protegida por RBAC).
  - `web-admin` → 200 em `doe-admin.govsistem.com.br`.
- Nota: o build/rebuild publica o estado atual do working tree do módulo (inclui trabalho WIP de
  outros agentes já compatível com o banco migrado). Reverter = rebuild pelas imagens anteriores +
  `alembic downgrade 3e4a5b6c7d8e` não destrutivo não é aplicável para dados; o downgrade drops
  `review_reason/metadata/responsible_id/authorities`.
