import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pgPromise from 'pg-promise';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
const databaseName = (() => {
  try {
    return new URL(databaseUrl).pathname.slice(1);
  } catch {
    return '';
  }
})();
const bancoSeguro = /(?:^|_)(?:test|dev)(?:_|$)/i.test(databaseName);

let db;
let pgp;
let obterOuCriarConversaAtiva;
let obterConversaParaSaidaSincronizada;
let tenantId;
let contatoId;
let departamentoId;
let operadorId;

before(async () => {
  if (!bancoSeguro) return;

  ({
    obterConversaParaSaidaSincronizada,
    obterOuCriarConversaAtiva,
  } = await import('../src/services/conversas.js'));
  pgp = pgPromise();
  db = pgp(databaseUrl);

  const sufixo = `${process.pid}-${Date.now()}`;
  const tenant = await db.one(
    `INSERT INTO tenants (nome, slug)
     VALUES ($1, $2)
     RETURNING id`,
    ['Teste ciclo de atendimento', `teste-ciclo-${sufixo}`]
  );
  tenantId = tenant.id;

  const contato = await db.one(
    `INSERT INTO contatos (tenant_id, wa_jid, nome, telefone)
     VALUES ($1, $2, 'Cidadão teste', $3)
     RETURNING id`,
    [tenantId, `${sufixo}@s.whatsapp.net`, sufixo]
  );
  contatoId = contato.id;

  const departamento = await db.one(
    `INSERT INTO departamentos (tenant_id, nome)
     VALUES ($1, 'Setor antigo') RETURNING id`,
    [tenantId]
  );
  departamentoId = departamento.id;
  const operador = await db.one(
    `INSERT INTO operadores (tenant_id, nome, email, senha_hash, papel)
     VALUES ($1, 'Atendente antigo', $2, 'teste', 'operador') RETURNING id`,
    [tenantId, `atendente-${sufixo}@teste.local`]
  );
  operadorId = operador.id;
  await db.none(
    `INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id)
     VALUES ($1, $2, $3)`,
    [operadorId, departamentoId, tenantId]
  );
});

after(async () => {
  if (db && tenantId) await db.none('DELETE FROM tenants WHERE id = $1', [tenantId]);
  if (pgp) pgp.end();
});

test('uma nova mensagem após RESOLVIDA ou ARQUIVADA cria outro atendimento', { skip: !bancoSeguro }, async () => {
  let atendimentoAtual = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
  await db.none(
    `UPDATE conversas SET departamento_id = $1, operador_id = $2 WHERE id = $3`,
    [departamentoId, operadorId, atendimentoAtual.id]
  );
  await db.none(
    `INSERT INTO conversa_participantes
       (conversa_id, operador_id, tenant_id, papel, adicionado_por)
     VALUES ($1, $2, $3, 'dono', $2)`,
    [atendimentoAtual.id, operadorId, tenantId]
  );
  const { getOuGerarProtocolo } = await import('../src/services/protocolo.js');
  const protocoloAntigo = await getOuGerarProtocolo(tenantId, atendimentoAtual.id, contatoId);
  const mensagemAntiga = await db.one(
    `INSERT INTO mensagens (tenant_id, conversa_id, direcao, conteudo)
     VALUES ($1, $2, 'entrada', 'assunto anterior')
     RETURNING id`,
    [tenantId, atendimentoAtual.id]
  );

  for (const [status, statusOperacional] of [
    ['resolvida', 'RESOLVIDA'],
    ['arquivada', 'ARQUIVADA'],
  ]) {
    await db.none(
      `UPDATE conversas
          SET status = $2, status_operacional = $3
        WHERE id = $1`,
      [atendimentoAtual.id, status, statusOperacional]
    );

    const novo = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
    assert.notEqual(novo.id, atendimentoAtual.id, `${statusOperacional} não pode reutilizar o ID encerrado`);
    assert.equal(novo.departamento_id, null);
    assert.equal(novo.operador_id, null);
    assert.equal(novo.protocolo_id, null);

    const mensagensDoNovoCiclo = await db.manyOrNone(
      'SELECT id FROM mensagens WHERE tenant_id = $1 AND conversa_id = $2',
      [tenantId, novo.id]
    );
    assert.deepEqual(mensagensDoNovoCiclo, []);
    const participantesNovos = await db.one(
      'SELECT count(*)::int AS total FROM conversa_participantes WHERE conversa_id = $1',
      [novo.id]
    );
    assert.equal(participantesNovos.total, 0);
    atendimentoAtual = novo;
  }

  const antigaPreservada = await db.oneOrNone(
    'SELECT id FROM mensagens WHERE tenant_id = $1 AND id = $2',
    [tenantId, mensagemAntiga.id]
  );
  assert.equal(antigaPreservada.id, mensagemAntiga.id);
  const protocoloPreservado = await db.oneOrNone(
    'SELECT id FROM protocolos WHERE tenant_id = $1 AND id = $2',
    [tenantId, protocoloAntigo.id]
  );
  assert.equal(protocoloPreservado.id, protocoloAntigo.id);
});

