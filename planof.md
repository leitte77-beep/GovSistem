# GovAssist — Módulo Assistência Social
## Projeto de Frontend (UX + UI + Arquitetura)

> Versão 1.0 — julho/2026. Complementa o Plano de Desenvolvimento e o prompt de backend.
> O frontend consome a API `/api/v1` do módulo (OpenAPI), com RBAC nos tokens da plataforma GovAssist.

---

## 1. Quem usa e em que condição — o design parte daqui

| Persona | Contexto real | O que o design precisa garantir |
|---|---|---|
| **Recepção do CRAS** | Fila de pessoas na frente, computador antigo, alta rotatividade de servidores | Busca onipresente, cadastro em 1 tela, zero jargão técnico, atalhos de teclado |
| **Técnico de referência** (assistente social, psicólogo) | Atende no gabinete e em visita domiciliar com tablet; internet cai; escreve textos longos e sigilosos | Autosave agressivo, formulário de atendimento ≤ 2 min, sigilo visível na interface |
| **Técnico de nível médio / educador** | Chamada de frequência no pátio, no celular | Tela de frequência mobile-first, toque grande, funciona com conexão ruim |
| **Coordenador de unidade** | Fecha o RMA todo início de mês sob pressão de prazo | Números com drill-down até o registro de origem, conferência lado a lado |
| **Gestor / Vigilância** | Presta contas ao prefeito, CMAS e órgãos de controle | Dashboard imprimível, mapa por território, exportações |
| **Conselheiro (CMAS)** | Acesso eventual, pouca familiaridade | Relatórios prontos, agregados, sem caminhos para dado pessoal |

Regra de ouro herdada do domínio: **quem não pode ler, não vê nem o botão**. A interface se remonta por perfil (RBAC-driven UI), nunca apenas desabilita.

---

## 2. Direção visual

### 2.1 Conceito
Ferramenta profissional de política pública: séria sem ser burocrática, calorosa sem ser infantil. A identidade foge do verde-amarelo caricato e dos azuis genéricos de dashboard. A assinatura visual do produto é dupla:

1. **A Trilha da Família** — a linha do tempo do prontuário é o coração do sistema e recebe o melhor tratamento visual do produto: eventos com glifos e cor por tipo de serviço, densidade confortável, leitura cronológica impecável.
2. **Sigilo visível** — conteúdo sensível aparece como cartão velado (desfoque + cadeado + "Conteúdo restrito — sua visualização será registrada"). Revelar é um clique consciente que dispara auditoria. A privacidade vira elemento de design, não nota de rodapé — e vende o produto em demonstração para prefeituras.

### 2.2 Tokens de design

Cores (contraste AA garantido sobre `paper`):
```css
--ga-paper:        #FAFAF7;  /* fundo geral, quente, cansa menos que branco puro */
--ga-surface:      #FFFFFF;  /* cartões */
--ga-ink:          #20302D;  /* texto principal */
--ga-ink-soft:     #5A6B67;  /* texto secundário */
--ga-primary:      #17635A;  /* verde-profundo institucional: ações, links, foco */
--ga-primary-soft: #E3F0EC;  /* fundos de destaque, chips */
--ga-amber:        #9A5B00;  /* pendências, prazos, alertas não-críticos */
--ga-danger:       #A62639;  /* erros, violação de direitos, exclusões */
--ga-sensitive:    #4F4680;  /* roxo do sigilo: bordas/cadeado de conteúdo restrito */
--ga-focus:        #0B7285;  /* anel de foco de teclado, sempre visível */
```
Cores semânticas por tipo de serviço (usadas em chips e na Trilha): PAIF verde-primário; SCFV verde-claro; PAEFI roxo-sensível; MSE âmbar; Benefício azul-petróleo `#0B5563`; Encaminhamento cinza-azulado `#46626B`; Visita domiciliar terra `#7A5230`.

Tipografia:
- **Archivo** (600/700) — títulos, números do RMA, cabeçalhos de família. Tipografia latino-americana, condensável, ótima em UI densa.
- **Source Sans 3** (400/600) — corpo, formulários, tabelas.
- **IBM Plex Mono** (500) — CPF/NIS mascarados, códigos de protocolo, números de ofício.
Escala: 12 / 14 (base) / 16 / 20 / 24 / 32. Altura de linha 1.5 no corpo.

Espaço e forma: grade de 8px; raio 8px em cartões, 6px em inputs; sombras discretas (1 nível); densidade "confortável" por padrão com modo "compacto" por usuário (recepção agradece).

