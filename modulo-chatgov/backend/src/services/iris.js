import db from '../db.js';

// ─── Menu de setores (mídia no primeiro contato) ──────────────────────────
// Quando o cidadão abre o atendimento enviando áudio, imagem, vídeo ou
// documento, não há texto para a Iris triar. Em vez de deixá-lo sem resposta,
// devolvemos o menu com os setores ativos do tenant para ele escolher.

const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

// Número em keycap: 1..9 simples, 10 = 🔟, 11..99 com dígitos combinados
// (ex.: "1️⃣1️⃣") e, acima disso, número simples ("101.").
function keycapNumero(num) {
  if (num === 10) return '🔟';
  const digitos = String(num);
  if (digitos.length <= 2) {
    return digitos.split('').map((d) => KEYCAPS[Number(d)]).join('');
  }
  return `${num}.`;
}

// Formatação pura (sem banco): separada para poder ser testada isoladamente.
export function formatarMenuSetores(tenantNome, setores) {
  const nome = (tenantNome || '').trim();
  const saudacao = nome ? `da ${nome}` : 'da Prefeitura Municipal';

  const linhas = (setores || []).map((s, i) => `${keycapNumero(i + 1)} ${s}`);
  const corpo = linhas.length > 0
    ? linhas.join('\n')
    : 'No momento não há setores disponíveis.';

  return [
    `👋 Olá! Eu sou a Íris, assistente virtual ${saudacao}.`,
    '',
    'Recebi sua mensagem, mas não consegui identificar o assunto. Para direcionar seu atendimento corretamente, selecione uma das opções abaixo:',
    '',
    corpo,
    '',
    '📲 Digite o número ou o nome do setor desejado.',
    '',
    'Assim que você escolher, vou encaminhar seu atendimento para o setor responsável. 😊',
  ].join('\n');
}

// Lê os setores ativos do tenant e monta o menu para envio ao cidadão.
// Devolve também a lista ordenada de IDs (na MESMA ordem do menu) para que a
// escolha numérica do cidadão ("3" → 3º setor) seja resolvida de forma
// determinística, sem depender da IA interpretar o número.
export async function montarMenuSetores(tenantId) {
  const tenant = await db.oneOrNone(
    'SELECT nome FROM tenants WHERE id = $1',
    [tenantId]
  );

  const setores = await db.manyOrNone(
    `SELECT d.id, d.nome
     FROM departamentos d
     WHERE d.tenant_id = $1 AND d.ativo = true
     ORDER BY d.nome`,
    [tenantId]
  );

  return {
    texto: formatarMenuSetores(tenant?.nome, setores.map((s) => s.nome)),
    ids: setores.map((s) => s.id),
  };
}