test('mensagens subsequentes reutilizam o atendimento enquanto ele está ativo', { skip: !bancoSeguro }, async () => {
  const primeira = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
  const seguinte = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });

  assert.equal(seguinte.id, primeira.id);
});

test('mensagens concorrentes resultam em uma única conversa ativa', { skip: !bancoSeguro }, async () => {
  await db.none(
    `UPDATE conversas
        SET status = 'resolvida', status_operacional = 'RESOLVIDA'
      WHERE tenant_id = $1 AND contato_id = $2
        AND status NOT IN ('resolvida', 'arquivada')`,
    [tenantId, contatoId]
  );

  const resultados = await Promise.all(
    Array.from({ length: 8 }, () => obterOuCriarConversaAtiva(db, { tenantId, contatoId }))
  );

  assert.equal(new Set(resultados.map(({ id }) => id)).size, 1);
  const { total } = await db.one(
    `SELECT count(*)::int AS total
       FROM conversas
      WHERE tenant_id = $1 AND contato_id = $2 AND deleted_at IS NULL
        AND status NOT IN ('resolvida', 'arquivada')
        AND COALESCE(status_operacional, '') NOT IN ('RESOLVIDA', 'ARQUIVADA')`,
    [tenantId, contatoId]
  );
  assert.equal(total, 1);
});

test('migrations de conversa podem ser reaplicadas após existirem ciclos encerrados', { skip: !bancoSeguro }, async () => {
  const migrationsDir = new URL('../src/migrations/', import.meta.url);
  const migration022 = await readFile(new URL('022_conversa_excluida.sql', migrationsDir), 'utf8');
  const migration029 = await readFile(new URL('029_conversa_ciclos.sql', migrationsDir), 'utf8');

  await db.none(migration022);
  await db.none(migration029);
});

test('não reabre ciclo antigo quando o cidadão já possui outro atendimento ativo', { skip: !bancoSeguro }, async () => {
  const encerrada = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
  await db.none(
    `UPDATE conversas
        SET status = 'resolvida', status_operacional = 'RESOLVIDA'
      WHERE id = $1`,
    [encerrada.id]
  );
  await obterOuCriarConversaAtiva(db, { tenantId, contatoId });

  const { transitionConversation } = await import('../src/services/status-transitions.js');
  await assert.rejects(
    transitionConversation({
      tenantId,
      conversaId: encerrada.id,
      targetStatus: 'EM_ATENDIMENTO',
      operadorId: null,
      justificativa: 'reabrir ciclo antigo',
    }),
    /outro atendimento ativo/i
  );
});

test('geração concorrente mantém um único protocolo no novo ciclo', { skip: !bancoSeguro }, async () => {
  const conversa = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
  const { getOuGerarProtocolo } = await import('../src/services/protocolo.js');
  const protocolos = await Promise.all(
    Array.from({ length: 8 }, () => getOuGerarProtocolo(tenantId, conversa.id, contatoId))
  );

  assert.equal(new Set(protocolos.map(({ id }) => id)).size, 1);
  const contagem = await db.one(
    'SELECT count(*)::int AS total FROM protocolos WHERE tenant_id = $1 AND conversa_id = $2',
    [tenantId, conversa.id]
  );
  assert.equal(contagem.total, 1);
});

test('saída sincronizada após encerramento não abre atendimento invisível', { skip: !bancoSeguro }, async () => {
  const conversa = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
  await db.none(
    `UPDATE conversas SET status = 'resolvida', status_operacional = 'RESOLVIDA'
     WHERE id = $1`,
    [conversa.id]
  );

  const destino = await obterConversaParaSaidaSincronizada(db, {
    tenantId,
    contatoId,
    ultimaMensagem: 'enviada pelo aparelho',
  });
  assert.equal(destino.id, conversa.id);
  const ativas = await db.one(
    `SELECT count(*)::int AS total FROM conversas
     WHERE tenant_id = $1 AND contato_id = $2 AND deleted_at IS NULL
       AND status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA')`,
    [tenantId, contatoId]
  );
  assert.equal(ativas.total, 0);
});