Tematização por tenant: brasão no topo + cor de destaque opcional do município aplicada SOMENTE em elementos decorativos (barra do cabeçalho, capa de relatório). Ações e textos permanecem nos tokens do produto — verificação automática de contraste; se falhar AA, cai no padrão.

Modo escuro: fora do MVP (uso diurno em repartição); manter tokens preparados.

### 2.3 Acessibilidade (eMAG / WCAG 2.1 AA) — requisitos de aceite
- 100% operável por teclado; foco visível (`--ga-focus`, 2px, nunca removido).
- Labels sempre visíveis (placeholder não substitui label); erros textuais associados via `aria-describedby`.
- Contraste mínimo 4.5:1 texto, 3:1 componentes; nada comunicado só por cor (chips têm texto).
- Tabelas com cabeçalhos reais; ícones com nome acessível; `prefers-reduced-motion` respeitado.
- Testes automatizados de acessibilidade (axe) nas 10 telas principais no CI.

---

## 3. Arquitetura de informação e navegação

```
┌────────────────────────────────────────────────────────────────┐
│ [Brasão] GovAssist · Assistência Social   [Unidade: CRAS Norte ▾]│
│ [🔍 Buscar família, pessoa, CPF ou NIS…        (atalho: /) ]  [🔔] [Usuário ▾] │
├──────────────┬─────────────────────────────────────────────────┤
│ Início       │                                                 │
│ Famílias     │                                                 │
│ Atendimentos │              área de conteúdo                   │
│ Agenda & Fila│                                                 │
│ Benefícios   │                                                 │
│ Grupos & SCFV│                                                 │
│ Encaminham.  │                                                 │
│ RMA          │  (menu se remonta por perfil — recepção vê      │
│ Vigilância   │   apenas Início, Famílias, Agenda & Fila)       │
│ Administração│                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

- **Seletor de unidade** no topo define o contexto de tudo (agenda, fila, RMA). Técnico lotado em 2 unidades alterna ali.
- **Busca global** (atalho `/`) está em todas as telas e aceita nome, nome social, CPF, NIS e endereço; tolera acentos e erros simples; resultados agrupados em Famílias × Pessoas com badge da situação (Em acompanhamento PAIF, etc. — conforme permissão).
- **Início por perfil**: recepção abre na Fila do dia; técnico abre em "Meus acompanhamentos + minha agenda"; coordenador em pendências da unidade + status do RMA; gestor no dashboard.
- Breadcrumbs em páginas profundas; nomenclatura idêntica à do SUAS (a equipe fala "acolhida", "evolução", "contrarreferência" — a interface fala igual).

---

## 4. Especificação tela a tela

Para cada tela: propósito, wireframe, comportamentos e estados (vazio/carregando/erro/offline/sem-permissão).

### 4.1 Busca e resultado
Uma caixa central na primeira visita ("Encontre uma família para começar") e resultados em lista com: nome do responsável, código da família, bairro/território, chips de situação. Estado vazio com ação: "Nenhum resultado para 'Maria Souza' — Cadastrar nova família". Detector de duplicata atua já aqui: ao clicar em cadastrar, mostra possíveis semelhantes antes de abrir o formulário.

### 4.2 Ficha da Família (tela mais importante)
```
┌ Família nº 2024-0193 · Território Vila Rica ──────────────────────────┐
│ Maria da Silva Souza (responsável) · NIS •••4821 · CPF ***.***.***-12 │
│ [PBF] [CadÚnico atualizado 03/2026] [Em acompanhamento PAIF]          │
│ 4 membros: Maria (38) · João (12) · Ana (9) · Tereza (61, BPC)        │
│ Ações: [Registrar atendimento] [Conceder benefício] [Encaminhar] [⋯]  │
├───────────────────────────────────────────────────────────────────────┤
│ Trilha │ Atendimentos │ Acompanhamentos │ Benefícios │ Encaminh. │ Grupos │ Docs │
├───────────────────────────────────────────────────────────────────────┤
│  TRILHA DA FAMÍLIA (assinatura visual)                                │
│  ● 04/07/2026 · Atendimento PAIF · Téc. Carla (CRAS Norte)            │
│  │   ┌─ 🔒 Evolução restrita — clique para ver (registrado) ─┐        │
│  ● 28/06/2026 · Benefício entregue · Cesta básica · comprovante ↧     │
│  ● 15/06/2026 · Atendimento no CREAS (conteúdo restrito à unidade)    │
│  ● 02/06/2026 · Encaminhamento → Saúde (devolutiva recebida ✓)        │
│  [carregar meses anteriores]                                          │
└───────────────────────────────────────────────────────────────────────┘
```
Comportamentos: cabeçalho fixo ao rolar; composição familiar editável em modal com histórico; visão-de-rede na Trilha mostra a EXISTÊNCIA do evento de outra unidade sem o conteúdo; botão imprimir gera o PDF no layout do Prontuário SUAS. Sem permissão para abas sensíveis → a aba não é renderizada.

### 4.3 Registrar atendimento (meta: ≤ 2 minutos)
Painel lateral (slide-over) sobre a ficha, para não perder contexto:
1. Data/hora (agora, editável) · Unidade (contexto) · Serviço (select com os tipificados da unidade)
2. Tipo: Individual / Familiar / Visita domiciliar / Coletivo
3. Membros atendidos (chips da composição — toque para marcar)
4. Evolução (editor simples com negrito/lista; contador de autosave "Rascunho salvo às 14:32")
5. Sigilo: padrão da unidade · [Reforçado 🔒 — só eu e a coordenação]
6. Ações rápidas encadeadas: salvar e [+ Encaminhar] [+ Conceder benefício] [+ Agendar retorno]
Offline/queda: rascunho persiste localmente (IndexedDB) com aviso "Sem conexão — será enviado ao reconectar".

### 4.4 Concessão de benefício (antiduplicidade em primeiro plano)
Layout em duas colunas: à esquerda o formulário (tipo → critérios/valor carregam da configuração do tenant → parecer técnico [sensível] → quantidade), à direita o **histórico da família na rede** com alerta destacado: "⚠ Cesta básica concedida há 12 dias no CRAS Sul — janela mínima do município: 30 dias" (bloqueio ou justificativa, conforme parametrização). Fluxo de status com linha de aprovação visível (Solicitado → Parecer → Aprovação → Entrega). Na entrega: comprovante em PDF com brasão + assinatura na tela (canvas) opcional; botão de reimpressão sempre auditado.

### 4.5 Chamada de frequência (mobile-first)
Lista vertical de participantes com foto/iniciais e alvo de toque ≥ 48px; tocar alterna Presente/Falta; contador no topo; funciona offline e sincroniza. Ao encerrar: resumo "18 presentes · 3 faltas · 2 justificadas" e atalho "repetir lista do último encontro".

### 4.6 Agenda & Fila do dia
Agenda semanal por profissional/unidade com cores por tipo. Fila do dia em kanban de 3 colunas: Aguardando → Em atendimento → Concluído; cartão mostra nome, motivo NÃO sensível e tempo de espera; recepção arrasta ou usa botões. Check-in transforma agendamento em presença com um clique.

### 4.7 Painel de encaminhamentos
Duas listas: Recebidos (aguardando aceite / em atendimento / com devolutiva a dar) e Enviados (aguardando devolutiva — com idade em dias e cor âmbar após prazo). Devolutiva abre formulário curto de contrarreferência. Externo: gera guia PDF numerada.

### 4.8 Conferência e fechamento do RMA ⭐
```
┌ RMA · CRAS Norte · Junho/2026 ─────────────── Status: EM CONFERÊNCIA ┐
│ Bloco 2 — Atendimentos individualizados                              │
│ C1 Famílias atendidas .......................  [ 128 ] 🔎            │
│ C2 Encaminhadas p/ inclusão no CadÚnico .....  [  14 ] 🔎            │
│ C4 Indivíduos encaminhados ao BPC ...........  [   6 ] 🔎  ✎ ajustar │
│ …                                                                    │
│ [Exportar PDF espelho] [Exportar CSV]        [Fechar mês →]          │
└──────────────────────────────────────────────────────────────────────┘
```
🔎 abre o drill-down: a lista exata de registros que compõem o número (com link para cada um). ✎ ajusta manualmente com justificativa obrigatória (fica marcado "ajustado" no PDF interno). Fechar o mês exibe confirmação com consequências ("registros de junho ficam travados") e assinatura de perfil. Estado pós-fechamento: somente leitura com banner e opção "solicitar reabertura" (coordenador).

### 4.9 Dashboard do gestor + mapa
Linha 1: cartões grandes (Archivo 32) — atendimentos no mês, acompanhamentos ativos, benefícios concedidos/orçamento %, encaminhamentos pendentes — cada um clicável para o relatório. Linha 2: série de 12 meses (barras) + distribuição por serviço (donut com rótulos textuais). Linha 3: mapa (MapLibre) com camadas: calor por território (padrão, agregado) e pinos identificados (somente perfis autorizados; ativar pinos mostra aviso de auditoria). Filtros persistentes por período/unidade/território; botão "versão para impressão" (layout A4, cabeçalho com brasão — vira anexo de prestação de contas).

### 4.10 Administração do tenant
Assistente de implantação (wizard): 1 Unidades → 2 Territórios → 3 Equipes e lotações → 4 Tipos de benefício (critérios, valores, janelas) → 5 Parâmetros de sigilo → 6 Importação CadÚnico (upload → mapeamento → prévia da conciliação: novos/atualizados/conflitos → aplicar). Tela de importação mostra progresso do job e log baixável.

---

## 5. Componentes reutilizáveis (biblioteca do módulo)

| Componente | Papel |
|---|---|
| `<BuscaGlobal>` | Typeahead com agrupamento, atalho `/`, debounce, destaque do termo |
| `<CabecalhoFamilia>` | Header fixo com chips de situação e ações contextuais por perfil |
| `<TrilhaFamilia>` | Timeline virtualizada, glifos por tipo, paginação por mês |
| `<CartaoSigiloso>` | Conteúdo velado + cadeado + revelação consciente (dispara evento de auditoria via API) |
| `<CampoCPF> / <CampoNIS>` | Máscara, validação de DV em tempo real, exibição mascarada |
| `<SeletorMembros>` | Chips da composição familiar com toque |
| `<EditorEvolucao>` | Rich-text mínimo + autosave com status visível + rascunho offline |
| `<FluxoStatus>` | Linha de aprovação (benefício, encaminhamento) |
| `<NumeroRMA>` | Valor + lupa de drill-down + estado "ajustado" |
| `<GradeFrequencia>` | Lista de chamada mobile-first offline-first |
| `<MapaTerritorial>` | Camadas calor/pinos com trava por permissão |
| `<EstadoVazio>` | Ilustração leve + frase-ação ("Nenhum encaminhamento pendente — bom trabalho") |
| `<BarraOffline>` | Estado de conexão + fila de sincronização |

---

## 6. Arquitetura técnica do frontend

- **Stack**: a da plataforma GovAssist (placeholder no prompt). Referência recomendada: SPA React + TypeScript + Vite, roteamento por módulo, importada como módulo federado/rota da shell do GovAssist.
- **Dados**: cliente HTTP central com interceptador de tenant/token, tratamento padronizado de RFC 9457 (mapa `type` → mensagem pt-BR), retry idempotente. Cache e sincronização com TanStack Query (staleTime curto em fila/agenda, invalidação por mutação).
- **Permissões**: hook `usePermissao('beneficio.conceder')` alimentado pelas claims; componente `<Permitido papel=…>` remove subárvores; rotas protegidas redirecionam para "sem acesso" institucional.
- **Formulários**: React Hook Form + Zod espelhando as validações do backend (uma fonte de esquema compartilhada se o stack permitir).
- **Offline**: IndexedDB para rascunhos de evolução e chamadas de frequência; fila de sincronização com resolução "servidor vence + preserva rascunho local em conflito".
- **Estado sensível**: nunca persistir conteúdo sigiloso revelado em cache local além da sessão; `CartaoSigiloso` busca sob demanda e não grava em query-cache persistente.
- **Impressões/PDF**: rotas de impressão dedicadas (layout A4) para prontuário, comprovante, guia e RMA espelho — geradas no backend quando exigirem numeração/auditoria, no front quando forem apenas visualização.
- **Testes**: unitários de componentes críticos (validações, NumeroRMA), e2e (Playwright) dos 5 fluxos-chave (busca→ficha, atendimento ≤2min, concessão com alerta, chamada offline→sync, fechamento RMA), axe em CI.
- **Performance**: listas virtualizadas (Trilha, resultados), code-splitting por rota, orçamento de bundle inicial ≤ 250 KB gzip, funcionar bem em máquinas modestas de prefeitura.

## 7. Critérios de aceite globais do frontend
1. Registro de atendimento completo em ≤ 2 min por usuário treinado (medir em teste moderado).
2. Zero elemento interativo sem foco visível; axe sem violações sérias nas 10 telas.
3. Nenhum dado sensível visível a perfil sem permissão em nenhum estado (incluindo tooltips, exports e telas de impressão).
4. Rascunhos sobrevivem a queda de conexão e de aba.
5. Todos os textos em pt-BR com o vocabulário do SUAS; botões nomeiam a ação exata ("Fechar RMA de junho", não "Enviar").
