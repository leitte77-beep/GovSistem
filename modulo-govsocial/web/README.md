# GovSocial — Frontend do módulo Assistência Social (SUAS)

Frontend do módulo **Assistência Social** da plataforma GovSocial. SPA em
**React 18 + TypeScript + Vite**, montado como rota `/assistencia-social` na
shell do GovSocial. Consome a API `/api/govsocial/v1` (mesmo backend deste
repositório).

> Este README cobre a **FASE 1 — Design system, shell e navegação**.
> Escopo e regras: `../../planof.md` (frontend) e `../README.md` (backend).

## Stack

| Área | Tecnologia |
|---|---|
| App | React 18 · TypeScript · Vite |
| Rotas | React Router v6 (`basename=/assistencia-social`, code-splitting por rota) |
| Dados | TanStack Query · cliente HTTP próprio (RFC 9457, retry idempotente) |
| Formulários | React Hook Form · Zod (a partir da Fase 2) |
| Estilo | Tailwind mapeado sobre tokens CSS (`--ga-*`) |
| Ícones | lucide-react (tree-shakeable) |
| Mock | MSW (chaveável por env) |
| Catálogo | Storybook + addon-a11y |
| Testes | Vitest + Testing Library · Playwright + axe (e2e/acessibilidade) |

## Como rodar

```bash
cd modulo-govsocial/web
npm install
npx msw init public/ --save   # gera public/mockServiceWorker.js (uma vez)
```

### Com mock (sem backend) — recomendado para desenvolver UI
```bash
npm run dev:mock
# abre http://localhost:7401/assistencia-social/
```
O MSW intercepta `/api/govsocial/v1/*` e injeta um JWT falso com o perfil de
`VITE_MOCK_ROLE`. Troque o perfil no `.env` para ver a UI se remontar:

```
VITE_MOCK_ROLE=recepcao          # vê só Início, Famílias, Agenda & Fila
VITE_MOCK_ROLE=tecnico_superior  # (default) registra atendimento, concede benefício
VITE_MOCK_ROLE=coordenador_unidade
VITE_MOCK_ROLE=gestor_municipal  # dashboard, RMA, vigilância
```

### Com API real
```bash
# .env: VITE_API_MOCK=  (vazio)  |  VITE_API_URL=/api/govsocial/v1
npm run dev
```
O Vite faz proxy de `/api` para `http://localhost:8000` (a API do módulo). A
shell do GovSocial injeta o token via `?token=` na primeira carga; o módulo o
move para `sessionStorage` e limpa a URL (nenhum dado na URL).

### Outros comandos
```bash
npm run build         # build de produção (verifica orçamento de bundle)
npm run lint          # ESLint (jsx-a11y incluído), zero warnings
npm run typecheck     # tsc --noEmit
npm run test          # unitários (Vitest)
npm run test:e2e      # Playwright (sobe dev:mock automaticamente)
npm run storybook     # catálogo de componentes com estados
```

## Flags de ambiente

| Var | Efeito |
|---|---|
| `VITE_API_MOCK` | `1` liga o MSW (mock) e injeta token falso; vazio usa API real |
| `VITE_API_URL` | Origem da API real (default `/api/govsocial/v1`) |
| `VITE_MOCK_ROLE` | Perfil simulado no modo mock |

## O que a Fase 1 entrega

- **Design system** (tokens EXATOS do §2), tipografia (Archivo / Source Sans 3 /
  IBM Plex Mono), grade 8px, densidade **confortável/compacto** (persistida).
- **Tematização por tenant**: brasão + cor de destaque **apenas em decoração**,
  com **verificação de contraste** (reprovou AA → cai no padrão do produto).
- **Shell**: cabeçalho (brasão, nome do produto, **seletor de unidade** global
  persistido, **busca global** com atalho `/`, sino, usuário), **sidebar por
  perfil** e **início por perfil**.
- **Componentes base** (Storybook, com estados): Botão, Input, Select, Chip,
  Tabela, Modal, SlideOver, Toast, Skeleton, EstadoVazio, EstadoErro,
  EstadoSemPermissão, BarraOffline, Cadeado, Brasão.
- **Permissões**: `usePermissao('beneficio.conceder')`, `<Permitido>` (remove a
  subárvore — não desabilita), guardas de rota → página institucional de "sem
  acesso".
- **Cliente HTTP** único: token/tenant no interceptador, **RFC 9457 → pt-BR**,
  retry só em GET/idempotentes, header `Idempotency-Key` para mutações críticas.
- **Mock server (MSW)** fiel aos contratos, com fixtures do tenant "Nova
  Esperança" (CPF/NIS já mascarados) e um endpoint de erro para o EstadoErro.
- **Validadores BR** (CPF/NIS/CEP + máscaras) espelhando o backend, com testes.

## Árvore de rotas

```
/                    → /inicio
/inicio              → início por perfil
/familias            → (Fase 2)   guard: familia.ler
/familias/:id        → (Fase 3)   guard: familia.ler   (id = UUID, sem PII na URL)
/atendimentos        → (Fase 4)   guard: prontuario.ler
/agenda              → (Fase 7)
/beneficios          → (Fase 5)   guard: beneficio.conceder
/grupos              → (Fase 6)   guard: grupo.gerir
/encaminhamentos     → (Fase 7)   guard: encaminhamento.criar
/rma                 → (Fase 8)   guard: rma.conferir
/vigilancia          → (Fase 8)   guard: vigilancia.ver
/administracao       → (Fase 9)   guard: administracao.gerir
/imprimir/*          → layout A4 (sem shell)
/sem-acesso · *      → institucional / 404
```
As rotas de negócio são **stubs com os 5 estados** nesta fase; o conteúdo real
chega nas próximas.

## Estrutura de pastas

```
src/
  estilos/    tokens.css (§2), base.css (foco, reduced-motion, print)
  tema/       TenantTemaProvider, contraste (WCAG), densidade
  nucleo/     http (cliente, problemDetails, idempotencia), auth (sessao, jwt,
              tokenStorage), permissoes (matriz, hook, <Permitido>), query, offline
  ui/         componentes base + *.stories.tsx
  layout/     ShellModulo, Cabecalho, SeletorUnidade, Sidebar, GuardRota, LayoutImpressao
  paginas/    inicio/, SemAcesso, NaoEncontrada, _stubs/PaginaEmConstrucao
  contextos/  UnidadeAtualProvider, CarregadorUnidades
  mock/       browser/server, handlers, fixtures/, tokenFalso
  tipos/      DTOs que espelham o backend
  i18n/       textos.ts (pt-BR, vocabulário SUAS)
```

## Decisões relevantes

