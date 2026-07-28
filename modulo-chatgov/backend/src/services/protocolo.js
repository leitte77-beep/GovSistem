import db from '../db.js';

export async function gerarNumeroProtocolo(tenantId) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');

  const row = await db.one(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '^\\d+-\\d+-', ''), '')::int), 0) + 1 AS seq
     FROM protocolos
     WHERE tenant_id = $1 AND numero LIKE $2`,
    [tenantId, `${ano}-${mes}-%`]
  );

  const seq = String(row.seq).padStart(6, '0');
  return `${ano}-${mes}-${seq}`;
}

export async function gerarProtocolo(tenantId, conversaId, contatoId, departamentoId, operadorId, assunto) {
  const numero = await gerarNumeroProtocolo(tenantId);

  const proto = await db.one(
    `INSERT INTO protocolos (tenant_id, numero, conversa_id, contato_id, departamento_id, operador_id, assunto, status, prioridade)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'aberto', 'normal')
     RETURNING *`,
    [tenantId, numero, conversaId, contatoId, departamentoId || null, operadorId || null, assunto || 'Atendimento geral']
  );

  await db.none(
    `INSERT INTO andamentos_protocolo (tenant_id, protocolo_id, status, descricao, operador_id)
     VALUES ($1, $2, 'aberto', 'Protocolo aberto — atendimento iniciado', $3)`,
    [tenantId, proto.id, operadorId || null]
  );

  if (conversaId) {
    await db.none('UPDATE conversas SET protocolo_id = $1 WHERE id = $2 AND tenant_id = $3', [
      proto.id,
      conversaId,
      tenantId,
    ]);
  }

  return proto;
}

export async function atualizarStatusProtocolo(protocoloId, tenantId, status, descricao, operadorId) {
  const proto = await db.oneOrNone(
    `UPDATE protocolos SET status = $1, atualizado_em = now(),
       fechado_em = CASE WHEN $1 IN ('encerrado','concluido','cancelado') THEN now() ELSE fechado_em END
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [status, protocoloId, tenantId]
  );

  if (!proto) throw new Error('Protocolo não encontrado');

  await db.none(
    `INSERT INTO andamentos_protocolo (tenant_id, protocolo_id, status, descricao, operador_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, protocoloId, status, descricao, operadorId || null]
  );

  return proto;
}

export async function consultarProtocolo(tenantId, numero) {
  const proto = await db.oneOrNone(
    `SELECT p.*, c.nome AS contato_nome, c.telefone AS contato_telefone,
            d.nome AS departamento_nome, o.nome AS operador_nome
     FROM protocolos p
     LEFT JOIN contatos c ON c.id = p.contato_id
     LEFT JOIN departamentos d ON d.id = p.departamento_id
     LEFT JOIN operadores o ON o.id = p.operador_id
     WHERE p.tenant_id = $1 AND p.numero = $2`,
    [tenantId, numero]
  );

  if (!proto) return null;

  const andamentos = await db.manyOrNone(
    `SELECT a.*, o.nome AS operador_nome
     FROM andamentos_protocolo a
     LEFT JOIN operadores o ON o.id = a.operador_id
     WHERE a.protocolo_id = $1
     ORDER BY a.criado_em DESC`,
    [proto.id]
  );

  return { ...proto, andamentos };
}

export async function encerrarProtocolo(protocoloId, tenantId, descricao, operadorId) {
  return atualizarStatusProtocolo(protocoloId, tenantId, 'encerrado', descricao || 'Atendimento encerrado', operadorId);
}

export async function getOuGerarProtocolo(tenantId, conversaId, contatoId) {
  const existente = await db.oneOrNone(
    'SELECT * FROM protocolos WHERE conversa_id = $1 AND tenant_id = $2',
    [conversaId, tenantId]
  );
  if (existente) return existente;

  const conversa = await db.oneOrNone('SELECT * FROM conversas WHERE id = $1 AND tenant_id = $2', [
    conversaId,
    tenantId,
  ]);

  return gerarProtocolo(
    tenantId,
    conversaId,
    contatoId,
    conversa?.departamento_id || null,
    conversa?.operador_id || null,
    null
  );
}