// Detecta quando o cidadão respondeu ao menu só com um número (ex.: "3",
// "3️⃣", "1️⃣1️⃣"). Retorna o número escolhido ou null. Mensagens com letras ou
// palavras ("preciso de 3 documentos", "quero o setor de saúde") NÃO são
// tratadas como escolha de menu — a triagem por texto segue normal.
export function detectarEscolhaMenu(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;

  // Remove dígitos e os caracteres que compõem o "keycap" (VS16 + combining).
  // Se sobrar qualquer letra/caractere, não é uma escolha numérica pura.
  if (t.replace(/[0-9\uFE0F\u20E3️]/g, '').trim() !== '') return null;

  const digitos = t.replace(/\D/g, '');
  if (!digitos) return null;

  const n = parseInt(digitos, 10);
  return (n >= 1 && n <= 99) ? n : null;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ─── Horário de atendimento ───────────────────────────────────────────────

const NOMES_DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function nomeDia(num) {
  return NOMES_DIAS[num] || 'dia';
}

function nomeDiaCurto(num) {
  const curtos = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  return curtos[num] || 'dia';
}

function diasDesc(dias) {
  if (!dias || dias.length === 0) return 'dias úteis';
  const nomes = dias.map((d) => nomeDiaCurto(d));
  if (nomes.length === 1) return nomes[0] + '-feira';
  const ultimo = nomes.pop();
  return nomes.join(', ') + ' e ' + ultimo + '-feira';
}

function calcularProximoDiaUtil(diaAtual, diasAtendimento) {
  let proximo = diaAtual;
  for (let i = 1; i <= 7; i++) {
    proximo = (diaAtual + i) % 7;
    if (diasAtendimento.includes(proximo)) break;
  }
  return { numero: proximo, nome: nomeDia(proximo) };
}

async function obterContextoHorario(tenantId) {
  try {
    const cfg = await db.oneOrNone(
      'SELECT horario_inicio, horario_fim, dias_atendimento, fora_horario_ativo FROM tenant_config WHERE tenant_id = $1',
      [tenantId]
    );
    console.log('[Iris] obterContextoHorario cfg:', JSON.stringify(cfg));
    if (!cfg || !cfg.fora_horario_ativo) {
      console.log('[Iris] obterContextoHorario: fora_horario_ativo desligado ou sem config → retornando null');
      return null;
    }

    const now = new Date();
    const brNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const diaSemana = brNow.getDay();
    const hora = String(brNow.getHours()).padStart(2, '0') + ':' + String(brNow.getMinutes()).padStart(2, '0');
    console.log('[Iris] obterContextoHorario UTC:', now.toISOString(), 'BR:', `${nomeDia(diaSemana)} ${hora}`);

    const dias = (cfg.dias_atendimento || '1,2,3,4,5').split(',').map(Number).filter((n) => !isNaN(n));

    if (!dias.includes(diaSemana)) {
      const proximo = calcularProximoDiaUtil(diaSemana, dias);
      return {
        dentroDoHorario: false,
        motivo: 'dia_nao_util',
        descricao: `Hoje (${nomeDia(diaSemana)}) não é dia útil. O atendimento funciona de ${diasDesc(dias)}, das ${cfg.horario_inicio} às ${cfg.horario_fim}.`,
        proximoDiaUtil: proximo.nome,
        horario_inicio: cfg.horario_inicio,
        horario_fim: cfg.horario_fim,
      };
    }

    if (hora < (cfg.horario_inicio || '00:00')) {
      return {
        dentroDoHorario: false,
        motivo: 'antes_do_horario',
        descricao: `O expediente ainda não começou. O atendimento inicia às ${cfg.horario_inicio} e vai até às ${cfg.horario_fim}.`,
        horario_inicio: cfg.horario_inicio,
        horario_fim: cfg.horario_fim,
      };
    }

    if (hora >= (cfg.horario_fim || '23:59')) {
      const proximo = calcularProximoDiaUtil(diaSemana, dias);
      return {
        dentroDoHorario: false,
        motivo: 'apos_horario',
        descricao: `O expediente encerrou às ${cfg.horario_fim}.`,
        proximoDiaUtil: proximo.nome,
        horario_inicio: cfg.horario_inicio,
        horario_fim: cfg.horario_fim,
      };
    }

    return {
      dentroDoHorario: true,
      descricao: `Atendimento em horário normal: ${cfg.horario_inicio} às ${cfg.horario_fim}.`,
      horario_inicio: cfg.horario_inicio,
      horario_fim: cfg.horario_fim,
    };
  } catch (err) {
    console.error('[Iris] Erro ao obter contexto de horário:', err.message);
    return null;
  }
}

// ─── Fim horário ──────────────────────────────────────────────────────────

async function obterInfoFila(tenantId, departamentoSugerido) {
  try {
    // Atendentes online por departamento
    const onlinePorDepto = await db.manyOrNone(
      `SELECT d.id, d.nome, COUNT(o.id)::int AS online,
              COUNT(c.id) FILTER (WHERE c.status = 'fila')::int AS na_fila
       FROM departamentos d
       LEFT JOIN operador_departamentos od ON od.departamento_id = d.id
       LEFT JOIN operadores o ON o.id = od.operador_id AND o.online = true
       LEFT JOIN conversas c ON c.departamento_id = d.id AND c.status = 'fila'
         AND c.tenant_id = $1 AND c.deleted_at IS NULL
       WHERE d.tenant_id = $1 AND d.ativo = true
       GROUP BY d.id, d.nome
       ORDER BY d.nome`,
      [tenantId]
    );

    // Contagem total na fila (sem departamento ou recepção)
    const totalFila = await db.one(
      `SELECT COUNT(*)::int AS total
       FROM conversas
       WHERE tenant_id = $1
         AND status = 'fila'
         AND operador_id IS NULL
         AND deleted_at IS NULL`,
      [tenantId]
    );

    // Tempo médio de espera (últimas 100 conversas resolvidas).
    // O recorte precisa acontecer numa subconsulta: ORDER BY/LIMIT ao lado de
    // um AVG sem GROUP BY é erro de SQL — e derrubava a função inteira, deixando
    // a Iris sem nenhum dado de fila.
    const tempoMedio = await db.oneOrNone(
      `SELECT AVG(EXTRACT(EPOCH FROM (ultima_mensagem_em - criado_em)))::int AS segundos
       FROM (
         SELECT ultima_mensagem_em, criado_em
         FROM conversas
         WHERE tenant_id = $1
           AND status = 'resolvida'
           AND operador_id IS NOT NULL
           AND deleted_at IS NULL
           AND criado_em > now() - INTERVAL '30 days'
         ORDER BY criado_em DESC
         LIMIT 100
       ) recentes`,
      [tenantId]
    );

    // Posição na fila do cidadão atual (se departamento sugerido)
    let posicaoFila = null;
    if (departamentoSugerido) {
      const pos = await db.oneOrNone(
        `SELECT COUNT(*)::int AS posicao
         FROM conversas
         WHERE tenant_id = $1
           AND status = 'fila'
           AND operador_id IS NULL
           AND deleted_at IS NULL
           AND departamento_id = $2
           AND criado_em < (SELECT criado_em FROM conversas WHERE departamento_sugerido = $2 AND tenant_id = $1 LIMIT 1)`,
        [tenantId, departamentoSugerido]
      );
      if (pos) posicaoFila = pos.posicao + 1;
    }

    return {
      onlinePorDepto,
      totalFila: totalFila?.total || 0,
      tempoMedioSegundos: tempoMedio?.segundos || null,
      posicaoFila,
    };
  } catch (err) {
    console.error('[Iris] Erro ao obter info de fila:', err.message);
    return {
      onlinePorDepto: [],
      totalFila: 0,
      tempoMedioSegundos: null,
      posicaoFila: null,
    };
  }
}

// Janela de tolerância do heartbeat de presença (gateway renova a cada 60s).
// Fora dela o atendente é tratado como offline, mesmo com a flag `online` ligada.
const PRESENCA_FRESCA = '3 minutes';

// A equipe é lida do banco a cada mensagem: quem for cadastrado, desativado ou
// trocado de setor entra no contexto da Iris na conversa seguinte, sem ninguém
// precisar editar o prompt.
async function obterEquipe(tenantId) {
  try {
    return await db.manyOrNone(
      `SELECT o.id, o.nome, o.papel,
              (o.online AND o.ultimo_visto > now() - INTERVAL '${PRESENCA_FRESCA}') AS online,
              o.status_atendente,
              COALESCE(o.limite_conversas, o.capacidade_maxima) AS limite,
              COALESCE(carga.abertas, 0)::int AS em_atendimento,
              COALESCE(
                array_agg(d.nome ORDER BY d.nome) FILTER (WHERE d.nome IS NOT NULL),
                '{}'
              ) AS setores,
              COALESCE(
                array_agg(d.id::text ORDER BY d.nome) FILTER (WHERE d.id IS NOT NULL),
                '{}'
              ) AS setor_ids
       FROM operadores o
       LEFT JOIN operador_departamentos od ON od.operador_id = o.id
       LEFT JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS abertas FROM conversas c
         WHERE c.operador_id = o.id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL
           AND c.status_operacional IN ('EM_ATENDIMENTO', 'AGUARDANDO_CIDADAO', 'AGUARDANDO_SETOR')
       ) carga ON true
       WHERE o.tenant_id = $1 AND o.ativo = true
       GROUP BY o.id, carga.abertas
       ORDER BY o.nome`,
      [tenantId]
    );
  } catch (err) {
    console.error('[Iris] Erro ao obter equipe:', err.message);
    return [];
  }
}

// Formato enxuto entregue ao modelo: nome para conversar, id para rotear.
function equipeCompacta(equipe) {
  return equipe.map((o) => ({
    id: o.id,
    nome: o.nome,
    setores: o.setores || [],
    online: o.online === true,
    conversas_abertas: o.em_atendimento,
    limite: o.limite,
  }));
}

const REGRAS_EQUIPE = `
ATENDENTES:
- A lista "EQUIPE" traz os atendentes reais, com o setor de cada um e se estao online agora.
- Pode citar pelo nome quem esta online ("A Karina, da Tributacao, esta disponivel").
- Nunca prometa uma pessoa que esta offline nem invente nomes fora da lista.
- Se o cidadao pedir por uma pessoa da lista e ela estiver online e com vaga
  (conversas_abertas < limite), devolva o UUID dela em "operador_id" — a conversa vai direto para ela.
- Se a pessoa pedida estiver offline ou lotada, diga isso com naturalidade e encaminhe
  para o setor dela usando "departamento_id" (deixe "operador_id" null).
- Sem pedido por pessoa, roteie por assunto como sempre: use so "departamento_id".`;

function buildSystemPrompt(tenantNome, secretarias, departamentos, infoFila, contextoHorario = null, insistencia = 0, equipe = []) {
  const deptos = departamentos.map((d) => {
    const sec = secretarias.find((s) => s.id === d.secretaria_id);
    const prefix = sec ? `${sec.nome} › ` : '';
    const filaInfo = infoFila?.onlinePorDepto?.find((f) => f.id === d.id);
    const online = filaInfo?.online || 0;
    const naFila = filaInfo?.na_fila || 0;
    const disponibilidade = online > 0
      ? `${online} atendente(s) online, ${naFila} na fila`
      : `nenhum atendente online, ${naFila} na fila`;
    return `  - "${d.nome}" (id: ${d.id})${prefix ? ` — ${prefix.slice(0, -3)}` : ''} [${disponibilidade}]`;
  }).join('\n');

  const deptosCompact = departamentos.map((d) => {
    const sec = secretarias.find((s) => s.id === d.secretaria_id);
    const filaInfo = infoFila?.onlinePorDepto?.find((f) => f.id === d.id);
    return {
      id: d.id,
      nome: d.nome,
      secretaria: sec?.nome || 'Geral',
      atendentes_online: filaInfo?.online || 0,
      conversas_na_fila: filaInfo?.na_fila || 0,
    };
  });

  const tempoEstimado = infoFila?.tempoMedioSegundos
    ? `${Math.ceil(infoFila.tempoMedioSegundos / 60)} minutos`
    : 'alguns minutos';

  const infoPosicao = infoFila?.posicaoFila
    ? `\nO cidadao e o ${infoFila.posicaoFila}º na fila do departamento sugerido. Informe isso a ele se perguntar.`
    : '';

  const infoFilaTexto = infoFila?.totalFila > 0
    ? `\nHa ${infoFila.totalFila} conversas aguardando na fila geral. O tempo medio de espera e de ${tempoEstimado}.`
    : '';

  const basePrompt = `Voce e a Iris, assistente virtual da Prefeitura ${tenantNome || 'Municipal'}.
Seu objetivo e atender cidadaos com educacao, clareza e empatia.

REGRAS:
1. Sempre se apresente no primeiro contato: "Ola! Sou a Iris, assistente virtual da Prefeitura. Em que posso ajudar?"
2. Encaminhe DIRETAMENTE ao departamento correto. NAO encaminhe para Recepcao se o departamento alvo existe.
3. Se o departamento alvo NAO estiver na lista, ai sim encaminhe para Recepcao.
4. Se o cidadao pedir atendente humano sem especificar setor, encaminhe para Recepcao.
5. Se nao tiver certeza, faca ate 2 perguntas. Se ainda nao souber, encaminhe para Recepcao.
6. NUNCA invente informacoes. Nao de diagnosticos medicos.
7. Seja educada, empatica e direta ao ponto.
8. Priorize departamentos COM ATENDENTES ONLINE. Se dois departamentos servem, escolha o que tem atendente disponivel.
9. Se o cidadao perguntar sobre tempo de espera, informe com base nos dados disponiveis.${infoPosicao}${infoFilaTexto}`;

  let regraHorario = '';

  if (contextoHorario && !contextoHorario.dentroDoHorario) {
    if (insistencia >= 2) {
      const proximo = contextoHorario.proximoDiaUtil || 'no próximo dia útil';
      const extraSexta = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay() === 5 ? ' (retorno na segunda-feira)' : '';
      regraHorario = `\n
10. CONTEXTO — FORA DO HORARIO: ${contextoHorario.descricao}
    O cidadao ja enviou mensagens anteriores sem resposta de atendente${extraSexta}.
    Seja acolhedora: tranquilize o cidadao, informe que nao ha atendentes online agora e que o retorno ocorrera ${proximo} a partir das ${contextoHorario.horario_inicio || '08:00'}.
    Reforce que a conversa esta registrada e que voce pode ajudar com informacoes basicas.
    NAO use "departamento_id" — mantenha null. Mantenha "finalizado": false.`;
    } else {
      regraHorario = `\n
10. CONTEXTO — FORA DO HORARIO: ${contextoHorario.descricao}
    Este e o primeiro contato do cidadao fora do expediente.
    Comece com uma saudacao calorosa e tom leve. Mencione que o expediente encerrou, mas que ainda pode ter atendente por perto.
    Nao seja robotica — evite a saudacao padrao, seja natural e acolhedora.
    NAO use "departamento_id" — mantenha null. Mantenha "finalizado": false.`;
    }
  }

  return basePrompt + regraHorario + `

DEPARTAMENTOS DISPONIVEIS:
${deptos}
${REGRAS_EQUIPE}

FORMATO DE RESPOSTA (JSON obrigatorio):
{
  "resposta": "sua mensagem para o cidadao",
  "departamento_id": "id-do-departamento ou null",
  "operador_id": "id-do-atendente ou null",
  "finalizado": true
}

IMPORTANTE:
- "departamento_id": use o UUID do departamento que esta na lista acima. NAO use null se souber o departamento.
- So use "departamento_id": null se ainda estiver fazendo perguntas.
- "operador_id": so preencha quando o cidadao pedir por um atendente da lista EQUIPE que esteja online e com vaga.
- "finalizado": true ao encaminhar. false so se fizer pergunta e esperar resposta.

DEPARTAMENTOS EM JSON:
${JSON.stringify(deptosCompact)}

EQUIPE:
${JSON.stringify(equipeCompacta(equipe))}`;
}

/**
 * Tenta extrair nome de departamento do texto bruto usando similaridade.
 */
function extrairDepartamentoDoTexto(textoBruto, departamentos) {
  if (!textoBruto || departamentos.length === 0) return null;

  const textoLower = textoBruto.toLowerCase();

  // Estratégia 1: busca exata do nome
  for (const d of departamentos) {
    if (textoLower.includes(d.nome.toLowerCase())) {
      return d.id;
    }
  }

  // Estratégia 2: busca por nome da secretaria
  for (const d of departamentos) {
    if (d.secretaria_nome && textoLower.includes(d.secretaria_nome.toLowerCase())) {
      return d.id;
    }
  }

  // Estratégia 3: palavras-chave comuns -> departamento
  const mapaKeywords = {
    'saude': ['saúde', 'saude', 'hospital', 'posto', 'ubs', 'medico', 'médico', 'vacina', 'consulta', 'exame', 'sus', 'sintoma', 'doença', 'doenca', 'remédio', 'remedio', 'farmacia', 'farmácia'],
    'educação': ['educação', 'educacao', 'escola', 'creche', 'professor', 'aluno', 'matricula', 'matrícula', 'ensino', 'vaga'],
    'tributos': ['iptu', 'iss', 'imposto', 'taxa', 'tributo', 'boleto', 'cobrança', 'cobranca', 'divida', 'dívida', 'parcela', 'certidão', 'certidao'],
    'obras': ['obra', 'asfalto', 'tapa-buraco', 'buraco', 'pavimentação', 'pavimentacao', 'iluminação', 'iluminacao', 'saneamento', 'calçada', 'calcada'],
    'assistência social': ['assistência', 'assistencia', 'social', 'cesta', 'bolsa', 'cadunico', 'cadúnico', 'beneficio', 'benefício', 'vulnerabilidade'],
    'meio ambiente': ['ambiente', 'lixo', 'coleta', 'reciclagem', 'reciclagem', 'poluição', 'poluicao', 'árvore', 'arvore', 'praça', 'praca', 'jardim'],
    'trânsito': ['trânsito', 'transito', 'multa', 'semaforo', 'semáforo', 'estacionamento', 'transporte', 'ônibus', 'onibus'],
    'protocolo': ['protocolo', 'documento', 'processo', 'requerimento', 'oficio', 'ofício'],
  };

  for (const d of departamentos) {
    const nome = d.nome.toLowerCase();
    for (const [deptoTipo, keywords] of Object.entries(mapaKeywords)) {
      if (nome.includes(deptoTipo)) {
        for (const kw of keywords) {
          if (textoLower.includes(kw)) return d.id;
        }
      }
    }
  }

  return null;
}

// Uma resposta só serve para ser enviada ao cidadão se tiver conteúdo de fato.
// O DeepSeek eventualmente devolve só a abertura do objeto ("{") ou string
// vazia; mandar isso pelo WhatsApp é pior do que não responder — e, como a
// mensagem entra no histórico da conversa, o modelo passa a imitar o padrão e
// responde "{" para sempre naquele atendimento.
function textoUtil(txt) {
  return typeof txt === 'string' && txt.replace(/[^\p{L}\p{N}]/gu, '').length >= 2;
}

// Aceita JSON puro, JSON dentro de bloco ```json e JSON embutido em texto.
function extrairJson(bruto) {
  const txt = String(bruto || '').trim();
  if (!txt) return null;
  const candidatos = [txt];

  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidatos.push(fence[1].trim());

  const inicio = txt.indexOf('{');
  const fim = txt.lastIndexOf('}');
  if (inicio !== -1 && fim > inicio) candidatos.push(txt.slice(inicio, fim + 1));

  for (const c of candidatos) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === 'object') return obj;
    } catch { /* tenta o próximo formato */ }
  }
  return null;
}

