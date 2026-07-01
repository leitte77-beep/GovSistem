import express from 'express';
import db from '../db.js';
import { authMiddleware, requirePapel } from '../auth/middleware.js';
import { rateLimiter } from '../auth/ratelimit.js';
import {
  atualizarPresenca, getPresenca, getTodosOnline
} from '../services/presenca.js';
import {
  editarMensagem, excluirMensagem, encaminharMensagem,
  fixarMensagem, desafixarMensagem, getMensagensFixadas,
  adicionarReacao, removerReacao, getReacoes,
  marcarLido, contarNaoLidas, buscarMensagens
} from '../services/mensagens.js';
import {
  uploadArquivo, getArquivo, getArquivosConversa,
  excluirArquivo, downloadArquivo, novaVersaoArquivo, getVersoesArquivo
} from '../services/arquivos.js';
import {
  getCalendario, criarEventoCalendario, solicitarAusencia, aprovarAusencia
} from '../services/reunioes.js';
import {
  criarNotificacao, listarNotificacoes, contarNaoLidasNotificacoes,
  marcarNotificacaoLida, marcarTodasLidas,
  getConfigNotificacoes, atualizarConfigNotificacoes,
  silenciarConversa, getSilenciadas, getContagemNaoLidasPorCanal
} from '../services/notificacoes.js';
import { createStorage } from '../storage/index.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================================
// PRESENÇA
// ============================================================
router.get('/presenca', async (req, res) => {
  try {
    const op = req.operador;
    const todos = await getTodosOnline(op.tenantId);
    res.json(todos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar presença' });
  }
});

router.get('/presenca/me', async (req, res) => {
  try {
    const op = req.operador;
    const p = await getPresenca(op.tenantId, op.id);
    res.json(p);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar presença' });
  }
});

router.put('/presenca', async (req, res) => {
  try {
    const op = req.operador;
    const { status, mensagem } = req.body;
    await atualizarPresenca(op.tenantId, op.id, status || 'online', mensagem || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar presença' });
  }
});

// ============================================================
// MENSAGENS INTERNAS AVANÇADAS
// ============================================================
router.put('/canais-internos/:canalId/mensagens/:msgId/editar', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const msg = await editarMensagem(op.tenantId, req.params.msgId, op.id, req.body.conteudo);
    if (!msg) return res.status(404).json({ erro: 'Mensagem não encontrada ou prazo de edição expirado' });
    res.json(msg);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao editar mensagem' });
  }
});

router.delete('/canais-internos/:canalId/mensagens/:msgId', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const msg = await excluirMensagem(op.tenantId, req.params.msgId, op.id);
    if (!msg) return res.status(404).json({ erro: 'Mensagem não encontrada' });
    res.json(msg);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir mensagem' });
  }
});

router.post('/canais-internos/:canalId/mensagens/:msgId/encaminhar', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.body.canal_destino_id, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const msg = await encaminharMensagem(op.tenantId, req.params.msgId, req.body.canal_destino_id, op.id);
    if (!msg) return res.status(404).json({ erro: 'Mensagem não encontrada' });
    res.json(msg);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao encaminhar mensagem' });
  }
});

router.get('/canais-internos/:canalId/fixadas', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const fixadas = await getMensagensFixadas(op.tenantId, req.params.canalId);
    res.json(fixadas);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar fixadas' });
  }
});

router.post('/canais-internos/:canalId/mensagens/:msgId/fixar', async (req, res) => {
  try {
    const op = req.operador;
    const r = await fixarMensagem(op.tenantId, req.params.canalId, req.params.msgId, op.id);
    res.json(r || { ok: false });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao fixar mensagem' });
  }
});

router.delete('/canais-internos/:canalId/mensagens/:msgId/fixar', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    await desafixarMensagem(op.tenantId, req.params.canalId, req.params.msgId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao desafixar mensagem' });
  }
});

router.get('/canais-internos/:canalId/mensagens/:msgId/reacoes', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const reacoes = await getReacoes(op.tenantId, [req.params.msgId]);
    res.json(reacoes);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar reações' });
  }
});

router.post('/canais-internos/:canalId/mensagens/:msgId/reagir', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const { emoji } = req.body;
    const r = await adicionarReacao(op.tenantId, req.params.msgId, op.id, emoji);
    res.json(r || { ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao adicionar reação' });
  }
});

router.delete('/canais-internos/:canalId/mensagens/:msgId/reagir', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    const { emoji } = req.body;
    await removerReacao(op.tenantId, req.params.msgId, op.id, emoji);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover reação' });
  }
});

