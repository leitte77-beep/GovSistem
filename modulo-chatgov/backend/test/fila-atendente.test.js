import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_ATENDIMENTOS_ATENDENTE,
  decidirRoteamentoAtendente,
  calcularPosicaoFilaAtendente,
  mensagemEntradaFilaAtendente,
  mensagemAtualizacaoFilaAtendente,
  mensagemAtendimentoIniciado,
  planejarPromocaoFilaAtendente,
  promoverFilaAtendente,
  solicitarAtendente,
} from '../src/services/filaAtendente.js';

function bancoFalso({ ativos = 0, anterior = null, pessoasAntes = 0, totalFila = 0, aguardando = [], atendenteExiste = true } = {}) {
  const comandos = [];
  const atendente = {
    id: 'op-1', nome: 'Alisson', online: true,
    departamento_id: 'dep-1', atendimentos_ativos: ativos,
  };
  const tx = {
    comandos,
    tx: async (fn) => fn(tx),
    none: async (sql, params) => { comandos.push({ sql, params }); },
    oneOrNone: async (sql, params) => {
      comandos.push({ sql, params });
      if (sql.includes('FROM operadores o')) return atendenteExiste ? atendente : null;
      if (sql.includes('SELECT operador_solicitado_id')) return anterior || {
        operador_solicitado_id: null, fila_operador_posicao_notificada: null,
      };
      if (sql.includes('UPDATE conversas SET operador_id')) return { id: 'conv-1' };
      return null;
    },
    one: async (sql) => {
      if (sql.includes('pg_advisory_xact_lock')) return { bloqueado: null };
      if (sql.includes('pessoas_antes')) return { pessoas_antes: pessoasAntes };
      if (sql.includes('COUNT(*)::int AS total')) return { total: totalFila };
      throw new Error(`Consulta não prevista: ${sql}`);
    },
    manyOrNone: async () => aguardando,
  };
  return tx;
}

test('atribui diretamente quando o atendente tem menos de cinco atendimentos', () => {
  assert.equal(LIMITE_ATENDIMENTOS_ATENDENTE, 5);
  assert.equal(decidirRoteamentoAtendente({ online: true, atendimentosAtivos: 4 }), 'direto');
});

test('coloca na fila pessoal quando o atendente já tem cinco atendimentos', () => {
  assert.equal(decidirRoteamentoAtendente({ online: true, atendimentosAtivos: 5 }), 'fila');
  assert.equal(calcularPosicaoFilaAtendente({ atendimentosAtivos: 5, pessoasAntes: 0 }), 6);
  assert.match(
    mensagemEntradaFilaAtendente({ atendenteNome: 'Alisson', posicao: 6 }),
    /Alisson.*número 6/i,
  );
});

test('não promete transferência para atendente offline', () => {
  assert.equal(decidirRoteamentoAtendente({ online: false, atendimentosAtivos: 0 }), 'indisponivel');
});

test('só cria atualização ao cidadão quando a posição realmente diminui', () => {
  assert.equal(mensagemAtualizacaoFilaAtendente({ atendenteNome: 'Alisson', posicaoAnterior: 6, posicao: 6 }), null);
  assert.match(
    mensagemAtualizacaoFilaAtendente({ atendenteNome: 'Alisson', posicaoAnterior: 7, posicao: 6 }),
    /agora.*número 6/i,
  );
});

test('ao abrir uma vaga promove o primeiro e recalcula os demais', () => {
  const plano = planejarPromocaoFilaAtendente({
    atendimentosAtivos: 4,
    aguardando: [
      { conversaId: 'c1', posicaoNotificada: 6 },
      { conversaId: 'c2', posicaoNotificada: 7 },
    ],
  });

  assert.deepEqual(plano.promover.map((item) => item.conversaId), ['c1']);
  assert.deepEqual(plano.atualizarPosicoes, [
    { conversaId: 'c2', posicaoAnterior: 7, posicao: 6 },
  ]);
  assert.equal(plano.totalAguardando, 1);
});

