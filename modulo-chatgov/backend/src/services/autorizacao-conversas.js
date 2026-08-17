function ehGestor(op) {
  return op?.papel === 'admin' || op?.papel === 'supervisor';
}

/** Mesma regra de compartimentação usada para leitura e transição. */
export async function podeAcessarConversa(conn, op, conversaId) {
  if (!op?.tenantId || !op?.id) return false;
  if (ehGestor(op)) {
    const row = await conn.oneOrNone(
      'SELECT 1 FROM conversas WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [conversaId, op.tenantId]
    );
    return !!row;
  }

  const row = await conn.oneOrNone(
    `SELECT 1 FROM conversas c
     WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL AND (
       EXISTS (
         SELECT 1 FROM conversa_participantes p
         WHERE p.conversa_id = c.id AND p.operador_id = $3 AND p.tenant_id = $2
       )
       OR (c.status = 'fila' AND (
         c.departamento_id IS NULL
         OR EXISTS (
           SELECT 1 FROM operador_departamentos od
           JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
           WHERE od.operador_id = $3 AND od.departamento_id = c.departamento_id
         )
         OR (
           EXISTS (
             SELECT 1 FROM departamentos dd
             WHERE dd.id = c.departamento_id AND LOWER(dd.nome) = 'recepcao' AND dd.ativo = true
           )
           AND EXISTS (
             SELECT 1 FROM operador_departamentos od
             JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
             WHERE od.operador_id = $3 AND LOWER(d.nome) = 'recepcao'
           )
         )
       ))
     )`,
    [conversaId, op.tenantId, op.id]
  );
  return !!row;
}