router.post('/canais-internos/:canalId/ler', async (req, res) => {
  try {
    const op = req.operador;
    const { assertMembroCanal } = await import('../services/mensagens.js');
    try {
      await assertMembroCanal(op.tenantId, req.params.canalId, op.id);
    } catch (e) {
      return res.status(403).json({ erro: e.message });
    }
    await marcarLido(op.tenantId, req.params.canalId, op.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao marcar lido' });
  }
});

router.get('/canais-internos/nao-lidas', async (req, res) => {
  try {
    const op = req.operador;
    const total = await contarNaoLidas(op.tenantId, op.id);
    res.json({ total });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao contar não lidas' });
  }
});

router.get('/busca/mensagens', async (req, res) => {
  try {
    const op = req.operador;
    const { q, tipo, canal_id, remetente_id } = req.query;
    const resultados = await buscarMensagens(op.tenantId, op.id, q, { tipo, canal_id, remetente_id });
    res.json(resultados);
  } catch (err) {
    res.status(500).json({ erro: 'Erro na busca' });
  }
});

// ============================================================
// ARQUIVOS (infra compartilhada: chat interno e mídias de conversa)
// ============================================================
router.post('/arquivos/upload', upload.single('arquivo'), async (req, res) => {
  try {
    const op = req.operador;
    if (!req.file) return res.status(400).json({ erro: 'Arquivo obrigatório' });
    const result = await uploadArquivo(
      op.tenantId, op.id, req.file.buffer, req.file.originalname,
      req.file.mimetype, req.body.conversa_id || null, req.body.pasta_id || null,
      req.body.canal_id || null, req.body.tarefa_id || null
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao fazer upload' });
  }
});

router.get('/arquivos/:id', async (req, res) => {
  try {
    const op = req.operador;
    const arquivo = await getArquivo(op.tenantId, req.params.id);
    if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado' });
    res.json(arquivo);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar arquivo' });
  }
});

router.get('/arquivos/:id/download', async (req, res) => {
  try {
    const op = req.operador;
    const result = await downloadArquivo(op.tenantId, req.params.id);
    if (!result) return res.status(404).json({ erro: 'Arquivo não encontrado' });
    res.setHeader('Content-Type', result.arquivo.tipo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.arquivo.nome_original}"`);
    res.send(result.buffer);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao baixar arquivo' });
  }
});

// Serve o arquivo inline (sem Content-Disposition: attachment) para ser usado
// diretamente em <img src>, <video src>, <iframe src> etc. Aceita o token
// via query string (?token=...) para esses casos em que o navegador não envia
// o header Authorization.
router.get('/arquivos/:id/raw', async (req, res) => {
  try {
    const { verifyToken } = await import('../auth/jwt.js');
    const { operadorFromToken } = await import('../auth/middleware.js');
    let op = req.operador;
    if (!op) {
      const token = req.query.token;
      if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
      try {
        const decoded = verifyToken(token);
        op = operadorFromToken(decoded);
      } catch (e) {
        return res.status(401).json({ erro: 'Token inválido' });
      }
    }
    const result = await downloadArquivo(op.tenantId, req.params.id);
    if (!result) return res.status(404).json({ erro: 'Arquivo não encontrado' });
    res.setHeader('Content-Type', result.arquivo.tipo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(result.buffer);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao servir arquivo' });
  }
});

router.delete('/arquivos/:id', async (req, res) => {
  try {
    const op = req.operador;
    await excluirArquivo(op.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir arquivo' });
  }
});

router.get('/conversas/:id/arquivos', async (req, res) => {
  try {
    const op = req.operador;
    const arquivos = await getArquivosConversa(op.tenantId, req.params.id, req.query);
    res.json(arquivos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar arquivos' });
  }
});

router.post('/arquivos/:id/nova-versao', upload.single('arquivo'), async (req, res) => {
  try {
    const op = req.operador;
    if (!req.file) return res.status(400).json({ erro: 'Arquivo obrigatório' });
    const versao = await novaVersaoArquivo(op.tenantId, req.params.id, op.id, req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json(versao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar nova versão' });
  }
});

router.get('/arquivos/:id/versoes', async (req, res) => {
  try {
    const op = req.operador;
    const versoes = await getVersoesArquivo(op.tenantId, req.params.id);
    res.json(versoes);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar versões' });
  }
});

// ============================================================
// CALENDÁRIO E AUSÊNCIAS (Agenda)
// ============================================================
router.get('/calendario', async (req, res) => {
  try {
    const op = req.operador;
    const { inicio, fim } = req.query;
    const eventos = await getCalendario(op.tenantId, op.id, inicio || new Date().toISOString(), fim || new Date(Date.now() + 30 * 86400000).toISOString());
    res.json(eventos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar calendário' });
  }
});

router.post('/calendario/eventos', async (req, res) => {
  try {
    const op = req.operador;
    const evento = await criarEventoCalendario(op.tenantId, op.id, req.body);
    res.json(evento);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar evento' });
  }
});

router.post('/ausencias', async (req, res) => {
  try {
    const op = req.operador;
    const ausencia = await solicitarAusencia(op.tenantId, op.id, req.body);
    res.json(ausencia);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao solicitar ausência' });
  }
});

router.patch('/ausencias/:id/aprovar', requirePapel('admin', 'supervisor'), async (req, res) => {
  try {
    const op = req.operador;
    const { aprovado } = req.body;
    const ausencia = await aprovarAusencia(op.tenantId, req.params.id, op.id, aprovado);
    if (!ausencia) return res.status(404).json({ erro: 'Ausência não encontrada' });
    res.json(ausencia);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao aprovar ausência' });
  }
});

// ============================================================
// NOTIFICAÇÕES
// ============================================================
router.get('/notificacoes', async (req, res) => {
  try {
    const op = req.operador;
    const { apenas_nao_lidas } = req.query;
    const notificacoes = await listarNotificacoes(op.tenantId, op.id, apenas_nao_lidas === 'true');
    res.json(notificacoes);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar notificações' });
  }
});

router.get('/notificacoes/contagem', async (req, res) => {
  try {
    const op = req.operador;
    const total = await contarNaoLidasNotificacoes(op.tenantId, op.id);
    res.json({ total });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao contar notificações' });
  }
});

router.get('/notificacoes/status', async (req, res) => {
  try {
    const op = req.operador;

    const { total: notifTotal } = await db.one(
      `SELECT COUNT(*)::int AS total FROM notificacoes
       WHERE tenant_id = $1 AND operador_id = $2 AND lida = false`,
      [op.tenantId, op.id]
    );

    const { naoLidasConv } = await db.one(
      `SELECT COALESCE(SUM(c.nao_lidas), 0)::int AS "naoLidasConv"
       FROM conversas c
       WHERE c.tenant_id = $1
         AND c.nao_lidas > 0
         AND c.status NOT IN ('resolvida', 'arquivada')
         AND (
           c.operador_id = $2
           OR c.operador_id IS NULL
           OR            c.departamento_id IN (
             SELECT departamento_id FROM operador_departamentos od JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true WHERE od.operador_id = $2
           )
         )`,
      [op.tenantId, op.id]
    );

    const config = await db.oneOrNone(
      `SELECT * FROM config_notificacoes WHERE operador_id = $1`,
      [op.id]
    );

    res.json({
      notificacoes: notifTotal || 0,
      conversas: naoLidasConv || 0,
      total: (notifTotal || 0) + (naoLidasConv || 0),
      config: config || { push_ativo: true, som_ativado: true },
    });
  } catch (err) {
    console.error('[Notif Status] Erro:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar status de notificações' });
  }
});

router.post('/notificacoes/:id/ler', async (req, res) => {
  try {
    const op = req.operador;
    await marcarNotificacaoLida(op.tenantId, op.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao marcar como lida' });
  }
});

router.post('/notificacoes/ler-todas', async (req, res) => {
  try {
    const op = req.operador;
    await marcarTodasLidas(op.tenantId, op.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao marcar todas como lidas' });
  }
});

router.get('/config/notificacoes', async (req, res) => {
  try {
    const op = req.operador;
    const cfg = await getConfigNotificacoes(op.tenantId, op.id);
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar configurações' });
  }
});

router.put('/config/notificacoes', async (req, res) => {
  try {
    const op = req.operador;
    const cfg = await atualizarConfigNotificacoes(op.tenantId, op.id, req.body);
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar configurações' });
  }
});

router.post('/config/silenciar', async (req, res) => {
  try {
    const op = req.operador;
    const { conversa_id, canal_id, silenciar } = req.body;
    const r = await silenciarConversa(op.tenantId, op.id, conversa_id || null, canal_id || null, silenciar || 'tudo');
    res.json(r);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao silenciar' });
  }
});

router.get('/config/silenciadas', async (req, res) => {
  try {
    const op = req.operador;
    const silenciadas = await getSilenciadas(op.tenantId, op.id);
    res.json(silenciadas);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar silenciadas' });
  }
});

export default router;
