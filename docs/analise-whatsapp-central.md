# Análise de Melhorias — Central de Atendimento WhatsApp (ChatGov)

> Análise estática do módulo `modulo-chatgov/frontend/src/components/PainelAtendimento.jsx`, `BolhaConversa.jsx`, `ItemConversa.jsx`, `ColunaEsquerda.jsx` (modo atendimento) e do backend `backend/src/whatsapp/WhatsAppManager.js` + rotas REST.
>
> Gerado em: 2026-06-10

## Índice

1. [UX do chat](#1-ux-do-chat-critico)
2. [Composer / envio](#2-composer--envio)
3. [Cabeçalho da conversa](#3-cabeçalho-da-conversa-header-lotado)
4. [Lista de conversas (ColunaEsquerda)](#4-lista-de-conversas-colunaesquerda)
5. [Filtros e chips](#5-filtros-e-chips)
6. [Backend WhatsApp (WhatsAppManager.js)](#6-backend-whatsapp-whatsappmanagerjs)
7. [Backend REST atendimento](#7-backend-rest-atendimento)
8. [Acessibilidade (a11y)](#8-acessibilidade-a11y)
9. [UX/Estado](#9-uxestado)
10. [Código](#10-código)
11. [Privacidade / LGPD](#11-privacidade--lgpd)
12. [Recursos avançados que faltam](#12-recursos-avançados-que-faltam)
13. [Tabela consolidada por severidade](#13-tabela-consolidada-por-severidade)

---

## 1. UX do chat (crítico)

### 1.1 Auto-scroll sempre no fim
- **Arquivo:** `PainelAtendimento.jsx:76-78`
- O efeito rola ao final a cada `mensagens` mudar, mesmo quando o usuário rola para cima para ler mensagens antigas. A próxima mensagem recebida "puxa" o scroll involuntariamente.
- **Solução:** detectar se `scrollTop + clientHeight >= scrollHeight - threshold` antes do update; se não, mostrar botão flutuante "↓ X novas mensagens".

### 1.2 Sem agrupamento de bolhas
- **Arquivo:** `BolhaConversa.jsx`
- Cada mensagem tem `marginBottom: 4` e repete o nome do operador. Em sequências do mesmo operador, fica visualmente bagunçado.
- **Solução:** agrupar mensagens consecutivas do mesmo `remetente_id` e ocultar nome/avatar a partir da 2ª.

### 1.3 Sem botão "X novas mensagens"
- Quando chega mensagem e o usuário não está no fim do chat, ela aparece silenciosamente. Falta o contador flutuante (já implementado no chat interno, pode reutilizar padrão).

### 1.4 Sem paginação / scroll infinito
- `fetchMensagens` retorna `LIMIT` fixo (provavelmente 200-500). Conversas longas truncam sem possibilidade de carregar mais.
- **Solução:** cursor `?antesDe=<id>&limite=50` e detecção de scroll no topo para carregar mais.

### 1.5 Sem indicador "digitando..." do cliente
- O backend tem `setTyping` (`WhatsAppManager.js:236`) mas nunca é chamado para notificar o atendente quando o cliente está digitando.
- **Solução:** escutar `presence` updates do Baileys e emitir `cliente:digitando` no socket.

### 1.6 Composer sem Shift+Enter
- `Enter` envia, `Shift+Enter` não quebra linha. Faltam:
  - Emoji picker real (botão `Smile` é decorativo)
  - Drag & drop de arquivo
  - Barra de progresso de upload
  - Atalhos (Ctrl+B, Ctrl+I para formatação)

### 1.7 Templates sem variáveis
- `aplicarTemplate` (linha 190) envia o conteúdo literal. Variáveis comuns como `{{nome}}`, `{{telefone}}`, `{{protocolo}}` não são preenchidas.

### 1.8 Sem preview de link
- Links aparecem como texto puro. Comum em WhatsApp mostrar um card de preview.

### 1.9 Sem reações
- O chat interno tem (`mensagem:reagir`), mas o atendimento não. WhatsApp suporta reações (👍 ❤️ 😂 etc) e o sistema ignora.

### 1.10 Sem reply / quote
- Não dá para responder uma mensagem específica do cidadão criando um thread.

---

## 2. Composer / envio

### 2.1 Botões Smile e Paperclip decorativos
- **Arquivo:** `PainelAtendimento.jsx:447-448`
- Não fazem nada. Apenas clicáveis sem ação.

### 2.2 Sem suporte a mídia
- Input só aceita texto. `WhatsAppManager.sendMedia` (`WhatsAppManager.js:188`) existe mas nunca é chamado pelo composer.

### 2.3 Sem validação de tamanho
- Sem limite de caracteres no frontend nem contador visível.

### 2.4 Sem retry de envio
- Se a rede cair durante o envio, a mensagem é perdida.

### 2.5 Magic number de timeout
- `socket.timeout(12000)` é fixo. Sem feedback ao usuário durante o envio ("Enviando..."), apenas um boolean `enviando`.

### 2.6 Estado de envio global
- O boolean `enviando` é único. Se enviar 5 mensagens em sequência rápida, todas enfileiram mas a UI mostra só "uma" em envio.

---

## 3. Cabeçalho da conversa (header lotado)

### 3.1 Header tem 9 botões
- Em telas < 1280px, os botões "Assumir", "Transferir", "Devolver", "Anexar", "Templates", "Etiquetas", "Encaminhar", "Resolver", "Arquivar", "Excluir" estouram o layout.
- **Solução:** agrupar em menu "⋯" (MoreHorizontal). Manter visível só: Templates, Etiquetas, Resolver, Mais.

### 3.2 Sem agrupamento de ações destrutivas
- "Arquivar" e "Excluir" deveriam ficar num menu separado de "Resolver".

### 3.3 Sem indicador online do contato
- Só mostra telefone.

### 3.4 Sem "visto por último"
- WhatsApp original mostra; pode ser útil.

### 3.5 Sem tempo de espera / SLA
- Não há badge tipo "aguardando 12 min" ou "SLA estourado em 2 min".

### 3.6 Sem histórico de transferências
- Mostra apenas "em atendimento por X" atual, sem log de quem atendeu antes nem timeline de mudanças.

### 3.7 Editar nome via clique no header é não-óbvio
- Input aparece inline sem label claro; foco se perde ao clicar fora (onBlur cancela).

### 3.8 Sem status "lido / não lido pelo cliente"
- Backend emite `mensagem:status` (linha 62 do PainelAtendimento), mas não há indicador visual claro além do componente `Tick` (✓ vs ✓✓).

---

## 4. Lista de conversas (ColunaEsquerda)

### 4.1 Sem preview de mídia
- `ultima_mensagem` mostra string "imagem" ou texto puro, sem thumbnail.

### 4.2 Sem "fixar" conversa
- Gestor não consegue destacar importantes no topo.

### 4.3 Arquivados sem seção dedicada
- Só chip filtra, não há pasta "Arquivadas" visível.

### 4.4 Sem busca avançada
- `busca` em `ColunaEsquerda.jsx` é só substring do nome/telefone. Não busca dentro das mensagens.

### 4.5 Sem ordenação customizável
- Provavelmente só `ultima_mensagem_em DESC`.

### 4.6 Sem agrupar por departamento
- Gestor com 30 secretarias precisa rolar muito.

### 4.7 Sem badge "minha conversa"
- Não destaca visualmente o que é meu vs fila vs outro operador.

### 4.8 Inconsistência de data
- `formatarHora` no `ItemConversa.jsx:6` mostra "Ontem" / "Seg" / data; `ItemCanal.jsx` mostra data completa. Sem padrão.

---

## 5. Filtros e chips

### 5.1 Sem filtro "atribuídas a mim"
- Chip "Tudo" mostra todas; não há chip "Minhas" (sou dono).

### 5.2 Sem filtro por status
- Só os chips básicos (Tudo, Não lidas, Fila, Arquivadas). Falta "Resolvidas", "Pendentes", "Urgentes".

### 5.3 Sem contagem por departamento no chip
- Gestor não vê onde está o gargalo.

---

## 6. Backend WhatsApp (WhatsAppManager.js)

### 6.1 `start` sem lock
- **Arquivo:** `WhatsAppManager.js:29`
- Dois admins clicando simultaneamente em "Conectar" podem iniciar duas instâncias Baileys para o mesmo tenant, corrompendo credenciais.
- **Solução:** `if (this._initPromises.has(tenantId)) return this._initPromises.get(tenantId);`

### 6.2 Reconexão infinita sem backoff
- `WhatsAppManager.js:143` tenta reconectar em 3s sempre. Se o servidor do WhatsApp estiver fora por horas, serão milhares de tentativas. Sem:
  - Backoff exponencial
  - Limite de tentativas
  - Notificação ao admin após N falhas

### 6.3 Logs de debug excessivos
- `WhatsAppManager.js:66-69` loga toda mensagem recebida com `fromMe`, `senderPn`, `stub` etc. Em produção vira spam e potencialmente vaza dados sensíveis em logs.

### 6.4 Sem rate-limit de envio
- Operador pode disparar 1000 mensagens/segundo via socket e ser banido pelo WhatsApp.

### 6.5 `sendText` e `sendMedia` sem retry
- Falha de rede = mensagem perdida. Sem fila de retry.

### 6.6 `_resolveRecipientJid` chama `onWhatsApp` em todo envio
- Operação cara. Cachear resultado por 5 minutos.

### 6.7 Mensagens de grupo não tratadas
- `remoteJid.includes('@g.us')` não é filtrado em `messages.upsert` (linha 70-74). O sistema recebe e tenta processar, mas o resto do sistema não trata grupos.

### 6.8 Sem fila de envio durante desconexão
- Se cair, mensagens pendentes se perdem.

### 6.9 Sem healthcheck
- Se a sessão travar sem `connection.update`, ninguém percebe.

### 6.10 `setTyping` não é chamado para o atendente
- Cliente está digitando? Backend nunca avisa o atendente.

### 6.11 Sem deduplicação
- Reconexão do Baileys frequentemente re-entrega mensagens. Sem `UNIQUE (wa_message_id)` ou verificação na inserção, duplica.

### 6.12 Sem suporte a mensagens de reação (👍 ❤️) do WhatsApp
- O Baileys entrega; o sistema ignora silenciosamente.

### 6.13 Sem suporte a polls, contatos, location
- WhatsApp envia; sistema ignora.

### 6.14 `restaurarSessoes` em série
- **Arquivo:** `WhatsAppManager.js:15-27` — abre N sockets sequencialmente. Com 50 tenants, demora 50× o tempo.

---

## 7. Backend REST atendimento

### 7.1 `authMiddleware` antes de `/api/auth/login`
- **Arquivo:** `index.js:231` — login precisa estar registrado antes do middleware global. (Verificar se está.)

### 7.2 Inconsistência de parâmetros
- `GET /api/conversas` aceita `departamento_id` mas `ColunaEsquerda.jsx:44` envia `departamento`. Provável bug silencioso.

### 7.3 Sem `DELETE /api/conversas/:id/mensagens/:msgId`
- Operador não consegue apagar mensagem enviada errada (LGPD exige).

### 7.4 Sem `PATCH /api/conversas/:id`
- Só dá para mudar departamento/operador via socket; deveria ter REST.

### 7.5 Sem endpoint de exportação da conversa
- LGPD/compliance exige exportação de dados do cidadão.

### 7.6 Sem paginação em `GET /api/conversas`
- Em 10k conversas, retorna tudo.

### 7.7 N+1 em `GET /api/conversas`
- Provavelmente cada conversa faz query separada para `ultima_mensagem`, `nao_lidas`, `operador_nome`, `departamento`. Resolver com subqueries ou JOIN.

---

## 8. Acessibilidade (a11y)

### 8.1 Botões com só ícone sem `aria-label`
- `Smile`, `Paperclip` no composer (linha 447-448).

### 8.2 Área de mensagens sem `role="log"`
- Leitores de tela não anunciam novas mensagens.

### 8.3 Sem foco visível em inputs
- Padrão do navegador some em alguns casos.

### 8.4 Dropdowns sem `role="menu"`
- Templates, Etiquetas, Encaminhar (linhas 297-334) — navegação por teclado (Tab, Esc, setas) não funciona.

### 8.5 Sem `aria-live` para banners
- Banner de transferência pendente, "em atendimento por", mudança de status — todos sem anúncio para leitores de tela.

### 8.6 Sem skip-links
- Teclado precisa tabular por todos os botões do header.

---

## 9. UX/Estado

### 9.1 Confirmações via `alert()` e `confirm()`
- **Arquivo:** `PainelAtendimento.jsx:121, 126, 130, 182`
- Bloqueia thread, visual feio, não acessível.

### 9.2 Sem undo de exclusão de conversa
- Exclusão é imediata e irreversível.

### 9.3 Sem undo de resolução
- "Resolver" é irreversível pelo socket.

### 9.4 Notas internas sem edição/exclusão
- Só adiciona; não dá para apagar nota errada.

### 9.5 Editar nome do contato salva silenciosamente
- Sem feedback "salvo" / toast.

### 9.6 Sem proteção contra duplo-clique em "Resolver"
- Dispara 2x (backend pode tratar, frontend não).

### 9.7 `socket?.emit('conversa:atribuir')` sem ack
- Se falhar, UI não sabe.

### 9.8 Sem indicador de conexão websocket
- `connected` existe no `SocketContext` mas não há badge visual no header.

### 9.9 Estado "carregando" sem skeleton
- Lista pisca em branco ao trocar filtro.

---

## 10. Código

### 10.1 `BolhaConversa.jsx` mistura DOM hardcoded + import de `T`
- Cores hardcoded (`#FFFFFF`, `#d9fdd3`, `#2563EB`) em vez de usar `T.*`.

### 10.2 Estilos inline gigantes
- `PainelAtendimento.jsx` tem 568 linhas; ~80% é style. Difícil manter e revisar.

### 10.3 Magic strings para `papel`
- `'admin'`, `'supervisor'`, `'atendente'`, `'operador'` espalhados pelo código.

### 10.4 `formatarHora` duplicado
- Em `BolhaConversa.jsx:5`, `ItemConversa.jsx:6`, `BolhaMensagem.jsx`, e o `formatarDataHora` do `utils/arquivo.js`. 4 implementações diferentes.

### 10.5 Sem testes
- Nem backend nem frontend.

### 10.6 `PainelAtendimento.jsx` monolítico
- Separar em `HeaderAtendimento`, `MensagensArea`, `Composer`, `NotasInternas`, `BannersTransf`.

### 10.7 `socket.timeout(12000).emit(... callback)`
- Callback é chamado com `(err, ack)` onde `err` é timeout e `ack` é resposta do servidor. Padrão confuso.

### 10.8 Sem tratamento de mensagens de sistema
- Se o Baileys entregar `protocolMessage` (revogar), `appStateChanges`, `contacts.update`, o sistema quebra silenciosamente.

### 10.9 `useEffect` re-assina listeners sem cleanup apropriado
- Linha 73 mistura `socket.off` de alguns eventos e não remove listeners órfãos.

### 10.10 `Promise` sem `AbortController`
- `fetchMensagens`, `fetchDepartamentos` etc. não podem ser cancelados ao trocar de conversa rapidamente, gerando race conditions.

---

## 11. Privacidade / LGPD

### 11.1 Sem botão "solicitar exclusão de dados"
- Existe `solicitarExclusaoLGPD` na API mas não há UI na conversa.

### 11.2 Sem máscara de número em screenshots/logs
- Print de tela vaza número inteiro.

### 11.3 Sem retenção configurável
- Conversas ficam para sempre.

### 11.4 Sem export "minhas conversas" para o próprio operador
- Operador não consegue levar histórico ao sair.

### 11.5 Sem política de retenção de mídia
- Imagens/documentos nunca são purgados.

---

## 12. Recursos avançados que faltam

- **Respostas rápidas com variáveis** (`{{nome}}`, `{{telefone}}`, `{{protocolo}}`, `{{data}}`)
- **Botões interativos** (WhatsApp Business API — Quick Reply, Call to Action)
- **List messages** (listas de opções)
- **Agendamento de mensagens** (enviar em data/hora futura)
- **Resposta automática fora do horário** (já tem config no tenant, falta disparo)
- **Chatbot visual** (existe `chatbot.js` mas sem UI para criar fluxos)
- **Avaliação NPS pós-atendimento** (existe `criarPesquisaNPS` mas não integrado)
- **Gravação de áudio do atendente** (MediaRecorder API)
- **Tradução automática** de mensagens recebidas
- **Sugestão de resposta por IA** no composer (existe `iris.js` mas não integrado)
- **Multi-canal** (Instagram, Facebook Messenger, Telegram) — Baileys tem só WhatsApp
- **Voz sobre IP / ligação VoIP** via WhatsApp Business Calling API
- **Status / Stories** do WhatsApp
- **Catálogo de produtos** (WhatsApp Business Catalog)
- **Pagamentos in-chat** (WhatsApp Pay)

---

## 13. Tabela consolidada por severidade

| #  | Severidade    | Item                                                                  | Esforço |
|----|---------------|-----------------------------------------------------------------------|---------|
| 1  | 🔴 crítico   | Auto-scroll sempre no fim (UX chat)                                   | P       |
| 2  | 🔴 crítico   | N+1 em `GET /api/conversas`                                          | M       |
| 3  | 🔴 crítico   | Sem deduplicação de mensagens (reconexão)                             | P       |
| 4  | 🟠 alto      | Lock em `WhatsAppManager.start` (race condition)                      | P       |
| 5  | 🟠 alto      | Backoff exponencial em reconexão                                      | P       |
| 6  | 🟠 alto      | Composer sem suporte a mídia                                          | G       |
| 7  | 🟠 alto      | Sem paginação de mensagens (LIMIT fixo)                               | M       |
| 8  | 🟠 alto      | Sem indicador online / digitando do cliente                           | M       |
| 9  | 🟠 alto      | Header lotado (9 botões)                                              | M       |
| 10 | 🟠 alto      | Inconsistência `departamento` vs `departamento_id`                    | P       |
| 11 | 🟠 alto      | Sem `DELETE /api/conversas/:id/mensagens/:msgId` (LGPD)               | P       |
| 12 | 🟡 médio     | Agrupamento de bolhas                                                 | M       |
| 13 | 🟡 médio     | Botão "X novas mensagens"                                             | P       |
| 14 | 🟡 médio     | Atalho Shift+Enter quebra linha                                       | P       |
| 15 | 🟡 médio     | Drag&drop de arquivo + barra de progresso                             | M       |
| 16 | 🟡 médio     | Emoji picker real                                                     | M       |
| 17 | 🟡 médio     | Templates com variáveis                                               | M       |
| 18 | 🟡 médio     | Reactions no atendimento (paridade com chat interno)                   | M       |
| 19 | 🟡 médio     | Reply/quote de mensagem                                               | M       |
| 20 | 🟡 médio     | Preview de link                                                       | G       |
| 21 | 🟡 médio     | Cache `_resolveRecipientJid`                                          | P       |
| 22 | 🟡 médio     | Filtro "atribuídas a mim"                                             | P       |
| 23 | 🟡 médio     | Filtro por status (resolvida, pendente)                               | P       |
| 24 | 🟡 médio     | "Fixar" conversa na lista                                            | M       |
| 25 | 🟡 médio     | Agrupar por departamento                                              | M       |
| 26 | 🟡 médio     | a11y (aria-labels, role=log, focus)                                   | M       |
| 27 | 🟡 médio     | Toasts / undo para ações destrutivas                                  | M       |
| 28 | 🟡 médio     | Indicador de conexão websocket no header                              | P       |
| 29 | 🟡 médio     | Skeleton de carregamento                                              | P       |
| 30 | 🟡 médio     | `restaurarSessoes` em paralelo                                        | P       |
| 31 | 🟡 médio     | Rate-limit de envio no servidor                                       | M       |
| 32 | 🟡 médio     | Retry de envio com fila                                               | G       |
| 33 | 🟡 médio     | Healthcheck de sessão WhatsApp                                        | M       |
| 34 | 🟢 baixo     | Tempo de espera / SLA badge                                           | M       |
| 35 | 🟢 baixo     | Histórico de transferências (timeline)                                | G       |
| 36 | 🟢 baixo     | Confirmações via modal (não `alert`/`confirm`)                        | P       |
| 37 | 🟢 baixo     | Editar/excluir notas internas                                         | M       |
| 38 | 🟢 baixo     | Refatorar `PainelAtendimento.jsx` em subcomponentes                   | G       |
| 39 | 🟢 baixo     | Unificar `formatarHora` (4 implementações)                            | P       |
| 40 | 🟢 baixo     | Migration para JSX (substituir `React.createElement`)                 | G       |
| 41 | 🟢 baixo     | Testes automatizados                                                  | G       |
| 42 | 🟢 baixo     | Sugestão de resposta por IA (Iris integrado)                          | G       |
| 43 | 🟢 baixo     | Agendamento de mensagens                                              | G       |
| 44 | 🟢 baixo     | Botões interativos (WhatsApp Business)                                | G       |
| 45 | 🟢 baixo     | Multi-canal (Instagram, Telegram)                                     | GG      |
| 46 | 🟢 baixo     | Retenção/LGPD (export, purge automático)                              | M       |

**Legenda:** P = poucas horas · M = 1-2 dias · G = 1 semana · GG = 2+ semanas
