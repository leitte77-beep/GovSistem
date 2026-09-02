# Relatório — Redesign Premium da Página Pública de Edição do Diário Oficial

- **Escopo:** `modulo-diario/web-public` — página pública `/edicoes/{ano}/{numero}` (e âncoras `#materia-…`)
- **Natureza:** redesign de UX/UI/design system/editorial — **sem** alteração de arquitetura, SSR, rotas, dados, snapshots, APIs, autenticação ou conteúdo oficial.
- **Regra mantida:** nenhum texto jurídico publicados foi reescrito, corrigido ou reorganizado. Apenas apresentação.

---

## Antes

Problemas visuais identificados no layout anterior:

- Aparência de interface **administrativa/dashboard**: toda a página era uma coleção de “cards” (`rounded-xl border bg-surface-container-lowest`) empilhados — header em card, status em card, sumário em card, busca em card.
- Fundo homogêneo e sem separação clara entre **ambiente** e **documento**.
- Cabeçalho da edição competia com o conteúdo (mesmo tom), sem hierarquia editorial forte para “Edição nº”.
- Ações todas parecidas: “Baixar PDF” e as ações secundárias eram **botões idênticos** (mesma cor de borda), nada parecia primário.
- Status oficial chegava como um **card técnico grande** logo no topo, com uma tabela “de sistema” de estados.
- Sumário lateral tinha cara de **menu administrativo** (chip de tipo + contadores), não de conteúdo editorial; sem destaque da matéria ativa durante o scroll.
- Busca com caixa pequena e “filtros-chips” de sistema; placeholder técnico.
- Tipografia do conteúdo oficial sem corpo editorial: o plugin de typography do Tailwind **não estava instalado**, então `.prose-*`/`.prose` eram inertes e o documento saía quase sem estilo.
- Matéria não parecia documento: faltavam espaçamentos generosos, respiro, tipografia escalada, divisórias sutis.
- Tabelas sem tratamento (podiam estourar no mobile) e sem refinamento visual.
- Rodapé/documento “de sistema”, com código/hash em caixas.

---

## Depois

Mudanças de apresentação realizadas (identidade premium, editorial e institucional):

1. **Fundo “canvas” + folha do documento.** Novo fundo neutro `#eef1f5` (ambiente) e a edição renderizada como **uma folha branca contínua** (`#ffffff`, radius 18px, ring sutil, sombra quase invisível). A matéria é o protagonista; a interface desaparece ao redor.
2. **Masthead institucional premium** (`EditionHeader`): logo do tenant, overline “Diário Oficial Eletrônico”, nome do órgão (derivado do tenant — sem hardcode “Farol”), “Edição nº 23” gigante (numeral em cor de marca), data, e **um único `<h1>`** (sr-only com o nome completo do recurso) para acessibilidade/SEO. Status oficial discreto (pílula verde suave) + contagem.
3. **Ações com hierarquia real**: só “Baixar PDF” é primário (sólido navy); Visualizar, Verificar autenticidade, Compartilhar, Imprimir e Copiar link viram ações “ghost” discretas que não competem.
4. **Busca editorial** com campo largo, ícone discreto e placeholder natural; **filtros como tabs discretos** (ativo: fundo suave + texto forte, sem gradiente).
5. **Sumário lateral editorial** (“Nesta edição”, `EditionToc`, client): itens com numeração discreta, separadores hairline e **destaque da matéria ativa** via `IntersectionObserver` (barra lateral fina + texto em cor de marca). Sem cards por item.
6. **Documento** (`MatterDocument`): cada matéria é tipografada como documento — overline do tipo de ato, título grande, súmula com filete de destaque, divisória sutil e **corpo oficial estilizado** (`matter-body`) com parágrafos justificados, hierarquia de headings, listas, citações e **tabelas refinadas com scroll horizontal responsivo** (`table-scroll`). O HTML oficial não é alterado (apenas `h1→h2` e o envoltório da tabela, que é apresentação).
7. **Barra de autenticidade** (`EditionAuthenticity`): “Publicação autenticada” com selo, signatário (do certificado, extração de CN), código de verificação copiável e link “Ver autenticidade →”. Os **detalhes técnicos** foram compactados e movidos para o fim da folha (`EditionStatus` variante `tech`).
8. **Rodapé de fechamento institucional** limpo + **navegação entre matérias** (anterior/próxima, duas colunas editoriais) e **navegação entre edições** (`EditionPager`) separadas no fim.
9. **Responsividade**: acima de `xl` sumário lateral *sticky* com `max-height` e scroll interno; abaixo disso **Drawer/sheet acessível** (`<dialog>`, `MobileTocDrawer`) com o mesmo sumário; busca e documento em largura cheia no mobile; sem tentar comprimir o desktop.
10. **Microinterações** 150–250ms: hover/focus, item ativo, “Link copiado”, destaque suave de âncora (`:target` flash 1.6s) e `scroll-margin-top` para compensar o header sticky.
11. **Estado vazio** e avisos de edição legada/limitada seguindo o mesmo padrão premium (sem página quebrada).
12. **Impressão** (`@media print`): remove navegação/sidebar/busca/ações, mantém masthead, matérias, autenticidade e rodapé; quebra cada matéria e a faixa de autenticidade em páginas próprias.
13. **Contraste**: token `muted` escurecido para garantir contraste ≥ 4.5:1 também sobre o fundo canvas. Axe: 0 violações critical/serious.

