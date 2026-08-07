import db from '../db.js';
import { atualizarStatusNotificacao } from './protocolo-v2.js';

// A fila de protocolo_notificacoes era gravada mas nunca consumida: nada
// processava os registros pendentes, então nenhuma notificação enfileirada
// chegava ao destinatário. Este worker drena a fila periodicamente.

const INTERVALO_MS = Number(process.env.PROTOCOLO_NOTIF_INTERVALO_MS || 30_000);
const LOTE = Number(process.env.PROTOCOLO_NOTIF_LOTE || 20);
const MAX_TENTATIVAS = Number(process.env.PROTOCOLO_NOTIF_MAX_TENTATIVAS || 5);

let timer = null;
let rodando = false;

function backoffMinutos(tentativas) {
  // 1, 2, 4, 8, 16 minutos entre tentativas.
  return Math.min(2 ** Math.max(0, tentativas - 1), 16);
}

async function proximasPendentes(limite) {
  return db.manyOrNone(
    `SELECT * FROM protocolo_notificacoes
     WHERE status_envio = 'pendente'
       AND tentativas < $2
       AND (
         ultima_tentativa_em IS NULL
         OR ultima_tentativa_em < now() - (make_interval(mins => LEAST(POWER(2, GREATEST(tentativas - 1, 0))::int, 16)))
       )
     ORDER BY criado_em ASC
     LIMIT $1`,
    [limite, MAX_TENTATIVAS]
  );
}

function jidDe(destinatario) {
  const digits = String(destinatario || '').replace(/\D/g, '');
  if (!digits || digits.length < 10) return null;
  return `${digits}@s.whatsapp.net`;
}

async function enviarUma(notif, whatsapp) {
  if (notif.canal === 'whatsapp') {
    const jid = jidDe(notif.destinatario);
    if (!jid) {
      // Destinatário inválido não melhora com retry — encerra como falha.
      await db.none(
        `UPDATE protocolo_notificacoes
         SET status_envio = 'falha', falha_detalhe = $2,
             tentativas = tentativas + 1, ultima_tentativa_em = now()
         WHERE id = $1`,
        [notif.id, 'Destinatário sem telefone válido']
      );
      return { ok: false, permanente: true };
    }
    if (!whatsapp) {
      await atualizarStatusNotificacao(notif.id, {
        statusEnvio: 'pendente', falhaDetalhe: 'WhatsApp indisponível no processo',
      });
      return { ok: false };
    }

    await whatsapp.sendText(notif.tenant_id, jid, notif.conteudo);
    await atualizarStatusNotificacao(notif.id, { statusEnvio: 'enviado' });
    return { ok: true };
  }

  // Canais ainda sem provedor configurado (e-mail): marca explicitamente
  // em vez de deixar o registro preso como "pendente" para sempre.
  await atualizarStatusNotificacao(notif.id, {
    statusEnvio: 'falha',
    falhaDetalhe: `Canal "${notif.canal}" ainda não possui provedor configurado`,
  });
  return { ok: false, permanente: true };
}

export async function processarFilaNotificacoes(whatsapp) {
  if (rodando) return { processadas: 0 };
  rodando = true;
  let enviadas = 0;
  let falhas = 0;

  try {
    const pendentes = await proximasPendentes(LOTE);
    for (const notif of pendentes) {
      try {
        const r = await enviarUma(notif, whatsapp);
        if (r.ok) enviadas++;
        else falhas++;
      } catch (err) {
        falhas++;
        await atualizarStatusNotificacao(notif.id, {
          statusEnvio: 'pendente', falhaDetalhe: err.message?.slice(0, 500),
        }).catch(() => {});
      }
    }

    // Esgotou as tentativas: sai da fila como falha definitiva.
    await db.none(
      `UPDATE protocolo_notificacoes
       SET status_envio = 'falha'
       WHERE status_envio = 'pendente' AND tentativas >= $1`,
      [MAX_TENTATIVAS]
    );

    if (enviadas || falhas) {
      console.log(`[protocolo-notif] enviadas=${enviadas} falhas=${falhas}`);
    }
    return { processadas: pendentes.length, enviadas, falhas };
  } finally {
    rodando = false;
  }
}

export function iniciarWorkerNotificacoes(getWhatsApp) {
  if (timer) return;
  if (process.env.PROTOCOLO_NOTIF_ATIVO === 'false') {
    console.log('[protocolo-notif] Worker desativado por configuração.');
    return;
  }

  timer = setInterval(() => {
    processarFilaNotificacoes(typeof getWhatsApp === 'function' ? getWhatsApp() : getWhatsApp)
      .catch((err) => console.error('[protocolo-notif] Erro no ciclo:', err.message));
  }, INTERVALO_MS);

  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[protocolo-notif] Worker de notificações ativo (a cada ${INTERVALO_MS / 1000}s).`);
}

export function pararWorkerNotificacoes() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
