import db from '../db.js';
import { excluirMidiaDaConversa } from './midia-conversas.js';
import { config } from '../config.js';

const { ativo, acao, horas, intervaloMinutos } = config.limpezaConversas;
const EXCLUIR = acao === 'excluir';
const HORAS_INATIVIDADE = Number.isFinite(horas) && horas > 0 ? horas : 72;
const INTERVALO_MIN = Number.isFinite(intervaloMinutos) && intervaloMinutos > 0 ? intervaloMinutos : 30;
const INTERVALO_VERIFICACAO_MS = INTERVALO_MIN * 60 * 1000;

// Conversas abertas em que a última mensagem foi de saída (nós respondemos) e o
// cidadão não retornou há mais de HORAS_INATIVIDADE. Por padrão são ARQUIVADAS
// (status='arquivada'), preservando histórico, mídia e protocolo. Se o cidadão
// voltar a escrever, o gateway reabre a conversa para a fila automaticamente.
async function processarConversasInativas(storage) {
  try {
    const tenants = await db.manyOrNone('SELECT id, nome FROM tenants WHERE ativo = true');

    let totalAfetadas = 0;

    for (const tenant of tenants) {
      await db.task(async (t) => {
        await t.none('SET app.tenant_id = $1', [tenant.id]);

        const alvo = await t.manyOrNone(
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

        for (const conv of alvo) {
          if (EXCLUIR) {
            // Apaga os arquivos físicos (foto/vídeo/áudio/documentos) antes de
            // remover a conversa — a cascata em `mensagens` levaria os media_url junto.
            try {
              await excluirMidiaDaConversa(storage, tenant.id, conv.id, t);
            } catch (e) {
              console.error(`[Limpeza] Falha ao excluir mídia da conversa ${conv.id}:`, e.message);
            }
            await t.none('DELETE FROM conversas WHERE id = $1 AND tenant_id = $2', [conv.id, tenant.id]);
          } else {
            await t.none(
              `UPDATE conversas SET status = 'arquivada' WHERE id = $1 AND tenant_id = $2`,
              [conv.id, tenant.id]
            );
          }
          totalAfetadas += 1;
        }

        if (alvo.length > 0) {
          console.log(
            `[Limpeza] ${tenant.nome}: ${alvo.length} conversa(s) ` +
            `${EXCLUIR ? 'excluída(s)' : 'arquivada(s)'} (>${HORAS_INATIVIDADE}h sem resposta do cidadão)`
          );
        }
      });
    }

    await db.none('RESET app.tenant_id');

    if (totalAfetadas > 0) {
      console.log(
        `[Limpeza] Total: ${totalAfetadas} conversa(s) ${EXCLUIR ? 'excluída(s)' : 'arquivada(s)'} nesta execução`
      );
    }
  } catch (err) {
    console.error('[Limpeza] Erro ao processar conversas inativas:', err.message);
    try { await db.none('RESET app.tenant_id'); } catch {}
  }
}

export function iniciarLimpezaConversas(storage) {
  if (!ativo) {
    console.log('[Limpeza] Rotina de limpeza de conversas DESATIVADA (LIMPEZA_CONVERSAS_ATIVO=false).');
    return;
  }
  console.log(
    `[Limpeza] Agendado ${EXCLUIR ? 'EXCLUSÃO' : 'arquivamento'} de conversas abertas >${HORAS_INATIVIDADE}h ` +
    `sem resposta do cidadão. Verificando a cada ${INTERVALO_MIN}min.`
  );
  processarConversasInativas(storage);
  setInterval(() => processarConversasInativas(storage), INTERVALO_VERIFICACAO_MS);
}
