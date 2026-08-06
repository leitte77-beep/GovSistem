# PROMPT DE ENGENHARIA — Módulo "ChatGov"

> **Como usar este documento:** entregue este arquivo inteiro à sua IA programadora (Claude Code, Cursor, etc.) como especificação única do módulo. Ele é autossuficiente: contém objetivo de negócio, stack, restrições legais, modelo de dados pronto, contratos de tempo real e a especificação da interface. Peça à IA para implementar **por fases** (seção 16) e validar contra os **critérios de aceitação** (seção 17) antes de avançar.

---

## 0. Papel da IA

Você é um(a) engenheiro(a) de software sênior especializado(a) em sistemas SaaS multi-tenant para o setor público. Vai construir um módulo de atendimento via WhatsApp, com aparência de WhatsApp e marca **ChatGov**, dentro de uma plataforma de governo já existente (**GovSistem**, que já possui outros módulos, como Diário Oficial). Priorize: isolamento entre entidades (tenants), robustez de conexão, conformidade com a LGPD e um caminho de migração limpo para a API oficial do WhatsApp no futuro. Não tome atalhos que comprometam segurança ou separação de dados entre prefeituras.

---

## 1. Objetivo de negócio

A plataforma atende **várias entidades públicas** (prefeituras, autarquias, câmaras) em regime multi-tenant. Cada entidade quer **um único número de WhatsApp** que seja **compartilhado por várias secretarias/departamentos** (Saúde, Tributos, Protocolo, Assistência Social, Obras…). O cidadão manda mensagem para esse número e a equipe responde por uma interface única, no estilo WhatsApp Web, encaminhando cada conversa para a secretaria responsável.

Além disso, para **não sobrecarregar a conexão do WhatsApp**, o sistema oferece um **chat interno** — conversa entre operadores (DMs e grupos), com envio de arquivos — que é **totalmente independente** do WhatsApp e nunca consome a sessão dele.

Resultado esperado: um produto coeso, profissional e pronto para uso, visualmente igual ao WhatsApp mas com marca própria (ChatGov), sem reproduzir o logotipo nem ativos protegidos do WhatsApp.

---

## 2. Conceitos-chave (glossário)

- **Tenant / Entidade** — uma prefeitura ou órgão. Tudo é isolado por `tenant_id`.
- **Departamento / Secretaria** — subdivisão de um tenant. Várias secretarias dividem o **mesmo** número de WhatsApp.
- **Operador** — usuário do sistema (servidor público). Tem papel `admin | supervisor | operador` e pode atender uma ou mais secretarias.
- **Conversa** — fio de mensagens com **um** contato externo (cidadão), via WhatsApp. Nasce na **fila** e é **triada** (atribuída) a uma secretaria/operador.
- **Fila / Triagem** — conversa sem secretaria definida fica na fila geral; alguém (ou um bot) a encaminha para a secretaria certa.
- **Chat interno** — canais (`dm` ou `grupo`) entre operadores. Não passa pelo WhatsApp.
- **Sessão WhatsApp** — uma conexão Baileys por tenant (1 número por entidade).

---

## 3. Stack obrigatória

| Camada | Tecnologia | Observação |
|---|---|---|
| Runtime backend | **Node.js (LTS)** | Obrigatório: o cliente não-oficial (Baileys) é Node. |
| Cliente WhatsApp | **@whiskeysockets/baileys** | Cliente **não-oficial** (ver seção 4). |
| Tempo real | **Socket.IO** | Salas por tenant/conversa/operador/canal. |
| Banco | **PostgreSQL 14+** | Schema compartilhado + `tenant_id` + RLS opcional. |
| Acesso ao banco | **pg-promise** (ou equivalente) | Os exemplos assumem `db.one/none/oneOrNone/manyOrNone`. |
| Frontend | **React** | UI estilo WhatsApp Web, marca ChatGov. |
| Ícones | **lucide-react** | Não use o logotipo do WhatsApp. |
| Auth | **JWT** | Token do operador carrega `sub`, `tenantId`, `papel`. |
| Mídia | **Abstração de storage** | Local em dev; S3/MinIO em produção (ver seção 10). |

