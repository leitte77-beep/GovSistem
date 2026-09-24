import express from 'express';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { verifyToken, signToken } from './jwt.js';
import { ensureTenantProvisioned } from '../services/provisionamento.js';

const router = express.Router();

// Sessão técnica exclusiva dos testes automatizados do compose DEV.
// Não recebe identidade do cliente, não existe sem a flag e nunca é habilitada
// no compose de produção.
router.post('/e2e-session', async (_req, res) => {
  if (process.env.NODE_ENV !== 'development'
      || (process.env.ENABLE_DEV_E2E_AUTH || '').toLowerCase() !== 'true') {
    return res.status(404).json({ erro: 'Rota não encontrada' });
  }
  const operador = await db.oneOrNone(
    `SELECT o.id, o.nome, o.email, o.papel, o.tenant_id AS "tenantId",
            t.nome AS "tenantNome", t.slug AS "tenantSlug"
     FROM operadores o JOIN tenants t ON t.id = o.tenant_id
     WHERE o.papel = 'admin' AND o.ativo = true
     ORDER BY o.criado_em LIMIT 1`
  );
  if (!operador) return res.status(404).json({ erro: 'Administrador DEV não encontrado' });
  const token = signToken({
    sub: operador.id,
    name: operador.nome,
    email: operador.email,
    papel: operador.papel,
    organization_id: operador.tenantId,
    tenantId: operador.tenantId,
    tenantNome: operador.tenantNome,
    tenantSlug: operador.tenantSlug,
    type: 'module_access',
    module: 'chatgov-dev-e2e',
  });
  return res.json({ token, operador });
});

function papelFromRoles(roles = []) {
  if (roles.some((role) => ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ADMIN'].includes(role))) {
    return 'admin';
  }
  if (roles.includes('SUPPORT')) return 'supervisor';
  return 'operador';
}

router.post('/session', async (req, res) => {
  if ((process.env.ENABLE_DEV_SAAS_AUTH || '').toLowerCase() !== 'true') {
    return res.status(404).json({ erro: 'Rota não encontrada' });
  }

  const accessToken = req.body?.access_token;
  if (!accessToken) {
    return res.status(400).json({ erro: 'Token do SaaS não fornecido' });
  }

  try {
    const decoded = verifyToken(accessToken);
    if (decoded.type !== 'access' || !decoded.sub) {
      return res.status(401).json({ erro: 'Token do SaaS inválido' });
    }

    const saasApiUrl = (process.env.SAAS_API_URL || '').replace(/\/$/, '');
    if (!saasApiUrl) throw new Error('SAAS_API_URL não configurada');

    const meResponse = await fetch(`${saasApiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meResponse.ok) {
      return res.status(401).json({ erro: 'Sessão do GovSistem inválida' });
    }

    const user = await meResponse.json();
    if (String(user.id) !== String(decoded.sub)) {
      return res.status(401).json({ erro: 'Identidade do GovSistem divergente' });
    }

    const dashboardResponse = await fetch(`${saasApiUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!dashboardResponse.ok) {
      return res.status(403).json({ erro: 'Não foi possível confirmar os módulos do usuário' });
    }
    const dashboard = await dashboardResponse.json();
    const canAccessChatGov = Array.isArray(dashboard.modules)
      && dashboard.modules.some((module) => module.slug === 'chatgov');
    if (!canAccessChatGov) {
      return res.status(403).json({ erro: 'Usuário sem permissão para acessar o ChatGov' });
    }

    const organizationId = user.organization_id || decoded.organization_id;
    if (!organizationId) {
      return res.status(403).json({ erro: 'Usuário sem órgão vinculado no GovSistem' });
    }

    await ensureTenantProvisioned({
      organization_id: organizationId,
      name: user.organization_name,
      slug: user.organization_slug,
      is_active: true,
    });

    const roles = Array.isArray(decoded.roles) ? decoded.roles : [];
    const papel = papelFromRoles(roles);
    const email = String(user.email || '').toLowerCase().trim();
    const nome = user.name || user.nome || 'Usuário GovSistem';

    const existing = await db.oneOrNone(
      'SELECT id FROM operadores WHERE id = $1 OR (tenant_id = $2 AND email = $3)',
      [user.id, organizationId, email]
    );

    let operadorId = user.id;
    if (existing) {
      operadorId = existing.id;
      await db.none(
        `UPDATE operadores
         SET tenant_id = $1, nome = $2, email = $3, papel = $4
         WHERE id = $5`,
        [organizationId, nome, email, papel, operadorId]
      );
    } else {
      const placeholderHash = await bcrypt.hash(randomUUID(), 10);
      await db.none(
        `INSERT INTO operadores (id, tenant_id, nome, email, senha_hash, papel)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [operadorId, organizationId, nome, email, placeholderHash, papel]
      );

      const deptGeral = await db.oneOrNone(
        "SELECT id FROM departamentos WHERE tenant_id = $1 AND nome = 'Geral' AND ativo = true",
        [organizationId]
      );
      if (deptGeral) {
        await db.none(
          `INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [operadorId, deptGeral.id, organizationId]
        );
      }
    }

    const token = signToken({
      sub: operadorId,
      name: nome,
      email,
      roles,
      papel,
      organization_id: organizationId,
      tenantId: organizationId,
      tenantNome: user.organization_name || '',
      tenantSlug: user.organization_slug || '',
      type: 'module_access',
      module: 'chatgov-dev',
    });

    return res.json({
      token,
      operador: {
        id: operadorId,
        nome,
        email,
        papel,
        tenantId: organizationId,
        tenantNome: user.organization_name || '',
        tenantSlug: user.organization_slug || '',
      },
    });
  } catch (err) {
    console.error('[Dev SaaS Auth] Erro:', err.message);
    return res.status(401).json({ erro: 'Não foi possível validar o acesso no GovSistem' });
  }
});

export default router;
