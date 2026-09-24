# Plano: Aviso global (popup) do Admin para atendentes online

> Status: **PLANEJADO** — aguardando implementação.
> Módulo: `modulo-chatgov`

## Objetivo

Criar uma nova aba em **Configurações → "Avisos"** onde o administrador do órgão
escreve uma mensagem que aparece como **popup em tempo real** para todos os
atendentes online daquele órgão (tenant).

Exemplo de mensagem:
> "Olá, aqui é o TI. Preciso que todos se desloguem e loguem novamente, ou o
> sistema vai ser atualizado e você poderá ser desconectado por alguns minutos."

Cada atendente que recebe o popup pode fechá-lo.

---

## Como se encaixa na arquitetura atual

- **Multi-tenant:** o gateway já isola por sala `tenant:${tenantId}`
  (`salas.tenant`), então o broadcast atinge só os operadores do órgão do admin.
- **Config admin-only:** o padrão `requirePapel('admin')` já protege endpoints de
  configuração (ex.: `/api/config`, `/api/bloqueios`).
- **Realtime:** o `io` é retornado por `iniciarGateway` e fica acessível em
  `index.js` (`backend/src/index.js:2388`), permitindo emitir a partir de uma
  rota REST.
- **Overlay global:** o `ChatGov.jsx` já usa `useSocket()` e envolve toda a
  aplicação — lugar ideal para montar o listener + o modal de popup.

---

## Backend

