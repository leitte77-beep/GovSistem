import db from '../db.js';

async function gerarNumeroProtocoloNoContexto(conn, tenantId) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');

  const row = await conn.one(
    `INSERT INTO protocolo_sequencias (tenant_id, ano, mes, ultimo_numero)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (tenant_id, ano, mes)
     DO UPDATE SET ultimo_numero = protocolo_sequencias.ultimo_numero + 1
     RETURNING ultimo_numero AS seq`,
    [tenantId, ano, Number(mes)]
  );

  const seq = String(row.seq).padStart(6, '0');
  return `${ano}-${mes}-${seq}`;
}

export async function gerarNumeroProtocolo(tenantId) {
  return db.tx((t) => gerarNumeroProtocoloNoContexto(t, tenantId));
}

async function criarProtocoloNoContexto(t, tenantId, conversaId, contatoId, departamentoId, operadorId, assunto) {
  const numero = await gerarNumeroProtocoloNoContexto(t, tenantId);
  const proto = await t.one(
       `INSERT INTO protocolos
         (tenant_id, numero, conversa_id, contato_id, departamento_id, operador_id,
          assunto, status, status_operacional, prioridade, origem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'aberto', 'ABERTO', 'normal', 'whatsapp')
       RETURNING *`,
      [tenantId, numero, conversaId, contatoId, departamentoId || null, operadorId || null, assunto || 'Atendimento geral']
    );
  await t.none(
      `INSERT INTO andamentos_protocolo (tenant_id, protocolo_id, status, descricao, operador_id)
       VALUES ($1, $2, 'aberto', 'Protocolo aberto — atendimento iniciado', $3)`,
      [tenantId, proto.id, operadorId || null]
    );
  if (conversaId) {
    await t.none('UPDATE conversas SET protocolo_id = $1 WHERE id = $2 AND tenant_id = $3', [
      proto.id, conversaId, tenantId,
    ]);
  }
  return proto;
}

async function protocoloDaConversaNoContexto(t, tenantId, conversaId) {
  const conversa = await t.oneOrNone(
    `SELECT * FROM conversas
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     FOR UPDATE`,
    [conversaId, tenantId]
  );
  if (!conversa) return { conversa: null, protocolo: null };

  const protocolo = await t.oneOrNone(
    `SELECT * FROM protocolos
     WHERE conversa_id = $1 AND tenant_id = $2
     ORDER BY (id = $3) DESC, aberto_em ASC
     LIMIT 1`,
    [conversaId, tenantId, conversa.protocolo_id]
  );
  if (protocolo && conversa.protocolo_id !== protocolo.id) {
    await t.none(
      'UPDATE conversas SET protocolo_id = $1 WHERE id = $2 AND tenant_id = $3',
      [protocolo.id, conversaId, tenantId]
    );
  }
  return { conversa, protocolo };
}

export async function gerarProtocolo(tenantId, conversaId, contatoId, departamentoId, operadorId, assunto) {
  return db.tx(async (t) => {
    if (conversaId) {
      const existente = await protocoloDaConversaNoContexto(t, tenantId, conversaId);
      if (!existente.conversa) throw new Error('Conversa não encontrada');
      if (existente.protocolo) return existente.protocolo;
    }
    return criarProtocoloNoContexto(
      t, tenantId, conversaId, contatoId, departamentoId, operadorId, assunto
    );
  });
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
  return db.tx(async (t) => {
    const existente = await protocoloDaConversaNoContexto(t, tenantId, conversaId);
    if (!existente.conversa) throw new Error('Conversa não encontrada');
    if (existente.protocolo) return existente.protocolo;

    return criarProtocoloNoContexto(
      t,
      tenantId,
      conversaId,
      contatoId,
      existente.conversa.departamento_id || null,
      existente.conversa.operador_id || null,
      null
    );
  });
}