## Componentes alterados

| Componente | Arquivo | O que mudou |
|---|---|---|
| Página da edição | `src/app/edicoes/[ano]/[numero]/page.tsx` | Novo layout em canvas + folha; moveu status/autenticidade para o fim; estado vazio; grid sidebar+documento |
| Masthead | `components/edition/EditionHeader.tsx` | Hero institucional, único `<h1>` sr-only, pílula de status discreta |
| Ações | `components/edition/EditionActions.tsx` | Hierarquia primária/ghost |
| Status/Autenticidade | `components/edition/EditionStatus.tsx` | Variante `card`/`tech`; monochrome; movido para o fim |
| Autenticidade nova | `components/edition/EditionAuthenticity.tsx` *(novo)* | Selo + signatário + código + detalhes técnicos |
| Matéria/documento | `components/edition/MatterDocument.tsx` | Tipografia documental, súmula com filete, tabelas com scroll |
| Sumário lateral | `components/edition/EditionToc.tsx` *(novo)* | Sumário editorial com item ativo |
| Sumário mobile | `components/edition/MobileTocDrawer.tsx` *(novo)* | Drawer `<dialog>` acessível |
| Busca/Filtros | `components/edition/SearchControls.tsx` | Campo editorial + tabs discretos |
| Rodapé da edição | `components/edition/EditionDocumentFooter.tsx` | Fechamento institucional limpo |
| Navegação entre edições | `components/edition/EditionPager.tsx` | Cards editoriais anterior/próxima |
| Navegação de matéria | `MatterDocument` | Pager duas colunas anterior/próxima |
| Breadcrumb | `components/edition/EditionBreadcrumb.tsx` | Estilo discreto |
| Copiar link | `components/edition/CopyMatterLink.tsx` | Estilo discreto |
| Design tokens | `tailwind.config.ts`, `src/app/globals.css` | Token `edition.*`, `matter-body`, `table-scroll`, print |

## Design tokens

Definidos em `:root` (globals.css) e mapeados no Tailwind como `colors.edition.*`:

| Token | Valor | Uso |
|---|---|---|
| `--edition-canvas` | `#eef1f5` | Fundo do ambiente |
| `--edition-sheet` | `#ffffff` | Folha do documento |
| `--edition-sheet-muted` | `#f6f7f9` | Superfícies internas suaves |
| `--edition-ink` | `#1a1f24` | Texto principal (quase preto) |
| `--edition-ink-2` | `#454c55` | Texto secundário |
| `--edition-muted` | `#565d66` | Texto terciário (contraste ≥4.5 no canvas) |
| `--edition-line` | `#e6e9ef` | Hairline/divisória |
| `--edition-line-strong` | `#d3d8e0` | Divisória mais visível |
| `--edition-accent` / `accent-strong` | `#0a4d9c` / `#072f63` | Links, item ativo, detalhes institucionais |
| `--edition-brand` | `#0f2a52` | Ação primária / numeral |
| `--doe-accent` | (tenant/derivado) | Reservado para acento do tenant |
| `--edition-success/warn/danger` | verde/âmbar/vermelho | Estados discretos |

Não há hex espalhado nos componentes — tudo referenciado por token via utilitários Tailwind `bg-edition-*`, `text-edition-*`, `ring-edition-line`.

## Responsividade

- **1440 / 1280:** sidebar lateral (coluna ~300px) + folha; sumário sticky `top-24`, `max-height: calc(100vh-8rem)` com scroll interno.
- **1024:** layout mobile → *drawer* de sumário + documento full-width (sem compressão do desktop).
- **768 / 430 / 390 / 360:** busca e documento quase full-width, padding confortável (20–24px mobile, 40px+ tablet, 56px+ desktop dentro da folha), botões organizados, busca full width, tabelas com scroll horizontal.
- Verificado: **sem overflow horizontal** em nenhuma largura (zoom 200% também testado).