1. **JWT não traz `lotacoes[]`.** As claims do token têm `sub`, `roles[]` e
   `organization_id` (tenant). Nome e detalhes vêm de `/auth/me`; as **lotações**
   (para o sigilo por unidade) serão resolvidas por telas técnicas via
   profissionais nas fases seguintes (o backend já filtra por lotação). O
   `SessaoProvider` já deixa o campo `lotacoes` pronto.
2. **Sigilo desde o núcleo.** Nenhum conteúdo sensível é cacheado: o TanStack
   Query não persiste em disco e o cliente HTTP tem `semCache` para o
   `CartaoSigiloso` (Fase 3). Fixtures de atendimento vêm com
   `evolution_restrita: true` / `evolution_text: null`.
3. **Sem PII em URL, título de aba, console ou erro.** Título neutro fixo; regra
   ESLint `no-console` (permite só `warn`/`error`); mensagens de erro derivadas
   do Problem Details, sem dado pessoal.
4. **Acessibilidade como critério de aceite.** Foco visível global
   (`--ga-focus`), labels sempre visíveis, erros por `aria-describedby`, chips
   com texto (nunca só cor), `prefers-reduced-motion`, foco preso em
   Modal/SlideOver, link "pular para o conteúdo". Axe no e2e sem violações
   sérias.
5. **Orçamento de bundle.** Split por rota + vendor; shell inicial ~83 KB gzip
   (react ~53 + app ~16 + query ~9), bem abaixo do teto de 250 KB.
6. **Dependências.** Além do stack acordado, `@tanstack/react-virtual` já
   consta no `package.json` para a virtualização da Trilha/listas (Fase 3) — não
   é usada ainda na Fase 1.

## Definition of Done (Fase 1) — status

- [x] Componentes catalogados (Storybook) com estados
- [x] 5 estados de tela implementados (carregando, vazio, erro, offline, sem-permissão)
- [x] Zero violação séria no axe (e2e) · navegação por teclado verificada
- [x] Testes unitários das regras (CPF/NIS, Problem Details, contraste,
      permissões, JWT) + e2e do fluxo da fase passando (31 unit + 5 e2e)
- [x] Textos pt-BR (vocabulário SUAS); botões nomeiam a ação
- [x] Nenhum dado sensível em cache persistente, URL, console ou export
- [x] README da fase (este arquivo)

## Nota sobre a rota real na shell

Se a shell do GovSocial servir o módulo em outro caminho, ajuste `BASE` em
`vite.config.ts`, `BASENAME` em `src/App.tsx` e a `serviceWorker.url` do MSW em
`src/main.tsx` — todos apontam para `/assistencia-social`.

---

# FASE 2 — Busca global e cadastro de famílias/pessoas

Busca unificada onipresente e cadastro-base do município com detecção de
duplicata assistida.

## O que a Fase 2 entrega

- **`<BuscaGlobal>`** (no cabeçalho): typeahead com **debounce 300ms**,
  resultados **agrupados em Pessoas × Famílias**, **destaque do termo** (tolerante
  a acento/caixa), navegação por teclado (↑/↓/Enter/Esc) e `role=combobox`/
  `listbox` acessíveis. Enter sem seleção abre a página de resultados.
- **Página de resultados** (`/familias?q=`): grupos Pessoas × Famílias, chips de
  situação (respeitando permissão), CPF/NIS **mascarados**, idade calculada, e os
  **5 estados** (carregando/vazio/erro/offline/sem-permissão). A caixa central
  convidativa aparece quando não há termo.
- **`<CampoCPF>` / `<CampoNIS>`**: máscara progressiva e **validação de dígito
  verificador em tempo real** (mesmo algoritmo do backend), com feedback textual
  (não só cor). Exibem o número completo — uso restrito a telas de edição.
- **Cadastro de família + responsável** (`/familias/nova`): React Hook Form +
  **Zod** (espelha as validações do backend), **busca de CEP** (ViaCEP) que
  preenche o endereço, **nome social com precedência** de exibição, e o **fluxo
  de duplicata ANTES de criar**: cria o responsável → se o backend retorna
  candidatos (`created=false`), abre o `ModalDuplicata` para "usar existente" ou
  "criar mesmo assim" (com **justificativa obrigatória**) → então cria a família
  e vincula o responsável.

## Componentes e arquivos novos

```
src/
  layout/BuscaGlobal.tsx           typeahead agrupado (integrado ao Cabecalho)
  ui/CampoCPF.tsx, CampoNIS.tsx    máscara + DV em tempo real
  ui/Checkbox.tsx, DestaqueTermo.tsx
  paginas/familias/
    ResultadosBusca.tsx            busca e resultados (5 estados)
    FamiliaFormulario.tsx          cadastro (RHF + Zod + CEP + dedup)
    ModalDuplicata.tsx             decisão usar existente / criar mesmo assim
    esquemaFamilia.ts              schema Zod compartilhado
  nucleo/api/pessoas.ts            serviços (search, persons, families, cep)
  nucleo/api/hooks.ts             hooks TanStack Query
  nucleo/useDebounce.ts, datas.ts idade/formatos
  i18n/dominios.ts                enums pt-BR (sexo, parentesco, faixa de renda…)
  tipos/pessoas.ts                DTOs espelhando o backend
  mock/fixtures/store.ts          store em memória do mock (dedup, criação)
```

## Endpoints consumidos (contratos do backend)

- `GET /search?q=` → `UnifiedSearchItem[]` (CPF/NIS mascarados)
- `POST /persons` → `PersonCreateResult` (`created=false` + `duplicates[]` quando
  há possível duplicata; **409** para CPF/NIS já em uso)
- `POST /families` → `FamilyOut`
- `POST /families/{id}/members` → vincula o responsável (`definir_responsavel`)
- `GET /families/{id}` → `FamilyOut`

## Decisões

1. **Dedup no lugar certo.** A unicidade dura de CPF/NIS retorna **409** (tratado
   como erro amigável); a duplicata "fraca" (nome+nascimento) volta como
   `created=false` e é resolvida pelo `ModalDuplicata` **antes** de qualquer
   escrita de família — nada é criado até a decisão do usuário.
2. **CEP via ViaCEP** apenas para preencher endereço (sem dado pessoal); falha de
   rede degrada para preenchimento manual, sem travar o cadastro.
3. **`@hookform/resolvers` + `zod`** adicionados (stack de formulários já
   acordado). O chunk do formulário é lazy (~28 KB gzip), fora do bundle inicial.
4. **Sem PII na URL.** A navegação usa UUIDs; o `?q=` da busca é o termo digitado
   pelo próprio usuário (não um identificador persistido).

## Testes da fase

- **Unitários** (Vitest): `<CampoCPF>`/`<CampoNIS>` (máscara + DV em tempo real),
  `esquemaFamilia` (Zod), dedup do store. Total do projeto: **43 testes**.
- **E2E** (Playwright + axe): busca→resultados agrupados; estado vazio convida a
  cadastrar; **cadastro com alerta de duplicidade → criar mesmo assim**; axe sem
  violações sérias no cadastro. Total: **10 e2e**.