Dependências de back-end mínimas:
```bash
npm i @whiskeysockets/baileys @hapi/boom pino qrcode socket.io jsonwebtoken pg-promise
```

---

## 4. ⚠️ Restrições críticas — leia antes de codar

**4.1 WhatsApp não-oficial.** Baileys conecta como um "aparelho vinculado" (WhatsApp Web), o que **viola os Termos de Serviço do WhatsApp** e expõe o número a **bloqueio**. Para uma prefeitura, perder o número é grave. Portanto, implemente desde já as mitigações:

- **Rate limiting de envio** por tenant (ex.: fila de saída com intervalo mínimo entre mensagens; nada de rajadas).
- **Proibir disparo em massa / broadcast** pela interface. O sistema é de **atendimento reativo**, não de marketing.
- **Aquecimento do número** ("warm-up"): volume baixo nos primeiros dias.
- **`markOnlineOnConnect: false`** na sessão, para não sequestrar o status "online" do celular.
- **Nunca** responder a `status@broadcast` nem a mensagens do próprio número (`fromMe`).
- Deixe a arquitetura **pronta para trocar Baileys pela API oficial (Cloud API)** sem reescrever a UI (ver seção 18).

**4.2 LGPD / governo.** Conversas com cidadãos contêm dados pessoais. Requisitos:
- Tabela de **auditoria** registrando ações sensíveis (atribuição, envio, resolução).
- Aviso visível na interface de que as mensagens são registradas para fins de atendimento.
- **Criptografar as credenciais** da sessão WhatsApp em repouso (campos `creds`/`keys`).
- Isolamento forte entre tenants (RLS recomendado).

---

## 5. Arquitetura de alto nível

```
  Cidadão (WhatsApp do celular)
        │  (mensagens)
        ▼
┌──────────────────────┐     emite eventos      ┌──────────────────────┐
│  WhatsAppManager      │ ─────────────────────▶ │  Gateway (Socket.IO)  │
│  (Baileys, 1 sessão   │  qr/connected/message  │  • persiste no banco  │
│   por tenant)         │  message-status/logout │  • roteia por salas   │
│  • auth no Postgres   │ ◀───────────────────── │  • triagem/fila       │
│  • reconexão          │  sendText/sendMedia    │  • chat interno       │
└──────────┬───────────┘                         └──────────┬───────────┘
           │                                                │ WebSocket
           ▼                                                ▼
     ┌───────────┐                                   ┌──────────────┐
     │ PostgreSQL│ ◀──────────────────────────────── │  React (UI)  │
     └───────────┘                                   │  "ChatGov"   │
                                                      └──────────────┘
```

Fluxo de uma mensagem recebida: Baileys recebe → `WhatsAppManager` emite `message` → Gateway persiste (cria/atualiza **contato** + **conversa na fila** + **mensagem**) → faz broadcast em tempo real para a sala da conversa e do tenant → a UI mostra na fila → operador triа para uma secretaria → operador responde → Gateway chama `wa.sendText` → persiste a saída → emite `mensagem:nova`.

Princípio de ouro: **o chat interno nunca toca o `WhatsAppManager`.** Ele vive só no banco + Socket.IO.

---

## 6. Modelo de multi-tenancy

- **Schema compartilhado** com coluna `tenant_id` em **todas** as tabelas de dados.
- Toda query é obrigatoriamente filtrada por `tenant_id`.
- **Recomendado:** habilitar **Row Level Security** no Postgres. Cada conexão define `SET app.tenant_id = '<uuid>'` e as policies garantem que um tenant jamais leia dados de outro, mesmo com bug na aplicação.
- **Uma sessão WhatsApp por tenant** (relação 1:1).
- O `tenantId` vem do **JWT** do operador, nunca de parâmetro enviado pelo cliente.

