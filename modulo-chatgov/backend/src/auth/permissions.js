export const PERMISSIONS = Object.freeze({
  CONVERSAS_VIEW: 'conversas.visualizar',
  CONVERSAS_REPLY: 'conversas.responder',
  CONVERSAS_TRANSFER: 'conversas.transferir',
  CONVERSAS_RETURN: 'conversas.devolver',
  CONVERSAS_RESOLVE: 'conversas.resolver',
  CONVERSAS_REOPEN: 'conversas.reabrir',
  CONVERSAS_ARCHIVE: 'conversas.arquivar',
  CONTACTS_BLOCK: 'contatos.bloquear',
  PROTOCOLOS_MANAGE: 'protocolos.gerenciar',
  TEMPLATES_MANAGE: 'templates.gerenciar',
  IRIS_MANAGE: 'iris.gerenciar',
  CHATBOT_MANAGE: 'chatbot.gerenciar',
  USERS_MANAGE: 'usuarios.gerenciar',
  DEPARTMENTS_MANAGE: 'departamentos.gerenciar',
  CHANNELS_MANAGE: 'canais.gerenciar',
  SENSITIVE_VIEW: 'dados_sensiveis.visualizar',
  EXPORT: 'dados.exportar',
  REPORTS_VIEW: 'relatorios.visualizar',
  SETTINGS_MANAGE: 'configuracoes.gerenciar',
  AUDIT_VIEW: 'auditoria.visualizar',
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: ['*'],
  supervisor: [
    'conversas.*', 'protocolos.*', 'dados_sensiveis.visualizar',
    'dados.exportar', 'relatorios.visualizar', 'auditoria.visualizar',
  ],
  gestor_departamento: ['conversas.*', 'protocolos.*', 'relatorios.visualizar', 'templates.gerenciar'],
  operador: [
    'conversas.visualizar', 'conversas.responder', 'conversas.transferir',
    'conversas.resolver', 'protocolos.gerenciar',
  ],
  auditor: ['conversas.visualizar', 'relatorios.visualizar', 'auditoria.visualizar'],
  operador_ia: ['conversas.visualizar', 'iris.gerenciar', 'chatbot.gerenciar', 'templates.gerenciar'],
});

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
