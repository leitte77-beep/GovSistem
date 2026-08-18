// node --test src/__tests__/dashboard-utils.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  descreverFiltros, formatarDataBr, formatarDataCurta, formatarTempo,
  inicioPeriodo, matrizesDashboard, periodosRapidos, situacaoMeta,
} from '../utils/dashboard.js';
import { celulaCsv, montarCsv, nomeArquivoExport } from '../utils/exportar.js';

test('tempo é lido em segundos, minutos ou horas conforme a grandeza', () => {
  assert.equal(formatarTempo(45), '45s');
  assert.equal(formatarTempo(90), '2min');
  assert.equal(formatarTempo(3600), '1h');
  assert.equal(formatarTempo(5400), '1h 30min');
  assert.equal(formatarTempo(-10), '0s');
  assert.equal(formatarTempo(null), '0s');
});

test('datas aparecem no formato brasileiro', () => {
  assert.equal(formatarDataCurta('2026-08-18'), '18/08');
  assert.equal(formatarDataBr('2026-08-18'), '18/08/2026');
  assert.equal(formatarDataBr(''), '');
});

test('períodos rápidos cobrem o mês corrente e o anterior', () => {
  const lista = periodosRapidos(new Date(2026, 7, 18));
  const mesPassado = lista.find((p) => p.chave === 'mes_anterior');
  assert.deepEqual({ inicio: mesPassado.inicio, fim: mesPassado.fim }, { inicio: '2026-07-01', fim: '2026-07-31' });
  assert.equal(lista.find((p) => p.chave === 'mes').inicio, '2026-08-01');
  assert.equal(lista.find((p) => p.chave === 'ontem').inicio, '2026-08-17');
  assert.equal(inicioPeriodo(7, new Date(2026, 7, 18)), '2026-08-12');
});

test('semáforo avisa antes de estourar a meta', () => {
  assert.equal(situacaoMeta(5 * 60, 30), 'NO_PRAZO');
  assert.equal(situacaoMeta(25 * 60, 30), 'PROXIMO');
  assert.equal(situacaoMeta(45 * 60, 30), 'VENCIDO');
  assert.equal(situacaoMeta(0, 30), 'NO_PRAZO');
});

test('descrição do recorte diz setor e canal, mesmo quando não filtrados', () => {
  assert.equal(
    descreverFiltros({ inicio: '2026-08-01', fim: '2026-08-18' }),
    'De 01/08/2026 a 18/08/2026 · Todos os setores · Todo o atendimento',
  );
  assert.match(
    descreverFiltros({ inicio: '2026-08-18', fim: '2026-08-18', departamentoNome: 'Saúde', canalRotulo: 'Iris' }),
    /^Dia 18\/08\/2026 · Setor: Saúde · Atendimento: Iris$/,
  );
});

test('planilha carrega procedência e os números dos painéis', () => {
  const blocos = matrizesDashboard(
    {
      metricas: {
        resumo: { criadas: 12, recebidas: 30, enviadas: 25, taxa_resolucao: 75, tempo_primeira_resposta_seg: 120 },
        por_dia: [{ dia: '2026-08-18', total: 12 }],
        por_setor: [{ nome: 'Saúde', total: 7 }],
        por_status: [{ status: 'fila', total: 3 }],
        por_hora: [{ hora: 9, total: 5 }],
        ranking_atendentes: [{ nome: 'Ana', enviadas: 20, conversas: 6 }],
        nps: { nps: 40 },
      },
      administrativo: {
        fila: { total: 3, maior_espera_seg: 900, fora_da_meta: 1, sem_primeira_resposta: 2 },
        atendimento: { respostas_bot: 10, respostas_humano: 15, percentual_bot: 40 },
        metas: { primeira_resposta_minutos: 30 },
        tma_por_setor: [{ nome: 'Saúde', minutos: 45 }],
      },
    },
    { inicio: '2026-08-18', fim: '2026-08-18', orgao: 'Prefeitura de Farol', emitidoPor: 'Alisson', emitidoEm: '18/08/2026 16:00' },
  );
  const resumo = blocos[0].linhas;
  assert.deepEqual(resumo[1], ['Prefeitura de Farol']);
  assert.match(resumo[2][0], /Dia 18\/08\/2026 · Todos os setores/);
  assert.match(resumo[3][0], /Emitido em 18\/08\/2026 16:00 por Alisson/);
  assert.deepEqual(resumo.find((l) => l[0] === 'Aguardando acima da meta'), ['Aguardando acima da meta', 1]);
  assert.deepEqual(resumo.find((l) => l[0] === 'Atendimento resolvido pela Iris (%)'), ['Atendimento resolvido pela Iris (%)', 40]);
  assert.deepEqual(blocos.find((b) => b.nome === 'TMA por setor').linhas[1], ['Saúde', 45]);
  assert.equal(blocos.length, 7);
});

test('planilha não quebra quando ainda não há dados', () => {
  const blocos = matrizesDashboard(null, {});
  assert.equal(blocos.length, 7);
  assert.deepEqual(blocos[0].linhas.find((l) => l[0] === 'Aguardando agora'), ['Aguardando agora', 0]);
});

test('CSV usa ponto e vírgula, BOM e escapa o que precisa', () => {
  assert.equal(celulaCsv('Saúde; Ambulatório'), '"Saúde; Ambulatório"');
  assert.equal(celulaCsv('aspas "aqui"'), '"aspas ""aqui"""');
  assert.equal(celulaCsv(null), '');
  const csv = montarCsv([['a', 'b'], [1, 2]]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv.split('\r\n')[1], '1;2');
});

test('nome do arquivo é ordenável e sem caractere inválido', () => {
  assert.equal(nomeArquivoExport('painel', '2026-08-01', '2026-08-18'), 'painel_2026-08-01_a_2026-08-18');
  assert.equal(nomeArquivoExport('painel', '2026-08-18', '2026-08-18'), 'painel_2026-08-18');
});
