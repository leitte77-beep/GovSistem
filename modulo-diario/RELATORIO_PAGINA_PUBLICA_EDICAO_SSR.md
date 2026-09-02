# Relatório — Página Pública de Edição do Diário Oficial (SSR / experiência de consulta)

Escopo: `modulo-diario/web-public` (Next.js 14 App Router). **Sem alterações em backend,
banco/migrations, signer ou fluxo administrativo.**

---

## 1. Auditoria inicial

### Como funcionava
A rota pública `/edicoes/{ano}/{numero}` (arquivo `src/app/edicoes/[ano]/[numero]/page.tsx`)
era **100% client-side**: componente `"use client"` que em `useEffect` chamava
`api.getEditionSnapshot(...)` (endpoint `/api/public/v1/editions/{year}/{number}/snapshot`)
e só então montava a edição. O mesmo vale para `/materias/[id]` (`getMatter`).

### Componentes/APIs existentes
- Backend público: `app/api/public_v1/semantic.py` (snapshot/immutable/download),
  `app/api/v1/public.py` (organization, editions, matters, verify).
- Front: `lib/api.ts`, `lib/org-context.tsx`, `components/ShareDialog.tsx`, `Navbar`,
  `Footer`, `AccessibilityProvider`.
- Já havia: busca local simples, sumário com âncoras, painel de autenticidade lateral,
  baixar PDF, imprimir, copiar link, compartilhar (diálogo).

### Problemas encontrados (confirmado em teste real)
Uma requisição HTTP direta a `https://farol.govsistem.com.br/edicoes/2026/23` retornava
HTML inicial com apenas **"Carregando edição…"** e metadados genéricos — **sem número,
data, órgão ou qualquer matéria no HTML**. Causa raiz: entrega exclusiva por
`useEffect + fetch` (client-only). Isto impede indexação/SEO, compartilhamento,
leitores de tela e degradação sem JS.

Outros: cabeçalho pouco "documental"; filtros/sumário em carousel; autenticidade
densa em um card lateral tipo "dashboard"; sem metadata dinâmica por edição; sem
breadcrumb; CSS de impressão acoplado a classes antigas; página única grande.

---

## 2. Alterações implementadas

### Frontend (todas aditivas)
- **`/edicoes/[ano]/[numero]` convertida para Server Component** — busca a edição no
  servidor (snapshot imutável) e entrega número, data, órgão, sumário e **todas as
  matérias (títulos + súmulas + HTML)** no HTML inicial. O conteúdo continua **íntegro**
  (nenhuma reescrita do HTML oficial; só demote `h1→h2` para manter um único `<h1>`).
- **`/materias/[id]` convertida para Server Component** com SSR + metadata própria.
- Componentização nova em `src/components/edition/`:
  `EditionBreadcrumb`, `EditionHeader`, `EditionActions` (cliente), `EditionStatus`
  (selo de publicação oficial + "Ver detalhes técnicos" via `<details>` sem JS),
  `EditionSummary` ("Nesta edição", âncoras estáveis), `SearchControls` (cliente:
  busca local com debounce + filtros por tipo/caderno gerados dos dados reais),
  `MatterDocument` (+ nav anterior/próxima e "voltar ao sumário"), `CopyMatterLink`
  (cliente), `EditionPager` (edição anterior/seguinte só quando existirem),
  `EditionDocumentFooter` (encerramento documental).
- Busca em conteúdo (não só meta): lê o texto real renderizado por matéria; conta e
  anuncia em `aria-live`; **não remove o DOM permanentemente** (usa `hidden` reversível),
  preservando Ctrl+F e o HTML original.
- Compartilhar prioriza `navigator.share`; fallback copia link com feedback "Link copiado.".
- Barra de ações reordenada por prioridade (Baixar → Visualizar → Verificar → Compartilhar → Imprimir → Copiar).
- Multi-tenant respeitado (identidade/brasão vêm da organização/tenant; nada hardcodado de Farol).

### SEO
- `generateMetadata` dinâmico por edição e matéria: title/description canônicas,
  canonical absoluta (origem do request), OpenGraph, Twitter Card, robots.
- JSON-LD: `GovernmentOrganization` + `WebPage` + `BreadcrumbList` na edição;
  `Article` + `BreadcrumbList` na matéria.

### Acessibilidade
- Um único `<h1>` (verificado), hierarquia consistente, âncoras com `scroll-mt`.
- `aria-live` para resultados de busca; `aria-pressed` nos filtros; `role="search"`.
- Navegação por sumário funciona sem JS; busca/filtros são aprimoramentos progressivos.
- Status nunca depende só de cor (texto + ícone + `aria`).

### Impressão
- CSS `@media print` adaptado aos novos componentes (esconde navbar/ações/filtros/
  navegação; preserva brasão, cabeçalho e conteúdo; evita quebras em tabelas/assinaturas).

### Segurança
- Sem exposição de IDs internos sensíveis, tokens, paths de storage ou stack traces
  (erros → `notFound()`/mensagem amigável). Nenhuma URL pública nova aponta para
  serviços externos.

---

