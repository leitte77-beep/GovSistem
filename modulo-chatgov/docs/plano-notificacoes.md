# Plano: Sistema de Notificações Real — Badge + Desktop Push (sem mexer no gateway.js)

**Objetivo:** Notificações funcionais sem nenhuma alteração no `gateway.js`.

**Estratégia:** Toda nova lógica vai em arquivos novos ou já existentes que não são o gateway. O backend usa REST + trigger SQL; o frontend escuta eventos que o gateway **já emite**.

---

## Diagnóstico

| Problema | Causa | Por que não precisa do gateway |
|---|---|---|
| Badge sempre 0 | `notifCount` só é setado pelo `CentroNotificacoes`, que só monta na view `notificacoes` | Vamos carregar a contagem via REST no `ChatGov.jsx` ao iniciar e manter com polling |
| Sem push desktop | Nunca foi implementado | O gateway já emite `mensagem:nova` — o frontend só precisa **ouvir** |
| `config_notificacoes` ignorada | Código nunca lê essas colunas | Vamos ler via REST no hook de notificações desktop |
| Só notificação de transferência | Só 3 chamadas `criarNotificacao()` no gateway | Vamos usar uma **trigger PostgreSQL** que cria notificação automaticamente ao inserir mensagem |

---

## Tarefas

### FASE 1 — Badge com contagem real (sem gateway.js)

#### 1.1 Novo endpoint REST: status de não lidas

**Arquivo:** `modulo-chatgov/backend/src/routes/evolucoes.js` (adicionar ~linha 789)

```js
// GET /api/evolucoes/notificacoes/status — unread summary for badge
router.get('/notificacoes/status', async (req, res) => {
  try {
    const { tenantId, id: operadorId } = req.operador;

    // 1. Contagem de notificações do sistema (transferências, etc.)
    const { total: notifTotal } = await db.one(
      `SELECT COUNT(*)::int AS total FROM notificacoes
       WHERE tenant_id = $1 AND operador_id = $2 AND lida = false`,
      [tenantId, operadorId]
    );

    // 2. Contagem de conversas não lidas (WhatsApp) que o operador pode ver
    const { naoLidasConv } = await db.one(
      `SELECT COALESCE(SUM(c.nao_lidas), 0)::int AS "naoLidasConv"
       FROM conversas c
       WHERE c.tenant_id = $1
         AND c.nao_lidas > 0
         AND c.status NOT IN ('resolvida', 'arquivada')
         AND (
           c.operador_id = $2
           OR c.operador_id IS NULL
           OR c.departamento_id IN (
             SELECT departamento_id FROM operador_departamentos WHERE operador_id = $2
           )
         )`,
      [tenantId, operadorId]
    );

    // 3. Config de notificações (push_ativo, som_ativado, etc.)
    const config = await db.oneOrNone(
      `SELECT * FROM config_notificacoes WHERE operador_id = $1`,
      [operadorId]
    );

    res.json({
      notificacoes: notifTotal || 0,
      conversas: naoLidasConv || 0,
      total: (notifTotal || 0) + (naoLidasConv || 0),
      config: config || { push_ativo: true, som_ativado: true },
    });
  } catch (err) {
    console.error('[Notif Status] Erro:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar status de notificações' });
  }
});
```

#### 1.2 Frontend API Client

**Arquivo:** `modulo-chatgov/frontend/src/api/evolucoes.js` (adicionar):

```js
export async function fetchNotificacoesStatus() {
  const res = await fetch('/api/evolucoes/notificacoes/status', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Erro ao buscar status');
  return res.json();
}
```

#### 1.3 ChatGov.jsx — polling leve para o badge

**Arquivo:** `modulo-chatgov/frontend/src/ChatGov.jsx`

```js
import { fetchNotificacoesStatus } from './api/evolucoes';

// Dentro do componente ChatGov:
useEffect(() => {
  if (!connected) return;

  const atualizar = () => {
    fetchNotificacoesStatus()
      .then(({ total }) => setNotifCount(total || 0))
      .catch(() => {});
  };

  atualizar(); // imediata
  const interval = setInterval(atualizar, 10000); // a cada 10s
  return () => clearInterval(interval);
}, [connected]);
```

