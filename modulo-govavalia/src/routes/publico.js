'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { problem } = require('../problem');
const { auditar, origemDe } = require('../audit');
const catalogo = require('../repositories/catalogoRepo');
const avaliacoes = require('../repositories/avaliacoesRepo');
const manifestacoes = require('../repositories/manifestacoesRepo');
const { pool } = require('../db');

const router = express.Router();

// Limite de envio por IP — protege contra abuso sem travar o cidadão.
const limiteEnvio = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => problem(res, {
    status: 429, title: 'Muitas tentativas',
    detail: 'Aguarde um instante e tente novamente.', instance: req.originalUrl
  })
});

/** Idempotência: se a mesma chave já foi usada, devolve o resultado guardado. */
async function jaProcessado(chave) {
  if (!chave) return null;
  const { rows } = await pool.query(
    `SELECT resposta FROM govavalia.idempotencia WHERE chave = $1`, [chave]);
  return rows[0] ? rows[0].resposta : null;
}
async function guardarIdempotencia(chave, tipo, id, resposta) {
  if (!chave) return;
  await pool.query(
    `INSERT INTO govavalia.idempotencia (chave, recurso_tipo, recurso_id, resposta)
     VALUES ($1,$2,$3,$4) ON CONFLICT (chave) DO NOTHING`,
    [chave, tipo, id, JSON.stringify(resposta)]
  );
}

// ---------------------------------------------------------------------
// Configuração para a tela do tablet: unidades, perguntas, escala, tipos.
// ---------------------------------------------------------------------
router.get('/api/v1/config', async (req, res, next) => {
  try {
    const [perguntas, unidades] = await Promise.all([
      catalogo.listarPerguntasAtivas(),
      catalogo.listarUnidadesAtivas()
    ]);
    res.json({
      unidades,
      perguntas,
      escala: config.escala,
      tiposManifestacao: config.tiposManifestacao
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Registrar avaliação (pesquisa anônima).
// ---------------------------------------------------------------------
router.post('/api/v1/avaliacoes', limiteEnvio, async (req, res, next) => {
  try {
    const chave = req.header('Idempotency-Key');
    const cache = await jaProcessado(chave);
    if (cache) return res.status(201).json(cache);

    const { unidadeId, respostas } = req.body || {};
    if (!Array.isArray(respostas) || respostas.length === 0) {
      return problem(res, { status: 422, title: 'Dados inválidos',
        detail: 'Envie ao menos uma resposta.', instance: req.originalUrl });
    }
    const notasValidas = new Set(config.escala.map(e => e.valor));
    const perguntas = await catalogo.listarPerguntasAtivas();
    const mapa = new Map(perguntas.map(p => [p.codigo, p.texto]));

    const limpas = [];
    for (const r of respostas) {
      if (!mapa.has(r.codigo) || !notasValidas.has(Number(r.nota))) {
        return problem(res, { status: 422, title: 'Resposta inválida',
          detail: 'Pergunta ou nota fora do esperado.', instance: req.originalUrl });
      }
      limpas.push({ codigo: r.codigo, texto: mapa.get(r.codigo), nota: Number(r.nota) });
    }

    const avaliacao = await avaliacoes.criarAvaliacao({ unidadeId, respostas: limpas });
    const resposta = { id: avaliacao.id, criadoEm: avaliacao.criado_em };
    await guardarIdempotencia(chave, 'avaliacao', avaliacao.id, resposta);
    await auditar({ ator: 'publico', acao: 'avaliacao.criar',
      recurso: `avaliacao:${avaliacao.id}`, origem: origemDe(req),
      detalhe: { qtdRespostas: limpas.length } });
    res.status(201).json(resposta);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Registrar manifestação da ouvidoria.
// ---------------------------------------------------------------------
router.post('/api/v1/manifestacoes', limiteEnvio, async (req, res, next) => {
  try {
    const chave = req.header('Idempotency-Key');
    const cache = await jaProcessado(chave);
    if (cache) return res.status(201).json(cache);

    let { tipo, mensagem, anonimo, contato, unidadeId } = req.body || {};
    const tiposValidos = new Set(config.tiposManifestacao.map(t => t.id));
    mensagem = (mensagem || '').trim();
    if (!tiposValidos.has(tipo)) {
      return problem(res, { status: 422, title: 'Tipo inválido',
        detail: 'Escolha um tipo de manifestação válido.', instance: req.originalUrl });
    }
    if (!mensagem) {
      return problem(res, { status: 422, title: 'Mensagem vazia',
        detail: 'Escreva sua mensagem.', instance: req.originalUrl });
    }
    if (mensagem.length > 5000) mensagem = mensagem.slice(0, 5000);
    anonimo = anonimo !== false; // padrão: anônimo
    contato = anonimo ? null : (contato || '').trim().slice(0, 200) || null;

    const m = await manifestacoes.criarManifestacao({ tipo, mensagem, anonimo, contato, unidadeId });
    const resposta = { protocolo: m.protocolo, criadoEm: m.criado_em };
    await guardarIdempotencia(chave, 'manifestacao', m.id, resposta);
    // Auditoria SEM conteúdo da mensagem nem contato.
    await auditar({ ator: 'publico', acao: 'manifestacao.criar',
      recurso: `manifestacao:${m.id}`, origem: origemDe(req),
      detalhe: { tipo, anonimo } });
    res.status(201).json(resposta);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// Consulta pública de andamento por protocolo (sem dado pessoal).
// ---------------------------------------------------------------------
router.get('/api/v1/manifestacoes/:protocolo/status', async (req, res, next) => {
  try {
    const m = await manifestacoes.statusPublico(req.params.protocolo);
    if (!m) return problem(res, { status: 404, title: 'Protocolo não encontrado',
      detail: 'Confira o número e tente novamente.', instance: req.originalUrl });
    res.json({
      protocolo: m.protocolo, tipo: m.tipo, status: m.status,
      resposta: m.resposta, criadoEm: m.criado_em, atualizadoEm: m.atualizado_em
    });
  } catch (e) { next(e); }
});

module.exports = router;
