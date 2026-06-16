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
  listarProjetos, criarProjeto, getKanban,
  criarColuna, atualizarColuna,
  criarTarefa, getTarefa, atualizarTarefa, moverTarefa,
  adicionarChecklistItem, toggleChecklistItem,
  adicionarComentario, listarTarefas, minhasTarefas, relatorioProdutividade
} from '../services/tarefas.js';
import {
  uploadArquivo, getArquivo, getArquivosConversa, getArquivosPasta,
  excluirArquivo, listarPastas, criarPasta, buscarArquivos,
  downloadArquivo, novaVersaoArquivo, getVersoesArquivo
} from '../services/arquivos.js';
import {
  criarReuniao, getReuniao, listarReunioes, atualizarReuniao,
  cancelarReuniao, adicionarParticipante, removerParticipante,
  confirmarPresenca, getReunioesLembrete, getTarefasVencidas,
  getTarefasProximoPrazo, getCalendario,
  criarEventoCalendario, solicitarAusencia, aprovarAusencia
} from '../services/reunioes.js';
import {
  criarNotificacao, listarNotificacoes, contarNaoLidasNotificacoes,
  marcarNotificacaoLida, marcarTodasLidas,
  getConfigNotificacoes, atualizarConfigNotificacoes,
  silenciarConversa, getSilenciadas, getContagemNaoLidasPorCanal
} from '../services/notificacoes.js';
import {
  listarArtigos, getArtigo, criarArtigo, atualizarArtigo,
  getVersoesArtigo, getCategoriasWiki
} from '../services/wiki.js';
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
// PROJETOS E TAREFAS / KANBAN
// ============================================================
router.get('/projetos', async (req, res) => {
  try {
    const op = req.operador;
    const projetos = await listarProjetos(op.tenantId, op.id);
    res.json(projetos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar projetos' });
  }
});

router.post('/projetos', async (req, res) => {
  try {
    const op = req.operador;
    const projeto = await criarProjeto(op.tenantId, op.id, req.body);
    res.json(projeto);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar projeto' });
  }
});

router.get('/projetos/:id/kanban', async (req, res) => {
  try {
    const op = req.operador;
    const kanban = await getKanban(op.tenantId, req.params.id);
    if (!kanban) return res.status(404).json({ erro: 'Projeto não encontrado' });
    res.json(kanban);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao carregar kanban' });
  }
});

router.post('/projetos/:id/colunas', async (req, res) => {
  try {
    const op = req.operador;
    const coluna = await criarColuna(op.tenantId, req.params.id, req.body);
    res.json(coluna);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar coluna' });
  }
});

router.patch('/colunas/:id', async (req, res) => {
  try {
    const op = req.operador;
    const coluna = await atualizarColuna(op.tenantId, req.params.id, req.body);
    if (!coluna) return res.status(404).json({ erro: 'Coluna não encontrada' });
    res.json(coluna);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar coluna' });
  }
});

router.get('/tarefas', async (req, res) => {
  try {
    const op = req.operador;
    const tarefas = await listarTarefas(op.tenantId, req.query);
    res.json(tarefas);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar tarefas' });
  }
});

router.post('/tarefas', async (req, res) => {
  try {
    const op = req.operador;
    const tarefa = await criarTarefa(op.tenantId, op.id, req.body);
    res.json(tarefa);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar tarefa' });
  }
});

router.get('/tarefas/minhas', async (req, res) => {
  try {
    const op = req.operador;
    const tarefas = await minhasTarefas(op.tenantId, op.id);
    res.json(tarefas);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar tarefas' });
  }
});

router.get('/tarefas/:id', async (req, res) => {
  try {
    const op = req.operador;
    const tarefa = await getTarefa(op.tenantId, req.params.id);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada' });
    res.json(tarefa);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar tarefa' });
  }
});

router.patch('/tarefas/:id', async (req, res) => {
  try {
    const op = req.operador;
    const tarefa = await atualizarTarefa(op.tenantId, req.params.id, op.id, req.body);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada' });
    res.json(tarefa);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar tarefa' });
  }
});

router.post('/tarefas/:id/mover', async (req, res) => {
  try {
    const op = req.operador;
    const { coluna_id, ordem } = req.body;
    const tarefa = await moverTarefa(op.tenantId, req.params.id, coluna_id, ordem || 0, op.id);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada' });
    res.json(tarefa);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao mover tarefa' });
  }
});

router.post('/tarefas/:id/checklist', async (req, res) => {
  try {
    const op = req.operador;
    const item = await adicionarChecklistItem(op.tenantId, req.params.id, req.body.texto);
    res.json(item);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao adicionar item' });
  }
});

router.patch('/tarefas/:id/checklist/:itemId', async (req, res) => {
  try {
    const op = req.operador;
    const item = await toggleChecklistItem(op.tenantId, req.params.id, req.params.itemId, req.body.concluido);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar item' });
  }
});

router.post('/tarefas/:id/comentarios', async (req, res) => {
  try {
    const op = req.operador;
    const comentario = await adicionarComentario(op.tenantId, req.params.id, op.id, req.body.texto);
    res.json(comentario);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao adicionar comentário' });
  }
});

router.get('/tarefas/:id/historico', async (req, res) => {
  try {
    const op = req.operador;
    const tarefa = await getTarefa(op.tenantId, req.params.id);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada' });
    res.json(tarefa.historico);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar histórico' });
  }
});

router.get('/relatorios/tarefas', requirePapel('admin'), async (req, res) => {
  try {
    const op = req.operador;
    const { inicio, fim } = req.query;
    const relatorio = await relatorioProdutividade(op.tenantId, inicio || null, fim || null);
    res.json(relatorio);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao gerar relatório' });
  }
});

// ============================================================
// ARQUIVOS
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

router.get('/pastas', async (req, res) => {
  try {
    const op = req.operador;
    const { setor_id } = req.query;
    const pastas = await listarPastas(op.tenantId, setor_id || null);
    res.json(pastas);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar pastas' });
  }
});

router.post('/pastas', async (req, res) => {
  try {
    const op = req.operador;
    const pasta = await criarPasta(op.tenantId, op.id, req.body);
    res.json(pasta);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar pasta' });
  }
});

router.get('/pastas/:id/arquivos', async (req, res) => {
  try {
    const op = req.operador;
    const arquivos = await getArquivosPasta(op.tenantId, req.params.id);
    res.json(arquivos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar arquivos da pasta' });
  }
});

router.get('/arquivos/buscar', async (req, res) => {
  try {
    const op = req.operador;
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const arquivos = await buscarArquivos(op.tenantId, q);
    res.json(arquivos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro na busca' });
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
// REUNIÕES
// ============================================================
router.post('/reunioes', async (req, res) => {
  try {
    const op = req.operador;
    const reuniao = await criarReuniao(op.tenantId, op.id, req.body);
    if (req.body.participantes && Array.isArray(req.body.participantes)) {
      for (const pId of req.body.participantes) {
        await adicionarParticipante(op.tenantId, reuniao.id, pId);
      }
    }
    res.json(reuniao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar reunião' });
  }
});

router.get('/reunioes', async (req, res) => {
  try {
    const op = req.operador;
    const reunioes = await listarReunioes(op.tenantId, op.id, req.query);
    res.json(reunioes);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar reuniões' });
  }
});

router.get('/reunioes/:id', async (req, res) => {
  try {
    const op = req.operador;
    const reuniao = await getReuniao(op.tenantId, req.params.id);
    if (!reuniao) return res.status(404).json({ erro: 'Reunião não encontrada' });
    res.json(reuniao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar reunião' });
  }
});

router.patch('/reunioes/:id', async (req, res) => {
  try {
    const op = req.operador;
    const reuniao = await atualizarReuniao(op.tenantId, req.params.id, req.body);
    if (!reuniao) return res.status(404).json({ erro: 'Reunião não encontrada' });
    res.json(reuniao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar reunião' });
  }
});

router.delete('/reunioes/:id', async (req, res) => {
  try {
    const op = req.operador;
    const reuniao = await cancelarReuniao(op.tenantId, req.params.id, op.id);
    if (!reuniao) return res.status(404).json({ erro: 'Reunião não encontrada' });
    res.json(reuniao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao cancelar reunião' });
  }
});

router.post('/reunioes/:id/participantes', async (req, res) => {
  try {
    const op = req.operador;
    const { operador_id } = req.body;
    await adicionarParticipante(op.tenantId, req.params.id, operador_id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao adicionar participante' });
  }
});

router.delete('/reunioes/:id/participantes/:operadorId', async (req, res) => {
  try {
    const op = req.operador;
    await removerParticipante(op.tenantId, req.params.id, req.params.operadorId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover participante' });
  }
});

router.post('/reunioes/:id/confirmar', async (req, res) => {
  try {
    const op = req.operador;
    await confirmarPresenca(op.tenantId, req.params.id, op.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao confirmar presença' });
  }
});

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

// ============================================================
// WIKI
// ============================================================
router.get('/wiki', async (req, res) => {
  try {
    const op = req.operador;
    const { categoria } = req.query;
    const artigos = await listarArtigos(op.tenantId, categoria || null);
    res.json(artigos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar artigos' });
  }
});

router.get('/wiki/categorias', async (req, res) => {
  try {
    const op = req.operador;
    const categorias = await getCategoriasWiki(op.tenantId);
    res.json(categorias);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar categorias' });
  }
});

router.get('/wiki/:id', async (req, res) => {
  try {
    const op = req.operador;
    const artigo = await getArtigo(op.tenantId, req.params.id);
    if (!artigo) return res.status(404).json({ erro: 'Artigo não encontrado' });
    res.json(artigo);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar artigo' });
  }
});

router.post('/wiki', async (req, res) => {
  try {
    const op = req.operador;
    const artigo = await criarArtigo(op.tenantId, op.id, req.body);
    res.json(artigo);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar artigo' });
  }
});

router.put('/wiki/:id', async (req, res) => {
  try {
    const op = req.operador;
    const artigo = await atualizarArtigo(op.tenantId, req.params.id, op.id, req.body);
    if (!artigo) return res.status(404).json({ erro: 'Artigo não encontrado' });
    res.json(artigo);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar artigo' });
  }
});

router.get('/wiki/:id/versoes', async (req, res) => {
  try {
    const op = req.operador;
    const versoes = await getVersoesArtigo(op.tenantId, req.params.id);
    res.json(versoes);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar versões' });
  }
});

export default router;
