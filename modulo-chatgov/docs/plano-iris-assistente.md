# Plano: Iris como Assistente Pessoal do Atendente (Slash Command `/Iris`)

**Objetivo:** Permitir que qualquer atendente digite `/Iris` no composer da conversa, peça algo (ex: "faça um pedido formal de orçamento para a empresa Azul Acabamentos com dados X, Y, Z") e a Iris gere o texto, exibindo-o no composer para revisão antes do envio — sem modificar o `gateway.js`.

---

## Arquitetura

```
Atendente digita "/Iris faça um orçamento..."
        │
        ▼
Frontend (PainelAtendimento.jsx)
  1. Detecta prefixo /Iris no textarea
  2. Extrai o prompt (tudo após /Iris)
  3. Chama POST /api/iris/chat (REST)
        │
        ▼
Backend (index.js + iris.js)
  POST /api/iris/chat
    → irisService.processarAssistente(tenantId, prompt, contexto)
    → Chama DeepSeek/OpenAI com system prompt de "redator"
    → Retorna { texto, sugestao }
        │
        ▼
Frontend
  4. Insere texto gerado no composer
  5. Atendente revisa/edita e envia normalmente
```

**Gateway.js: intocado.** Toda comunicação com a IA vai por REST; o envio final da mensagem usa o fluxo Socket.IO existente (`mensagem:enviar`).

---

## Tarefas

### 1. Backend — Nova função `processarAssistente()` em `iris.js`

**Arquivo:** `modulo-chatgov/backend/src/services/iris.js`

Criar função exportada:

```js
export async function processarAssistente(tenantId, prompt, contexto = {}) {
  // 1. Carrega config_iris (api_key, provider, model, temperatura)
  // 2. Monta system prompt de ASSISTENTE DE REDAÇÃO:
  //    - "Você é a Iris, assistente de redação do atendente."
  //    - "Seu objetivo é ajudar a escrever mensagens formais, ofícios,
  //       pedidos de orçamento, respostas padronizadas, etc."
  //    - "Use tom profissional e adequado ao contexto de governo municipal."
  //    - "NUNCA invente dados — use placeholders { } para campos faltantes."
  //    - contexto opcional: { nomeCidadao, departamento, conversaResumo }
  // 3. Chama LLM (DeepSeek/OpenAI) — sem response_format json_object,
  //    resposta em texto puro
  // 4. Retorna { texto } (texto gerado para o composer)
}
```

**System prompt sugerido:**

```
Você é a Iris, assistente de redação de um atendente da prefeitura.
Seu objetivo é ajudar a escrever mensagens profissionais para cidadãos e empresas.

REGRAS:
1. Escreva de forma clara, educada e profissional.
2. Use tom adequado ao contexto de governo/administração pública.
3. NUNCA invente dados, valores, prazos ou nomes.
4. Se faltar informação essencial, use [PREENCHER] como placeholder.
5. Se o atendente pedir um documento formal (ofício, pedido de orçamento, etc),
   estruture-o adequadamente com:
   - Saudação
   - Corpo (objetivo claro)
   - Dados/requisitos (quando fornecidos)
   - Fechamento com contato/signatário
6. Seja conciso — o atendente poderá editar depois.
7. Retorne APENAS o texto final, sem explicações adicionais.
```

### 2. Backend — Novo endpoint REST em `index.js`

**Arquivo:** `modulo-chatgov/backend/src/index.js`

Adicionar após os endpoints existentes de `/api/iris/config` (linha ~1489):

```js
// ===== Iris — Assistente de Redação para Atendentes =====
app.post('/api/iris/chat', async (req, res) => {
  try {
    const op = req.operador;
    const { prompt, contexto } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ erro: 'Prompt é obrigatório.' });
    }

    const resultado = await irisService.processarAssistente(
      op.tenantId,
      prompt.trim(),
      contexto || {}
    );

    if (!resultado) {
      return res.status(500).json({ erro: 'Iris não está configurada ou indisponível.' });
    }

    res.json(resultado);
  } catch (err) {
    console.error('[Iris Chat] Erro:', err.message);
    res.status(500).json({ erro: 'Erro ao processar com Iris.' });
  }
});
```