## Acessibilidade

- Um único `<h1>` (sr-only com nome completo); títulos de matérias como `<h2>`.
- Foco visível em todos os controles (`focus-visible` com ring na cor de marca).
- Drawer usa `<dialog>` nativo (fecha por Esc, botão e seleção) com `aria-label`.
- `aria-live`/`role=status` para busca, “link copiado” e contadores; `aria-current` no item ativo do sumário; `aria-pressed` nos filtros.
- Contraste corrigido (token `muted`) → **Axe: 0 violações critical/serious** (edição 23) e nenhuma critical/serious na 22.
- `skip-link`, `scroll-margin-top`, sem depender de cor (estados também por texto/símbolo).
- Suporte a `prefers-reduced-motion` (desativa flash/transições).
- SSR e HTML inicial indexável mantidos e validados por teste Playwright (`edition-ssr.spec.ts`).

## Performance

- **Nenhuma biblioteca nova.** Reaproveita Next, Tailwind (tokens), Material Symbols e Inter já presentes.
- Conteúdo tipográfico passou a ser estilizado via CSS declarativo (`.matter-body`), em vez de depender de plugin ausente — custo zero de bundle.
- Não houve mudança em busca/SSR/metadata/canonical/JSON-LD; a página segue servidor-renderizada e indexável.
- First Load JS do build permanece inalterado em substância (ver tabela `next build`).

## Testes

- `npx tsc --noEmit`: ok.
- `npx eslint` nos arquivos alterados: sem erros.
- `npx vitest run`: **38 testes passando** (inclui `SearchControls` e `EditionStatus`/`CopyMatterLink`).
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:9400 npx playwright test e2e/edition-ssr.spec.ts`: **4 passaram** (SSR, um único `<h1>`, âncoras `materia-`).
- Validação de layout por DOM/computed style nas larguras 1440/1280/1024/768/430/390/360 — sem overflow; sidebar `xl+`, drawer abaixo.
- Validação interativa em build de produção: busca filtra/esconde matérias e mostra “Nenhuma matéria encontrada.”; sumário destaca a matéria ativa ao rolar; drawer abre/fecha (Esc); deep-link de âncora mantém o item ativo.
- Axe: sem critical/serious.

## Pendências

Apenas reais:

- **Dark mode:** o sistema atual não possui dark mode nesta página documental; conforme orientação, não foi adicionado.
- **UF do tenant:** a resposta da API de organização (`/organization`) não expõe um campo de UF; o rodapé/masthead mostram nome e brasão do tenant derivados dos dados reais, sem hardcode de “Farol/Paraná”. Se a API passar a expor `uf`, basta adicionar ao `EditionDocumentFooter`/hero.
- **Prévia local:** para inspecionar o resultado, um servidor de produção local (`next start`) foi deixado em `http://127.0.0.1:9400` (build do `web-public`), apontando para a API em `127.0.0.1:9203`. Encerrar com `pkill -f "next start -p 9400"`. O deploy real depende de rebuild da imagem Docker `web-public`.

---

### Evidências (screenshots)

`docs/evidencias/redesign-premium-edicao/`

**Antes:** `antes/antes-desktop-full.png`, `antes/antes-desktop-top.png`, `antes/antes-tablet-1024.png`, `antes/antes-mobile-top.png`, `antes/antes-mobile-full.png`

**Depois** (`depois/`):
- `desktop-topo.png`, `desktop-materia.png`, `desktop-final.png`, `desktop-full.png` (Edição nº 23)
- `view-1280.png`, `view-1024.png` (Edição nº 22 — multi-matéria, para validar sumário/tabelas)
- `mobile-topo.png`, `mobile-full.png`, `mobile-drawer.png`

*Nota: capturas “depois” foram geradas em build de produção local, sem overlay de dev.*

---

# Revisão corretiva v2 — composição, eixo e hierarquia

Segunda passada puramente visual sobre `/edicoes/{ano}/{numero}` (sem mudar dados, SSR, APIs ou conteúdo jurídico).

## Desalinhamentos encontrados e causas

