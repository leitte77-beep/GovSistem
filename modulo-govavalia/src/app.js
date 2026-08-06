'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { problem } = require('./problem');
const publicoRoutes = require('./routes/publico');
const adminRoutes = require('./routes/admin');

/** Cabeçalhos de segurança e CORS comuns. */
function aplicarSeguranca(app) {
  app.set('trust proxy', true); // atrás de proxy reverso (Nginx etc.)
  app.use(helmet());
  app.use(cors({
    origin: config.origensPermitidas,
    credentials: true
  }));
  app.use(express.json({ limit: '64kb' }));
}

/** Router PÚBLICO: tela dos tablets + API pública (sem login). */
function criarRouterPublico() {
  const r = express.Router();
  r.use(express.static(path.join(__dirname, '..', 'web', 'avalia')));
  r.use(publicoRoutes);
  return r;
}

/**
 * Router ADMIN: painel da equipe + API protegida.
 * IMPORTANTE: monte o middleware de autenticação do SEU sistema ANTES deste
 * router, para que `req.user` esteja preenchido (ver README e src/auth.js).
 */
function criarRouterAdmin() {
  const r = express.Router();
  r.use(express.static(path.join(__dirname, '..', 'web', 'admin')));
  r.use(adminRoutes);
  return r;
}

/** Tratador de erros — sempre no formato Problem Details, sem vazar interno. */
function tratadorDeErros(err, req, res, _next) {
  // Log de aplicação (sem dado pessoal): só a mensagem técnica.
  console.error('[govavalia] erro:', err.message);
  if (res.headersSent) return;
  problem(res, {
    status: 500,
    title: 'Erro interno',
    detail: 'Não foi possível concluir a operação. Tente novamente.',
    instance: req.originalUrl
  });
}

module.exports = {
  aplicarSeguranca,
  criarRouterPublico,
  criarRouterAdmin,
  tratadorDeErros
};
