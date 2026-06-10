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

export async function calcularNPS(tenantId, dataInicio, dataFim) {
  let query = `
    SELECT
      COUNT(*) FILTER (WHERE nota BETWEEN 9 AND 10) AS promotores,
      COUNT(*) FILTER (WHERE nota BETWEEN 7 AND 8)  AS neutros,
      COUNT(*) FILTER (WHERE nota BETWEEN 0 AND 6)  AS detratores,
      COUNT(*) FILTER (WHERE respondida_em IS NOT NULL) AS total_respondidos,
      COUNT(*) AS total_enviados
    FROM pesquisas_nps
    WHERE tenant_id = $1
  `;
  const params = [tenantId];

  if (dataInicio) {
    query += ' AND enviada_em >= $2';
    params.push(dataInicio);
  }
  if (dataFim) {
    query += ' AND enviada_em <= $' + (params.length + 1);
    params.push(dataFim);
  }

  const row = await db.one(query, params);

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

export async function npsPorSetor(tenantId, dataInicio, dataFim) {
  let query = `
    SELECT
      d.id AS departamento_id,
      d.nome AS departamento_nome,
      COUNT(*) FILTER (WHERE p.nota BETWEEN 9 AND 10) AS promotores,
      COUNT(*) FILTER (WHERE p.nota BETWEEN 7 AND 8)  AS neutros,
      COUNT(*) FILTER (WHERE p.nota BETWEEN 0 AND 6)  AS detratores,
      COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL) AS total
    FROM pesquisas_nps p
    JOIN departamentos d ON d.id = p.departamento_id
    WHERE p.tenant_id = $1 AND p.respondida_em IS NOT NULL
  `;
  const params = [tenantId];

  if (dataInicio) {
    query += ' AND p.enviada_em >= $2';
    params.push(dataInicio);
  }
  if (dataFim) {
    query += ' AND p.enviada_em <= $' + (params.length + 1);
    params.push(dataFim);
  }

  query += ' GROUP BY d.id, d.nome ORDER BY total DESC';

  const rows = await db.manyOrNone(query, params);

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

export async function npsPorAtendente(tenantId, dataInicio, dataFim) {
  let query = `
    SELECT
      o.id AS operador_id,
      o.nome AS operador_nome,
      COUNT(*) FILTER (WHERE p.nota BETWEEN 9 AND 10) AS promotores,
      COUNT(*) FILTER (WHERE p.nota BETWEEN 7 AND 8)  AS neutros,
      COUNT(*) FILTER (WHERE p.nota BETWEEN 0 AND 6)  AS detratores,
      COUNT(*) FILTER (WHERE p.respondida_em IS NOT NULL) AS total
    FROM pesquisas_nps p
    JOIN operadores o ON o.id = p.operador_id
    WHERE p.tenant_id = $1 AND p.respondida_em IS NOT NULL
  `;
  const params = [tenantId];

  if (dataInicio) {
    query += ' AND p.enviada_em >= $2';
    params.push(dataInicio);
  }
  if (dataFim) {
    query += ' AND p.enviada_em <= $' + (params.length + 1);
    params.push(dataFim);
  }

  query += ' GROUP BY o.id, o.nome ORDER BY total DESC';

  const rows = await db.manyOrNone(query, params);

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
