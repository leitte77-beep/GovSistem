import { verifyToken } from './jwt.js';
import db from '../db.js';

export function operadorFromToken(decoded) {
  if (decoded.type === 'module_access') {
    return {
      id: decoded.sub,
      nome: decoded.name || decoded.nome || 'Operador',
      email: decoded.email || '',
      papel: mapRolesToPapel(decoded.roles || []),
      tenantId: decoded.organization_id || decoded.tenantId || decoded.tenant_id,
      tenantNome: decoded.org_name || decoded.tenantNome || decoded.tenant_name || '',
      tenantSlug: decoded.org_slug || decoded.tenantSlug || decoded.tenant_slug || '',
    };
  }

  return {
    id: decoded.sub,
    nome: decoded.nome || decoded.name || 'Operador',
    email: decoded.email || '',
    papel: decoded.papel || decoded.role || mapRolesToPapel(decoded.roles || []),
    tenantId: decoded.tenantId || decoded.organization_id || decoded.tenant_id,
    tenantNome: decoded.tenantNome || decoded.org_name || decoded.tenant_name || '',
    tenantSlug: decoded.tenantSlug || decoded.org_slug || decoded.tenant_slug || '',
  };
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const token = header.substring(7);
  try {
    const decoded = verifyToken(token);
    req.operador = operadorFromToken(decoded);

    if (!req.operador.tenantId) {
      return res.status(401).json({ erro: 'Token sem organização/tenant' });
    }

    if ((!req.operador.nome || req.operador.nome === 'Operador') && req.operador.id) {
      try {
        const row = await db.oneOrNone(
          'SELECT nome, papel FROM operadores WHERE id = $1',
          [req.operador.id]
        );
        if (row?.nome) req.operador.nome = row.nome;
        if (row?.papel) req.operador.papel = row.papel;
      } catch { /* silencioso */ }
    }

    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function mapRolesToPapel(roles) {
  if (roles.some(r => ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ADMIN'].includes(r))) {
    return 'admin';
  }
  return 'operador';
}

export function requirePapel(...papeis) {
  return (req, res, next) => {
    if (!req.operador) {
      return res.status(401).json({ erro: 'Não autenticado' });
    }
    if (!papeis.includes(req.operador.papel)) {
      return res.status(403).json({ erro: 'Acesso não autorizado para este papel' });
    }
    next();
  };
}