> **Alternativa mais reativa:** Em vez de polling, escutar o evento `conversa:atualizada` e `notificacao:nova` (que vamos emitir via trigger na Fase 3). Mas polling de 10s já resolve 95% do problema sem complexidade.

---

### FASE 2 — Notificações desktop (estilo WhatsApp Web)

**Zero alterações no backend.** O gateway já emite `mensagem:nova` com todos os dados necessários.

#### 2.1 Hook: `useNotificacoesDesktop.js`

**Novo arquivo:** `modulo-chatgov/frontend/src/hooks/useNotificacoesDesktop.js`

```js
import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

export function useNotificacoesDesktop({ conversaAtivaId }) {
  const { socket } = useSocket();
  const conversaAtivaRef = useRef(conversaAtivaId);
  conversaAtivaRef.current = conversaAtivaId;

  useEffect(() => {
    if (!socket) return;

    // Solicitar permissão ao montar
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const handler = (msg) => {
      // Só notifica mensagens de entrada (cidadão)
      if (msg.direcao !== 'entrada') return;
      // Só se for texto
      if (msg.tipo !== 'texto') return;
      // Não notifica se a conversa está aberta
      if (msg.conversa_id === conversaAtivaRef.current) return;
      // Não notifica se o usuário está na aba
      if (!document.hidden) return;
      // Permissão negada
      if (Notification.permission !== 'granted') return;

      const nome = msg.contato_nome || msg.contato_telefone || 'Novo atendimento';
      const trecho = (msg.conteudo || '').slice(0, 100);

      const notif = new Notification(nome, {
        body: trecho,
        icon: msg.contato_avatar || '/logo192.png',
        badge: '/logo192.png',
        tag: msg.conversa_id,       // agrupa por conversa
        renotify: true,
        data: { conversaId: msg.conversa_id },
      });

      notif.onclick = () => {
        window.focus();
        window.dispatchEvent(new CustomEvent('notificacao:abrir-conversa', {
          detail: { conversaId: msg.conversa_id },
        }));
        notif.close();
      };
    };

    socket.on('mensagem:nova', handler);
    return () => socket.off('mensagem:nova', handler);
  }, [socket]);
}
```

#### 2.2 Integrar no `ChatGov.jsx`

```js
import { useNotificacoesDesktop } from './hooks/useNotificacoesDesktop';

// Dentro do componente:
useNotificacoesDesktop({ conversaAtivaId: conversaAtiva?.id });

// Handler para abrir conversa ao clicar na notificação:
useEffect(() => {
  const handler = (e) => {
    const { conversaId } = e.detail;
    handleChangeView('atendimento');
    socket?.emit('conversa:abrir', conversaId, (conv) => {
      if (conv) handleSelectConversa(conv);
    });
  };
  window.addEventListener('notificacao:abrir-conversa', handler);
  return () => window.removeEventListener('notificacao:abrir-conversa', handler);
}, [socket]);
```

#### 2.3 Respeitar preferências do operador

Antes de disparar a notificação, adicionar verificação de `push_ativo` e `nao_perturbe`:

```js
// Dentro do handler, antes de new Notification():
const cfg = await fetchNotificacoesStatus();
if (!cfg.config?.push_ativo) return;

// Verificar não perturbe
if (cfg.config?.nao_perturbe_inicio && cfg.config?.nao_perturbe_fim) {
  const now = new Date();
  const hora = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  if (hora >= cfg.config.nao_perturbe_inicio && hora < cfg.config.nao_perturbe_fim) return;
}
```

> **Otimização:** Fazer cache do `config` por alguns minutos para evitar chamada REST a cada mensagem.

---

### FASE 3 — Trigger SQL: criar notificações automaticamente (opcional)

Se quiser que o `CentroNotificacoes` também mostre notificações de novas mensagens (além das de transferência), sem mexer no gateway:

**Novo arquivo de migration:** `modulo-chatgov/backend/src/migrations/018_trigger_notificacoes.sql`