---

## 7. Modelo de dados (PostgreSQL) — use como base

Implemente este schema (ajuste nomes/índices se necessário, mas preserve a semântica). `departamento_id` nulo em `conversas` significa **fila**; `status` controla o ciclo `fila → aberta → resolvida`.

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- NÚCLEO / TENANTS
CREATE TABLE tenants (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome      TEXT NOT NULL,
    slug      TEXT UNIQUE NOT NULL,
    ativo     BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Secretarias que COMPARTILHAM o mesmo número WhatsApp
CREATE TABLE departamentos (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome      TEXT NOT NULL,
    cor       TEXT DEFAULT '#00A884',
    ativo     BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dep_tenant ON departamentos(tenant_id);

-- Operadores (usuários do sistema)
CREATE TABLE operadores (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome         TEXT NOT NULL,
    email        TEXT NOT NULL,
    senha_hash   TEXT NOT NULL,
    papel        TEXT NOT NULL DEFAULT 'operador', -- admin | supervisor | operador
    avatar_url   TEXT,
    online       BOOLEAN NOT NULL DEFAULT false,
    ultimo_visto TIMESTAMPTZ,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX idx_op_tenant ON operadores(tenant_id);

-- Um operador pode atender VÁRIAS secretarias (N:N)
CREATE TABLE operador_departamentos (
    operador_id     UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
    PRIMARY KEY (operador_id, departamento_id)
);

-- SESSÃO WHATSAPP (1 por tenant)
CREATE TABLE whatsapp_sessoes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    numero        TEXT,
    status        TEXT NOT NULL DEFAULT 'desconectado', -- desconectado|qr|conectando|conectado
    creds         JSONB,   -- credenciais Baileys (CRIPTOGRAFAR!)
    keys          JSONB,   -- signal keys
    conectado_em  TIMESTAMPTZ,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CONVERSAS EXTERNAS (WhatsApp)
CREATE TABLE contatos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wa_jid     TEXT NOT NULL,  -- 5544999999999@s.whatsapp.net
    nome       TEXT,
    telefone   TEXT,
    avatar_url TEXT,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, wa_jid)
);
CREATE INDEX idx_contato_tenant ON contatos(tenant_id);

CREATE TABLE conversas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contato_id         UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    departamento_id    UUID REFERENCES departamentos(id),  -- NULL = fila geral
    operador_id        UUID REFERENCES operadores(id),     -- NULL = não atribuída
    status             TEXT NOT NULL DEFAULT 'fila',       -- fila|aberta|resolvida
    nao_lidas          INTEGER NOT NULL DEFAULT 0,
    ultima_mensagem    TEXT,
    ultima_mensagem_em TIMESTAMPTZ,
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, contato_id)   -- 1 conversa por contato
);
CREATE INDEX idx_conv_status ON conversas(tenant_id, status);
CREATE INDEX idx_conv_dep    ON conversas(departamento_id);

CREATE TABLE mensagens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversa_id   UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    wa_message_id TEXT,
    direcao       TEXT NOT NULL,                 -- entrada | saida
    operador_id   UUID REFERENCES operadores(id),
    tipo          TEXT NOT NULL DEFAULT 'texto', -- texto|imagem|audio|video|documento|local
    conteudo      TEXT,
    media_url     TEXT,
    media_mime    TEXT,
    status        TEXT DEFAULT 'enviado',        -- enviado|entregue|lido|erro
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_conversa ON mensagens(conversa_id, criado_em);

-- CHAT INTERNO (operador <-> operador) — separado do WhatsApp
CREATE TABLE canais_internos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome       TEXT,                       -- NULL em DMs
    tipo       TEXT NOT NULL DEFAULT 'dm', -- dm | grupo
    criado_por UUID REFERENCES operadores(id),
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_canal_tenant ON canais_internos(tenant_id);

