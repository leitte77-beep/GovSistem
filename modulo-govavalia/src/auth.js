'use strict';
const jwt = require('jsonwebtoken');
const { problem } = require('./problem');
const config = require('./config');

/**
 * AUTENTICAÇÃO — aceita:
 * 1. Token do SaaS GovSistem (JWT com type=module_access, module=govavalia)
 * 2. DEV_FAKE_USER=true (apenas desenvolvimento)
 *
 * O token do SaaS chega via ?token= da URL (redirecionamento SSO)
 * ou via header Authorization: Bearer <token>.
 */

/** Extrai o token JWT da requisição (query param ou header). */
function extrairToken(req) {
  const queryToken = req.query?.token;
  if (queryToken) return queryToken;

  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * Middleware de autenticação. Preenche req.user com:
 * { id, nome, email, perfis: ['gestor', 'ouvidoria'], organization_id }
 */
function autenticar(req, res, next) {
  // Modo dev: usuário fake (apenas desenvolvimento)
  if (process.env.GOVAVALIA_DEV_FAKE_USER === 'true') {
    req.user = {
      id: 'dev',
      nome: 'Servidor de Teste',
      email: 'dev@govsistem.com.br',
      perfis: [config.papelOuvidoria, config.papelGestor],
      organization_id: 'dev-org'
    };
    return next();
  }

  const token = extrairToken(req);
  if (!token) return next(); // público não exige token

  try {
    const decoded = jwt.verify(token, config.saasJwtSecret, { algorithms: ['HS256'] });

    // Só aceita token do tipo module_access para este módulo
    if (decoded.type !== 'module_access') {
      return next(); // não é token de módulo, ignora
    }
    if (decoded.module && decoded.module !== 'govavalia') {
      return next(); // token de outro módulo
    }

    // Mapeia papéis do SaaS para perfis locais
    const perfis = mapearPerfis(decoded.roles || []);

    req.user = {
      id: decoded.sub,
      nome: decoded.name || 'Usuário',
      email: decoded.email || '',
      perfis,
      organization_id: decoded.organization_id
    };
    return next();
  } catch (e) {
    // Token inválido/expirado: ignora silenciosamente
    next();
  }
}

function mapearPerfis(roles) {
  const perfis = [];
  const r = new Set(roles);
  if (r.has('PLATFORM_ADMIN') || r.has('ADMIN') || r.has('SUPER_ADMIN')) {
    perfis.push(config.papelGestor, config.papelOuvidoria);
    return perfis;
  }
  if (r.has('GOVAVALIA_GESTOR') || r.has(config.papelGestor)) {
    perfis.push(config.papelGestor);
  }
  if (r.has('GOVAVALIA_OUVIDORIA') || r.has(config.papelOuvidoria)) {
    perfis.push(config.papelOuvidoria);
  }
  // Fallback: membro da org vê resumo da pesquisa
  if (perfis.length === 0 && r.has('ORG_MEMBER')) {
    perfis.push(config.papelGestor);
  }
  return [...new Set(perfis)];
}

/** Middleware de proteção para rotas internas (chave compartilhada). */
function requireInternalKey(req, res, next) {
  const key = req.headers['x-internal-key'];
  if (key && key === config.internalApiKey) return next();
  return problem(res, {
    status: 401,
    title: 'Não autorizado',
    detail: 'Internal API key inválida ou ausente.',
    instance: req.originalUrl
  });
}

function requireAuth(req, res, next) {
  if (req.user && req.user.id) return next();
  return problem(res, {
    status: 401,
    title: 'Não autenticado',
    detail: 'Faça login no sistema para acessar o painel.',
    type: 'https://govsistem.com.br/erros/nao-autenticado',
    instance: req.originalUrl
  });
}

function papeisDe(user) {
  const p = user.perfis || user.roles || user.papeis || [];
  return Array.isArray(p) ? p : [p];
}

function requireRole(...papeisNecessarios) {
  return (req, res, next) => {
    const meus = papeisDe(req.user || {});
    if (meus.some(p => papeisNecessarios.includes(p))) return next();
    return problem(res, {
      status: 403,
      title: 'Acesso negado',
      detail: 'Seu perfil não tem permissão para esta área.',
      type: 'https://govsistem.com.br/erros/sem-permissao',
      instance: req.originalUrl
    });
  };
}

const apenasGestor    = [requireAuth, requireRole(config.papelGestor, config.papelOuvidoria)];
const apenasOuvidoria = [requireAuth, requireRole(config.papelOuvidoria)];

module.exports = {
  autenticar,
  extrairToken,
  requireAuth,
  requireRole,
  requireInternalKey,
  apenasGestor,
  apenasOuvidoria,
  mapearPerfis
};