// O prompt do tenant costuma trazer "não repita a apresentação". Sem este aviso
// o modelo trata o retorno do cidadão como continuação do atendimento anterior —
// e, como aquele assunto já foi encerrado, não responde nada.
const AVISO_RETORNO = `INSTRUCAO PRIORITARIA (vale para esta resposta e prevalece sobre a saudacao padrao definida acima):
RETORNO DO CIDADAO — o atendimento anterior deste cidadao ja foi encerrado pelo atendente. A mensagem atual abre um NOVO atendimento e a triagem recomeca do zero.
- Cumprimente de novo e se apresente, mesmo que voce ja tenha se apresentado em atendimentos anteriores.
- Se o assunto ja estiver claro na mensagem dele, encaminhe normalmente para o setor.
- Se a mensagem NAO deixar claro o que ele precisa, sua resposta DEVE perguntar com qual setor ele quer falar. Use exatamente este tipo de frase: "Ola! Sou a Iris, assistente virtual da Prefeitura. Com qual setor voce gostaria de falar hoje?". NAO encerre a frase com "Em que posso ajudar?". Nesse caso mantenha "departamento_id": null e "finalizado": false.
- Nao presuma que o assunto e o mesmo do atendimento anterior nem comente o que foi tratado antes.`;

// Rede de segurança para quando o provedor nao devolve nada aproveitavel: mantem
// a triagem viva em vez de deixar o cidadao falando sozinho.
function mensagemTriagem(comApresentacao) {
  if (comApresentacao) {
    return 'Olá! Sou a Iris, assistente virtual do atendimento. Com qual setor você gostaria de falar? '
      + 'Me conte o assunto que eu encaminho para o atendente certo.';
  }
  return 'Desculpe, não consegui entender. Pode me dizer com qual setor você quer falar ou qual é o assunto?';
}