```sql
-- Trigger: cria notificação no sistema quando chega nova mensagem de cidadão
CREATE OR REPLACE FUNCTION notificar_nova_mensagem_entrada()
RETURNS TRIGGER AS $$
DECLARE
  v_contato_nome TEXT;
  v_conversa_id UUID;
  v_tenant_id UUID;
  v_trecho TEXT;
  v_depto_id UUID;
BEGIN
  -- Só para mensagens de entrada texto
  IF NEW.direcao <> 'entrada' OR NEW.tipo <> 'texto' THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do contato e tenant
  SELECT c.tenant_id, c.id, co.nome INTO v_tenant_id, v_conversa_id, v_contato_nome
  FROM conversas c
  JOIN contatos co ON co.id = c.contato_id
  WHERE c.id = NEW.conversa_id;

  v_trecho := left(NEW.conteudo, 80);

  -- Notificar operador dono da conversa (se existir)
  IF EXISTS (SELECT 1 FROM conversas WHERE id = NEW.conversa_id AND operador_id IS NOT NULL) THEN
    INSERT INTO notificacoes (tenant_id, operador_id, tipo, titulo, mensagem, link)
    SELECT c.tenant_id, c.operador_id, 'mensagem',
           COALESCE(v_contato_nome, 'Novo contato'),
           v_trecho,
           '/atendimento?conversa=' || v_conversa_id
    FROM conversas c
    WHERE c.id = NEW.conversa_id AND c.operador_id IS NOT NULL;
  ELSE
    -- Notificar operadores do departamento
    SELECT c.departamento_id INTO v_depto_id FROM conversas c WHERE c.id = NEW.conversa_id;

    INSERT INTO notificacoes (tenant_id, operador_id, tipo, titulo, mensagem, link)
    SELECT DISTINCT v_tenant_id, od.operador_id, 'mensagem',
           COALESCE(v_contato_nome, 'Novo contato'),
           v_trecho,
           '/atendimento?conversa=' || v_conversa_id
    FROM operador_departamentos od
    WHERE od.departamento_id = COALESCE(v_depto_id, (
      SELECT id FROM departamentos
      WHERE tenant_id = v_tenant_id AND LOWER(nome) = 'recepcao' AND ativo = true
      LIMIT 1
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover trigger antiga se existir
DROP TRIGGER IF EXISTS trigger_notificar_mensagem ON mensagens;

-- Criar trigger
CREATE TRIGGER trigger_notificar_mensagem
AFTER INSERT ON mensagens
FOR EACH ROW
EXECUTE FUNCTION notificar_nova_mensagem_entrada();
```

> **Nota:** Essa trigger é independente do gateway. Roda direto no PostgreSQL sempre que uma linha é inserida em `mensagens`. O badge será atualizado via polling (Fase 1) e as notificações desktop vêm do hook (Fase 2).

---

### FASE 4 — Som de notificação

#### 4.1 Hook auxiliar

```js
// Dentro de useNotificacoesDesktop.js
function tocarSom() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* silencioso */ }
}
```

Chamar `tocarSom()` antes de `new Notification()` se `config.som_ativado === true`.

---

### FASE 5 — Toggle de notificações na tela de configurações

**Arquivo:** `modulo-chatgov/frontend/src/components/PaginaConfiguracoes.jsx`

Adicionar seção "Notificações":
- Switch: "Notificações desktop" (`push_ativo`)
- Switch: "Som" (`som_ativado`)
- Inputs de horário: "Não perturbe" (`nao_perturbe_inicio` / `nao_perturbe_fim`)

API já existe: `GET/PUT /api/evolucoes/config/notificacoes`.

---

## Resumo: arquivos alterados ou criados

| Arquivo | Ação | Toca gateway? |
|---|---|---|
| `backend/src/routes/evolucoes.js` | +1 endpoint `GET /notificacoes/status` | Não |
| `backend/src/migrations/018_trigger_notificacoes.sql` | **Novo** — trigger PostgreSQL | Não |
| `frontend/src/api/evolucoes.js` | +1 função `fetchNotificacoesStatus()` | Não |
| `frontend/src/hooks/useNotificacoesDesktop.js` | **Novo** — hook de push | Não |
| `frontend/src/ChatGov.jsx` | Polling + hook desktop + handler clique | Não |
| `frontend/src/components/PaginaConfiguracoes.jsx` | Seção de toggles | Não |

**gateway.js: 0 alterações.**

## Estimativa

| Fase | Tempo |
|---|---|
| 1 — Badge (endpoint + polling) | 1h |
| 2 — Desktop push (hook) | 1h30 |
| 3 — Trigger SQL | 1h |
| 4 — Som | 30min |
| 5 — Configurações | 1h |
| **Total** | **~5 horas** |
