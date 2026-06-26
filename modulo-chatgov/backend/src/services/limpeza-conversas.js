import db from '../db.js';
import { excluirMidiaDaConversa } from './midia-conversas.js';

const HORAS_INATIVIDADE = 24;
const INTERVALO_VERIFICACAO_MS = 30 * 60 * 1000; // 30 minutos

async function limparConversasInativas(storage) {
  try {
    const tenants = await db.manyOrNone('SELECT id, nome FROM tenants WHERE ativo = true');

    let totalExcluidas = 0;

    for (const tenant of tenants) {
      await db.task(async (t) => {
        await t.none('SET app.tenant_id = $1', [tenant.id]);

        const aExcluir = await t.manyOrNone(
          `SELECT c.id, c.contato_id
             FROM conversas c
             JOIN mensagens m ON m.conversa_id = c.id
               AND m.criado_em = (
                 SELECT MAX(criado_em) FROM mensagens WHERE conversa_id = c.id
               )
            WHERE c.status = 'aberta'
              AND m.direcao = 'saida'
              AND m.criado_em < NOW() - make_interval(hours => $1)`,
          [HORAS_INATIVIDADE]
        );

        for (const conv of aExcluir) {
          // Apaga os arquivos físicos (foto/vídeo/áudio/documentos) antes de
          // remover a conversa — a cascata em `mensagens` levaria os media_url junto.
          try {
            await excluirMidiaDaConversa(storage, tenant.id, conv.id, t);
          } catch (e) {
            console.error(`[Limpeza] Falha ao excluir mídia da conversa ${conv.id}:`, e.message);
          }

          await t.none('DELETE FROM conversas WHERE id = $1 AND tenant_id = $2', [conv.id, tenant.id]);
          totalExcluidas += 1;
          console.log(
            `[Limpeza] ${tenant.nome}: conversa ${conv.id} excluída ` +
            `(contato ${conv.contato_id}) — >${HORAS_INATIVIDADE}h sem resposta do cidadão`
          );
        }
      });
    }

    await db.none('RESET app.tenant_id');

    if (totalExcluidas > 0) {
      console.log(`[Limpeza] Total: ${totalExcluidas} conversa(s) excluída(s) nesta execução`);
    }
  } catch (err) {
    console.error('[Limpeza] Erro ao limpar conversas inativas:', err.message);
    try { await db.none('RESET app.tenant_id'); } catch {}
  }
}

export function iniciarLimpezaConversas(storage) {
  console.log(
    `[Limpeza] Agendada limpeza de conversas abertas >${HORAS_INATIVIDADE}h ` +
    `sem resposta do cidadão. Verificando a cada ${INTERVALO_VERIFICACAO_MS / 60000}min.`
  );
  limparConversasInativas(storage);
  setInterval(() => limparConversasInativas(storage), INTERVALO_VERIFICACAO_MS);
}
