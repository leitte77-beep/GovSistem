import express from 'express';
import {
  listarItens, resumo, getItem, criarItem, atualizarItem,
  concluirItem, reabrirItem, excluirItem,
  lembretesPendentes, reconhecerLembrete, AgendaError,
} from '../services/agenda.js';

const router = express.Router();

// O router é montado depois do authMiddleware, então `req.operador` sempre
// existe aqui. Nenhuma rota aceita operador_id do corpo: o dono do item é
// sempre quem está autenticado.
function ctx(req) {
  return { tenantId: req.operador.tenantId, operadorId: req.operador.id };
}

// Erro de validação vira 400 com a mensagem que o formulário mostra; qualquer
// outro vira 500 genérico e fica no log — nunca vaza detalhe de banco ao front.
function tratarErro(res, err, msgPadrao) {
  if (err instanceof AgendaError) return res.status(err.status).json({ erro: err.message });
  console.error(`[Agenda] ${msgPadrao}:`, err.message);
  return res.status(500).json({ erro: msgPadrao });
}

// ============================================================
// LEITURA
// ============================================================

// Resumo da tela inicial e do modal de login. A janela do dia vem do cliente
// porque só ele conhece o fuso do usuário.
router.get('/resumo', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    const dados = await resumo(tenantId, operadorId, {
      hojeInicio: req.query.hoje_inicio,
      hojeFim: req.query.hoje_fim,
      dias: req.query.dias,
    });
    res.json(dados);
  } catch (err) {
    tratarErro(res, err, 'Erro ao carregar agenda');
  }
});

router.get('/itens', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    const itens = await listarItens(tenantId, operadorId, {
      inicio: req.query.inicio,
      fim: req.query.fim,
      status: req.query.status,
      tipo: req.query.tipo,
      busca: req.query.q,
      ordem: req.query.ordem,
      limite: req.query.limite,
      offset: req.query.offset,
    });
    res.json(itens);
  } catch (err) {
    tratarErro(res, err, 'Erro ao listar compromissos');
  }
});

router.get('/itens/:id', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    const item = await getItem(tenantId, operadorId, req.params.id);
    if (!item) return res.status(404).json({ erro: 'Compromisso não encontrado' });
    res.json(item);
  } catch (err) {
    tratarErro(res, err, 'Erro ao buscar compromisso');
  }
});

// ============================================================
// ESCRITA
// ============================================================

router.post('/itens', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.status(201).json(await criarItem(tenantId, operadorId, req.body || {}));
  } catch (err) {
    tratarErro(res, err, 'Erro ao criar compromisso');
  }
});

router.patch('/itens/:id', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.json(await atualizarItem(tenantId, operadorId, req.params.id, req.body || {}));
  } catch (err) {
    tratarErro(res, err, 'Erro ao atualizar compromisso');
  }
});

router.post('/itens/:id/concluir', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.json(await concluirItem(tenantId, operadorId, req.params.id, { observacao: req.body?.observacao }));
  } catch (err) {
    tratarErro(res, err, 'Erro ao concluir compromisso');
  }
});

router.post('/itens/:id/reabrir', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.json(await reabrirItem(tenantId, operadorId, req.params.id));
  } catch (err) {
    tratarErro(res, err, 'Erro ao reabrir compromisso');
  }
});

router.delete('/itens/:id', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.json(await excluirItem(tenantId, operadorId, req.params.id));
  } catch (err) {
    tratarErro(res, err, 'Erro ao excluir compromisso');
  }
});

// ============================================================
// LEMBRETES
// ============================================================

router.get('/lembretes/pendentes', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.json(await lembretesPendentes(tenantId, operadorId));
  } catch (err) {
    tratarErro(res, err, 'Erro ao buscar lembretes');
  }
});

// Fechar o popup, adiar ("adiar_min") ou concluir passa por aqui.
router.post('/lembretes/:id/reconhecer', async (req, res) => {
  try {
    const { tenantId, operadorId } = ctx(req);
    res.json(await reconhecerLembrete(tenantId, operadorId, req.params.id, { adiarMin: req.body?.adiar_min }));
  } catch (err) {
    tratarErro(res, err, 'Erro ao reconhecer lembrete');
  }
});

export default router;
