'use strict';
const express = require('express');
const { problem } = require('../problem');
const { auditar, origemDe } = require('../audit');
const { apenasGestor, apenasOuvidoria } = require('../auth');
const { pool } = require('../db');
const avaliacoes = require('../repositories/avaliacoesRepo');
const manifestacoes = require('../repositories/manifestacoesRepo');
const catalogo = require('../repositories/catalogoRepo');
const { montarCsv } = require('../services/csv');

const router = express.Router();
const idDe = (req) => (req.user && req.user.id) ? String(req.user.id) : 'desconhecido';

// ---- Dashboard analítico --------------------------------------------------
router.get('/api/v1/admin/dashboard', apenasGestor, async (req, res, next) => {
  try {
    // Totais
    const { rows: [totals] } = await pool.query(`
      SELECT
        (SELECT count(*) FROM govavalia.avaliacao) AS total_avaliacoes,
        (SELECT count(*) FROM govavalia.manifestacao) AS total_manifestacoes,
        (SELECT count(*) FROM govavalia.manifestacao WHERE status IN ('recebida','em_analise')) AS manifestacoes_pendentes,
        (SELECT round(avg(r.nota)::numeric, 2) FROM govavalia.avaliacao_resposta r) AS nota_media_geral,
        (SELECT count(*) FROM govavalia.manifestacao WHERE tipo = 'elogio') AS total_elogios,
        (SELECT count(*) FROM govavalia.manifestacao WHERE tipo = 'reclamacao') AS total_reclamacoes,
        (SELECT count(*) FROM govavalia.manifestacao WHERE tipo = 'denuncia') AS total_denuncias,
        (SELECT count(*) FROM govavalia.manifestacao WHERE tipo = 'sugestao') AS total_sugestoes,
        (SELECT count(*) FROM govavalia.manifestacao WHERE tipo = 'solicitacao') AS total_solicitacoes,
        (SELECT count(*) FROM govavalia.unidade) AS total_unidades
    `);

    // Últimos 30 dias: avaliações por dia
    const { rows: trend } = await pool.query(`
      SELECT d::date AS dia, coalesce(count(a.id), 0) AS total
      FROM generate_series(current_date - interval '29 days', current_date, '1 day') d
      LEFT JOIN govavalia.avaliacao a ON a.criado_em::date = d::date
      GROUP BY d ORDER BY d
    `);

    // Distribuição de notas (geral)
    const { rows: dist } = await pool.query(`
      SELECT nota, count(*) AS total
      FROM govavalia.avaliacao_resposta
      GROUP BY nota ORDER BY nota
    `);

    // Top 5 unidades
    const { rows: topUnidades } = await pool.query(`
      SELECT u.nome, count(a.id) AS total,
             round(avg(r.nota)::numeric, 2) AS media
      FROM govavalia.unidade u
      LEFT JOIN govavalia.avaliacao a ON a.unidade_id = u.id
      LEFT JOIN govavalia.avaliacao_resposta r ON r.avaliacao_id = a.id
      GROUP BY u.id, u.nome
      ORDER BY total DESC LIMIT 5
    `);

    res.json({
      ...totals,
      trend,
      distribuicao: dist,
      topUnidades
    });
  } catch (e) { next(e); }
});

// ---- Resumo da pesquisa (sem dado pessoal): gestor ou ouvidoria ----------
router.get('/api/v1/admin/resumo', apenasGestor, async (req, res, next) => {
  try {
    const { de, ate, unidadeId } = req.query;
    const dados = await avaliacoes.resumo({ de, ate, unidadeId });
    res.json(dados);
  } catch (e) { next(e); }
});

// ---- Lista de manifestações (dado pessoal/sensível): só ouvidoria --------
router.get('/api/v1/admin/manifestacoes', apenasOuvidoria, async (req, res, next) => {
  try {
    const r = await manifestacoes.listar(req.query);
    // Toda leitura de dado de cidadão gera auditoria (sem o conteúdo).
    await auditar({ ator: idDe(req), acao: 'manifestacao.listar',
      origem: origemDe(req), detalhe: { filtros: req.query, retornados: r.itens.length } });
    res.json(r);
  } catch (e) { next(e); }
});

