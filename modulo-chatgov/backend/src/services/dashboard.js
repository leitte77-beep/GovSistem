import { slaIndicator } from '../domain/sla.js';

// Fuso usado para recortar dia e hora nos indicadores. O banco grava em UTC;
// sem converter, o atendimento do fim da tarde cai no dia seguinte e o
// relatório do gestor não bate com o expediente dele.
const TZ_PADRAO = 'America/Sao_Paulo';

export function fusoPainel(valor = process.env.TZ_RELATORIOS) {
  const nome = String(valor || '').trim();
  // Só nomes de fuso IANA — a string vai interpolada no SQL.
  return /^[A-Za-z]+(?:[_+-][A-Za-z0-9]+)*(?:\/[A-Za-z0-9]+(?:[_+-][A-Za-z0-9]+)*)+$/.test(nome)
    ? nome
    : TZ_PADRAO;
}

// Expressão SQL do "dia local" de uma coluna timestamptz.
export function diaLocal(coluna, tz = fusoPainel()) {
  return `((${coluna}) AT TIME ZONE '${tz}')::date`;
}

export function horaLocal(coluna, tz = fusoPainel()) {
  return `EXTRACT(HOUR FROM ((${coluna}) AT TIME ZONE '${tz}'))::int`;
}

// Canais aceitos nos relatórios. Antes, um valor desconhecido ('whatsapp',
// 'chat_interno') simplesmente não filtrava nada e a tela mostrava o total
// como se fosse o recorte pedido — pior que recusar o filtro.
const CANAIS = {
  chatbot: 'bot',
  bot: 'bot',
  iris: 'bot',
  humano: 'humano',
  atendente: 'humano',
  equipe: 'humano',
  whatsapp: 'whatsapp',
  chat_interno: 'vazio',
  interno: 'vazio',
};

export function resolverCanal(valor) {
  if (valor === undefined || valor === null || valor === '') return { ok: true, tipo: null };
  const chave = String(valor).trim().toLowerCase();
  const tipo = CANAIS[chave];
  if (!tipo) return { ok: false, tipo: null };
  return { ok: true, tipo };
}

// Cláusulas por canal. `conv` filtra a tabela conversas (alias c quando houver),
// `msg` filtra mensagens (alias m).
//
// As mensagens são recortadas pela conversa a que pertencem, e não pela própria
// origem: filtrar "atendimento da Iris" por `origem='bot'` zeraria o total de
// mensagens recebidas, já que o que o cidadão escreve nunca tem origem de bot.
// A divisão Iris x equipe é assunto de `repartirAtendimento`.
export function filtrosCanal(tipo, { aliasConversa = 'c', aliasMensagem = 'm' } = {}) {
  const daConversa = (condicao) =>
    ` AND EXISTS (SELECT 1 FROM conversas cc WHERE cc.id = ${aliasMensagem}.conversa_id AND ${condicao})`;
  switch (tipo) {
    case 'bot':
      return {
        conv: ` AND ${aliasConversa}.operador_id IS NULL`,
        msg: daConversa('cc.operador_id IS NULL'),
      };
    case 'humano':
      return {
        conv: ` AND ${aliasConversa}.operador_id IS NOT NULL`,
        msg: daConversa('cc.operador_id IS NOT NULL'),
      };
    case 'whatsapp':
      return {
        conv: ` AND EXISTS (SELECT 1 FROM contatos ct WHERE ct.id = ${aliasConversa}.contato_id AND ct.canal = 'whatsapp')`,
        msg: daConversa("EXISTS (SELECT 1 FROM contatos ct WHERE ct.id = cc.contato_id AND ct.canal = 'whatsapp')"),
      };
    // Canal previsto no produto mas sem origem própria no banco: devolver vazio
    // é a resposta honesta — "não há atendimento neste canal".
    case 'vazio':
      return { conv: ' AND FALSE', msg: ' AND FALSE' };
    default:
      return { conv: '', msg: '' };
  }
}

export const META_PADRAO = Object.freeze({
  primeira_resposta_minutos: 30,
  resolucao_minutos: 480,
  alerta_percentual: 80,
});

// Metas do setor filtrado, caindo para a meta geral do tenant e daí para o
// padrão. `linhas` vem de sla_configuracoes.
export function metasDoPeriodo(linhas = [], departamentoId = null) {
  const ativas = (linhas || []).filter((linha) => linha && linha.ativo !== false);
  const doSetor = departamentoId
    ? ativas.find((linha) => linha.departamento_id === departamentoId)
    : null;
  const geral = ativas.find((linha) => !linha.departamento_id);
  const escolhida = doSetor || geral || null;
  if (!escolhida) return { ...META_PADRAO, origem: 'padrao' };
  return {
    primeira_resposta_minutos: Number(escolhida.primeira_resposta_minutos) || META_PADRAO.primeira_resposta_minutos,
    resolucao_minutos: Number(escolhida.resolucao_minutos) || META_PADRAO.resolucao_minutos,
    alerta_percentual: Number(escolhida.alerta_percentual) || META_PADRAO.alerta_percentual,
    origem: doSetor ? 'departamento' : 'tenant',
  };
}

