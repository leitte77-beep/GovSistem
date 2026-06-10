import db from '../db.js';

export async function listarArtigos(tenantId, categoria) {
  let query = `SELECT a.*, o.nome as autor_nome FROM artigos_wiki a
     LEFT JOIN operadores o ON o.id = a.autor_id
     WHERE a.tenant_id = $1`;
  const params = [tenantId];
  if (categoria) { params.push(categoria); query += ` AND a.categoria = $${params.length}`; }
  query += ' ORDER BY a.atualizado_em DESC LIMIT 200';
  return db.manyOrNone(query, params);
}

export async function getArtigo(tenantId, artigoId) {
  return db.oneOrNone(
    `SELECT a.*, o.nome as autor_nome FROM artigos_wiki a
     LEFT JOIN operadores o ON o.id = a.autor_id WHERE a.id = $1 AND a.tenant_id = $2`,
    [artigoId, tenantId]
  );
}

export async function criarArtigo(tenantId, operadorId, dados) {
  const artigo = await db.one(
    `INSERT INTO artigos_wiki (tenant_id, titulo, conteudo, categoria, autor_id, publico, leitura_obrigatoria)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [tenantId, dados.titulo, dados.conteudo || '', dados.categoria || 'Geral', operadorId,
     dados.publico !== false, dados.leitura_obrigatoria || false]
  );
  await db.none(
    `INSERT INTO artigos_wiki_versoes (artigo_id, titulo, conteudo, autor_id)
     VALUES ($1, $2, $3, $4)`,
    [artigo.id, artigo.titulo, artigo.conteudo, operadorId]
  );
  return artigo;
}

export async function atualizarArtigo(tenantId, artigoId, operadorId, dados) {
  const artigo = await db.oneOrNone(
    `UPDATE artigos_wiki SET titulo = COALESCE($1, titulo), conteudo = COALESCE($2, conteudo),
            categoria = COALESCE($3, categoria), publico = COALESCE($4, publico),
            leitura_obrigatoria = COALESCE($5, leitura_obrigatoria), atualizado_em = now()
     WHERE id = $6 AND tenant_id = $7 RETURNING *`,
    [dados.titulo || null, dados.conteudo || null, dados.categoria || null,
     dados.publico ?? null, dados.leitura_obrigatoria ?? null, artigoId, tenantId]
  );
  if (artigo && dados.conteudo) {
    await db.none(
      `INSERT INTO artigos_wiki_versoes (artigo_id, titulo, conteudo, autor_id)
       VALUES ($1, $2, $3, $4)`,
      [artigo.id, artigo.titulo, artigo.conteudo, operadorId]
    );
  }
  return artigo;
}

export async function getVersoesArtigo(tenantId, artigoId) {
  return db.manyOrNone(
    `SELECT v.*, o.nome as autor_nome FROM artigos_wiki_versoes v
     LEFT JOIN operadores o ON o.id = v.autor_id
     WHERE v.artigo_id = $1 ORDER BY v.criado_em DESC`,
    [artigoId]
  );
}

export async function getCategoriasWiki(tenantId) {
  return db.manyOrNone(
    `SELECT categoria, COUNT(*)::int as total FROM artigos_wiki
     WHERE tenant_id = $1 GROUP BY categoria ORDER BY categoria`,
    [tenantId]
  );
}
