# Handoff — Fases 8 e 9 (frontend govsocial)

> Documento de passagem para retomar o frontend em um **novo chat**. Fases 1–7
> concluídas e verificadas: **96 testes unitários + 32 e2e**, `tsc`, `eslint
> --max-warnings 0` e `build` limpos. O e2e roda na **porta 7411** (a 7401 do
> `dev` costuma estar ocupada no ambiente — já ajustado em `playwright.config.ts`).

## Como retomar (cole no novo chat)

Continuando o frontend do módulo govsocial (`/home/ubuntu/sistemaweb/modulo-govsocial/web`).
Fases 1–7 completas e verificadas. Trabalhe **tudo em português** (textos, tarefas,
pensamento). Leia `modulo-govsocial/web/README.md` (seções por fase),
`/home/ubuntu/sistemaweb/planof.md` (§4.8 RMA, §4.9 Dashboard/mapa, §4.10
Administração) e este `PROXIMAS_FASES.md`. Faça a **Fase 8** (RMA + Vigilância/
Dashboard) e depois a **Fase 9** (Administração/wizard). Ao final rode `npm run
typecheck`, `npm run lint`, `npm run test` e `npx playwright test`.

## Padrões do projeto (obrigatórios)

- React 18 + TypeScript + Vite; TanStack Query; MSW no modo mock.
- **Tokens `--ga-*`** (sem cor crua); componente `<Chip>` com variantes já
  existentes. Atenção: a variante `scfv` reprova contraste AA em texto pequeno —
  use `primario` para chips de texto pequeno (aprendizado da Fase 6).
- **Permissão desde o núcleo**: `<GuardRota exige="...">` nas rotas e
  `<Permitido capacidade="...">` para esconder subárvores (nunca desabilitar).
- **Sem PII** em URL, título de aba, console ou export. Nome de pessoa vem de
  `GET /persons/{id}` (padrão já usado em Grupos e Agenda), nunca do payload.
- **Conteúdo sensível** velado no `<CartaoSigiloso>` (revelação consciente,
  auditada, sem cache).
- **Idempotência** (`novaChaveIdempotencia()` + `bloqueiaDuploSubmit`) em
  mutações críticas (fechar RMA, etc.).
- **Acessibilidade**: axe sem violações sérias; navegação por teclado; use
  `<Abas>`, `<Modal>`, `<FluxoStatus>`, `<EstadoVazio/Erro/SemPermissao>`,
  `<Skeleton>` já existentes. Cuidado: `<dl>` exige `<dt>/<dd>` (não use `<dl>`
  com `<div>` — vira violação no axe; use `<div>`).
- **Impressão A4**: rotas sob `/imprimir/*` no `LayoutImpressao` (brasão do
  tenant); documentos oficiais numerados são do backend, o front é só via de
  visualização.
- Não usar `role="list"` em `<ul>` (regra eslint jsx-a11y/no-redundant-roles).
- Verificação final SEMPRE: `typecheck`, `lint`, `test`, `playwright test`.

## Capacidades (matriz já existente em `src/nucleo/permissoes/matrizPapeis.ts`)

Já existem e cobrem as fases 8–9: `rma.conferir`, `rma.fechar`, `vigilancia.ver`,
`vigilancia.pinos`, `administracao.gerir`, `auditoria.ler`.
- `rma.conferir`: coordenador, gestor, ADMIN (e vigilância lê).
- `rma.fechar`: **gestor** e ADMIN (coordenador NÃO fecha).
- `vigilancia.pinos`: **gestor** e ADMIN (mapa com pinos identificados só p/ eles;
  os demais veem só o calor agregado).
- `administracao.gerir`: ADMIN e suporte_govassist.

As rotas `/rma`, `/vigilancia`, `/administracao` hoje são **stubs**
(`PaginaEmConstrucao`) em `src/rotas.tsx` — basta trocar pelos componentes reais,
como foi feito em `/grupos`, `/agenda`, `/encaminhamentos`.

---

# FASE 8 — RMA (§4.8) + Vigilância/Dashboard (§4.9)

## 8A. Conferência e fechamento do RMA (rota `/rma`)

Tela ⭐ do plano. Fluxo: escolher unidade (contexto do cabeçalho) + ano/mês →
`POST /rma/calculate` (calcula ou retorna existente) → conferir blocos/campos →
ajustar campo com justificativa → **fechar mês** (assinatura de perfil) →
estado somente-leitura com banner + "solicitar reabertura".

Componentes sugeridos:
- `<NumeroRMA>` (biblioteca §5): valor + **lupa de drill-down** + estado
  "ajustado". Drill-down abre a lista exata de registros que compõem o número.
- `RmaConferencia.tsx` (página), `RmaBloco.tsx`, `ModalAjuste.tsx`,
  `RmaEspelhoImpressao.tsx` (A4 em `/imprimir/rma/:id`).