test('atendente anterior não acessa novo ciclo atribuído a outro setor', { skip: !bancoSeguro }, async () => {
  const outroDepartamento = await db.one(
    `INSERT INTO departamentos (tenant_id, nome)
     VALUES ($1, 'Setor novo') RETURNING id`,
    [tenantId]
  );
  const outroOperador = await db.one(
    `INSERT INTO operadores (tenant_id, nome, email, senha_hash, papel)
     VALUES ($1, 'Atendente novo', $2, 'teste', 'operador') RETURNING id`,
    [tenantId, `novo-${process.pid}-${Date.now()}@teste.local`]
  );
  await db.none(
    `INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id)
     VALUES ($1, $2, $3)`,
    [outroOperador.id, outroDepartamento.id, tenantId]
  );

  const nova = await obterOuCriarConversaAtiva(db, { tenantId, contatoId });
  await db.none(
    `UPDATE conversas SET departamento_id = $1, status = 'fila', status_operacional = 'NA_FILA'
     WHERE id = $2`,
    [outroDepartamento.id, nova.id]
  );

  const { podeAcessarConversa } = await import('../src/services/autorizacao-conversas.js');
  assert.equal(await podeAcessarConversa(db, {
    id: operadorId, tenantId, papel: 'operador',
  }, nova.id), false);
  assert.equal(await podeAcessarConversa(db, {
    id: outroOperador.id, tenantId, papel: 'operador',
  }, nova.id), true);
});

test('saída antiga entregue com atraso permanece no ciclo correspondente ao timestamp', { skip: !bancoSeguro }, async () => {
  const contato = await db.one(
    `INSERT INTO contatos (tenant_id, wa_jid, nome)
     VALUES ($1, $2, 'Contato atraso') RETURNING id`,
    [tenantId, `atraso-${process.pid}-${Date.now()}@s.whatsapp.net`]
  );
  const antiga = await obterOuCriarConversaAtiva(db, { tenantId, contatoId: contato.id });
  await db.none(
    `UPDATE conversas
     SET status = 'resolvida', status_operacional = 'RESOLVIDA',
         criado_em = '2026-01-01T10:00:00Z', resolvida_em = '2026-01-01T11:00:00Z'
     WHERE id = $1`,
    [antiga.id]
  );
  const nova = await obterOuCriarConversaAtiva(db, { tenantId, contatoId: contato.id });

  const destino = await obterConversaParaSaidaSincronizada(db, {
    tenantId,
    contatoId: contato.id,
    ultimaMensagem: 'saída atrasada do assunto anterior',
    ultimaMensagemEm: new Date('2026-01-01T10:30:00Z'),
  });
  assert.equal(destino.id, antiga.id);
  assert.notEqual(destino.id, nova.id);
});

test('criação v1 e v2 concorrentes não duplicam protocolo da conversa', { skip: !bancoSeguro }, async () => {
  const contato = await db.one(
    `INSERT INTO contatos (tenant_id, wa_jid, nome)
     VALUES ($1, $2, 'Contato protocolo') RETURNING id`,
    [tenantId, `protocolo-${process.pid}-${Date.now()}@s.whatsapp.net`]
  );
  const conversa = await obterOuCriarConversaAtiva(db, { tenantId, contatoId: contato.id });
  const { getOuGerarProtocolo } = await import('../src/services/protocolo.js');
  const { criarProtocolo } = await import('../src/services/protocolo-v2.js');

  const resultados = await Promise.allSettled([
    getOuGerarProtocolo(tenantId, conversa.id, contato.id),
    criarProtocolo(tenantId, {
      conversaId: conversa.id,
      contatoId: contato.id,
      origem: 'whatsapp',
    }),
  ]);
  assert.ok(resultados.some(({ status }) => status === 'fulfilled'));
  const contagem = await db.one(
    'SELECT count(*)::int AS total FROM protocolos WHERE tenant_id = $1 AND conversa_id = $2',
    [tenantId, conversa.id]
  );
  assert.equal(contagem.total, 1);
});