// 'NO_PRAZO' | 'PROXIMO' | 'VENCIDO' para um tempo em segundos contra a meta.
export function situacaoContraMeta(segundos, metaMinutos, alertaPercentual = META_PADRAO.alerta_percentual) {
  const minutos = Number(segundos) / 60;
  if (!Number.isFinite(minutos) || minutos <= 0) return 'NO_PRAZO';
  const meta = Number(metaMinutos);
  if (!Number.isFinite(meta) || meta <= 0) return 'NO_PRAZO';
  return slaIndicator(minutos, meta, alertaPercentual);
}

export const FAIXAS_ESPERA = Object.freeze([
  { chave: 'ate_15', rotulo: 'até 15 min', ateMinutos: 15 },
  { chave: 'de_15_30', rotulo: '15 a 30 min', ateMinutos: 30 },
  { chave: 'de_30_60', rotulo: '30 a 60 min', ateMinutos: 60 },
  { chave: 'acima_60', rotulo: 'mais de 1 h', ateMinutos: Infinity },
]);

// Retrato da fila: quantas aguardam, há quanto tempo espera a mais antiga e
// como a espera se distribui. É o número que manda alguém agir agora — os
// demais indicadores contam o que já passou.
export function resumirFila(itens = [], agora = new Date(), meta = META_PADRAO) {
  const referencia = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();
  const faixas = Object.fromEntries(FAIXAS_ESPERA.map((faixa) => [faixa.chave, 0]));
  let maiorEsperaSeg = 0;
  let maisAntiga = null;
  let semPrimeiraResposta = 0;
  let total = 0;

  for (const item of itens || []) {
    const inicio = item?.aguardando_desde ? new Date(item.aguardando_desde).getTime() : NaN;
    if (!Number.isFinite(inicio)) continue;
    total++;
    const esperaSeg = Math.max(0, Math.round((referencia - inicio) / 1000));
    const esperaMin = esperaSeg / 60;
    const faixa = FAIXAS_ESPERA.find((f) => esperaMin < f.ateMinutos) || FAIXAS_ESPERA[FAIXAS_ESPERA.length - 1];
    faixas[faixa.chave]++;
    if (item?.sem_primeira_resposta) semPrimeiraResposta++;
    if (esperaSeg > maiorEsperaSeg) {
      maiorEsperaSeg = esperaSeg;
      maisAntiga = {
        conversa_id: item.conversa_id || item.id || null,
        contato: item.contato || null,
        departamento: item.departamento || null,
        espera_seg: esperaSeg,
      };
    }
  }

  const alvo = Number(meta?.primeira_resposta_minutos) || META_PADRAO.primeira_resposta_minutos;
  const foraDaMeta = (itens || []).filter((item) => {
    const inicio = item?.aguardando_desde ? new Date(item.aguardando_desde).getTime() : NaN;
    if (!Number.isFinite(inicio)) return false;
    return (referencia - inicio) / 60000 >= alvo;
  }).length;

  return {
    total,
    faixas,
    maior_espera_seg: maiorEsperaSeg,
    mais_antiga: maisAntiga,
    sem_primeira_resposta: semPrimeiraResposta,
    fora_da_meta: foraDaMeta,
    situacao: situacaoContraMeta(maiorEsperaSeg, alvo, meta?.alerta_percentual),
  };
}

// Divisão do atendimento entre a Iris e a equipe, a partir das origens já
// gravadas em mensagens.origem.
export function repartirAtendimento(linhas = []) {
  const totais = { bot: 0, humano: 0, cidadao: 0 };
  for (const linha of linhas || []) {
    const total = Number(linha?.total) || 0;
    if (linha?.origem === 'bot') totais.bot += total;
    else if (linha?.origem === 'cidadao') totais.cidadao += total;
    else if (linha?.origem === 'atendente' || linha?.origem === 'whatsapp') totais.humano += total;
  }
  const respostas = totais.bot + totais.humano;
  return {
    respostas_bot: totais.bot,
    respostas_humano: totais.humano,
    mensagens_cidadao: totais.cidadao,
    percentual_bot: respostas > 0 ? Math.round((totais.bot / respostas) * 100) : 0,
  };
}

// Período imediatamente anterior, de mesmo tamanho, para comparação.
export function periodoAnterior(inicio, fim) {
  const inicioMs = new Date(`${inicio}T00:00:00Z`).getTime();
  const fimMs = new Date(`${fim}T00:00:00Z`).getTime();
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs) || fimMs < inicioMs) return null;
  const dias = Math.round((fimMs - inicioMs) / 86400000) + 1;
  const fimAnt = new Date(inicioMs - 86400000);
  const inicioAnt = new Date(fimAnt.getTime() - (dias - 1) * 86400000);
  return { inicio: inicioAnt.toISOString().slice(0, 10), fim: fimAnt.toISOString().slice(0, 10) };
}
