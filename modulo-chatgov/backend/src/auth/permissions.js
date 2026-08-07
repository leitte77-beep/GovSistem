export const PERMISSIONS = Object.freeze({
  // Conversas
  CONVERSAS_VIEW: 'conversas.visualizar',
  CONVERSAS_REPLY: 'conversas.responder',
  CONVERSAS_TRANSFER: 'conversas.transferir',
  CONVERSAS_RETURN: 'conversas.devolver',
  CONVERSAS_RESOLVE: 'conversas.resolver',
  CONVERSAS_REOPEN: 'conversas.reabrir',
  CONVERSAS_ARCHIVE: 'conversas.arquivar',
  CONTACTS_BLOCK: 'contatos.bloquear',

  // Protocolos — Visualização
  PROTOCOLOS_VIEW: 'protocolos.visualizar',
  PROTOCOLOS_VIEW_ALL: 'protocolos.visualizar_todos',
  PROTOCOLOS_VIEW_SENSITIVE: 'protocolos.visualizar_dados_sensiveis',
  PROTOCOLOS_VIEW_RESTRICTED: 'protocolos.visualizar_restritos',

  // Protocolos — Criação e Edição
  PROTOCOLOS_CREATE: 'protocolos.criar',
  PROTOCOLOS_EDIT: 'protocolos.editar',
  PROTOCOLOS_DELETE: 'protocolos.excluir',
  PROTOCOLOS_MANAGE: 'protocolos.gerenciar',

  // Protocolos — Mensagens
  PROTOCOLOS_MESSAGE_PUBLIC: 'protocolos.mensagem_publica',
  PROTOCOLOS_MESSAGE_INTERNAL: 'protocolos.anotacao_interna',

  // Protocolos — Documentos
  PROTOCOLOS_DOC_UPLOAD: 'protocolos.documento.anexar',
  PROTOCOLOS_DOC_VIEW: 'protocolos.documento.visualizar',
  PROTOCOLOS_DOC_DOWNLOAD: 'protocolos.documento.baixar',
  PROTOCOLOS_DOC_APPROVE: 'protocolos.documento.aprovar',
  PROTOCOLOS_DOC_REJECT: 'protocolos.documento.rejeitar',
  PROTOCOLOS_DOC_DELETE: 'protocolos.documento.excluir',
  PROTOCOLOS_DOC_SIGN: 'protocolos.documento.assinar',
  PROTOCOLOS_DOC_EMIT: 'protocolos.documento.emitir',
  // Tornar um documento visível ao cidadão no portal — decidir o que sai da
  // prefeitura é diferente de apenas aprovar o documento internamente.
  PROTOCOLOS_DOC_RELEASE: 'protocolos.documento.liberar',

  // Protocolos — Tramitação
  PROTOCOLOS_FORWARD: 'protocolos.tramitar',
  PROTOCOLOS_RECEIVE: 'protocolos.receber',
  PROTOCOLOS_RETURN: 'protocolos.devolver',
  PROTOCOLOS_ASSIGN: 'protocolos.atribuir',

  // Protocolos — Status
  PROTOCOLOS_COMPLETE: 'protocolos.concluir',
  PROTOCOLOS_CANCEL: 'protocolos.cancelar',
  PROTOCOLOS_REOPEN: 'protocolos.reabrir',
  PROTOCOLOS_ARCHIVE: 'protocolos.arquivar',
  PROTOCOLOS_CHANGE_PRIORITY: 'protocolos.alterar_prioridade',
  PROTOCOLOS_CHANGE_DEADLINE: 'protocolos.alterar_prazo',

  // Protocolos — Pendências
  PROTOCOLOS_PENDING_CREATE: 'protocolos.pendencia.criar',
  PROTOCOLOS_PENDING_RESOLVE: 'protocolos.pendencia.resolver',

  // Protocolos — Relacionamentos
  PROTOCOLOS_LINK: 'protocolos.vincular',

  // Administração
  PROTOCOLOS_ADMIN_SERVICES: 'protocolos.admin.servicos',
  PROTOCOLOS_ADMIN_CATEGORIES: 'protocolos.admin.categorias',
  PROTOCOLOS_ADMIN_TYPES: 'protocolos.admin.tipos',
  PROTOCOLOS_ADMIN_STATUS: 'protocolos.admin.status',
  PROTOCOLOS_ADMIN_SLA: 'protocolos.admin.sla',
  PROTOCOLOS_ADMIN_TEMPLATES: 'protocolos.admin.templates',
  PROTOCOLOS_ADMIN_SETTINGS: 'protocolos.admin.configuracoes',

  // Relatórios e Exportação
  RELATORIOS_VIEW: 'relatorios.visualizar',
  EXPORT: 'dados.exportar',

  // Auditoria
  AUDIT_VIEW: 'auditoria.visualizar',

  // Outros
  TEMPLATES_MANAGE: 'templates.gerenciar',
  IRIS_MANAGE: 'iris.gerenciar',
  CHATBOT_MANAGE: 'chatbot.gerenciar',
  USERS_MANAGE: 'usuarios.gerenciar',
  DEPARTMENTS_MANAGE: 'departamentos.gerenciar',
  CHANNELS_MANAGE: 'canais.gerenciar',
  SENSITIVE_VIEW: 'dados_sensiveis.visualizar',
  REPORTS_VIEW: 'relatorios.visualizar',
  SETTINGS_MANAGE: 'configuracoes.gerenciar',
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: ['*'],
  supervisor: [
    'conversas.*', 'protocolos.*',
    'dados_sensiveis.visualizar', 'dados.exportar',
    'relatorios.visualizar', 'auditoria.visualizar',
  ],
  gestor_departamento: [
    'conversas.*',
    'protocolos.visualizar', 'protocolos.visualizar_todos',
    'protocolos.criar', 'protocolos.editar',
    'protocolos.mensagem_publica', 'protocolos.anotacao_interna',
    'protocolos.documento.anexar', 'protocolos.documento.visualizar',
    'protocolos.documento.baixar', 'protocolos.documento.aprovar',
    'protocolos.documento.rejeitar', 'protocolos.documento.assinar',
    'protocolos.documento.liberar',
    'protocolos.tramitar', 'protocolos.receber', 'protocolos.devolver',
    'protocolos.atribuir', 'protocolos.concluir', 'protocolos.reabrir',
    'protocolos.arquivar', 'protocolos.alterar_prioridade',
    'protocolos.pendencia.criar', 'protocolos.pendencia.resolver',
    'protocolos.vincular',
    'relatorios.visualizar', 'templates.gerenciar',
  ],
  operador: [
    'conversas.visualizar', 'conversas.responder',
    'conversas.transferir', 'conversas.resolver',
    'protocolos.visualizar', 'protocolos.criar',
    'protocolos.mensagem_publica', 'protocolos.anotacao_interna',
    'protocolos.documento.anexar', 'protocolos.documento.visualizar',
    'protocolos.documento.baixar', 'protocolos.documento.liberar',
    'protocolos.tramitar', 'protocolos.receber',
    'protocolos.concluir', 'protocolos.reabrir',
    'protocolos.pendencia.criar',
    'protocolos.gerenciar',
  ],
  atendente: [
    'conversas.visualizar', 'conversas.responder',
    'conversas.transferir', 'conversas.resolver',
    'protocolos.visualizar', 'protocolos.criar',
    'protocolos.mensagem_publica',
    'protocolos.documento.anexar', 'protocolos.documento.visualizar',
    'protocolos.tramitar', 'protocolos.receber',
    'protocolos.gerenciar',
  ],
  auditor: [
    'conversas.visualizar',
    'protocolos.visualizar', 'protocolos.visualizar_todos',
    'protocolos.visualizar_dados_sensiveis',
    'protocolos.documento.visualizar',
    'relatorios.visualizar', 'auditoria.visualizar',
  ],
  operador_ia: [
    'conversas.visualizar',
    'protocolos.visualizar', 'protocolos.criar',
    'protocolos.mensagem_publica',
    'iris.gerenciar', 'chatbot.gerenciar', 'templates.gerenciar',
  ],
  visualizador: [
    'conversas.visualizar',
    'protocolos.visualizar',
    'relatorios.visualizar',
  ],
});