## Definition of Done (FASE 2) — status

- [x] `<BuscaGlobal>` com debounce, agrupamento, destaque e teclado
- [x] Página de resultados com chips por permissão e 5 estados
- [x] `<CampoCPF>`/`<CampoNIS>` com DV em tempo real (testados)
- [x] Nome social com precedência de exibição
- [x] Busca de CEP preenchendo endereço
- [x] Fluxo de duplicata antes de criar (usar existente / criar com justificativa)
- [x] Zero violação séria no axe · navegação por teclado
- [x] Textos pt-BR (vocabulário SUAS); botões nomeiam a ação
- [x] CPF/NIS mascarados em listagens; nenhum dado sensível em URL/console
- [x] tsc, ESLint (0), 43 unit + 10 e2e verdes; build ok

---

# FASE 3 — Ficha da família, Trilha e sigilo

A tela mais importante do módulo: prontuário familiar com cabeçalho fixo, abas
por permissão, a **Trilha** (assinatura visual) e o **sigilo visível**.

## O que a Fase 3 entrega

- **`<CabecalhoFamilia>`** fixo (sticky): responsável, código, território, chips
  de situação (PBF, CadÚnico, BPC, insegurança alimentar) e **ações por perfil**
  (Registrar atendimento, Conceder benefício, Encaminhar, Adicionar membro,
  Imprimir prontuário) — cada ação some via `<Permitido>` quando o perfil não
  pode agir.
