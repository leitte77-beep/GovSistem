import db from '../db.js';

/**
 * Remove permanentemente os arquivos físicos (foto, vídeo, áudio, documentos)
 * das mensagens de uma conversa antes de ela ser excluída do banco.
 *
 * Deve ser chamado ANTES do `DELETE FROM conversas`, pois a exclusão da conversa
 * dispara cascata em `mensagens` e os `media_url` deixam de existir.
 *
 * Por segurança, um arquivo só é apagado se nenhuma outra mensagem (em outra
 * conversa ou em canal interno) ainda o referenciar — evita remover mídia
 * compartilhada por encaminhamento.
 *
 * @param {{excluir: Function}} storage  instância de storage (local ou S3/MinIO)
 * @param {string} tenantId
 * @param {string} conversaId
 * @param {object} [dbCtx]  contexto de transação opcional (db.task); default: db
 * @returns {Promise<number>} quantidade de arquivos removidos
 */
export async function excluirMidiaDaConversa(storage, tenantId, conversaId, dbCtx = db) {
  if (!storage || typeof storage.excluir !== 'function') return 0;

  const linhas = await dbCtx.manyOrNone(
    `SELECT DISTINCT media_url
       FROM mensagens
      WHERE conversa_id = $1 AND tenant_id = $2 AND media_url IS NOT NULL`,
    [conversaId, tenantId]
  );

  let removidos = 0;
  for (const { media_url } of linhas) {
    // Não apaga se o mesmo arquivo ainda é usado por outra conversa ou canal interno.
    const ref = await dbCtx.one(
      `SELECT (
           (SELECT COUNT(*) FROM mensagens
              WHERE media_url = $1 AND tenant_id = $2 AND conversa_id <> $3)
         + (SELECT COUNT(*) FROM mensagens_internas
              WHERE media_url = $1 AND tenant_id = $2)
       )::int AS c`,
      [media_url, tenantId, conversaId]
    );
    if (ref.c > 0) continue;

    const ok = await storage.excluir(media_url, tenantId);
    if (ok) removidos += 1;
  }

  return removidos;
}