## 3. Arquivos alterados (principais)
- `web-public/src/app/edicoes/[ano]/[numero]/page.tsx` (reescrita → SSR)
- `web-public/src/app/materias/[id]/page.tsx` (reescrita → SSR)
- `web-public/src/app/globals.css` (utilitários + impressão)
- `web-public/src/lib/dates.ts` (novos formatadores), `edition-types.ts` (novo),
  `edition-catalog.ts` (novo), `server/edition-loader.ts` (novo)
- `web-public/src/components/edition/*` (novos)
- `web-public/src/app/HomeClient.tsx` e `__tests__/page.test.tsx` (export de `Props` +
  tipagem p/ `tsc` — correções mínimas pré-existentes que bloqueavam o typecheck)

## 4. APIs criadas/alteradas
Nenhuma. Reutilizadas as rotas públicas existentes: `GET /api/public/v1/editions/{y}/{n}/snapshot`,
`/organization`, `/editions?year=&page_size=`, `/matters/{id}`, `.../download` (server-side).

## 5. Banco de dados / migrations
Nenhuma migration necessária nem criada. Declarado explicitamente.

---

## 6. Testes executados
- **Typecheck:** `npx tsc --noEmit` → OK.
- **Lint:** `next lint --dir src` → OK (apenas 1 warning pré-existente em `buscar/page.tsx`).
- **Unit (vitest):** 38 testes passando (6 arquivos) — inclui catálogo de tipos,
  busca/filtros via DOM, status/autenticidade, copy-link, além dos pré-existentes.
- **Build:** `next build` → sucesso; `/edicoes/[ano]/[numero]` e `/materias/[id]`
  aparecem como `ƒ Dynamic server-rendered on demand`.
- **SSR (obrigatório) — prova real:** servidor de produção local (`next start`)
  apontando para a API de homologação; `GET /edicoes/2026/23` com `Host: farol.govsistem.com.br`
  devolveu **55 KB de HTML com**: "Edição nº 23", "PREFEITURA DE FAROL", matéria
  "PORTARIA…", código `20260023…`, âncora `materia-…`, **1 único `<h1>`**, JSON-LD,
  canonical, **sem** "Carregando edição…".
- **Mobile/e2e/axe:** não re-executados neste host (exigem redeploy do container +
  Playwright + API estável); a spec `e2e/edition-ssr.spec.ts` foi adicionada para rodar
  no ciclo de homologação.

## 7. Antes × Depois
- **Antes:** HTML inicial = "Carregando edição…"; conteúdo só após JS; metadata genérica;
  UI em card administrativo; impressão frágil.
- **Depois:** HTML inicial contém a edição e todas as matérias (indexável, compartilhável,
  legível por leitores de tela e mesmo sem JS); identidade institucional documental;
  selo de "Publicação oficial" + autenticidade técnica; barra de ações clara; sumário
  + busca + filtros gerados dos dados reais; navegação anterior/próxima (matéria e edição);
  metadata canônica + JSON-LD; acessibilidade e impressão reforçadas.

## 8. Pendências
1. **Filtros por "tipo de ato/secretaria" perfeitos:** o payload público do snapshot
   (`/snapshot`) expõe apenas `section_title`, não `act_type`/`org_unit`. Os filtros atuais
   agrupam por caderno (`section_title`, real) e por rótulo legal do **próprio título**
   (ex.: "Portaria") — derivado dos dados reais, sem inventar. Para agrupamento oficial por
   tipo/órgão seria preciso expor `act_type`/`org_unit` no snapshot (mudança de backend +
   snapshot), fora do escopo desta entrega.
2. **Assinatura por matéria:** a API pública expõe assinatura no **nível da edição**;
   o snapshot não carrega signatários individuais por matéria. A página mostra assinatura/
   autenticidade da edição (real) e, na rota individual `/materias/{id}`, o signatário real.
   Sem dados por matéria, nada é exibido como se existisse.
3. **QR Code:** requer biblioteca de geração e rota de verificação por matéria/código
   estável; hoje só existe `/verificar/{codigo}` (edição). Não adicionado para não criar
   dependência/rotina sem API determinística de per-matéria. Documentado, não implementado.
4. **Histórico de retificação/relacionamentos entre atos:** o modelo não expõe esses
   relacionamentos publicamente → interface preparada mas nada fictício exibido.
5. **e2e/axe e viewports mobile:** exigem redeploy do container `modulo-diario-web-public-1`
   (no ar há 11h com build antigo) e ambiente Playwright estável; spec adicionada para rodar
   após o deploy. Não realizado aqui para não interromper o serviço de homologação.
6. **CNPJ/endereço/UF/lei instituidora no rodapé:** o endpoint `organization` não expõe
   esses campos; para exibi-los seria necessário ampliar o contrato público (backend) —
   evitado exibir valores inventados.

## 9. Evidências
- Rota testada (SSR real): `/edicoes/2026/23` (HTML de 55 KB contendo nº/órgão/matéria/código).
- Rota individual implementada (SSR): `/materias/{id}` (depende de ID de matéria publicado;
  testada quanto a tipagem/build; verificação viva requer um ID real de matéria).
- Código-fonte e testes: `modulo-diario/web-public` (acima).
