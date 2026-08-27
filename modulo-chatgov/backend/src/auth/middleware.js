import { verifyToken } from './jwt.js';
import db from '../db.js';
import { ensureTenantProvisioned } from '../services/provisionamento.js';

// Tenants já garantidos neste processo — evita ir ao banco a cada request.
// Um tenant só entra no cache após confirmar/criar a linha em `tenants`.
const tenantsGarantidos = new Set();

// Rede de segurança: garante que a organização do token tenha linha em `tenants`
// antes de qualquer operação. Cobre o caso do sync da plataforma não ter rodado
// (ChatGov fora do ar no 1º acesso, mismatch de INTERNAL_API_KEY, etc.) — sem
// isso a org entra com token válido mas quebra ao gravar (ex.: FK do WhatsApp).
async function garantirTenantProvisionado(op) {
  if (!op?.tenantId || tenantsGarantidos.has(op.tenantId)) return;
  try {
    const existe = await db.oneOrNone('SELECT 1 FROM tenants WHERE id = $1', [op.tenantId]);
    if (!existe) {
      await ensureTenantProvisioned({
        organization_id: op.tenantId,
        name: op.tenantNome,
        slug: op.tenantSlug,
        is_active: true,
      });
      console.log(`[Auth] Tenant ${op.tenantId} provisionado just-in-time (sync da plataforma não havia criado a organização).`);
    }
    tenantsGarantidos.add(op.tenantId);
  } catch (err) {
    // Não bloqueia o login: em caso de falha, o erro real aflora depois, mas não
    // pioramos o request. Não cacheia em falha, para tentar de novo no próximo.
    console.error(`[Auth] Falha ao garantir tenant ${op.tenantId} just-in-time:`, err.message);
  }
}

// Presença da coluna `operadores.ativo` (migration 021), resolvida uma única vez
// por processo: bases antigas ainda não têm a coluna e o SELECT quebraria.
let colunaAtivo = null;
async function temColunaAtivo() {
  if (colunaAtivo !== null) return colunaAtivo;
  try {
    const row = await db.oneOrNone(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'operadores' AND column_name = 'ativo'`
    );
    colunaAtivo = !!row;
  } catch {
    colunaAtivo = false;
  }
  return colunaAtivo;
}

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
    // Segurança: token de módulo só é aceito se emitido para este módulo.
    if (decoded.type === 'module_access' && decoded.module && decoded.module !== 'chatgov') {
      return res.status(401).json({ erro: 'Token de módulo inválido' });
    }
    req.operador = operadorFromToken(decoded);

    if (!req.operador.tenantId) {
      return res.status(401).json({ erro: 'Token sem organização/tenant' });
    }

    await garantirTenantProvisionado(req.operador);

    // Papel e situação vêm sempre do banco para que revogação/desativação
    // produzam efeito no request seguinte, mesmo com JWT ainda válido.
    // `ativo` só existe a partir da migration 021: em base ainda não migrada a
    // coluna é ignorada em vez de derrubar a consulta inteira (antes o catch
    // silencioso engolia o erro e nome/papel nunca vinham do banco).
    if (req.operador.id) {
      try {
        const row = await db.oneOrNone(
          `SELECT nome, papel,
                  ${await temColunaAtivo() ? 'ativo' : 'true AS ativo'}
           FROM operadores WHERE id = $1 AND tenant_id = $2`,
          [req.operador.id, req.operador.tenantId]
        );
        if (row?.ativo === false) return res.status(403).json({ erro: 'Usuário desativado' });
        if (row?.nome) req.operador.nome = row.nome;
        if (row?.papel) req.operador.papel = row.papel;
      } catch (err) {
        console.error('[Auth] Falha ao recarregar operador do banco:', err.message);
      }
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