**Autenticação:** Middleware `authMiddleware` já cobre todas as rotas `/api/*`. Qualquer operador autenticado pode usar (não requer `requirePapel('admin')`).

### 3. Frontend — Detecção do `/Iris` no Composer

**Arquivo:** `modulo-chatgov/frontend/src/components/PainelAtendimento.jsx`

**Novos estados:**
```js
const [assistenteOcupado, setAssistenteOcupado] = useState(false);
const [assistenteErro, setAssistenteErro] = useState('');
```

**Nova função `acionarIrisAssistente`:**
```js
const acionarIrisAssistente = async (prompt) => {
  setAssistenteOcupado(true);
  setAssistenteErro('');
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/iris/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || 'Erro ao consultar Iris.');
    }
    const { texto: textoGerado } = await res.json();
    setTexto(textoGerado);
    inputRef.current?.focus();
  } catch (e) {
    setAssistenteErro(e.message);
    setTimeout(() => setAssistenteErro(''), 5000);
  } finally {
    setAssistenteOcupado(false);
  }
};
```

**Modificar `onKeyDown` do textarea (linha ~764):**

Adicionar lógica para detectar `/Iris` ao pressionar Enter:

```js
onKeyDown: (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    // Se começa com /Iris, aciona assistente em vez de enviar
    if (texto.trim().startsWith('/Iris') || texto.trim().startsWith('/iris')) {
      e.preventDefault();
      const prompt = texto.trim().replace(/^\/[Ii]ris\s*/, '');
      if (!prompt) {
        setAssistenteErro('Digite o que deseja que a Iris escreva. Ex: /Iris faça um ofício...');
        setTimeout(() => setAssistenteErro(''), 4000);
        return;
      }
      acionarIrisAssistente(prompt);
      return;
    }
    e.preventDefault();
    enviar(e);
  }
},
```

**Indicador visual no composer (placeholder ou loader):**

Alterar o placeholder do textarea quando estiver processando:
```js
placeholder: assistenteOcupado
  ? 'Iris está escrevendo...'
  : 'Digite uma mensagem (Enter envia, Shift+Enter quebra linha. /Iris para assistente)'
```

### 4. Frontend — API Client

**Arquivo:** `modulo-chatgov/frontend/src/api/index.js`

Adicionar função (opcional — pode usar fetch direto):

```js
export async function irisAssistente(prompt, contexto) {
  return jsonReq('/api/iris/chat', 'POST', { prompt, contexto });
}
```

### 5. Contexto opcional (melhoria futura)

Enviar dados da conversa atual como contexto para respostas mais precisas:

```js
const ctx = {
  nomeCidadao: conversa?.contato_nome || conversa?.contato_telefone,
  departamento: departamentos.find(d => d.id === conversa?.departamento_id)?.nome,
  protocolo: conversa?.protocolo || conversa?.protocolo_numero,
  ultimasMensagens: mensagens.slice(-3).map(m => ({
    direcao: m.direcao,
    texto: m.conteudo?.slice(0, 200),
  })),
};
```

---

## O que **NÃO** muda

- `gateway.js` — zero alterações
- Fluxo de envio de mensagens — continua igual
- Configuração atual da Iris — mesma `config_iris` do banco (API key, provider, model)
- Permissões — qualquer operador autenticado pode usar

---

## Estimativa de esforço

| Tarefa | Complexidade | Tempo estimado |
|---|---|---|
| `processarAssistente()` em iris.js | Baixa | 30 min |
| Endpoint `POST /api/iris/chat` em index.js | Baixa | 15 min |
| Detecção `/Iris` + estado no frontend | Média | 45 min |
| Testes manuais | Baixa | 30 min |
| **Total** | | **~2 horas** |
