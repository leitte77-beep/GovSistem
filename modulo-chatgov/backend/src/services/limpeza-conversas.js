import db from '../db.js';

const HORAS_INATIVIDADE = 24;
const INTERVALO_VERIFICACAO_MS = 30 * 60 * 1000; // 30 minutos

async function limparConversasInativas() {
  try {
    const tenants = await db.manyOrNone('SELECT id, nome FROM tenants WHERE ativo = true');

    let totalExcluidas = 0;

    for (const tenant of tenants) {
      await db.task(async (t) => {
        await t.none('SET app.tenant_id = $1', [tenant.id]);

        const resultado = await t.manyOrNone(
          `DELETE FROM conversas
           WHERE id IN (
             SELECT c.id
             FROM conversas c
             JOIN mensagens m ON m.conversa_id = c.id
               AND m.criado_em = (
                 SELECT MAX(criado_em) FROM mensagens WHERE conversa_id = c.id
               )
             WHERE c.status = 'aberta'
               AND m.direcao = 'saida'
               AND m.criado_em < NOW() - make_interval(hours => $1)
           )
           RETURNING id, contato_id`,
          [HORAS_INATIVIDADE]
        );

        if (resultado && resultado.length > 0) {
          totalExcluidas += resultado.length;
          for (const conv of resultado) {
            console.log(
              `[Limpeza] ${tenant.nome}: conversa ${conv.id} excluída ` +
              `(contato ${conv.contato_id}) — >${HORAS_INATIVIDADE}h sem resposta do cidadão`
            );
          }
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

export function iniciarLimpezaConversas() {
  console.log(
    `[Limpeza] Agendada limpeza de conversas abertas >${HORAS_INATIVIDADE}h ` +
    `sem resposta do cidadão. Verificando a cada ${INTERVALO_VERIFICACAO_MS / 60000}min.`
  );
  limparConversasInativas();
  setInterval(limparConversasInativas, INTERVALO_VERIFICACAO_MS);
}