const REFORCO_FORMATO = 'Responda AGORA somente com o objeto JSON no formato exigido: '
  + '{"resposta": "mensagem para o cidadao", "departamento_id": "uuid ou null", '
  + '"operador_id": "uuid ou null", "finalizado": true}. '
  + 'O campo "resposta" nunca pode ficar vazio.';

export async function processarComIris(tenantId, conversaId, texto) {
  const cfg = await db.oneOrNone(
    'SELECT * FROM config_iris WHERE tenant_id = $1 AND ativo = true',
    [tenantId]
  );
  if (!cfg) return null;

  // Verificar qual provider usar e se tem API key
  const provider = cfg.provider || 'deepseek';
  let apiKey;
  if (provider === 'deepseek') {
    apiKey = cfg.api_key;
    if (!apiKey) return null;
  } else if (provider === 'openai') {
    apiKey = cfg.openai_api_key || cfg.api_key; // fallback para campo antigo
    if (!apiKey) return null;
  }

  const tenant = await db.oneOrNone(
    'SELECT nome FROM tenants WHERE id = $1',
    [tenantId]
  );

  const secretarias = await db.manyOrNone(
    'SELECT id, nome FROM secretarias WHERE tenant_id = $1 ORDER BY nome',
    [tenantId]
  );

  // Buscar departamentos com nome da secretaria
  const departamentos = await db.manyOrNone(
    `SELECT d.id, d.nome, d.secretaria_id, s.nome AS secretaria_nome
     FROM departamentos d
     LEFT JOIN secretarias s ON s.id = d.secretaria_id
     WHERE d.tenant_id = $1 AND d.ativo = true
     ORDER BY d.nome`,
    [tenantId]
  );

  // `encerrada_em` marca o fim do último atendimento. A conversa é reaproveitada
  // quando o cidadão volta a escrever, então essa data é a fronteira entre o
  // atendimento antigo e o novo.
  const conv = await db.oneOrNone(
    `SELECT departamento_sugerido, menu_setores, GREATEST(resolvida_em, arquivada_em) AS encerrada_em
     FROM conversas WHERE id = $1 AND tenant_id = $2`,
    [conversaId, tenantId]
  );

  // Escolha numérica do menu de setores (enviado quando a primeira mensagem foi
  // mídia). Resolve "3" → 3º setor da lista de forma determinística, sem pedir
  // para a IA adivinhar o número — isso evita que a Iris mude o contexto e
  // responda com outro departamento.
  const escolhaNumero = detectarEscolhaMenu(texto);
  if (escolhaNumero && Array.isArray(conv?.menu_setores) && conv.menu_setores.length > 0) {
    const deptoId = conv.menu_setores[escolhaNumero - 1];
    const depto = deptoId ? departamentos.find((d) => d.id === deptoId) : null;
    if (depto) {
      console.log(`[Iris] Escolha numérica do menu: ${escolhaNumero} → ${depto.nome}`);
      return {
        respondido: true,
        resposta: `Certo! Vou te encaminhar para o setor de ${depto.nome}. Um atendente já vai te responder.`,
        departamento_id: depto.id,
        operador_id: null,
        finalizado: true,
        origem: 'iris',
        confianca: 'alta (menu de setores)',
      };
    }
  }

  // Obter informações da fila
  const infoFila = await obterInfoFila(tenantId, conv?.departamento_sugerido);

  // Quem atende, em que setor e quem está online neste instante
  const equipe = await obterEquipe(tenantId);

  // Obter contexto de horário de atendimento
  const contextoHorario = await obterContextoHorario(tenantId);

  // Contar quantas mensagens do cidadão após o fim do expediente
  let insistencia = 0;
  if (contextoHorario && !contextoHorario.dentroDoHorario) {
    try {
      const hoje = new Date();
      const inicioForaHorario = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0).toISOString();
      const contagem = await db.one(
        `SELECT COUNT(*)::int as cnt FROM mensagens
         WHERE conversa_id = $1 AND tenant_id = $2 AND direcao = 'entrada'
           AND criado_em > $3`,
        [conversaId, tenantId, inicioForaHorario]
      );
      insistencia = contagem.cnt;
    } catch (e) {
      console.error('[Iris] Erro ao contar mensagens fora do horário:', e.message);
    }
  }
  console.log('[Iris] contextoHorario:', JSON.stringify(contextoHorario), 'insistencia:', insistencia);

  // Só o atendimento atual entra no histórico. Levar junto a conversa já
  // encerrada fazia o modelo concluir que não sobrou nada a dizer e devolver
  // resposta vazia (o DeepSeek responde só espaços em branco nessa situação):
  // a Iris ficava muda justamente quando o cidadão voltava depois do "resolvido".
  const historico = await db.manyOrNone(
    `SELECT direcao, conteudo
     FROM mensagens
     WHERE conversa_id = $1 AND tenant_id = $2 AND tipo = 'texto'
       AND ($3::timestamptz IS NULL OR criado_em > $3)
     ORDER BY criado_em DESC LIMIT 15`,
    [conversaId, tenantId, conv?.encerrada_em || null]
  );

  // Primeira mensagem depois de um atendimento encerrado: a triagem recomeça do
  // zero, como em um contato novo.
  const retomandoAtendimento = Boolean(conv?.encerrada_em)
    && !historico.some((h) => h.direcao === 'saida');

  let systemPrompt = cfg.system_prompt
    || buildSystemPrompt(tenant?.nome, secretarias, departamentos, infoFila, contextoHorario, insistencia, equipe);

  if (cfg.system_prompt) {
    const deptosCompact = departamentos.map((d) => {
      const filaInfo = infoFila?.onlinePorDepto?.find((f) => f.id === d.id);
      return {
        id: d.id,
        nome: d.nome,
        secretaria: d.secretaria_nome || 'Geral',
        atendentes_online: filaInfo?.online || 0,
        conversas_na_fila: filaInfo?.na_fila || 0,
      };
    });

    // Prefixa aviso de fora do horário ANTES do prompt customizado (prioridade máxima)
    if (contextoHorario && !contextoHorario.dentroDoHorario) {
      if (insistencia >= 2) {
        const proximo = contextoHorario.proximoDiaUtil || 'no proximo dia util';
        const sexta = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay() === 5;
        const retorno = sexta ? `na segunda-feira a partir das ${contextoHorario.horario_inicio || '08:00'}` : `${proximo} a partir das ${contextoHorario.horario_inicio || '08:00'}`;
        systemPrompt = `CONTEXTO IMPORTANTE: ${contextoHorario.descricao} Nao houve resposta de atendente. Adapte sua resposta: reconheca que nao ha atendentes online no momento e que o retorno ocorrera ${retorno}. Tranquilize o cidadao dizendo que a conversa ficara registrada. Ofereca ajuda com informacoes. NAO use a saudacao "Ola! Sou a Iris..." — use um tom acolhedor e tranquilo.\n\nExemplo: "Entendo sua necessidade! No momento nossos atendentes nao estao disponiveis, mas sua mensagem esta registrada e retornaremos ${retorno}. Enquanto isso, pode me perguntar que tento ajudar com as informacoes que tenho. 😊"\n\nDemais instrucoes (validas em horario normal):\n\n${systemPrompt}`;
      } else {
        systemPrompt = `CONTEXTO IMPORTANTE: ${contextoHorario.descricao} Adapte sua apresentacao: comece com uma saudacao calorosa e um tom leve, mencionando que o expediente encerrou mas que ainda pode ter alguem por perto. NAO use a saudacao robotica "Ola! Sou a Iris..." — seja natural e acolhedora.\n\nExemplo: "Ola! Tudo bem? 😊 So pra avisar que nosso expediente foi ate as ${contextoHorario.horario_fim || '17:00'}, mas as vezes algum atendente ainda esta por aqui. Enquanto isso, fique a vontade para me perguntar — posso ajudar com informacoes! Em que posso ajudar?"\n\nDemais instrucoes (validas em horario normal):\n\n${systemPrompt}`;
      }
    }

    systemPrompt += `\n\nDEPARTAMENTOS DISPONIVEIS (use o UUID exato em "departamento_id"):\n${JSON.stringify(deptosCompact)}`;
    // O prompt customizado do tenant não conhece a equipe: anexamos a lista viva
    // e as regras de uso, do mesmo jeito que fazemos com os departamentos.
    systemPrompt += `\n${REGRAS_EQUIPE}\n\nEQUIPE (use o UUID exato em "operador_id"):\n${JSON.stringify(equipeCompacta(equipe))}`;
  }

  // Vai no fim do prompt, depois das regras do tenant: prefixado, ele perdia para
  // a saudação literal que o prompt customizado manda usar ("Em que posso
  // ajudar?") e a Iris não chegava a perguntar o setor no retorno do cidadão.
  if (retomandoAtendimento) {
    systemPrompt = `${systemPrompt}\n\n---\n\n${AVISO_RETORNO}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  console.log('[Iris] systemPrompt (primeiros 400 chars):', systemPrompt.slice(0, 400));

  for (let i = historico.length - 1; i >= 0; i--) {
    const h = historico[i];
    const clean = String(h.conteudo || '').replace(/^🤖\s*/, '');
    // Restos de falhas anteriores do provedor ("{", mensagem vazia) ficam de
    // fora: no histórico eles ensinam o modelo a repetir o mesmo lixo.
    if (!textoUtil(clean)) continue;
    if (h.direcao === 'entrada') {
      messages.push({ role: 'user', content: clean });
    } else {
      messages.push({ role: 'assistant', content: clean });
    }
  }

  // Uma chamada ao provedor. Devolve o texto cru da resposta (ou null).
  const chamarProvedor = async (msgs) => {
    const url = provider === 'deepseek' ? DEEPSEEK_API_URL : OPENAI_API_URL;
    const model = provider === 'deepseek'
      ? (cfg.model || 'deepseek-chat')
      : (cfg.openai_model || cfg.model || 'gpt-4o-mini');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        temperature: cfg.temperatura ?? 0.7,
        max_tokens: cfg.max_tokens ?? 1024,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Iris] ${provider} API error:`, res.status, errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const escolha = data.choices?.[0];
    if (escolha?.finish_reason && escolha.finish_reason !== 'stop') {
      console.warn(`[Iris] finish_reason=${escolha.finish_reason} tokens=${data.usage?.completion_tokens}`);
    }
    return escolha?.message?.content ?? null;
  };

  try {
    if (provider !== 'deepseek' && provider !== 'openai') {
      console.error('[Iris] Provider desconhecido:', provider);
      return null;
    }

    // O provedor às vezes devolve um objeto truncado ("{") ou vazio. Quando isso
    // acontece, uma segunda tentativa com o formato reforçado costuma resolver;
    // se não resolver, é melhor calar do que mandar lixo para o cidadão — a
    // conversa segue na fila e o atendente humano assume.
    let response = await chamarProvedor(messages);
    let parsed = extrairJson(response);
    // `null` = chamada falhou (erro HTTP/rede). Conteúdo inútil = provedor no ar,
    // mas sem nada a dizer. Os dois casos merecem tratamento diferente.
    let provedorNoAr = response !== null;

    if (!textoUtil(parsed?.resposta) && !textoUtil(response)) {
      console.warn('[Iris] Resposta degenerada, repetindo com reforço de formato:', JSON.stringify(response)?.slice(0, 80));
      response = await chamarProvedor([...messages, { role: 'system', content: REFORCO_FORMATO }]);
      parsed = extrairJson(response);
      provedorNoAr = provedorNoAr || response !== null;
    }

    if (!textoUtil(parsed?.resposta) && !textoUtil(response)) {
      if (provedorNoAr) {
        // Deixar o cidadão sem resposta é pior do que uma triagem genérica: a
        // conversa segue para a fila com a Iris tendo ao menos perguntado o setor.
        console.warn('[Iris] Resposta inutilizável nas 2 tentativas — enviando triagem padrão.');
        return {
          respondido: true,
          resposta: mensagemTriagem(retomandoAtendimento || historico.length <= 1),
          departamento_id: null,
          operador_id: null,
          finalizado: false,
          origem: 'iris',
          confianca: 'fallback (provedor sem resposta)',
        };
      }
      console.error('[Iris] Provedor indisponível nas 2 tentativas — nada será enviado ao cidadão.');
      return null;
    }

    if (!parsed || !textoUtil(parsed.resposta)) {
      // Veio texto puro em vez de JSON: aproveita o texto e tenta descobrir o
      // departamento por ele.
      const raw = String(response || '').trim();
      console.log('[Iris] Resposta nao-JSON, usando fallback inteligente:', raw.slice(0, 120));

      const deptoDoTexto = extrairDepartamentoDoTexto(raw, departamentos);

      let deptoAlvo = deptoDoTexto;
      if (!deptoAlvo) {
        // Última tentativa: recepção
        const recepcao = await db.oneOrNone(
          "SELECT id FROM departamentos WHERE tenant_id = $1 AND LOWER(nome) = 'recepcao' AND ativo = true",
          [tenantId]
        );
        deptoAlvo = recepcao?.id || null;
      }

      return {
        respondido: true,
        resposta: raw.slice(0, 1000),
        departamento_id: deptoAlvo,
        finalizado: true,
        origem: 'iris',
        confianca: deptoDoTexto ? 'media (extraido do texto)' : 'baixa (fallback)',
      };
    }

    console.log('[Iris] Resposta:', JSON.stringify({
      resposta: parsed.resposta?.slice(0, 80),
      departamento_id: parsed.departamento_id,
      operador_id: parsed.operador_id,
      finalizado: parsed.finalizado,
      provider,
    }));

    // O atendente escolhido é conferido contra a lista real: só vale quem está
    // na equipe deste tenant, online agora e com vaga. O modelo pode alucinar um
    // UUID ou insistir em alguém que acabou de sair — a decisão final é nossa.
    let operadorValido = null;
    if (parsed.operador_id) {
      const alvo = equipe.find((o) => o.id === String(parsed.operador_id));
      if (!alvo) {
        console.log('[Iris] Atendente fora da equipe, ignorando:', parsed.operador_id);
      } else if (!alvo.online) {
        console.log(`[Iris] Atendente ${alvo.nome} está offline — cai para o setor.`);
      } else if (alvo.limite && alvo.em_atendimento >= alvo.limite) {
        console.log(`[Iris] Atendente ${alvo.nome} no limite (${alvo.em_atendimento}/${alvo.limite}) — cai para o setor.`);
      } else {
        operadorValido = alvo.id;
      }
    }

    // Valida se o departamento_id existe no tenant
    let deptoValido = null;
    if (parsed.departamento_id) {
      try {
        const depto = await db.oneOrNone(
          'SELECT id FROM departamentos WHERE id = $1 AND tenant_id = $2 AND ativo = true',
          [parsed.departamento_id, tenantId]
        );
        if (depto) {
          deptoValido = parsed.departamento_id;
        } else {
          console.log('[Iris] Departamento invalido, ignorando:', parsed.departamento_id);
        }
      } catch {
        console.log('[Iris] Departamento nao-UUID, buscando por nome:', parsed.departamento_id);
        const deptoByName = await db.oneOrNone(
          `SELECT id FROM departamentos WHERE tenant_id = $1 AND ativo = true AND LOWER(nome) = LOWER($2)`,
          [tenantId, String(parsed.departamento_id)]
        );
        if (deptoByName) {
          deptoValido = deptoByName.id;
        } else {
          // Fallback: tentar extrair do texto da resposta
          console.log('[Iris] Departamento nao encontrado por nome, tentando fallback no texto');
          deptoValido = extrairDepartamentoDoTexto(
            parsed.resposta || '',
            departamentos
          );
        }
      }
    }

    // Pediram uma pessoa que não pode assumir agora: a conversa vai para a fila
    // do setor dela, para um colega pegar, em vez de ficar sem destino.
    if (!operadorValido && parsed.operador_id && !deptoValido) {
      const alvo = equipe.find((o) => o.id === String(parsed.operador_id));
      if (alvo?.setor_ids?.length) deptoValido = alvo.setor_ids[0];
    }

    // Se o departamento_id extraído do texto é o mesmo sugerido, é um bom sinal
    const confianca = deptoValido
      ? (conv?.departamento_sugerido === deptoValido ? 'alta' : 'normal')
      : 'sem roteamento';

    return {
      respondido: true,
      resposta: parsed.resposta || 'Desculpe, nao entendi. Um atendente ira ajuda-lo.',
      departamento_id: deptoValido,
      operador_id: operadorValido,
      finalizado: parsed.finalizado !== false,
      origem: 'iris',
      confianca,
    };
  } catch (err) {
    console.error('[Iris] Erro ao processar:', err.message);
    return null;
  }
}

export async function getConfigIris(tenantId) {
  const cfg = await db.oneOrNone('SELECT * FROM config_iris WHERE tenant_id = $1', [tenantId]);
  if (!cfg) {
    return {
      ativo: false,
      provider: 'deepseek',
      model: 'deepseek-chat',
      openai_model: 'gpt-4o-mini',
      temperatura: 0.7,
      max_tokens: 1024,
    };
  }
  return cfg;
}

export async function saveConfigIris(tenantId, body) {
  const fields = [];
  const values = [tenantId];
  let idx = 2;

  const allowed = [
    'ativo', 'api_key', 'model', 'system_prompt', 'temperatura', 'max_tokens',
    'provider', 'openai_api_key', 'openai_model',
  ];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      // Ignora api_key mascarada com bullet points
      if ((key === 'api_key' || key === 'openai_api_key') && typeof body[key] === 'string' && body[key].includes('\u2022')) {
        continue;
      }
      fields.push(`${key} = $${idx++}`);
      values.push(body[key]);
    }
  }

  fields.push(`atualizado_em = now()`);

  await db.none(
    `INSERT INTO config_iris (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO UPDATE SET ${fields.join(', ')}`,
    values
  );

  return getConfigIris(tenantId);
}
