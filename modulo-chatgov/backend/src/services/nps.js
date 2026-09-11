import db from '../db.js';

export async function registrarRespostaNPS(tenantId, protocoloId, conversaId, nota, comentario, departamentoId, operadorId) {
  const row = await db.oneOrNone(
    'SELECT * FROM pesquisas_nps WHERE protocolo_id = $1 AND tenant_id = $2 AND respondida_em IS NULL',
    [protocoloId, tenantId]
  );

  if (row) {
    return db.one(
      `UPDATE pesquisas_nps
       SET nota = $1, comentario = $2, respondida_em = now()
       WHERE id = $3
       RETURNING *`,
      [nota, comentario || null, row.id]
    );
  }

  return db.one(
    `INSERT INTO pesquisas_nps (tenant_id, protocolo_id, conversa_id, departamento_id, operador_id, nota, comentario, respondida_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     RETURNING *`,
    [tenantId, protocoloId, conversaId, departamentoId || null, operadorId || null, nota, comentario || null]
  );
}

export async function criarPesquisaNPS(tenantId, protocoloId, conversaId, departamentoId, operadorId) {
  return db.one(
    `INSERT INTO pesquisas_nps (tenant_id, protocolo_id, conversa_id, departamento_id, operador_id, nota, enviada_em)
     VALUES ($1, $2, $3, $4, $5, 0, now())
     RETURNING *`,
    [tenantId, protocoloId, conversaId, departamentoId || null, operadorId || null]
  );
}

// Filtros comuns (operador/status/canal) sobre pesquisas_nps p. Status e canal
// olham a conversa dona da pesquisa (alias c), por isso a query precisa do
// LEFT JOIN conversas c ON c.id = p.conversa_id.
function filtrosNps(filtros, params) {
  const { departamentoId, operadorId, status, canal } = filtros || {};
  let sql = '';
  if (departamentoId) { params.push(departamentoId); sql += ` AND p.departamento_id = $${params.length}::uuid`; }
  if (operadorId) { params.push(operadorId); sql += ` AND p.operador_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND c.status = $${params.length}`; }
  if (canal === 'chatbot') sql += ' AND c.operador_id IS NULL';
  else if (canal === 'interno') sql += ' AND FALSE';
  return sql;
}

export async function calcularNPS(tenantId, dataInicio, dataFim, filtros = {}) {
  const params = [tenantId];
  let where = 'p.tenant_id = $1';
  if (dataInicio) { params.push(dataInicio); where += ` AND p.enviada_em >= $${params.length}`; }
  if (dataFim) { params.push(dataFim); where += ` AND p.enviada_em <= $${params.length}`; }
  where += filtrosNps(filtros, params);

  const row = await db.one(
    // Promotores/neutros/detratores só contam respostas de fato (respondida_em),
    // senão as pesquisas ainda sem nota (nota 0) entravam como detratores.
    `SELECT
       COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL AND p.nota BETWEEN 9 AND 10) AS promotores,
       COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL AND p.nota BETWEEN 7 AND 8)  AS neutros,
       COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL AND p.nota BETWEEN 0 AND 6)  AS detratores,
       COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL) AS total_respondidos,
       COUNT(*) AS total_enviados
     FROM pesquisas_nps p
     LEFT JOIN conversas c ON c.id = p.conversa_id
     WHERE ${where}`,
    params
  );

  const total = parseInt(row.total_respondidos) || 0;
  const promotores = parseInt(row.promotores) || 0;
  const detratores = parseInt(row.detratores) || 0;

  const nps = total > 0 ? ((promotores - detratores) / total) * 100 : 0;

  return {
    nps: Math.round(nps * 100) / 100,
    promotores,
    neutros: parseInt(row.neutros) || 0,
    detratores,
    total_respondidos: total,
    total_enviados: parseInt(row.total_enviados) || 0,
  };
}

export async function npsPorSetor(tenantId, dataInicio, dataFim, filtros = {}) {
  const params = [tenantId];
  let where = 'p.tenant_id = $1 AND p.respondida_em IS NOT NULL';
  if (dataInicio) { params.push(dataInicio); where += ` AND p.enviada_em >= $${params.length}`; }
  if (dataFim) { params.push(dataFim); where += ` AND p.enviada_em <= $${params.length}`; }
  where += filtrosNps(filtros, params);

  const rows = await db.manyOrNone(
    `SELECT
       d.id AS departamento_id,
       d.nome AS departamento_nome,
       COUNT(*) FILTER (WHERE p.nota BETWEEN 9 AND 10) AS promotores,
       COUNT(*) FILTER (WHERE p.nota BETWEEN 7 AND 8)  AS neutros,
       COUNT(*) FILTER (WHERE p.nota BETWEEN 0 AND 6)  AS detratores,
       COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL) AS total
     FROM pesquisas_nps p
     JOIN departamentos d ON d.id = p.departamento_id
     LEFT JOIN conversas c ON c.id = p.conversa_id
     WHERE ${where}
     GROUP BY d.id, d.nome ORDER BY total DESC`,
    params
  );

  return rows.map((r) => {
    const t = parseInt(r.total) || 1;
    return {
      departamento_id: r.departamento_id,
      departamento_nome: r.departamento_nome,
      nps: Math.round((((parseInt(r.promotores) || 0) - (parseInt(r.detratores) || 0)) / t) * 100),
      promotores: parseInt(r.promotores) || 0,
      neutros: parseInt(r.neutros) || 0,
      detratores: parseInt(r.detratores) || 0,
      total: t,
    };
  });
}

export async function npsPorAtendente(tenantId, dataInicio, dataFim, filtros = {}) {
  const params = [tenantId];
  let where = 'p.tenant_id = $1 AND p.respondida_em IS NOT NULL';
  if (dataInicio) { params.push(dataInicio); where += ` AND p.enviada_em >= $${params.length}`; }
  if (dataFim) { params.push(dataFim); where += ` AND p.enviada_em <= $${params.length}`; }
  where += filtrosNps(filtros, params);

  const rows = await db.manyOrNone(
    `SELECT
       o.id AS operador_id,
       o.nome AS operador_nome,
       COUNT(*) FILTER (WHERE p.nota BETWEEN 9 AND 10) AS promotores,
       COUNT(*) FILTER (WHERE p.nota BETWEEN 7 AND 8)  AS neutros,
       COUNT(*) FILTER (WHERE p.nota BETWEEN 0 AND 6)  AS detratores,
       COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL) AS total
     FROM pesquisas_nps p
     JOIN operadores o ON o.id = p.operador_id
     LEFT JOIN conversas c ON c.id = p.conversa_id
     WHERE ${where}
     GROUP BY o.id, o.nome ORDER BY total DESC`,
    params
  );

  return rows.map((r) => {
    const t = parseInt(r.total) || 1;
    return {
      operador_id: r.operador_id,
      operador_nome: r.operador_nome,
      nps: Math.round((((parseInt(r.promotores) || 0) - (parseInt(r.detratores) || 0)) / t) * 100),
      promotores: parseInt(r.promotores) || 0,
      neutros: parseInt(r.neutros) || 0,
      detratores: parseInt(r.detratores) || 0,
      total: t,
    };
  });
}
