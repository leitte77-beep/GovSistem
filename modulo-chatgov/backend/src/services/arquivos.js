import db from '../db.js';
import crypto from 'crypto';
import { createStorage } from '../storage/index.js';

export async function uploadArquivo(tenantId, operadorId, buffer, nomeOriginal, tipoMime, conversaId, pastaId, canalId, tarefaId) {
  const storage = createStorage();
  const nomeStorage = await storage.salvar(buffer, tipoMime, tenantId);
  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  const tamanho = buffer.length;

  const tipo = classificarTipo(tipoMime);

  const duplicado = await db.oneOrNone(
    'SELECT a.*, o.nome as enviado_por_nome FROM arquivos a LEFT JOIN operadores o ON o.id = a.enviado_por WHERE a.tenant_id = $1 AND a.hash_md5 = $2 AND a.excluido_em IS NULL',
    [tenantId, hash]
  );

  const arquivo = await db.one(
    `INSERT INTO arquivos (tenant_id, nome_original, nome_storage, tamanho, tipo_mime, tipo,
                           enviado_por, conversa_id, tarefa_id, pasta_id, canal_id, hash_md5)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [tenantId, nomeOriginal, nomeStorage, tamanho, tipoMime, tipo, operadorId,
     conversaId || null, tarefaId || null, pastaId || null, canalId || null, hash]
  );

  // URL pública do arquivo (servida estaticamente em /media ou via S3).
  const url = nomeStorage;
  return { arquivo, duplicado: duplicado || null, url };
}

export async function getArquivo(tenantId, arquivoId) {
  return db.oneOrNone(
    'SELECT a.*, o.nome as enviado_por_nome FROM arquivos a LEFT JOIN operadores o ON o.id = a.enviado_por WHERE a.id = $1 AND a.tenant_id = $2 AND a.excluido_em IS NULL',
    [arquivoId, tenantId]
  );
}

export async function getArquivosConversa(tenantId, conversaId, filtros = {}) {
  let query = `SELECT a.*, o.nome as enviado_por_nome FROM arquivos a
     LEFT JOIN operadores o ON o.id = a.enviado_por
     WHERE a.tenant_id = $1 AND a.conversa_id = $2 AND a.excluido_em IS NULL`;
  const params = [tenantId, conversaId];
  if (filtros.tipo) { params.push(filtros.tipo); query += ` AND a.tipo = $${params.length}`; }
  query += ' ORDER BY a.enviado_em DESC LIMIT 200';
  return db.manyOrNone(query, params);
}

export async function getArquivosPasta(tenantId, pastaId) {
  return db.manyOrNone(
    `SELECT a.*, o.nome as enviado_por_nome FROM arquivos a
     LEFT JOIN operadores o ON o.id = a.enviado_por
     WHERE a.tenant_id = $1 AND a.pasta_id = $2 AND a.excluido_em IS NULL
     ORDER BY a.enviado_em DESC`,
    [tenantId, pastaId]
  );
}

export async function excluirArquivo(tenantId, arquivoId) {
  return db.none(
    'UPDATE arquivos SET excluido_em = now() WHERE id = $1 AND tenant_id = $2',
    [arquivoId, tenantId]
  );
}

export async function listarPastas(tenantId, setorId) {
  let query = `SELECT p.*, o.nome as criada_por_nome,
     (SELECT COUNT(*)::int FROM arquivos a WHERE a.pasta_id = p.id AND a.excluido_em IS NULL) as total_arquivos
     FROM pastas p LEFT JOIN operadores o ON o.id = p.criada_por
     WHERE p.tenant_id = $1 AND p.pasta_pai_id IS NULL`;
  const params = [tenantId];
  if (setorId) { params.push(setorId); query += ` AND p.setor_id = $${params.length}`; }
  query += ' ORDER BY p.nome';
  return db.manyOrNone(query, params);
}

export async function criarPasta(tenantId, operadorId, dados) {
  return db.one(
    `INSERT INTO pastas (tenant_id, nome, setor_id, pasta_pai_id, criada_por, publica)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tenantId, dados.nome, dados.setor_id || null, dados.pasta_pai_id || null, operadorId, dados.publica !== false]
  );
}

export async function buscarArquivos(tenantId, termo) {
  return db.manyOrNone(
    `SELECT a.*, o.nome as enviado_por_nome FROM arquivos a
     LEFT JOIN operadores o ON o.id = a.enviado_por
     WHERE a.tenant_id = $1 AND a.excluido_em IS NULL AND a.nome_original ILIKE $2
     ORDER BY a.enviado_em DESC LIMIT 50`,
    [tenantId, `%${termo}%`]
  );
}

export async function downloadArquivo(tenantId, arquivoId) {
  const arquivo = await getArquivo(tenantId, arquivoId);
  if (!arquivo) return null;
  const storage = createStorage();
  const buffer = await storage.obter(arquivo.nome_storage, tenantId);
  return { arquivo, buffer };
}

export async function novaVersaoArquivo(tenantId, arquivoId, operadorId, buffer, nomeOriginal, tipoMime) {
  const anterior = await getArquivo(tenantId, arquivoId);
  if (!anterior) return null;
  const storage = createStorage();
  const nomeStorage = await storage.salvar(buffer, tipoMime, tenantId);
  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  return db.one(
    `INSERT INTO arquivos (tenant_id, nome_original, nome_storage, tamanho, tipo_mime, tipo,
                           enviado_por, conversa_id, tarefa_id, pasta_id, canal_id, hash_md5,
                           versao_de, numero_versao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [tenantId, nomeOriginal, nomeStorage, buffer.length, tipoMime, classificarTipo(tipoMime),
     operadorId, anterior.conversa_id, anterior.tarefa_id, anterior.pasta_id, anterior.canal_id, hash,
     anterior.versao_de || anterior.id, (anterior.numero_versao || 1) + 1]
  );
}

export async function getVersoesArquivo(tenantId, arquivoId) {
  return db.manyOrNone(
    `SELECT a.*, o.nome as enviado_por_nome FROM arquivos a
     LEFT JOIN operadores o ON o.id = a.enviado_por
     WHERE a.tenant_id = $1 AND a.excluido_em IS NULL
       AND (a.id = $2 OR a.versao_de = $2)
     ORDER BY a.numero_versao DESC`,
    [tenantId, arquivoId]
  );
}

function classificarTipo(mime) {
  if (!mime) return 'outro';
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf')) return 'documento';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'planilha';
  if (mime.includes('word') || mime.includes('text') || mime.includes('document')) return 'documento';
  return 'outro';
}