Endpoints (todos sob `/api/govsocial/v1`):
- `GET /rma?unit_id=&ano=&status=` → `RmaFechamentoListItem[]`
- `POST /rma/calculate?unit_id=&ano=&mes=` → `RmaFechamentoOut` (idempotente:
  recalcula ou devolve o existente). **É POST com query params, sem corpo.**
- `GET /rma/{id}` → `RmaFechamentoOut`
- `POST /rma/{id}/adjust` (corpo `RmaAjusteCreate`: `bloco, campo,
  valor_calculado, valor_ajustado, justificativa`) → `RmaAjusteOut` (422 se já
  FECHADO). Requer `rma.conferir` (backend `_MANAGE` = coord/ADMIN).
- `POST /rma/{id}/close` → fecha (422 se já fechado). Exigir `rma.fechar` no
  front (o backend permite coord, mas o plano diz gestor assina; alinhar com o
  guard `rma.fechar`). Enviar `Idempotency-Key` + `bloqueiaDuploSubmit`.
- `POST /rma/{id}/reopen` (corpo `{ motivo_reabertura }`) → só se FECHADO.
- `GET /rma/{id}/export` → CSV (download; `Content-Disposition`).

DTOs (`RmaFechamentoOut`): `id, unit_id, ano, mes, status
(ABERTO|FECHADO|REABERTO|EM_CONFERENCIA), fechado_por_id, fechado_em,
reaberto_por_id, reaberto_em, motivo_reabertura, dados_calculados (dict:
{ "bloco2": { "C1": 128, ... } } ou lista — ver fixture RMA atual em
`novaEsperanca.ts`), calculado_em, ajustes: RmaAjusteOut[], created_at,
updated_at`.
`RmaAjusteOut`: `id, bloco, campo, valor_calculado, valor_ajustado,
justificativa, ajustado_por_id, created_at`.
`RmaDrillDown`: `bloco, campo, valor, registros: dict[]` (o backend expõe via
serviço; se não houver rota GET de drill-down pronta, mockar no MSW — conferir
`api/v1/rma.py`, hoje há calculate/get/adjust/close/reopen/export).

Observação: já existe uma fixture `RMA` em
`src/mock/fixtures/novaEsperanca.ts` (status EM_CONFERENCIA, `dados_calculados.
bloco2` com C1/C2/C4 e um ajuste em C4). Reaproveitar e ampliar num
`src/mock/fixtures/rma.ts` com store dinâmico (calcular/ajustar/fechar/reabrir).

## 8B. Dashboard do gestor + mapa (rota `/vigilancia`)

Layout (§4.9):
- Linha 1: cartões grandes (Archivo 32) — atendimentos no mês, acompanhamentos
  ativos, benefícios concedidos, encaminhamentos pendentes (cada um clicável).
- Linha 2: série de 12 meses (barras) + distribuição por serviço/benefício
  (donut **com rótulos textuais**).
- Linha 3: **mapa** (MapLibre) com camadas: **calor por território** (padrão,
  agregado) e **pinos identificados** (só `vigilancia.pinos`; ativar pinos mostra
  **aviso de auditoria**). Filtros persistentes por período/unidade/território.
- Botão "versão para impressão" (A4 com brasão → `/imprimir/dashboard`).

Endpoints:
- `GET /dashboard/overview` → `DashboardOverviewOut` (atendimentos_mes,
  acompanhamentos_ativos, familias_cadastradas, beneficios_concedidos_mes,
  encaminhamentos_pendentes, grupos_ativos, inscritos_scfv).
- `GET /dashboard/time-series?meses=12` → `TimeSeriesItem[]` (ano, mes,
  atendimentos, beneficios).
- `GET /dashboard/by-territory` → `TerritoryItem[]` (territorio, total_familias).
- `GET /dashboard/map` → `MapItem[]` (territorio, bairro, total_familias,
  centroide_lat, centroide_lng).
- `GET /dashboard/benefits-report?ano=&mes=` → `BenefitReportItem[]`
  (tipo_beneficio, total_concessoes, valor_total).
- `GET /dashboard/indicators` → `IndicatorsOut` (total_familias, pbf,
  pbf_percentual, bpc, bpc_percentual, cadunico_desatualizado_24m,
  inseguranca_alimentar, renda_por_faixa: FaixaRendaItem[]).
- Permissão de leitura: gestor, vigilância, coordenador, ADMIN.

Decisões técnicas a tomar:
- **MapLibre** é dependência nova (não está no `package.json`). Avaliar custo de
  bundle (orçamento inicial ≤ 250 KB gzip; carregar via chunk lazy da rota). Se
  preferir evitar dependência pesada num primeiro momento, é aceitável um mapa
  SVG/coroplético simples a partir dos centroides — decidir e registrar no README.