### 1. Migração — `backend/src/migrations/evolucoes.sql`
Append idempotente (padrão `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

Nova tabela `avisos_globais` (histórico + estado atual do aviso):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | UUID/serial (PK) | seguir padrão das outras tabelas |
| `tenant_id` | FK | órgão que enviou |
| `titulo` | TEXT | opcional, ex.: "TI" |
| `mensagem` | TEXT | conteúdo do aviso |
| `ativo` | BOOLEAN | default `true` |
| `criado_por` | operador id | quem enviou |
| `criado_em` | timestamp | default `now()` |
| `atualizado_em` | timestamp | default `now()` |

- Criar índice por `tenant_id`.

### 2. Endpoints REST em `backend/src/index.js`
Colocar junto aos demais `requirePapel('admin')` (~linha 1180).

- `GET /api/avisos` (`requirePapel('admin')`)
  → busca o último aviso do tenant (para preencher o formulário).
- `POST /api/avisos/enviar` (`requirePapel('admin')`):
  - valida `mensagem` (não vazia, limite ~500 chars);
  - insere registro em `avisos_globais`;
  - dispara `io.to(salas.tenant(op.tenantId)).emit('aviso:global', { id, titulo, mensagem, criado_em })`.
- (Opcional) `POST /api/avisos/limpar` (`requirePapel('admin')`):
  - marca `ativo=false`;
  - emite `aviso:global:limpar` para retirar popups abertos.

> **Nota técnica:** como `salas` está encapsulado no `gateway.js`, exportar um
> helper `emitirAvisoGlobal(io, tenantId, payload)` de `gateway.js`
> (ou exportar `salas`) para o `index.js` usar sem duplicar a lógica de salas.

### 3. Gateway — `backend/src/realtime/gateway.js`
- Nenhuma mudança no handshake; reuso do broadcast por tenant já existente
  (`salas.tenant`).
- Adicionar/exportar o helper de emit descrito acima.

---

## Frontend

### 4. API client — `frontend/src/api/index.js`
- `fetchAvisoAtual()` → `GET /api/avisos`
- `enviarAvisoGlobal(body)` → `POST /api/avisos/enviar`
- (opcional) `limparAvisoGlobal()` → `POST /api/avisos/limpar`

### 5. Nova aba — `frontend/src/components/PaginaConfiguracoes.jsx`
- Adicionar item no array `ABAS`
  (ex.: `{ id: 'avisos', label: 'Avisos', icon: Megaphone }` — ícone do `lucide-react`).
- Adicionar `aba === 'avisos' && React.createElement(AbaAvisos)` no render.
- Componente `AbaAvisos` (segue o padrão de `AbaGeral`):
  - `textarea` para a mensagem + campo opcional de título ("Ex.: TI / Aviso do sistema");
  - contador de caracteres;
  - pré-visualização de como o popup aparecerá;
  - botão **"Enviar aviso a todos os atendentes online"** usando `BotaoSalvar`;
  - confirmação antes de enviar (ação com impacto em todos).
- **Segurança de UI:** esconder a aba para não-admin, checando
  `auth.operador.papel === 'admin'`.

### 6. Popup global — `frontend/src/ChatGov.jsx`
- `useEffect` com `socket.on('aviso:global', ...)` guardando o aviso em estado
  (`avisoAtivo`).
- Renderizar `ModalAvisoGlobal` (overlay full-screen com backdrop, ícone de alerta,
  título, mensagem e botão **"Entendi / Fechar"**), seguindo o estilo visual de
  `TelaQR` / modais existentes e tokens do `theme.js` (`T.warning`, `T.surface`, etc.).
- Fechar limpa o estado local (não afeta outros usuários).
- `socket.off` no cleanup.
- (Opcional) tratar `aviso:global:limpar` fechando o popup remotamente.

### 7. Novo componente — `frontend/src/components/ModalAvisoGlobal.jsx`
- Modal simples, acessível (fecha com botão; opcional ESC).
- Responsivo (mobile/desktop via `breakpoint`).

---

## Comportamento e detalhes de UX/segurança

- Só **admin** vê a aba e consegue enviar (protegido no backend por
  `requirePapel('admin')` + no frontend escondendo a aba para não-admin).
- O popup chega **apenas a quem está online** (conectado ao socket) no mesmo
  tenant — exatamente o pedido. Quem está offline não recebe retroativamente
  (a menos que se adote o passo opcional abaixo).
- **Opcional (a decidir):** ao logar, buscar aviso `ativo` recente e exibir uma
  vez — para quem entrou depois do envio.

---

## Arquivos afetados (resumo)

| Arquivo | Ação |
|---|---|
| `backend/src/migrations/evolucoes.sql` | + tabela `avisos_globais` |
| `backend/src/index.js` | + endpoints `GET/POST /api/avisos*` |
| `backend/src/realtime/gateway.js` | + helper de emit por tenant (export) |
| `frontend/src/api/index.js` | + funções de API |
| `frontend/src/components/PaginaConfiguracoes.jsx` | + aba `AbaAvisos` |
| `frontend/src/components/ModalAvisoGlobal.jsx` | novo componente popup |
| `frontend/src/ChatGov.jsx` | + listener socket + render do modal |

## Esforço estimado

Pequeno/médio — ~1 tabela, 2 endpoints, 1 evento socket, 1 aba e 1 modal.
Sem dependências novas.

---

## Decisões pendentes (confirmar antes de implementar)

1. **Persistência para quem loga depois:** mostrar o aviso a quem logar após o
   envio (persistência + exibição no login)? Ou apenas para quem já está online
   no momento do envio?
2. **Ação no popup:** só o botão "Fechar", ou também um botão
   **"Sair e entrar novamente"** (logout direto)?
3. **Título separado:** o título ("Olá, aqui é o TI") deve ser um campo separado
   editável, ou tudo dentro de uma única caixa de mensagem?

---

## Referências de código (para a implementação)

- Salas por tenant: `backend/src/realtime/gateway.js:24` (`salas.tenant`)
- `io` retornado: `backend/src/realtime/gateway.js:1368` e uso em `backend/src/index.js:2388`
- Middleware admin: `backend/src/auth/middleware.js:67` (`requirePapel`)
- Endpoints de config existentes: `backend/src/index.js:1180` (`GET/PUT /api/config`)
- Padrão de aba de config: `frontend/src/components/PaginaConfiguracoes.jsx:19` (array `ABAS`), `:398` (`AbaGeral`)
- Botão salvar reutilizável: `frontend/src/components/PaginaConfiguracoes.jsx:250` (`BotaoSalvar`)
- Overlay global / socket: `frontend/src/ChatGov.jsx:88` (padrão de listener)
- API client (fetch + token): `frontend/src/api/index.js:223` (`fetchConfig`/`salvarConfig`)
- Tokens de tema: `frontend/src/theme.js` (`T.warning`, `T.surface`, `T.danger`)