- **`<TrilhaFamilia>`** — timeline **virtualizada** (`@tanstack/react-virtual`),
  glifo + cor por tipo de serviço (PAIF/SCFV/PAEFI/MSE/Benefício/Encaminhamento/
  Visita), **agrupada por mês** em ordem decrescente. Eventos de **outras
  unidades** aparecem como existência ("Atendimento em CREAS — conteúdo restrito
  à unidade"), **sem conteúdo** (visão de rede).
- **`<CartaoSigiloso>`** — conteúdo sensível **velado** (desfoque + cadeado +
  "sua visualização será registrada"). A revelação é um clique consciente que
  chama o **endpoint dedicado** do atendimento (o backend audita como
  `READ_SENSIVEL`). O conteúdo revelado vive **só no estado da tela** e é apagado
  ao desmontar — nunca em cache persistente, localStorage ou estado global. Se a
  política negar (`evolution_restrita`), mostra aviso de restrição.
- **`<Abas>`** (ARIA tablist, navegação por setas): Trilha · Composição familiar
  · Atendimentos · Benefícios · Encaminhamentos. **Abas sensíveis não são
  renderizadas** quando o perfil não tem a capacidade (§4.2).
- **Impressão A4** do Prontuário SUAS (`/imprimir/prontuario/:id`) no
  `LayoutImpressao` com brasão do tenant. A **evolução técnica não é impressa**
  nesta via (respeita o sigilo); o PDF oficial numerado é gerado pelo backend.

## Arquivos novos

```
src/
  ui/CartaoSigiloso.tsx, Abas.tsx
  paginas/familias/
    FichaFamilia.tsx          ficha (cabeçalho + abas + trilha)
    CabecalhoFamilia.tsx      cabeçalho fixo com ações por perfil
    TrilhaFamilia.tsx         timeline virtualizada + CartaoSigiloso
    montarTrilha.ts           combina timeline + visão de rede, agrupa por mês
    eventos.ts                tipo de evento → cor/glifo/rótulo
    ProntuarioImpressao.tsx   via A4 (sem evolução)
  nucleo/api/prontuario.ts    serviços (case-files, timeline, atendimento, rede)
  tipos/prontuario.ts         DTOs espelhando o backend
  mock/fixtures/prontuario.ts fixtures de trilha (legível, reforçado, outra unid.)
```

## Endpoints consumidos

- `GET /case-files?family_id=` → prontuários da família (filtrado por lotação no
  backend para técnicos)
- `GET /case-files/{id}/timeline` → `TimelineItem[]` (sem evolução; traz
  `pode_ler_evolucao`)
- `GET /case-files/{id}/attendances/{aid}` → `AttendanceOut` (evolução só quando
  concedida; `semCache: true` no cliente — auditada no backend)
- `GET /case-files/family/{id}/network` → `NetworkViewItem[]` (existência sem
  conteúdo)

## Decisões

1. **Sigilo por construção.** A Trilha/timeline nunca recebem o texto da
   evolução; ele só é buscado pelo `<CartaoSigiloso>` sob demanda, com
   `Cache-Control: no-store` e sem entrar no cache do TanStack Query. Ao sair da
   tela, o estado é limpo.
2. **Visão de rede sem vazamento.** `montarTrilha` deduplica por
   unidade+data+serviço: unidades acessíveis vêm da timeline (com conteúdo
   revelável); as demais entram apenas como existência, a partir da visão de rede.
3. **Acessibilidade da timeline.** A Trilha usa `role="region"` rolável com
   `article` por evento (o `role="feed"` foi descartado porque só admite filhos
   `article`, incompatível com os cabeçalhos de mês). Zero violação séria no axe.
4. **Impressão respeita sigilo.** A via A4 do front não imprime evolução; o
   documento oficial numerado/auditado continua sendo gerado pelo backend.

## Testes da fase

- **Unitários** (Vitest): `montarTrilha` (agrupamento, dedup, visão de rede),
  `eventos` (classificação por serviço/visita), `<CartaoSigiloso>` (velado →
  revelar → conteúdo; caso restrito). Total do projeto: **53 testes**.
- **E2E** (Playwright + axe): busca → ficha → cabeçalho fixo; trilha com evento
  de outra unidade sem conteúdo; **revelar sigiloso com aviso de auditoria**;
  abas sensíveis + composição familiar; axe sem violações sérias. Total: **15
  e2e** (fases 1–3).

## Definition of Done (FASE 3) — status

- [x] `<CabecalhoFamilia>` fixo com chips e ações por perfil (via `<Permitido>`)
- [x] `<TrilhaFamilia>` virtualizada, glifo/cor por tipo, paginação por mês
- [x] Visão de rede: existência de evento de outra unidade sem conteúdo
- [x] `<CartaoSigiloso>` com revelação sob demanda + auditoria; sem cache
      persistente do conteúdo sensível
- [x] Abas sensíveis não renderizam sem permissão
- [x] Botão "Imprimir prontuário" → rota A4 (sem evolução)
- [x] 5 estados de tela; zero violação séria no axe; navegação por teclado
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 53 unit + 15 e2e; build ok

---

# FASE 4 — Registro de atendimento (fluxo ≤ 2 min)

SlideOver sobre a ficha da família para registrar atendimento com o mínimo de
cliques, autosave agressivo e funcionamento offline.

## O que a Fase 4 entrega

- **SlideOver "Registrar atendimento"** (`RegistrarAtendimento`): data/hora
  pré-preenchidas, serviço (tipificados da unidade via `/service-types`), tipo
  (Individual/Familiar/Visita/Coletivo), `<SeletorMembros>` por chips,
  `<EditorEvolucao>` e sigilo (padrão | reforçado 🔒). Abre sobre a ficha, sem
  perder o contexto.
- **`<EditorEvolucao>`** — rich-text mínimo (negrito/itálico/lista) sem
  dependência externa (contentEditable), com **status de autosave visível**
  ("Rascunho salvo às 14:32").
- **`<SeletorMembros>`** — chips da composição familiar por toque (alvo ≥ 40px,
  `aria-pressed`).
- **Autosave em IndexedDB** por **usuário + registro** (§9): rascunho é salvo com
  debounce enquanto se digita e **recuperado automaticamente ao reabrir** o
  painel. Apagado após envio bem-sucedido.
- **Offline-first** (§9/§10): sem conexão (ou falha de rede no envio), o
  atendimento entra na **fila de sincronização** (IndexedDB) com **chave de
  idempotência** e é enviado ao reconectar. A `<BarraOffline>` mostra o número de
  pendentes; conflito (409) = **servidor vence**, preservando o rascunho local.
- **Ações encadeadas pós-salvar** (§4.3): "Salvar e encaminhar", "Salvar e
  conceder benefício", "Salvar e agendar retorno" — já vinculadas à família
  (benefício navega para `/beneficios?familia=…`).

## Arquivos novos

```
src/
  nucleo/offline/
    indexedDb.ts          wrapper mínimo (rascunhos + fila; fallback em memória)
    rascunhos.ts          rascunho por usuário+tipo+registro
    filaSync.ts           fila de operações offline (idempotência própria)
    processarFila.ts      envio ao reconectar (servidor vence / preserva rascunho)
    SincronizacaoProvider.tsx  pendentes + auto-sync ao reconectar
  nucleo/api/atendimento.ts    service-types, resolverProntuario, criarAtendimento
  ui/EditorEvolucao.tsx        rich-text mínimo + autosave visível
  paginas/familias/
    SeletorMembros.tsx         chips de membros por toque
    RegistrarAtendimento.tsx   SlideOver do fluxo ≤ 2 min
  tipos/dominios.ts            DTOs de service/referral/benefit types
```

## Fluxo de gravação (importante)

O `POST /case-files/{id}/attendances` exige um **prontuário** (família + unidade
+ serviço). O SlideOver resolve isso em `resolverProntuario`: reaproveita o
prontuário existente ou cria um novo (`POST /case-files`), tratando o **409 "já
existe"** como sucesso (busca o existente — seguro contra corrida). A mutação de
criação envia `Idempotency-Key` (§14) e o botão bloqueia duplo submit.

## Decisões

1. **Editor sem dependência nova.** Um contentEditable com `execCommand`
   (negrito/itálico/lista) atende ao "editor simples" do plano sem inflar o
   bundle; o HTML é sanitizado pelo backend.
2. **Sensível fora do cache.** O rascunho pode conter evolução; fica só no
   IndexedDB do dispositivo, indexado por usuário, e é removido após o envio.
   Nada vai para o query-cache nem para storages de terceiros.
3. **Idempotência dupla.** Cada item da fila carrega uma chave fixa; o envio
   online gera a sua. Assim, reenvios (online ou pós-reconexão) não duplicam o
   atendimento.
4. **Degradação graciosa de IndexedDB.** Em jsdom/SSR há um fallback em memória,
   permitindo testar a lógica de rascunho/fila sem navegador.

## Testes da fase

- **Unitários** (Vitest): rascunhos (salvar/ler/apagar, isolamento por usuário),
  fila de sincronização (enfileirar/contar/remover), `<EditorEvolucao>` (toolbar
  acessível + status de autosave), `<SeletorMembros>` (aria-pressed). Total do
  projeto: **63 testes**.
- **E2E** (Playwright + axe): registrar atendimento pelo SlideOver; **fluxo feliz
  cronometrado < 2 min**; ação encadeada "conceder benefício" navega vinculada;
  axe sem violações sérias no SlideOver. Total: **19 e2e** (fases 1–4).

## Definition of Done (FASE 4) — status

- [x] SlideOver de atendimento sobre a ficha (contexto preservado)
- [x] Data/hora pré-preenchidas, serviço tipificado, tipo, membros por chips
- [x] `<EditorEvolucao>` com autosave visível; rascunho em IndexedDB recuperável
- [x] Sigilo padrão/reforçado
- [x] Offline completo: fila de sincronização + idempotência + servidor vence
- [x] Ações encadeadas pós-salvar já vinculadas
- [x] E2E cronometrando o fluxo feliz (< 2 min); zero violação séria no axe
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 63 unit + 19 e2e; build ok

---

# FASE 5 — Benefícios eventuais

Concessão de benefícios eventuais com antiduplicidade em primeiro plano, fluxo
de aprovação e entrega auditada com comprovante.

## O que a Fase 5 entrega

- **Tela em duas colunas** (`/beneficios?familia=<uuid>`): à esquerda o
  formulário de concessão (tipo → quantidade → parecer); à direita o **histórico
  da família na rede**.
- **Alerta de duplicidade em destaque âmbar** (§4.4): calculado a partir do
  histórico e da janela do tipo (`periodicidade_max_dias`) — ex.: "Cesta básica
  concedida há 12 dias… janela mínima: 30 dias". Exige **justificativa** antes de
  conceder novamente; o backend ainda bloqueia com 409 (defesa em profundidade).
- **`<FluxoStatus>`** — linha de aprovação acessível (Solicitado → Parecer →
  Aprovação → Entrega), com `aria-current` na etapa atual e estado de
  negado/cancelado.
- **`PainelConcessao`** — progressão do status: parecer técnico (restrito) →
  aprovar/negar → **entrega**. A entrega envia **chave de idempotência** e
  bloqueia duplo submit (§14).
- **`<AssinaturaCanvas>`** — assinatura na tela (opcional) via pointer events
  (mouse/toque/caneta), com limpar e rótulos acessíveis.
- **Comprovante A4** (`/imprimir/comprovante/:id`) com brasão do tenant;
  reimpressão sinalizada como auditada. O comprovante oficial numerado é gerado
  pelo backend.
- **Aba "Benefícios" da ficha** agora lista o histórico real da família.

## Arquivos novos

```
src/
  ui/FluxoStatus.tsx, fluxoConcessao.ts   linha de etapas + mapeamento de status
  ui/AssinaturaCanvas.tsx                 assinatura opcional (canvas)
  paginas/beneficios/
    BeneficiosConcessao.tsx    tela em duas colunas (form + histórico)
    PainelConcessao.tsx        fluxo de status + entrega + comprovante
    HistoricoBeneficios.tsx    lista de concessões da família
    AlertaDuplicidade.tsx      alerta âmbar de janela mínima
    ComprovanteImpressao.tsx   via A4 do comprovante
    duplicidade.ts             regra de antiduplicidade (testável)
    rotulos.ts                 código de benefício → rótulo pt-BR
  nucleo/api/beneficios.ts     serviços (tipos, concessões, transições)
  tipos/beneficios.ts          DTOs espelhando o backend
  mock/fixtures/beneficios.ts  store com cesta básica entregue há 12 dias
```

## Endpoints consumidos

- `GET /benefit-types` → tipos com `periodicidade_max_dias`
- `GET /benefit-concessions?family_id=` → histórico da família
- `POST /benefit-concessions` → solicita (409 se duplicidade)
- `POST /benefit-concessions/{id}/analyze|approve|deny|deliver` → transições
- `GET /benefit-concessions/{id}` → detalhe (parecer sensível quando concedido)

## Decisões

1. **Duplicidade avisada antes, bloqueada no backend.** A UI calcula o aviso
   âmbar a partir do histórico + janela do tipo e pede justificativa; a garantia
   final continua no servidor (409), evitando corrida e divergência de relógio.
2. **Entrega idempotente.** `deliver` envia `Idempotency-Key` e o botão bloqueia
   duplo submit — clique duplo não gera duas baixas de estoque.
3. **Parecer é sensível.** Editado num campo marcado como restrito; no detalhe,
   só vem quando a política concede (`parecer_restrito`).
4. **Assinatura opcional e sem dependência.** Canvas com pointer events; não
   bloqueia o fluxo por teclado (a entrega funciona sem assinar).

## Testes da fase

- **Unitários** (Vitest): `avaliarDuplicidade` (dentro/fora da janela, status que
  contam, sem janela, tipo diferente), `<FluxoStatus>` e `indiceStatusConcessao`.
  Total do projeto: **71 testes**.
- **E2E** (Playwright + axe): duas colunas + histórico; **alerta de duplicidade +
  justificativa**; concessão sem duplicidade avançando Solicitado→Entrega com
  comprovante; axe sem violações sérias. Total: **23 e2e** (fases 1–5).

## Definition of Done (FASE 5) — status

- [x] Tela em duas colunas (concessão + histórico na rede)
- [x] Alerta de duplicidade âmbar com janela mínima e justificativa
- [x] `<FluxoStatus>` acessível (Solicitado → Parecer → Aprovação → Entrega)
- [x] Entrega com idempotência + comprovante A4 (brasão) + assinatura opcional
- [x] Reimpressão sinalizada como auditada
- [x] Parecer tratado como conteúdo restrito
- [x] Zero violação séria no axe; navegação por teclado
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 71 unit + 23 e2e; build ok

---

# FASE 6 — Grupos, SCFV e frequência

Gestão de grupos e serviços de convivência (SCFV) e a **chamada de frequência
mobile-first**, feita no pátio, no celular, com conexão ruim — 100% offline com
fila de sincronização.

## O que a Fase 6 entrega

- **Lista de grupos** (`/grupos`): cartões dos grupos/SCFV da **unidade atual**
  (contexto global do cabeçalho), com serviço tipificado, periodicidade, local e
  ocupação (inscritos/vagas). Os **5 estados** de tela
  (carregando/vazio/erro/offline/sem-permissão).
- **Detalhe do grupo** (`/grupos/:id`): cabeçalho do grupo (público-alvo,
  periodicidade, dia/horário, local, vagas), lista de **participantes** com
  status da inscrição (Ativa / Lista de espera / Desligada) e a lista de
  **encontros**. Os nomes dos participantes são resolvidos por
  `GET /persons/{id}` — a inscrição só carrega `person_id` (sigilo/normalização).
- **`<GradeFrequencia>`** — chamada mobile-first (§4.5): alvo de toque ≥ 48px,
  estado **tri-valorado** por participante (Presente / Falta / Justificada) com
  `radiogroup` acessível, **contador no topo** (`aria-live`), campo de
  justificativa opcional, e **"repetir lista do último encontro"** (aplica a
  frequência do encontro anterior). Ao encerrar: resumo
  "N presentes · N faltas · N justificadas".
- **Offline-first** (§9/§10): sem conexão (ou falha de rede no envio), a chamada
  entra na **fila de sincronização** (IndexedDB) com **chave de idempotência** e
  é enviada ao reconectar. A `<BarraOffline>` mostra os pendentes; conflito
  (409) = **servidor vence**. A fila já tratava `registrar_frequencia` desde a
  Fase 4 (infra offline compartilhada).

## Arquivos novos

```
src/
  paginas/grupos/
    GruposLista.tsx          lista de grupos da unidade (5 estados)
    GrupoDetalhe.tsx         participantes + encontros + chamada
    GradeFrequencia.tsx      chamada mobile-first offline-first (já existia)
    GradeFrequencia.stories.tsx
    frequenciaEstado.ts      estado tri-valorado ↔ DTO do backend (já existia)
    frequenciaEstado.test.ts
    rotulos.ts               rótulos pt-BR (periodicidade, status, dia da semana)
  nucleo/api/grupos.ts       serviços (ações, inscrições, encontros, frequência)
  nucleo/offline/frequenciaFila.test.ts
  tipos/grupos.ts            DTOs espelhando o backend
  mock/fixtures/grupos.ts    store do mock (2 grupos, 2 inscritos, 2 encontros)
```

## Endpoints consumidos (contratos do backend)

- `GET /acoes-coletivas?unit_id=` → grupos da unidade
- `GET /acoes-coletivas/{id}` → detalhe do grupo
- `GET /acoes-coletivas/{id}/enrollments` → inscrições (só `person_id`)
- `POST /acoes-coletivas/{id}/enrollments` → inscreve (409 se já inscrita)
- `GET /acoes-coletivas/{id}/meetings` → encontros
- `POST /acoes-coletivas/{id}/meetings` → cria encontro
- `GET /acoes-coletivas/{id}/meetings/{eid}/attendance` → frequência do encontro
- `POST …/attendance` → **upsert em lote** da frequência (idempotente por header)
- `GET /persons/{id}` → resolve o nome de exibição do participante

## Decisões

1. **Nome do participante fora da inscrição.** O backend não devolve o nome na
   inscrição; a tela resolve por `GET /persons/{id}` (paralelizado com
   `useQueries`). Mantém o contrato enxuto e evita duplicar PII nos payloads de
   grupo.
2. **Frequência é upsert em lote.** O `estadoParaRegistro` mapeia o tri-estado da
   UI para o par `presente:bool` + `justificativa` do DTO (PRESENTE →
   `true/null`; FALTA → `false/null`; JUSTIFICADA → `false/"texto"`). O envio é
   uma única requisição com todos os registros — combina com um item de fila
   offline.
3. **Offline reaproveita a infra da Fase 4.** `registrar_frequencia` já era um
   tipo de operação da fila; a Fase 6 só ligou a UI. Conflito (409) descarta o
   item ("servidor vence"); erro de rede retém para nova tentativa.
4. **Contraste antes de cor semântica.** O chip do serviço usa `primario` (verde
   AA) em vez do tom `scfv` decorativo (reprova AA em texto pequeno) — o SCFV
   continua identificado por texto, nunca só por cor.

## Testes da fase

- **Unitários** (Vitest): `frequenciaEstado` (mapeamento tri-estado ↔ DTO,
  resumo, ida e volta) e a **fila offline de `registrar_frequencia`**
  (envio com chave de idempotência, retenção em erro de rede, descarte em 409).
  Total do projeto: **85 testes**.
- **E2E** (Playwright + axe): lista → detalhe com participantes por nome;
  **chamada offline → sincronizar ao reconectar** (fluxo-chave 4); axe sem
  violações sérias na chamada. Total: **26 e2e** (fases 1–6).

## Definition of Done (FASE 6) — status

- [x] Lista de grupos por unidade com 5 estados
- [x] Detalhe com participantes (nome resolvido) e encontros
- [x] `<GradeFrequencia>` tri-estado, alvo ≥ 48px, contador e "repetir último"
- [x] Chamada 100% offline com fila + idempotência (servidor vence em conflito)
- [x] Handlers MSW + fixtures fiéis aos contratos (grupos/inscrições/encontros/frequência)
- [x] Stories da `<GradeFrequencia>`; sem PII em URL/console
- [x] Zero violação séria no axe; navegação por teclado
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 85 unit + 26 e2e; build ok

---

# FASE 7 — Agenda & Fila do dia e Encaminhamentos

Duas telas operacionais do dia a dia: a **Fila do dia** em kanban (recepção move
o cidadão pelas colunas) e o **Painel de encaminhamentos** (recebidos/enviados),
com contrarreferência sigilosa e guia A4 para a rede externa.

## O que a Fase 7 entrega

- **Agenda & Fila do dia** (`/agenda`): duas visões em abas.
  - **Fila do dia** — kanban de 3 colunas (Aguardando → Em atendimento →
    Concluído). Cada cartão mostra nome (resolvido por `GET /persons/{id}`),
    senha, motivo **não sensível** e o **tempo de espera** com cor de urgência
    (normal/atenção/crítica) sempre acompanhada de texto. **Check-in** com um
    clique (AGENDADO → AGUARDANDO), **chamar** (→ EM_ATENDIMENTO) e **concluir**.
  - **Agenda do dia** — lista por horário com senha, tipo e status.
- **Painel de encaminhamentos** (`/encaminhamentos`): duas listas em abas.
  - **Recebidos** — aceitar / recusar (com motivo) quando pendente; **registrar
    devolutiva** (contrarreferência) quando aceito.
  - **Enviados** — idade em dias com **âmbar após o prazo** (30 dias);
    para externos, **gerar ofício** e **imprimir guia**.
- **Detalhe do encaminhamento** (`/encaminhamentos/:id`): `<FluxoStatus>`
  (Solicitado → Aceite → Devolutiva | Solicitado → Ofício gerado), dados de
  origem/destino e a **devolutiva velada** no `<CartaoSigiloso>` (revelação
  consciente, auditada no backend; sem cache persistente).
- **Guia A4** (`/imprimir/guia/:id`) no `LayoutImpressao` com brasão do tenant.
  A guia oficial numerada é gerada pelo backend; a devolutiva sigilosa **nunca**
  entra na guia.

## Arquivos novos

```
src/
  paginas/agenda/
    AgendaFila.tsx               abas Fila (kanban) + Agenda do dia
    CartaoFila.tsx               cartão da fila (espera + urgência + ações)
    CartaoFila.stories.tsx
    PainelEncaminhamentos.tsx    abas Recebidos / Enviados
    ItemEncaminhamento.tsx       cartão + modais de recusa e devolutiva
    EncaminhamentoDetalhe.tsx    fluxo de status + devolutiva sigilosa
    GuiaImpressao.tsx            guia A4 do encaminhamento externo
    tempo.ts                     espera/urgência/idade/atraso (testável)
    tempo.test.ts
    rotulos.ts                   rótulos pt-BR (status, tipo)
  nucleo/api/agenda.ts           agenda, fila do dia, recepção
  nucleo/api/encaminhamentos.ts  encaminhamentos + workflow
  tipos/agenda.ts, tipos/recepcao.ts, tipos/encaminhamentos.ts
  mock/fixtures/agenda.ts        4 agendamentos cobrindo as 3 colunas
  mock/fixtures/encaminhamentos.ts  enviados/recebidos (um atrasado, um aceito)
```

## Endpoints consumidos (contratos do backend)

- `GET /appointments?unit_id=&data=` → agenda do dia
- `GET /appointments/daily-queue?unit_id=` → fila (AGENDADO/AGUARDANDO)
- `PATCH /appointments/{id}` → check-in / concluir (muda status)
- `POST /appointments/{id}/call` → chamar (→ EM_ATENDIMENTO)
- `GET /encaminhamentos?unit_id=` (enviados) · `?destino_id=` (recebidos)
- `GET /encaminhamentos/{id}` → detalhe (devolutiva sensível; `semCache`)
- `POST …/accept | …/reject | …/return | …/generate-office | …/cancel` → workflow

## Decisões

1. **Fila é dado volátil.** As consultas da fila têm `staleTime` curto e
   `refetchInterval` (a recepção precisa ver o quadro atual); as mutações
   invalidam as chaves `fila-dia`/`agenda` para refletir na hora.
2. **Motivo na fila nunca é sensível.** O cartão mostra apenas o campo
   `observacoes`/`motivo` (texto curto operacional). Nome vem de
   `GET /persons/{id}`, não do payload da agenda — nenhuma PII trafega no
   contrato de agenda.
3. **Contrarreferência é sigilosa.** A devolutiva só aparece no detalhe, velada
   no `<CartaoSigiloso>` (revelação consciente e auditada). Não entra em
   listagens nem na guia impressa.
4. **Urgência com texto, não só cor.** O tempo de espera exibe "Espera: 40 min"
   e a faixa de urgência é derivada em `tempo.ts` (≥30 atenção, ≥60 crítica) —
   testável e independente de relógio global.
5. **Atraso do encaminhamento.** `encaminhamentoAtrasado` marca âmbar quando um
   enviado (PENDENTE/ACEITO/ENVIADO/OFICIO_GERADO) passa do prazo de devolutiva
   (30 dias, parametrizável), respeitando a defesa em profundidade do backend.

## Testes da fase

- **Unitários** (Vitest): `tempo.ts` — `minutosDeEspera`, `formatarEspera`,
  `urgenciaEspera`, `idadeEmDias` e `encaminhamentoAtrasado` (dentro/fora do
  prazo, finalizados, prazo customizado). Total do projeto: **96 testes**.
- **E2E** (Playwright + axe): kanban com 3 colunas; **check-in → chamar**;
  painel de encaminhamentos com **registro de devolutiva**; enviados sinaliza
  **fora do prazo**; axe sem violações sérias nas duas telas. Total: **32 e2e**
  (fases 1–7).

## Definition of Done (FASE 7) — status

- [x] Fila do dia em kanban (Aguardando → Em atendimento → Concluído)
- [x] Check-in com um clique; chamar e concluir por cartão
- [x] Tempo de espera com urgência (cor + texto); nome via `/persons/{id}`
- [x] Painel Recebidos/Enviados; aceitar/recusar/devolutiva
- [x] Idade em dias com âmbar após o prazo; gerar ofício + guia A4 (externo)
- [x] Devolutiva (contrarreferência) tratada como sigilosa (`<CartaoSigiloso>`)
- [x] Handlers MSW + fixtures fiéis aos contratos; sem PII em URL/console
- [x] Stories dos cartões; zero violação séria no axe; navegação por teclado
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 96 unit + 32 e2e; build ok

---

# FASE 8 — RMA (§4.8) + Vigilância/Dashboard (§4.9)

Duas telas de gestão: a **conferência e fechamento do RMA** (a tela ⭐ do plano,
com números conferíveis, drill-down e assinatura de fechamento) e o **dashboard
do gestor** com mapa territorial e indicadores agregados.

## O que a Fase 8 entrega

### 8A — Conferência e fechamento do RMA (`/rma`)

- **Escolha da competência** (ano/mês) sobre a **unidade do cabeçalho**;
  `POST /rma/calculate` calcula ou devolve o existente (idempotente, POST com
  query params e **sem corpo**).
- **`<NumeroRMA>`** (biblioteca §5): valor em `IBM Plex Mono`, **lupa de
  drill-down** (abre a lista exata de registros que compõem o número, com link
  para cada origem — **sem PII**, só referências) e estado **"ajustado"** (chip
  âmbar + valor calculado riscado + leitura por leitor de tela).
- **`<RmaBloco>`** agrupa os números por bloco (CRAS_A/CRAS_C/CRAS_D, CREAS…).
  O `normalizarBlocos` aceita **os dois shapes** de `dados_calculados`:
  dicionário-de-dicionários (backend real) e dicionário-de-listas (fixture
  legada), derivando rótulos legíveis dos códigos do MDS.
- **`ModalAjuste`** — ajuste manual com **justificativa obrigatória** (o backend
  recusa com 422 se o RMA já estiver fechado; defesa em profundidade).
- **`<FluxoStatus>`** (Cálculo → Conferência → Fechado) + chip de situação.
- **Fechar o mês** exige `rma.fechar` (o plano diz "gestor assina"), mostra
  **confirmação com consequências** ("os registros ficam travados"), envia
  **chave de idempotência** e bloqueia duplo submit. Pós-fechamento: **banner de
  somente leitura** + **"solicitar reabertura"** (motivo obrigatório → REABERTO).
- **Exportações**: CSV (download via `http.getTexto`) e **PDF espelho A4**
  (`/imprimir/rma/:id`) no `LayoutImpressao`, com os números ajustados marcados.

### 8B — Dashboard do gestor + mapa (`/vigilancia`)

- **Cartões grandes** (Archivo 32): atendimentos no mês, acompanhamentos ativos,
  benefícios concedidos, encaminhamentos pendentes (âmbar quando > 0).
- **Série de 12 meses** (`<GraficoBarras>` em SVG puro) e **distribuição por
  benefício** (`<GraficoDonut>` em SVG puro) — ambos com **rótulos textuais**
  (nunca só cor): a legenda traz valor + percentual e o SVG é `role="img"` com
  `aria-label` resumido.
- **`<MapaTerritorial>`** — calor agregado por território (bolhas proporcionais)
  a partir dos **centroides**; a **tabela de territórios** ao lado é a fonte de
  dados acessível (o SVG é decoração). A camada de **pinos identificados** só é
  oferecida a quem tem `vigilancia.pinos`; ativá-la exibe **aviso de auditoria**.
- **Indicadores sociais** (PBF %, BPC %, CadÚnico desatualizado, insegurança
  alimentar) + donut de **faixa de renda**.
- **Versão para impressão** A4 (`/imprimir/dashboard`) — anexo de prestação de
  contas, só agregados.

## Arquivos novos

```
src/
  ui/NumeroRMA.tsx                         valor + lupa + "ajustado" (biblioteca §5)
  nucleo/api/rma.ts, dashboard.ts          serviços (calculate/adjust/close/…, dashboard)
  paginas/rma/
    RmaConferencia.tsx                     página (competência + blocos + fechar)
    RmaBloco.tsx, ModalAjuste.tsx, ModalDrillDown.tsx
    RmaEspelhoImpressao.tsx                via A4 do espelho
    rmaModelo.ts (+ .test.ts)              normalizar blocos, status→fluxo (puro)
  paginas/vigilancia/
    DashboardGestor.tsx                    página (cartões + gráficos + mapa)
    CartaoIndicador.tsx, GraficoBarras.tsx, GraficoDonut.tsx, MapaTerritorial.tsx
    DashboardImpressao.tsx                 via A4 do dashboard
    graficos.ts (+ .test.ts)               fatias/barras/projeção do mapa (puro)
  tipos/rma.ts, dashboard.ts               DTOs espelhando o backend
  mock/fixtures/rma.ts, dashboard.ts       stores/fixtures (RMA com ajuste em C4)
```

## Endpoints consumidos (contratos do backend)

- `GET /rma?unit_id=&ano=&status=` · `POST /rma/calculate?unit_id=&ano=&mes=`
- `GET /rma/{id}` · `POST /rma/{id}/adjust|close|reopen` · `GET /rma/{id}/export`
- `GET /rma/{id}/drilldown?bloco=&campo=` (drill-down; mockado no MSW)
- `GET /dashboard/overview|time-series|by-territory|map|benefits-report|indicators`

## Decisões

1. **Sem MapLibre.** Para respeitar o orçamento de bundle (≤ 250 KB gzip
   inicial), o mapa é um **SVG coroplético de bolhas** projetado dos centroides
   (`projetarMapa`), não uma biblioteca de mapas. A tabela de territórios é a
   fonte acessível; o SVG é decorativo (`aria-hidden`). As rotas de Fase 8
   ficaram pequenas (RMA ~5 KB gzip, dashboard ~3,7 KB gzip).
2. **Gráficos sem dependência.** Barras e donut são SVG puro (como o
   `EditorEvolucao`/`AssinaturaCanvas` evitaram libs). Percentuais e projeção do
   mapa são **funções puras testáveis** (`graficos.ts`).
3. **`dados_calculados` polimórfico.** `normalizarBlocos` trata dicionário e
   lista; o mock usa o shape REAL do backend (CRAS_A/CRAS_C/CRAS_D + `_metadata`)
   para exercitar o caminho de produção; chaves `_*` (metadados) são ignoradas.
4. **Fechamento é do gestor.** Guard `rma.fechar` (gestor/ADMIN) no botão de
   fechar; o backend permite coordenação, mas o front segue o plano.
5. **Pinos com auditoria.** A camada identificada do mapa só aparece com
   `vigilancia.pinos` e mostra aviso de que a visualização será registrada.

## Testes da fase

- **Unitários** (Vitest): `rmaModelo` (normalização dos dois shapes, códigos,
  mapa de ajustes, status→fluxo, competência) e `graficos` (donut, barras,
  conversões, projeção do mapa). Total do projeto: **140 testes**.
- **E2E** (Playwright + axe): RMA com número ajustado; drill-down; **ajuste com
  justificativa**; **fechar mês com confirmação → somente leitura**; dashboard
  com cartões; **aviso de auditoria ao ativar pinos**; vigilância sem pinos não vê
  a camada; axe nas duas telas. O e2e injeta o **token do perfil** (gestor/ADMIN)
  no `sessionStorage` antes de carregar (como a shell faria via `?token=`), já que
  o perfil default `tecnico_superior` não acessa essas telas. Total: **44 e2e**.

## Definition of Done (FASE 8) — status

- [x] Conferência do RMA: blocos, `<NumeroRMA>` com lupa e "ajustado"
- [x] Drill-down abre a lista de registros de origem (sem PII)
- [x] Ajuste manual com justificativa (422 se fechado)
- [x] Fechar mês com consequências + idempotência; somente leitura + reabertura
- [x] CSV + PDF espelho A4 (brasão), ajustes marcados
- [x] Dashboard: cartões grandes, barras (12m), donut por benefício
- [x] Mapa territorial (calor agregado) + pinos só p/ `vigilancia.pinos` com aviso
- [x] Gráficos com rótulos textuais; versão A4 para impressão
- [x] Zero violação séria no axe; navegação por teclado; sem PII em URL/console
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 140 unit + 44 e2e; build ok

---

# FASE 9 — Administração do tenant (§4.10)

Assistente de implantação (wizard) que configura o município passo a passo, com
importação do CadÚnico e prévia da conciliação.

## O que a Fase 9 entrega

- **`AdministracaoWizard`** (`/administracao`, guard `administracao.gerir`) —
  **stepper acessível** (`aria-current="step"`, etapas concluídas com ✓) em 6
  etapas: **1 Unidades → 2 Territórios → 3 Equipes e lotações → 4 Tipos de
  benefício → 5 Parâmetros de sigilo → 6 Importação CadÚnico**. O progresso vem de
  `GET /onboarding/status` (5 etapas de backend; sigilo é confirmação local).
- **Etapas** com validação **Zod** (`wizardModelo`): unidades e profissionais são
  adicionados a listas antes de enviar; CPF do profissional é validado (DV) via
  `<CampoCPF>`; território associa unidades por checkbox; benefícios semeia os
  domínios nacionais; sigilo escolhe o padrão da rede (padrão/reforçado).
- **`ImportacaoCadunico`** — upload **multipart** do CSV → **prévia da
  conciliação** (novos/atualizados/conflitos/erros em contadores) → **amostra do
  log** (NIS/CPF **mascarados**) → concluir. O arquivo nunca vai para a URL nem
  para o console.

## Arquivos novos

```
src/
  nucleo/api/admin.ts                      status, wizard/{step}, import-jobs, upload
  paginas/admin/
    AdministracaoWizard.tsx                stepper + orquestração das etapas
    PassoUnidades.tsx, PassoTerritorios.tsx, PassoEquipes.tsx
    PassoBeneficios.tsx, PassoSigilo.tsx
    ImportacaoCadunico.tsx                 upload + prévia + log
    wizardModelo.ts (+ .test.ts)           schemas Zod + "pronto" + conciliação (puro)
  tipos/admin.ts                           DTOs (onboarding + importação)
  mock/fixtures/admin.ts                   store do wizard + processamento do CSV
```

## Endpoints consumidos (contratos do backend)

- `GET /onboarding/status` → `TenantOnboardingStatus` (steps: units, territories,
  benefits, professionals, import; `ready`)
- `POST /onboarding/wizard/{step}` (corpo `{ data }`) → resultado por etapa
- `GET /import-jobs` · `POST /import-jobs/cadunico/upload` (multipart) ·
  `GET /import-jobs/{id}`

## Decisões

1. **6 etapas visuais, 5 de backend.** "Parâmetros de sigilo" é uma confirmação
   **local** (não é etapa do backend); as outras cinco executam
   `POST /onboarding/wizard/{step}` e marcam o progresso. `calcularPronto` só
   considera as etapas do backend.
2. **Upload dedicado.** O `uploadCadunico` usa `fetch` com `FormData` (o cliente
   HTTP padrão serializa JSON), reaproveitando o `ErroApi` (RFC 9457 → pt-BR).
3. **Conciliação sem gravar.** A prévia mostra os contadores e a amostra do log
   antes de qualquer efeito; NIS/CPF vêm mascarados (LGPD).
4. **Validação espelhando o backend.** Zod valida cada etapa (nome de unidade,
   UF de 2 letras, CPF com DV, e-mail) — mesma fonte de regra do cadastro.

## Testes da fase

- **Unitários** (Vitest): `wizardModelo` — schemas (unidade/território/
  profissional), `etapaConcluida`, `calcularPronto`, `proximaEtapaPendente`,
  `resumoConciliacao`. (Incluídos nos **140 testes** do projeto.)
- **E2E** (Playwright + axe): percorre o wizard (adiciona unidade → salva →
  avança para Territórios); **importa o CadÚnico e vê a prévia da conciliação**;
  axe sem violações sérias. (Incluídos nos **44 e2e**.)

## Definition of Done (FASE 9) — status

- [x] Wizard com stepper acessível (6 etapas; progresso de `/onboarding/status`)
- [x] Etapas validadas com Zod; unidades/profissionais em lista antes de enviar
- [x] Importação CadÚnico multipart + prévia (novos/atualizados/conflitos/erros)
- [x] Amostra do log com NIS/CPF mascarados; arquivo fora da URL/console
- [x] Guard `administracao.gerir`; zero violação séria no axe; navegação por teclado
- [x] Textos pt-BR (vocabulário SUAS); tsc, ESLint (0), 140 unit + 44 e2e; build ok