// Papéis especiais mapeados do SaaS
const ROLE_MAP_SAAS = {
  SUPER_ADMIN: 'admin',
  PLATFORM_ADMIN: 'admin',
  ADMIN: 'admin',
  SUPPORT: 'supervisor',
  MANAGER: 'gestor_departamento',
  AUDITOR: 'auditor',
  OPERATOR: 'operador',
  ATTENDANT: 'atendente',
  VIEWER: 'visualizador',
};

export function mapSaasRoleToPapel(saasRoles) {
  if (!Array.isArray(saasRoles)) return 'operador';
  for (const r of ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ADMIN']) {
    if (saasRoles.includes(r)) return 'admin';
  }
  for (const r of ['SUPPORT']) {
    if (saasRoles.includes(r)) return 'supervisor';
  }
  for (const r of ['MANAGER']) {
    if (saasRoles.includes(r)) return 'gestor_departamento';
  }
  for (const r of ['AUDITOR']) {
    if (saasRoles.includes(r)) return 'auditor';
  }
  for (const r of ['VIEWER']) {
    if (saasRoles.includes(r)) return 'visualizador';
  }
  if (saasRoles.includes('ATTENDANT')) return 'atendente';
  return 'operador';
}

export function hasPermission(role, permission) {
  const grants = ROLE_PERMISSIONS[role] || [];
  return grants.some((grant) => grant === '*' || grant === permission
    || (grant.endsWith('.*') && permission.startsWith(grant.slice(0, -1))));
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.operador?.papel, permission)) {
      return res.status(403).json({ erro: 'Permissão insuficiente', permissao: permission });
    }
    next();
  };
}

export function getAvailablePermissions(role) {
  return Object.values(PERMISSIONS).filter(p => hasPermission(role, p));
}
