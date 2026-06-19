'use strict';
/**
 * Servidor do módulo GovAvalia.
 *
 * Duas portas de entrada:
 *   Host = govavalia.govsistem.com.br  →  painel da equipe (admin, protegido por JWT SSO)
 *   demais hosts                        →  tela pública em /avalia (tablets, sem login)
 */
const express = require('express');
const config = require('./config');
const {
  aplicarSeguranca, criarRouterPublico, criarRouterAdmin, tratadorDeErros
} = require('./app');
const { autenticar } = require('./auth');
const internalRoutes = require('./routes/internal');
const { anonimizarContatosExpirados } = require('./services/retencao');

const app = express();
aplicarSeguranca(app);

// Autenticação JWT do SaaS GovSistem (via ?token= ou Authorization header)
app.use(autenticar);

// Rotas internas de sincronização com a plataforma SaaS
app.use('/internal', internalRoutes);

const routerPublico = criarRouterPublico();
const routerAdmin = criarRouterAdmin();

// Roteamento por domínio.
app.use((req, res, next) => {
  if (req.hostname === config.dominioAdmin) return routerAdmin(req, res, next);
  next();
});
app.use(config.basePathPublico, routerPublico);
app.get('/', (req, res) => res.redirect(config.basePathPublico));

app.use(tratadorDeErros);

app.listen(config.port, () => {
  console.log(`[govavalia] no ar na porta ${config.port}`);
  console.log(`  público: http://localhost:${config.port}${config.basePathPublico}`);
  console.log(`  admin:   ${config.dominioAdmin} (protegido por SSO GovSistem)`);
});

// Rotina de retenção: roda 1x ao dia (anonimiza contatos vencidos).
setInterval(() => {
  anonimizarContatosExpirados().catch(e =>
    console.error('[govavalia] retenção falhou:', e.message));
}, 24 * 60 * 60 * 1000);
