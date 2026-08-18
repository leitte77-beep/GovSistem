import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diaLocal, filtrosCanal, fusoPainel, horaLocal, metasDoPeriodo, META_PADRAO,
  periodoAnterior, repartirAtendimento, resolverCanal, resumirFila, situacaoContraMeta,
} from '../src/services/dashboard.js';

test('fuso cai no padrão quando a variável é inválida ou perigosa', () => {
  assert.equal(fusoPainel(''), 'America/Sao_Paulo');
  assert.equal(fusoPainel("America/Sao_Paulo'; DROP TABLE conversas; --"), 'America/Sao_Paulo');
  assert.equal(fusoPainel('Europe/Lisbon'), 'Europe/Lisbon');
});

test('dia e hora são recortados no fuso local, não em UTC', () => {
  assert.equal(diaLocal('criado_em', 'America/Sao_Paulo'), "((criado_em) AT TIME ZONE 'America/Sao_Paulo')::date");
  assert.match(horaLocal('m.criado_em', 'America/Sao_Paulo'), /EXTRACT\(HOUR FROM \(\(m\.criado_em\) AT TIME ZONE 'America\/Sao_Paulo'\)\)::int/);
});

test('canal desconhecido é recusado em vez de devolver o total sem filtro', () => {
  assert.deepEqual(resolverCanal('telefone'), { ok: false, tipo: null });
  assert.deepEqual(resolverCanal(''), { ok: true, tipo: null });
  assert.equal(resolverCanal('chatbot').tipo, 'bot');
  assert.equal(resolverCanal('CHAT_INTERNO').tipo, 'vazio');
  assert.equal(resolverCanal('humano').tipo, 'humano');
});

test('filtro de canal recorta mensagens pela conversa, não pela origem', () => {
  // Recortar por origem zeraria "mensagens recebidas": o cidadão nunca escreve
  // com origem de bot nem de atendente.
  assert.match(filtrosCanal('bot').conv, /operador_id IS NULL/);
  assert.match(filtrosCanal('bot').msg, /cc\.operador_id IS NULL/);
  assert.doesNotMatch(filtrosCanal('bot').msg, /origem/);
  assert.match(filtrosCanal('humano').msg, /cc\.operador_id IS NOT NULL/);
  assert.match(filtrosCanal('whatsapp').conv, /ct\.canal = 'whatsapp'/);
  assert.equal(filtrosCanal('vazio').conv, ' AND FALSE');
  assert.deepEqual(filtrosCanal(null), { conv: '', msg: '' });
});

test('meta do setor tem precedência sobre a do órgão, que vence o padrão', () => {
  const linhas = [
    { departamento_id: null, primeira_resposta_minutos: 20, resolucao_minutos: 300, alerta_percentual: 70, ativo: true },
    { departamento_id: 'dep-saude', primeira_resposta_minutos: 5, resolucao_minutos: 60, alerta_percentual: 90, ativo: true },
  ];
  assert.equal(metasDoPeriodo(linhas, 'dep-saude').primeira_resposta_minutos, 5);
  assert.equal(metasDoPeriodo(linhas, 'dep-saude').origem, 'departamento');
  assert.equal(metasDoPeriodo(linhas).primeira_resposta_minutos, 20);
  assert.equal(metasDoPeriodo([], null).primeira_resposta_minutos, META_PADRAO.primeira_resposta_minutos);
  assert.equal(metasDoPeriodo([{ departamento_id: null, primeira_resposta_minutos: 9, ativo: false }]).origem, 'padrao');
});

test('situação contra a meta avisa antes de estourar', () => {
  assert.equal(situacaoContraMeta(10 * 60, 30), 'NO_PRAZO');
  assert.equal(situacaoContraMeta(25 * 60, 30), 'PROXIMO');
  assert.equal(situacaoContraMeta(31 * 60, 30), 'VENCIDO');
  assert.equal(situacaoContraMeta(0, 30), 'NO_PRAZO');
  assert.equal(situacaoContraMeta(600, 0), 'NO_PRAZO');
});

test('resumo da fila distribui esperas e aponta a mais antiga', () => {
  const agora = new Date('2026-08-18T12:00:00Z');
  const fila = [
    { conversa_id: 'a', aguardando_desde: '2026-08-18T11:55:00Z', contato: 'Ana' },
    { conversa_id: 'b', aguardando_desde: '2026-08-18T11:40:00Z', contato: 'Bruno', sem_primeira_resposta: true },
    { conversa_id: 'c', aguardando_desde: '2026-08-18T11:15:00Z', contato: 'Carla' },
    { conversa_id: 'd', aguardando_desde: '2026-08-18T09:30:00Z', contato: 'Davi', sem_primeira_resposta: true },
    { conversa_id: 'e', aguardando_desde: null },
  ];
  const resumo = resumirFila(fila, agora, { primeira_resposta_minutos: 30, alerta_percentual: 80 });
  assert.equal(resumo.total, 4);
  assert.deepEqual(resumo.faixas, { ate_15: 1, de_15_30: 1, de_30_60: 1, acima_60: 1 });
  assert.equal(resumo.mais_antiga.conversa_id, 'd');
  assert.equal(resumo.maior_espera_seg, 150 * 60);
  assert.equal(resumo.sem_primeira_resposta, 2);
  assert.equal(resumo.fora_da_meta, 2);
  assert.equal(resumo.situacao, 'VENCIDO');
});

test('fila vazia não inventa espera', () => {
  const resumo = resumirFila([], new Date());
  assert.equal(resumo.total, 0);
  assert.equal(resumo.maior_espera_seg, 0);
  assert.equal(resumo.mais_antiga, null);
  assert.equal(resumo.situacao, 'NO_PRAZO');
});

test('divisão Iris x equipe ignora mensagens do cidadão no percentual', () => {
  const divisao = repartirAtendimento([
    { origem: 'bot', total: 30 },
    { origem: 'atendente', total: 60 },
    { origem: 'whatsapp', total: 10 },
    { origem: 'cidadao', total: 500 },
  ]);
  assert.equal(divisao.respostas_bot, 30);
  assert.equal(divisao.respostas_humano, 70);
  assert.equal(divisao.mensagens_cidadao, 500);
  assert.equal(divisao.percentual_bot, 30);
  assert.equal(repartirAtendimento([]).percentual_bot, 0);
});

test('período anterior tem o mesmo tamanho e termina na véspera', () => {
  assert.deepEqual(periodoAnterior('2026-08-08', '2026-08-14'), { inicio: '2026-08-01', fim: '2026-08-07' });
  assert.deepEqual(periodoAnterior('2026-08-18', '2026-08-18'), { inicio: '2026-08-17', fim: '2026-08-17' });
  assert.equal(periodoAnterior('2026-08-18', '2026-08-01'), null);
});
