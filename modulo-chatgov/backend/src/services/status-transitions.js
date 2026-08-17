import db from '../db.js';
import { assertTransition, normalizeStatus } from '../domain/status.js';

const LEGACY_CONVERSA = {
  NOVA: 'fila',
  NA_FILA: 'fila',
  EM_ATENDIMENTO: 'aberta',
  AGUARDANDO_CIDADAO: 'aberta',
  AGUARDANDO_SETOR: 'aberta',
  RESOLVIDA: 'resolvida',
  ARQUIVADA: 'arquivada',
};

const LEGACY_PROTOCOLO = {
  ABERTO: 'aberto',
  EM_ANDAMENTO: 'em_andamento',
  PENDENTE: 'pendente',
  CONCLUIDO: 'concluido',
  CANCELADO: 'cancelado',
  ARQUIVADO: 'arquivado',
};

export async function transitionConversation({
  tenantId, conversaId, targetStatus, operadorId, justificativa, origem = 'usuario', ip,
}) {
  try {
    return await db.tx(async (tx) => {
      const conversa = await tx.oneOrNone(
        `SELECT * FROM conversas WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [conversaId, tenantId]
      );
      if (!conversa) throw new Error('Conversa não encontrada');

      const from = normalizeStatus('conversa', conversa.status_operacional || conversa.status);
      const targetNormalizado = normalizeStatus('conversa', targetStatus);
      // Clicar duas vezes em Resolvido (ou dois atendentes fechando a mesma
      // conversa) não é erro: o estado desejado já é o atual, então não há o que
      // gravar nem o que auditar.
      if (from === targetNormalizado) return conversa;

      const target = assertTransition('conversa', from, targetStatus, {
        operadorId: conversa.operador_id,
        justificativa,
        origem,
      });

      if (!['RESOLVIDA', 'ARQUIVADA'].includes(target)) {
        const outraAtiva = await tx.oneOrNone(
          `SELECT id FROM conversas
           WHERE tenant_id = $1 AND contato_id = $2 AND id <> $3
             AND deleted_at IS NULL
             AND status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA')
           LIMIT 1`,
          [tenantId, conversa.contato_id, conversaId]
        );
        if (outraAtiva) {
          throw new Error('O cidadão já possui outro atendimento ativo; abra a conversa atual em vez de reabrir este histórico.');
        }
      }

      const updated = await tx.one(
        `UPDATE conversas SET
           status_operacional = $1,
           status = $2,
           resolvida_em = CASE WHEN $1 = 'RESOLVIDA' THEN now() ELSE resolvida_em END,
           arquivada_em = CASE WHEN $1 = 'ARQUIVADA' THEN now() ELSE NULL END
         WHERE id = $3 AND tenant_id = $4 RETURNING *`,
        [target, LEGACY_CONVERSA[target], conversaId, tenantId]
      );
      await tx.none(
        `INSERT INTO eventos_status
         (tenant_id, entidade, entidade_id, status_anterior, novo_status, operador_id, justificativa, origem, ip)
         VALUES ($1, 'conversa', $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, conversaId, from, target, operadorId || null, justificativa || null, origem, ip || null]
      );
      await tx.none(
        `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, ip, entidade, entidade_id)
         VALUES ($1, $2, 'conversa.status.alterado', $3, $4, $5, 'conversa', $6)`,
        [tenantId, operadorId || null, { anterior: from, novo: target, justificativa }, origem, ip || null, conversaId]
      );
      return updated;
    });
  } catch (err) {
    if (err?.code === '23505' && err?.constraint === 'conversas_tenant_contato_em_andamento_uk') {
      throw new Error('O cidadão já possui outro atendimento ativo; abra a conversa atual em vez de reabrir este histórico.');
    }
    throw err;
  }
}

export async function transitionProtocol({
  tenantId, protocoloId, targetStatus, operadorId, justificativa, origem = 'usuario', ip,
}) {
  return db.tx(async (tx) => {
    const protocolo = await tx.oneOrNone(
      `SELECT * FROM protocolos WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [protocoloId, tenantId]
    );
    if (!protocolo) throw new Error('Protocolo não encontrado');
    const from = normalizeStatus('protocolo', protocolo.status_operacional || protocolo.status);
    const target = assertTransition('protocolo', from, targetStatus, { justificativa });

    const updated = await tx.one(
      `UPDATE protocolos SET status_operacional = $1, status = $2, atualizado_em = now(),
         fechado_em = CASE WHEN $1 IN ('CONCLUIDO','CANCELADO','ARQUIVADO') THEN now() ELSE NULL END,
         motivo_reabertura = CASE WHEN $3 IN ('CONCLUIDO','CANCELADO','ARQUIVADO') AND $1 = 'EM_ANDAMENTO' THEN $4 ELSE motivo_reabertura END
       WHERE id = $5 AND tenant_id = $6 RETURNING *`,
      [target, LEGACY_PROTOCOLO[target], from, justificativa || null, protocoloId, tenantId]
    );
    await tx.none(
      `INSERT INTO eventos_status
       (tenant_id, entidade, entidade_id, status_anterior, novo_status, operador_id, justificativa, origem, ip)
       VALUES ($1, 'protocolo', $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, protocoloId, from, target, operadorId || null, justificativa || null, origem, ip || null]
    );
    await tx.none(
      `INSERT INTO andamentos_protocolo (tenant_id, protocolo_id, status, descricao, operador_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, protocoloId, LEGACY_PROTOCOLO[target], justificativa || `Status alterado para ${target}`, operadorId || null]
    );
    return updated;
  });
}