CREATE TABLE canal_membros (
    canal_id    UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,
    PRIMARY KEY (canal_id, operador_id)
);

CREATE TABLE mensagens_internas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    canal_id     UUID NOT NULL REFERENCES canais_internos(id) ON DELETE CASCADE,
    remetente_id UUID NOT NULL REFERENCES operadores(id),
    tipo         TEXT NOT NULL DEFAULT 'texto', -- texto|imagem|arquivo
    conteudo     TEXT,
    media_url    TEXT,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msgint_canal ON mensagens_internas(canal_id, criado_em);

-- AUDITORIA (governo / LGPD)
CREATE TABLE auditoria (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    operador_id UUID,
    acao        TEXT NOT NULL,  -- conversa.atribuida, mensagem.enviada...
    detalhe     JSONB,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant ON auditoria(tenant_id, criado_em);

-- ROW LEVEL SECURITY (recomendado) — cada conexão faz:
--   SET app.tenant_id = '<uuid-do-tenant>';
-- ALTER TABLE conversas          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE mensagens          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE mensagens_internas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY iso_conv ON conversas
--   USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- (repita a policy para cada tabela sensível)
```

---

## 8. Backend — Serviço de sessão WhatsApp (`WhatsAppManager`)

Crie uma classe `WhatsAppManager extends EventEmitter` que gerencia **uma sessão Baileys por tenant**, em um `Map<tenantId, { sock, status }>`.

**Requisitos não-negociáveis:**

1. **Persistir o auth no Postgres**, não em disco. **Não use** `useMultiFileAuthState` (não serve para multi-tenant / escala horizontal). Implemente um `usePostgresAuthState(db, tenantId)` que:
   - Carrega `creds`/`keys` da tabela `whatsapp_sessoes` (ou inicializa com `initAuthCreds()` se não existir).
   - (De)serializa os Buffers com `BufferJSON.reviver` / `BufferJSON.replacer`.
   - Trata `app-state-sync-key` com `proto.Message.AppStateSyncKeyData.fromObject(...)`.
   - Faz **upsert** (`ON CONFLICT (tenant_id) DO UPDATE`) a cada `creds.update` e a cada gravação de keys.
   - Isso garante **reconexão sem reescanear o QR** após reiniciar o processo.

2. **`makeWASocket`** com: `version` de `fetchLatestBaileysVersion()`, `logger: pino({level:'silent'})`, `printQRInTerminal: false`, **`markOnlineOnConnect: false`**, e `keys` via `makeCacheableSignalKeyStore`.

3. **Tratar `connection.update`:**
   - `qr` presente → status `qr`; gere data-URL com `qrcode.toDataURL(qr)` e **emita** `('qr', { tenantId, qr: dataUrl })`.
   - `connection === 'open'` → status `conectado`; salve `numero` (de `sock.user.id.split(':')[0]`) e `conectado_em`; **emita** `('connected', { tenantId, numero })`.
   - `connection === 'close'` → leia o código com `Boom`. Se `DisconnectReason.loggedOut`: **limpe** `creds/keys/numero` no banco e **emita** `('logout', { tenantId })`. Senão (queda de rede): **reconecte com backoff** (ex.: `setTimeout(start, 3000)`).

4. **Receber mensagens** em `messages.upsert` (só `type === 'notify'`): ignore `msg.key.fromMe` e `status@broadcast`; para o resto, **emita** `('message', { tenantId, msg, sock })`.

5. **Recibos** em `messages.update` → **emita** `('message-status', { tenantId, updates })`.

6. **Métodos públicos:**
   - `restaurarSessoes()` — no boot, reabre toda sessão com `creds IS NOT NULL`.
   - `start(tenantId)` — inicia/reinicia (idempotente: se já existe no Map, retorna).
   - `sendText(tenantId, jid, texto)`.
   - `sendMedia(tenantId, jid, { tipo, buffer, mimetype, fileName, caption })` — monta payload por tipo (`image`/`video`/`audio` com `ptt:true`/`document`).
   - `setTyping(tenantId, jid, ligado)` — `sendPresenceUpdate('composing'|'paused', jid)`.
   - `logout(tenantId)`.
   - `isConnected(tenantId)`.
   - Helper interno que lança erro se a sessão não estiver `conectado`.

**Eventos emitidos (contrato para o Gateway):** `qr`, `connected`, `logout`, `message`, `message-status`.

---

## 9. Backend — Gateway de tempo real (Socket.IO) + contratos de eventos

O Gateway (`iniciarGateway(httpServer, db, wa, storage)`) cria o `Server` Socket.IO, **autentica cada socket por JWT** (`jwt.verify(handshake.auth.token, JWT_SECRET)` → preenche `socket.data.operador = { id, tenantId, papel }`), e gerencia salas:

```
sala.tenant(id)   -> `tenant:${id}`
sala.conversa(id) -> `conversa:${id}`
sala.operador(id) -> `operador:${id}`
sala.canal(id)    -> `canal:${id}`
```

Ao conectar: entra em `tenant` e `operador`, e marca o operador **online** (atualiza `operadores.online` + emite `operador:presenca` ao tenant). No `disconnect`, marca offline.

### 9.1 Eventos recebidos do cliente (UI → servidor)

| Evento | Payload | Ação |
|---|---|---|
| `conversa:abrir` | `convId` | entra na sala da conversa; zera `nao_lidas`. |
| `conversa:atribuir` | `{ convId, departamentoId, operadorId? }` | seta `departamento_id`/`operador_id`, status `aberta`; grava **auditoria** `conversa.atribuida`; emite `conversa:atualizada` ao tenant. |
| `conversa:resolver` | `convId` | status `resolvida`; emite `conversa:atualizada`. |
| `mensagem:enviar` | `{ convId, jid, texto }`, com `ack` | `setTyping(true)` → `wa.sendText` → `setTyping(false)`; **persiste** saída em `mensagens` (`direcao 'saida'`, `operador_id`, `wa_message_id`); atualiza `ultima_mensagem`; emite `mensagem:nova` (sala da conversa) e `conversa:atualizada` (tenant); responde `ack({ok,id})` ou `ack({ok:false,erro})`. |
| `interno:abrir` | `canalId` | entra na sala do canal interno. |
| `interno:enviar` | `{ canalId, conteudo, tipo='texto', mediaUrl? }` | **persiste** em `mensagens_internas`; emite `interno:nova` à sala do canal. **Não toca no WhatsApp.** |
| `interno:digitando` | `{ canalId }` | retransmite `interno:digitando { opId, canalId }` aos demais membros. |

### 9.2 Eventos emitidos do servidor (servidor → UI)

| Evento | Payload | Origem |
|---|---|---|
| `whatsapp:qr` | `{ qr }` | `wa 'qr'` → tela de pareamento. |
| `whatsapp:conectado` | `{ numero }` | `wa 'connected'`. |
| `whatsapp:desconectado` | — | `wa 'logout'`. |
| `mensagem:nova` | objeto `mensagens` | entrada (de `wa 'message'`) **e** saída. |
| `mensagem:status` | `updates` | `wa 'message-status'` (entregue/lido). |
| `conversa:atualizada` | `{ convId }` | dispara recarregar a lista/preview. |
| `interno:nova` | objeto `mensagens_internas` | chat interno. |
| `operador:presenca` | `{ opId, online }` | presença. |

### 9.3 Persistência da mensagem recebida (lógica obrigatória)

Ao receber `wa 'message'`, execute `persistirEntrada`:
1. **Upsert do contato** por `(tenant_id, wa_jid)`, usando `msg.pushName` como nome quando houver.
2. **Upsert da conversa** por `(tenant_id, contato_id)`: se nova, entra como **`fila`** com `nao_lidas = 1`; se existente, incrementa `nao_lidas`, atualiza `ultima_mensagem`/`ultima_mensagem_em`, e **reabre** se estava `resolvida` (volta para `fila`).
3. **Insere a mensagem** (`direcao 'entrada'`).
4. Faz broadcast `mensagem:nova` (sala da conversa) + `conversa:atualizada` (tenant).

**Extração de conteúdo:** texto vem de `conversation` / `extendedTextMessage.text`. Mídia (`imageMessage|videoMessage|audioMessage|documentMessage`) → baixe com `downloadMediaMessage(msg,'buffer',{})`, salve via `storage.salvar(buffer, mime, tenantId)` e guarde `media_url`/`media_mime` + `caption`.

---

## 10. Backend — Camada de armazenamento de mídia (abstração)

Defina uma interface mínima e injete a implementação:
```
storage.salvar(buffer, mime, tenantId) -> Promise<string /* url */>
```
- **Dev:** grava em disco e serve via rota estática.
- **Produção:** S3/MinIO (chave prefixada por `tenantId`, ex.: `tenants/<id>/media/<uuid>.<ext>`).
- A escolha não deve vazar para o Gateway: ele só conhece `storage.salvar`.

---

## 11. Backend — Autenticação e autorização

- Login do operador (e-mail + senha com hash, ex.: bcrypt/argon2) emite um **JWT** com `sub` (operador), `tenantId`, `papel`.
- O socket e as rotas HTTP lêem o `tenantId` **do token**, nunca do corpo da requisição.
- Autorização por papel: `admin` configura tenant/secretarias/operadores; `supervisor` vê tudo do tenant e faz triagem; `operador` atende as conversas das suas secretarias.
- (Recomendado) repasse o `tenantId` ao Postgres via `SET app.tenant_id` para ativar a RLS.

---

## 12. Frontend — Especificação da interface "ChatGov"

Réplica visual fiel do **WhatsApp Web**, com **marca ChatGov** (ícone `ShieldCheck` verde + nome "ChatGov"; **sem** o logotipo do WhatsApp). Layout de duas colunas (lista à esquerda, conversa à direita).

### 12.1 Paleta (idêntica ao WhatsApp)
```
green #00A884 · greenDark #008069 · panel #F0F2F5 · chatBg #EFEAE2
bubbleIn #FFFFFF · bubbleOut #D9FDD3 · muted #667781 · border #E9EDEF
read #53BDEB (tique azul) · badge #25D366 (não lidas/online) · ink #111B21
```
> **Nota técnica de implementação:** se a UI for um artifact/ambiente sem compilador JIT do Tailwind, **não** use classes de valor arbitrário (`text-[15px]`, `max-w-[68%]`). Use **estilos inline** (`style={{...}}`) para cores/tamanhos finos, ou classes utilitárias padrão do Tailwind. Em projeto React normal com Tailwind configurado, classes arbitrárias são aceitáveis.

### 12.2 Coluna esquerda
- **Cabeçalho de marca:** ícone verde + "ChatGov" + nome da entidade (ex.: "Prefeitura de Goioerê"); ações de nova conversa e menu.
- **Barra de status da conexão** (clicável → abre tela de QR): bolinha verde/vermelha + "WhatsApp conectado · <número>" ou "WhatsApp desconectado".
- **Abas:** `Atendimento` (ícone telefone) e `Chat interno` (ícone fone de ouvido), com indicador na aba ativa.
- **Busca** (placeholder muda por aba).
- **Filtros por secretaria** (só na aba Atendimento): chips `Tudo`, `Fila` (com badge da quantidade na fila) e um chip por secretaria (cor própria).
- **Lista de itens:**
  - *Atendimento:* avatar (iniciais; ícone de telefone quando o "nome" é só número), nome/telefone, prévia da última mensagem, hora, badge de não lidas, e **etiqueta colorida da secretaria** (DeptBadge).
  - *Interno:* avatar de operador (com ponto de online) ou ícone de grupo (`Megaphone`/`Hash`), nome e legenda.

### 12.3 Painel direito — Atendimento
- **Header da conversa:** avatar + nome + telefone; à direita, botão **"Atribuir secretaria"** que abre um popover "Encaminhar para" listando as secretarias (bolinha colorida + nome). Ao escolher, a conversa muda de secretaria (e some da fila).
- **Área de mensagens:** fundo `chatBg` com **padrão "doodle" sutil** (SVG em data-URI, opacidade baixa). Bolhas: entrada à esquerda (branca), saída à direita (verde `bubbleOut`). Na saída, mostre **nome do operador** que respondeu e o **tique de status** (`Check` enviado, `CheckCheck` cinza entregue, `CheckCheck` azul lido).
- **Avisos contextuais:** chip de LGPD ("Mensagens registradas para fins de atendimento"); se a conversa está na **fila**, faixa "⏳ Aguardando triagem — atribua a uma secretaria para responder".
- **Barra de input:** emoji, anexo, campo de texto (envia no Enter), botão que vira **enviar** (`Send`) quando há texto ou **microfone** (`Mic`) quando vazio.

### 12.4 Painel direito — Chat interno
- Mesma moldura, mas o aviso muda para "Conversa interna da equipe — não sai pelo WhatsApp".
- Suporta **DMs** e **grupos**; bolhas com **nome do remetente** (em grupos) e **anexos** (cartão de arquivo com nome + tamanho).
- Tudo trafega por `interno:*` — **nunca** pelo WhatsApp.

### 12.5 Tela de pareamento (QR)
- Acessível pela barra de status. Mostra passo a passo ("WhatsApp no celular › Aparelhos conectados › Conectar um aparelho › apontar a câmera") e o **QR** vindo do evento `whatsapp:qr` (renderize o data-URL). Botão "Gerar novo código".

### 12.6 Componentes sugeridos
`Avatar`, `Tick`, `DeptBadge`, `Chip`, `ItemConversa`, `ItemCanal`, `BolhaConversa`, `BolhaInterna`, `EstadoVazio` e a tela `QR`. Comece com dados mockados em estado local e depois ligue ao Socket.IO (seção 9).

---

## 13. Requisitos não-funcionais

- **Segurança:** criptografar `creds`/`keys` em repouso; segredos via variáveis de ambiente; CORS restrito em produção (não `*`); validar todo payload de socket; `tenantId` sempre do token.
- **Isolamento:** RLS ativa; nenhuma query sem `tenant_id`.
- **Resiliência:** reconexão automática do WhatsApp com backoff; idempotência em `start`; tratamento de `loggedOut` exigindo novo QR.
- **Rate limiting:** fila de envio por tenant; limite por minuto; bloquear envio em massa (ver 4.1).
- **Observabilidade:** logs estruturados, métricas de status de sessão por tenant, e a tabela `auditoria` para trilha de ações.
- **Escala:** stateless o suficiente para rodar múltiplas instâncias; se escalar o Socket.IO horizontalmente, use um **adapter** (ex.: Redis). Atenção: cada sessão Baileys deve ter **dono único** (uma instância por tenant) — planeje afinidade/lock por tenant.

---

## 14. Variáveis de ambiente (mínimas)

```
DATABASE_URL=postgres://user:pass@host:5432/chatgov
JWT_SECRET=<segredo forte>
PORT=3000
STORAGE_DRIVER=local            # local | s3 | minio
S3_BUCKET=...                   # se s3/minio
S3_REGION=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
CREDS_ENCRYPTION_KEY=<chave para criptografar creds/keys da sessão>
SOCKET_CORS_ORIGIN=https://app.seudominio.gov.br
```

---

## 15. Estrutura de pastas sugerida

```
chatgov/
├─ backend/
│  ├─ src/
│  │  ├─ index.js                 # boot: HTTP + Socket.IO + wa.restaurarSessoes()
│  │  ├─ db.js                    # pg-promise + SET app.tenant_id
│  │  ├─ auth/                    # login, JWT, middleware de papel
│  │  ├─ whatsapp/
│  │  │  ├─ WhatsAppManager.js
│  │  │  └─ postgresAuthState.js
│  │  ├─ realtime/gateway.js      # Socket.IO + roteamento + triagem
│  │  ├─ storage/                 # local.js | s3.js (interface salvar())
│  │  └─ migrations/schema.sql
│  └─ package.json
└─ frontend/
   ├─ src/
   │  ├─ ChatGov.jsx              # UI principal (seção 12)
   │  ├─ components/              # Avatar, Tick, DeptBadge, Chip, bolhas...
   │  ├─ hooks/useSocket.js       # conexão Socket.IO + listeners
   │  └─ api/                     # login, fetch de conversas/mensagens
   └─ package.json
```

---

## 16. Roadmap de implementação (faça nesta ordem)

1. **Banco + auth:** schema (seção 7), login, JWT, middleware de papel, RLS.
2. **`WhatsAppManager`:** sessão única por tenant, `usePostgresAuthState`, eventos, reconexão, geração de QR. Testar pareamento e persistência (reiniciar processo sem reescanear).
3. **Gateway:** Socket.IO autenticado, salas, `persistirEntrada`, eventos da seção 9, auditoria.
4. **Storage:** driver local + extração/download de mídia.
5. **Frontend — Atendimento:** lista, fila, filtros, conversa, envio/recebimento em tempo real, ticks, triagem (atribuir secretaria), tela de QR.
6. **Frontend — Chat interno:** DMs, grupos, anexos (independente do WhatsApp).
7. **Endurecimento:** rate limiting, criptografia de credenciais, CORS, observabilidade, testes.

Implemente e valide **uma fase por vez** antes de seguir.

---

## 17. Critérios de aceitação (definição de "pronto")

- [ ] Um tenant consegue **parear** o número via QR; ao **reiniciar** o servidor, a sessão **reconecta sozinha** sem novo QR.
- [ ] Mensagem do cidadão **cria conversa na fila** e aparece **em tempo real** para os operadores do tenant.
- [ ] Operador **atribui** a conversa a uma secretaria; a mudança reflete na UI e gera **registro de auditoria**.
- [ ] Operador **responde** e o cidadão recebe; a saída é persistida com o **operador autor** e os **tiques** evoluem (enviado → entregue → lido).
- [ ] **Mídia** recebida é baixada, salva no storage e exibida.
- [ ] **Chat interno** (DM e grupo, com arquivo) funciona **sem** consumir a sessão WhatsApp.
- [ ] **Nenhum** dado vaza entre tenants (validar com RLS e testes).
- [ ] Há **rate limiting** de envio e **não** existe caminho de disparo em massa pela UI.
- [ ] Credenciais da sessão estão **criptografadas** em repouso.
- [ ] A UI é visualmente fiel ao WhatsApp, com marca ChatGov e **sem** ativos protegidos do WhatsApp.

---

## 18. Caminho de migração para a API oficial (Cloud API)

Para reduzir o risco regulatório no futuro, isole o WhatsApp atrás de uma **interface de provedor**:
```
interface WhatsAppProvider {
  start(tenantId)
  sendText(tenantId, jid, texto)
  sendMedia(tenantId, jid, payload)
  // emite: 'message', 'message-status', 'connected', 'qr'(só não-oficial)
}
```
- Hoje: `BaileysProvider` (não-oficial, QR).
- Depois: `CloudApiProvider` (oficial, webhooks + templates aprovados, sem QR).
- O **Gateway, o banco e a UI não mudam** — só troca a implementação do provider. Projete com isso em mente desde o início.

---

**Entregue um sistema coeso, seguro e fiel a esta especificação.** Em caso de ambiguidade, prefira a opção que (a) preserva o isolamento entre tenants, (b) reduz o risco de bloqueio do número e (c) mantém a UI desacoplada do provedor de WhatsApp.
