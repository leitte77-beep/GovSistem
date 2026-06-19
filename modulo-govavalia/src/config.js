'use strict';
/**
 * Configuração do módulo. Tudo vem de variável de ambiente — nenhum segredo
 * no código/repositório (exigência de segurança do setor público).
 */
module.exports = {
  port: parseInt(process.env.GOVAVALIA_PORT || '4000', 10),

  databaseUrl: process.env.DATABASE_URL,

  // Caminho da tela pública nos tablets: www.govsistem.com.br/avalia
  basePathPublico: process.env.GOVAVALIA_BASE_PATH || '/avalia',

  // Domínio do painel da equipe: govavalia.govsistem.com.br
  dominioAdmin: process.env.GOVAVALIA_ADMIN_DOMAIN || 'govavalia.govsistem.com.br',

  // Origens CORS
  origensPermitidas: (process.env.GOVAVALIA_ALLOWED_ORIGINS ||
    'https://govsistem.com.br,https://govavalia.govsistem.com.br')
    .split(',').map(s => s.trim()).filter(Boolean),

  // Segredo usado pelo SaaS GovSistem para assinar tokens JWT
  saasJwtSecret: process.env.GOVAVALIA_SAAS_JWT_SECRET ||
    process.env.SAAS_JWT_SECRET ||
    'dev-saas-secret-key-change-in-production',

  // Chave para endpoints internos de sincronização
  internalApiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key-123',

  papelGestor:   process.env.GOVAVALIA_ROLE_GESTOR   || 'gestor',
  papelOuvidoria: process.env.GOVAVALIA_ROLE_OUVIDORIA || 'ouvidoria',

  retencaoContatoDias: parseInt(process.env.GOVAVALIA_RETENCAO_CONTATO_DIAS || '365', 10),

  tratamento: {
    finalidade: 'Avaliar e melhorar os serviços públicos de saúde do município.',
    baseLegal: 'Execução de política pública (art. 7º, III, LGPD) e Lei 13.460/2017.'
  },

  escala: [
    { valor: 1, rotulo: 'Ruim',    face: '🙁' },
    { valor: 2, rotulo: 'Regular', face: '😐' },
    { valor: 3, rotulo: 'Bom',     face: '🙂' }
  ],

  tiposManifestacao: [
    { id: 'elogio',      rotulo: 'Elogio',     icone: '👍', dica: 'Quero elogiar um atendimento ou pessoa' },
    { id: 'reclamacao',  rotulo: 'Reclamação', icone: '⚠️', dica: 'Quero reclamar de algo que aconteceu' },
    { id: 'sugestao',    rotulo: 'Sugestão',   icone: '💡', dica: 'Tenho uma ideia para melhorar' },
    { id: 'solicitacao', rotulo: 'Pedido',     icone: '📩', dica: 'Preciso pedir alguma coisa' },
    { id: 'denuncia',    rotulo: 'Denúncia',   icone: '🛡️', dica: 'Quero denunciar uma irregularidade' }
  ]
};