- **Página “torta”:** a versão anterior aplicava um grid de duas colunas (`sidebar 300px + documento`) **sempre**, mesmo com uma única matéria, e ainda centralizava o hero. Isso criava um eixo quebrado entre hero centralizado, ações centralizadas e documento deslocado à direita.
- **Eixos múltiplos:** cada bloco tinha largura própria (hero 1320px, busca card, grid, rodapé) — nada compartilhava o mesmo eixo.
- **Status contraditórios:** a lista técnica mapeava `false` como “erro” (ícone vermelho de cancelamento) e misturava `true/false/null` sem distinção, gerando leituras como “verificada” ao lado de “Não”.
- **Repetição de identidade:** o cabeçalho do Diário reaparecia no rodapé documental e havia duplicação do tipo do ato no cabeçalho da matéria (`PORTARIA` duas vezes).

## O que foi removido da visão principal

- O bloco técnico gigante do topo (“Publicação verificada” + signatário/emissor/SHA/manifesto/cadeia ICP-Brasil…) **não aparece mais** no fluxo principal.
- O rodapé repetindo o masthead completo foi substituído por um encerramento mínimo.
- A “eyebrow” duplicada de tipo de ato foi removida do cabeçalho da matéria.
- Em edições de **uma matéria**, a busca/filtros e o sumário lateral deixaram de aparecer (sem o que procurar/filtrar) — a matéria domina imediatamente.

## Como o grid foi corrigido

- Um **único shell** para a página inteira (breadcrumb → hero → ações → documento → rodapé):
  - 1 matéria → coluna única `max-width: 900px` centrada (eixo único);
  - várias matérias → `max-width: 1180px` com `260px (sumário) + 32px gap + ~840px (documento)`.
- Todo o conteúdo principal é **alinhado à esquerda no mesmo eixo** (sem alternar centralizado/esquerda/centralizado).
- Brasão pequeno (56–64px) ao lado da “marca”; **uma única hierarquia dominante** (“Edição nº 23”), com município discreto acima.
- Ações: somente **Baixar PDF** sólido; `Visualizar PDF` e `Compartilhar` discretos; `⋯ Mais` reúne Verificar autenticidade, Imprimir e Copiar link.
- Espaçamentos seguem múltiplos (4/8/12/16/24/32/40/48) para ritmo consistente.

## Informações movidas para “detalhes”

Tudo isto ficou **sob demanda** (botão “Detalhes técnicos” → drawer/sheet acessível):
assinatura, validade do certificado, cadeia ICP-Brasil, consulta de revogação, carimbo de tempo, integridade do snapshot/documento, signatário, emissor, formato, SHA-256 e manifesto.

No topo ficou apenas o **status resumido honesto**: `✓ Publicação oficial verificada` + data da assinatura + “Ver autenticidade →”.

## Correção do mapeamento de status (verdadeiro/falso/desconhecido)

- `true` → verde (`Assinada`, `Válido`, `Consultada`, `Presente`, `Íntegro`).
- `false` → **não é erro automático**: tom neutro/âmbar conforme o campo, com texto preciso (ex.: “Certificado próprio, não ancorado” para cadeia de um certificado municipal autoadministrado).
- `null`/não testado → **“Não verificado”**, sem ícone, tom neutro.
- Ícones vermelhos de “cancelamento” foram removidos da lista técnica; legenda explica que itens cinza são propriedades que não se aplicam/não atestadas.

## Layout: 1 matéria × várias matérias

- **1 matéria (ex. edição 23):** coluna única centrada, sem sidebar, sem busca — a folha editorial é o protagonista (~70–80% da atenção).
- **Várias matérias (ex. edição 22):** grid real `260px sumário + 840px documento`; sumário sticky só a partir de `lg`, com drawer/sheet no mobile; busca presente.

## Screenshots produzidos (v2)

`docs/evidencias/redesign-premium-edicao/depois2/`
- `desktop-topo.png`, `desktop-materia.png`, `desktop-final.png`, `desktop-full.png` (Edição 23)
- `desktop-autenticidade.png` (drawer de detalhes técnicos aberto)
- `multi-topo.png`, `multi-full.png` (Edição 22 — várias matérias)
- `mobile-topo.png`, `mobile-materia.png`, `mobile-autenticidade.png` (bottom-sheet técnico)

## Testes (v2)

- `tsc --noEmit` e `eslint`: ok.
- `vitest run`: **38/38** (inclui os testes de status/share).
- SSR e2e (`edition-ssr.spec.ts`): **4/4**.
- Axe (produção local): **0 violações critical/serious** (edições 23 e 22).
- Sem overflow horizontal em 1440 / 1366 / 1024 / 768 / 430 / 390 (e 200% zoom).
- Validação interativa em build de produção: menu “Mais ações”, drawer de detalhes técnicos (abre/fecha por Esc), único `<h1>`, sumário ativo ao rolar (edição 22), busca filtrando.