- Gráficos sem dependência nova (barras/donut em SVG puro, como o
  `EditorEvolucao`/`AssinaturaCanvas` evitaram libs). Donut precisa de rótulos
  textuais (não só cor) por acessibilidade.

## Testes Fase 8 (sugestão)
- Unit: regra de "ajustado" do `<NumeroRMA>`; formatação de série; cálculo de
  percentuais/《donut》 (função pura); mapeamento status RMA → índice de
  `<FluxoStatus>`/banner.
- E2E: conferir RMA → ajustar campo com justificativa → fechar mês (confirma
  consequências) → estado somente-leitura; drill-down abre lista; dashboard
  mostra cartões e (se `vigilancia.pinos`) aviso de auditoria ao ativar pinos;
  axe nas duas telas.

---

# FASE 9 — Administração do tenant (§4.10, rota `/administracao`)

Assistente de implantação (wizard) com etapas:
1. **Unidades** → 2. **Territórios** → 3. **Equipes/lotações (professionals)** →
4. **Tipos de benefício** → 5. **Parâmetros de sigilo** → 6. **Importação
CadÚnico** (upload → mapeamento → prévia da conciliação novos/atualizados/
conflitos → aplicar; progresso do job + log baixável).

Endpoints:
- `GET /onboarding/status` → `TenantOnboardingStatus` (tenant_id, tenant_name,
  steps: `{step, completed}[]`, ready). Steps do backend: **units, territories,
  benefits, professionals, import** (nomes exatos).
- `POST /onboarding/wizard/{step}` (corpo `{ data: {...} }`) → resultado por step:
  - `units`: `data.unidades = [{ tipo, nome, bairro, municipio, uf, territorios[] }]`
  - `territories`: `data = { nome, unidades: [unitId, ...] }`
  - `benefits`: sem corpo relevante (semeia domínios nacionais)
  - `professionals`: `data.professionals = [{ nome, cpf, funcao, email, telefone }]`
  - `import`: retorna redirect para importação
- `GET /system/health` → `SystemHealthOut`; `GET /system/metrics` →
  `SystemMetricsOut` (para painel de suporte, se aplicável).
- Importação CadÚnico:
  - `GET /import-jobs` → `ImportJobOut[]`
  - `POST /import-jobs/cadunico/upload` (multipart) → `ImportResultOut`
    (`{ job, summary, logs: ImportLogItem[] }`). `ImportJobOut`: total_linhas,
    linhas_processadas, novos, atualizados, conflitos, erros, status.
  - `GET /import-jobs/{id}` → `ImportResultOut` (polling de progresso).
- Unidades/profissionais (para telas de apoio): `GET /units`, `POST /units`,
  `GET /professionals`, `POST /professionals` (CPF mascarado nas listagens).
- Permissão: `administracao.gerir` (ADMIN, suporte).

Componentes sugeridos: `AdministracaoWizard.tsx` (stepper acessível), um
componente por etapa, `ImportacaoCadunico.tsx` (upload + prévia + progresso),
`tipos/admin.ts`, `nucleo/api/admin.ts` + hooks, `mock/fixtures/admin.ts`
(status do wizard, job de importação com contadores).

## Testes Fase 9 (sugestão)
- Unit: validação de cada etapa do wizard (schema Zod), cálculo de "pronto"
  (todas etapas completas), resumo da conciliação (novos/atualizados/conflitos).
- E2E: percorrer o wizard preenchendo unidades → territórios → ... → importar;
  prévia da conciliação; axe.

---

## Estrutura já existente (referência de padrões)

- Rotas: `src/rotas.tsx` (lazy + `<GuardRota>`; `/imprimir/*` no `LayoutImpressao`).
- Hooks de dados: `src/nucleo/api/hooks.ts` (um bloco por fase).
- Serviços: `src/nucleo/api/*.ts` (cliente `http` com retry idempotente,
  `semCache`, `chaveIdempotencia`).
- Handlers/fixtures MSW: `src/mock/handlers.ts` + `src/mock/fixtures/*.ts`
  (registrar rotas específicas ANTES de `/:id`).
- UI base: `src/ui/*` (Abas, Modal, SlideOver, FluxoStatus, Chip, Skeleton,
  Estados, CartaoSigiloso, Botao com `bloqueiaDuploSubmit`, AssinaturaCanvas).
- i18n: `src/i18n/textos.ts` (pt-BR, vocabulário SUAS).
- Fixtures base do tenant "Nova Esperança": `src/mock/fixtures/novaEsperanca.ts`
  (inclui `RMA` e `UNIDADES`).
- Tema/impressão: `LayoutImpressao` + `Brasao` + tokens; classe `nao-imprimir`.

## Comandos

```bash
cd modulo-govsocial/web
npm run typecheck        # tsc -b --noEmit
npm run lint             # eslint --max-warnings 0
npm run test             # vitest run
npx playwright test      # e2e (sobe dev:mock na porta 7411)
npm run build            # verifica orçamento de bundle
```