router.get('/api/v1/admin/manifestacoes/:id', apenasOuvidoria, async (req, res, next) => {
  try {
    const m = await manifestacoes.buscarPorId(req.params.id);
    if (!m) return problem(res, { status: 404, title: 'Não encontrada', instance: req.originalUrl });
    await auditar({ ator: idDe(req), acao: 'manifestacao.ler',
      recurso: `manifestacao:${m.id}`, origem: origemDe(req) });
    res.json(m);
  } catch (e) { next(e); }
});

router.patch('/api/v1/admin/manifestacoes/:id', apenasOuvidoria, async (req, res, next) => {
  try {
    const { status, resposta } = req.body || {};
    const atualizado = await manifestacoes.atualizar(req.params.id,
      { status, resposta, ator: idDe(req) });
    if (!atualizado) return problem(res, { status: 404, title: 'Não encontrada', instance: req.originalUrl });
    await auditar({ ator: idDe(req), acao: 'manifestacao.atualizar',
      recurso: `manifestacao:${atualizado.id}`, origem: origemDe(req),
      detalhe: { status: status || null, respondeu: !!resposta } });
    res.json(atualizado);
  } catch (e) { next(e); }
});

// ---- Exportações CSV -----------------------------------------------------
router.get('/api/v1/admin/export/avaliacoes.csv', apenasGestor, async (req, res, next) => {
  try {
    const linhas = await avaliacoes.paraCsv(req.query);
    const csv = montarCsv(
      ['data_hora', 'unidade', 'pergunta', 'nota'],
      linhas.map(l => [l.criado_em.toISOString(), l.unidade || '', l.pergunta_texto, l.nota])
    );
    await auditar({ ator: idDe(req), acao: 'export.avaliacoes',
      origem: origemDe(req), detalhe: { linhas: linhas.length } });
    res.type('text/csv').attachment('pesquisas_satisfacao.csv').send(csv);
  } catch (e) { next(e); }
});

router.get('/api/v1/admin/export/manifestacoes.csv', apenasOuvidoria, async (req, res, next) => {
  try {
    const linhas = await manifestacoes.paraCsv(req.query);
    const csv = montarCsv(
      ['data_hora', 'protocolo', 'tipo', 'status', 'anonimo', 'contato', 'mensagem', 'resposta'],
      linhas.map(l => [l.criado_em.toISOString(), l.protocolo, l.tipo, l.status,
        l.anonimo, l.contato, l.mensagem, l.resposta])
    );
    // Exportar dado pessoal é evento sensível: sempre auditado.
    await auditar({ ator: idDe(req), acao: 'export.manifestacoes',
      origem: origemDe(req), detalhe: { linhas: linhas.length, filtros: req.query } });
    res.type('text/csv').attachment('ouvidoria.csv').send(csv);
  } catch (e) { next(e); }
});

// ---- Configuração das perguntas -----------------------------------------
router.get('/api/v1/admin/perguntas', apenasGestor, async (req, res, next) => {
  try { res.json(await catalogo.listarPerguntasTodas()); } catch (e) { next(e); }
});
router.post('/api/v1/admin/perguntas', apenasGestor, async (req, res, next) => {
  try {
    const { codigo, texto, ordem } = req.body || {};
    if (!codigo || !texto) return problem(res, { status: 422, title: 'Dados incompletos',
      detail: 'Informe código e texto.', instance: req.originalUrl });
    const p = await catalogo.criarPergunta({ codigo, texto, ordem });
    await auditar({ ator: idDe(req), acao: 'pergunta.criar', recurso: `pergunta:${p.id}`, origem: origemDe(req) });
    res.status(201).json(p);
  } catch (e) {
    if (e.code === '23505') return problem(res, { status: 409, title: 'Código já existe', instance: req.originalUrl });
    next(e);
  }
});
router.patch('/api/v1/admin/perguntas/:id', apenasGestor, async (req, res, next) => {
  try {
    const p = await catalogo.atualizarPergunta(req.params.id, req.body || {});
    if (!p) return problem(res, { status: 404, title: 'Não encontrada', instance: req.originalUrl });
    await auditar({ ator: idDe(req), acao: 'pergunta.atualizar', recurso: `pergunta:${p.id}`, origem: origemDe(req) });
    res.json(p);
  } catch (e) { next(e); }
});

module.exports = router;
