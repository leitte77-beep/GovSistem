import express from 'express';
import { allowedTransitions, CONVERSA_STATUS, PROTOCOLO_STATUS } from '../domain/status.js';
import { PERMISSIONS, requirePermission } from '../auth/permissions.js';
import { transitionConversation, transitionProtocol } from '../services/status-transitions.js';
import db from '../db.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({ conversa: CONVERSA_STATUS, protocolo: PROTOCOLO_STATUS });
});

router.get('/status/:entidade/:id/eventos', async (req, res) => {
  const { entidade, id } = req.params;
  if (!['conversa', 'protocolo'].includes(entidade)) {
    return res.status(400).json({ erro: 'Entidade inválida' });
  }
  const eventos = await db.manyOrNone(
    `SELECT e.*, o.nome AS operador_nome
     FROM eventos_status e LEFT JOIN operadores o ON o.id = e.operador_id
     WHERE e.tenant_id = $1 AND e.entidade = $2 AND e.entidade_id = $3
     ORDER BY e.criado_em DESC LIMIT 200`,
    [req.operador.tenantId, entidade, id]
  );
  res.json(eventos);
});

router.patch(
  '/conversas/:id/status',
  requirePermission(PERMISSIONS.CONVERSAS_RESOLVE),
  async (req, res) => {
    try {
      const targetStatus = String(req.body.status || '').toUpperCase();
      const conversa = await transitionConversation({
        tenantId: req.operador.tenantId,
        conversaId: req.params.id,
        targetStatus,
        operadorId: req.operador.id,
        justificativa: req.body.justificativa,
        origem: req.body.origem || 'usuario',
        ip: req.ip,
      });
      res.json({
        ...conversa,
        transicoes_permitidas: allowedTransitions('conversa', conversa.status_operacional),
      });
    } catch (err) {
      res.status(/não encontrada/.test(err.message) ? 404 : 409).json({ erro: err.message });
    }
  }
);

router.post(
  '/protocolos/:id/reabrir',
  requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE),
  async (req, res) => {
    try {
      const protocolo = await transitionProtocol({
        tenantId: req.operador.tenantId,
        protocoloId: req.params.id,
        targetStatus: 'EM_ANDAMENTO',
        operadorId: req.operador.id,
        justificativa: req.body.justificativa,
        origem: 'usuario',
        ip: req.ip,
      });
      res.json(protocolo);
    } catch (err) {
      res.status(/não encontrado/.test(err.message) ? 404 : 409).json({ erro: err.message });
    }
  }
);

export default router;