test('pedido apenas por setor não gera informação de fila pessoal', () => {
  assert.equal(mensagemEntradaFilaAtendente({ atendenteNome: null, posicao: 1 }), null);
  assert.equal(mensagemAtualizacaoFilaAtendente({ atendenteNome: null, posicaoAnterior: 2, posicao: 1 }), null);
  assert.match(mensagemAtendimentoIniciado('Alisson'), /Sua vez chegou.*Alisson/i);
  assert.deepEqual(planejarPromocaoFilaAtendente({ atendimentosAtivos: 5 }), {
    promover: [], atualizarPosicoes: [], totalAguardando: 0,
  });
});

test('serviço atribui e registra o dono quando existe vaga', async () => {
  const conn = bancoFalso({ ativos: 4, totalFila: 0 });
  const resultado = await solicitarAtendente(conn, {
    tenantId: 'tenant-1', conversaId: 'conv-1', operadorId: 'op-1',
  });

  assert.equal(resultado.tipo, 'direto');
  assert.ok(conn.comandos.some(({ sql }) => sql.includes("status_operacional = 'EM_ATENDIMENTO'")));
  assert.ok(conn.comandos.some(({ sql }) => sql.includes('INSERT INTO conversa_participantes')));
});

test('serviço enfileira no atendente, calcula posição seis e evita repetição', async () => {
  const primeira = bancoFalso({ ativos: 5, pessoasAntes: 0, totalFila: 1 });
  const entrada = await solicitarAtendente(primeira, {
    tenantId: 'tenant-1', conversaId: 'conv-1', operadorId: 'op-1',
  });
  assert.equal(entrada.tipo, 'fila');
  assert.equal(entrada.posicao, 6);
  assert.equal(entrada.deveNotificarCidadao, true);

  const repetida = bancoFalso({
    ativos: 5, pessoasAntes: 0, totalFila: 1,
    anterior: { operador_solicitado_id: 'op-1', fila_operador_posicao_notificada: 6 },
  });
  const semMudanca = await solicitarAtendente(repetida, {
    tenantId: 'tenant-1', conversaId: 'conv-1', operadorId: 'op-1',
  });
  assert.equal(semMudanca.deveNotificarCidadao, false);
});

test('serviço promove o primeiro registro e persiste a nova posição do restante', async () => {
  const conn = bancoFalso({
    ativos: 4,
    aguardando: [
      { conversa_id: 'c1', fila_operador_posicao_notificada: 6, wa_jid: '1@s.whatsapp.net' },
      { conversa_id: 'c2', fila_operador_posicao_notificada: 7, wa_jid: '2@s.whatsapp.net' },
    ],
  });
  const resultado = await promoverFilaAtendente(conn, { tenantId: 'tenant-1', operadorId: 'op-1' });

  assert.deepEqual(resultado.promovidas.map(({ conversaId }) => conversaId), ['c1']);
  assert.deepEqual(resultado.posicoesAlteradas.map(({ conversaId, posicao }) => ({ conversaId, posicao })), [
    { conversaId: 'c2', posicao: 6 },
  ]);
  assert.ok(conn.comandos.some(({ sql }) => sql.includes('fila_operador_posicao_notificada = $1')));
});

test('serviços tratam atendente inexistente sem atribuir conversa', async () => {
  const solicitacao = await solicitarAtendente(bancoFalso({ atendenteExiste: false }), {
    tenantId: 'tenant-1', conversaId: 'conv-1', operadorId: 'op-inexistente',
  });
  assert.equal(solicitacao.tipo, 'indisponivel');

  const promocao = await promoverFilaAtendente(bancoFalso({ atendenteExiste: false }), {
    tenantId: 'tenant-1', operadorId: 'op-inexistente',
  });
  assert.deepEqual(promocao, {
    atendente: null, promovidas: [], posicoesAlteradas: [], totalAguardando: 0,
  });
});
