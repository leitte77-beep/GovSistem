'use strict';
/**
 * Rotas internas de sincronização com a plataforma SaaS GovSistem.
 * Endpoints protegidos por X-Internal-Key — usados pelo módulo-access.
 */
const express = require('express');
const { pool } = require('../db');
const { requireInternalKey } = require('../auth');

const router = express.Router();

// Toda rota interna exige X-Internal-Key
router.use(requireInternalKey);

/**
 * POST /internal/sync-organization
 * Upsert da organização (prefeitura) no módulo govavalia.
 */
router.post('/sync-organization', async (req, res, next) => {
  try {
    const { organization_id, name, slug, cnpj, description, logo_url, public_url, is_active } = req.body || {};
    if (!organization_id || !name || !slug) {
      return res.status(422).json({ error: 'organization_id, name e slug são obrigatórios' });
    }

    const { rows } = await pool.query(`
      INSERT INTO govavalia.organizacoes (id, nome, slug, cnpj, logo_url, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (slug) DO UPDATE SET
        nome = EXCLUDED.nome,
        cnpj = COALESCE(EXCLUDED.cnpj, govavalia.organizacoes.cnpj),
        logo_url = COALESCE(EXCLUDED.logo_url, govavalia.organizacoes.logo_url),
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id, slug, nome`,
      [organization_id, name, slug, cnpj || null, logo_url || null, is_active !== false]
    );

    res.json({ organization_id: rows[0].id, slug: rows[0].slug });
  } catch (e) { next(e); }
});

/**
 * POST /internal/sync-user
 * Upsert do usuário no módulo govavalia, com seus papéis (roles).
 */
router.post('/sync-user', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { user_id, organization_id, name, email, is_active, roles } = req.body || {};
    if (!user_id || !organization_id || !name || !email) {
      return res.status(422).json({ error: 'user_id, organization_id, name e email são obrigatórios' });
    }

    await client.query('BEGIN');

    // Upsert usuário
    const { rows } = await client.query(`
      INSERT INTO govavalia.usuarios (id, organization_id, nome, email, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (email) DO UPDATE SET
        id = EXCLUDED.id,
        organization_id = EXCLUDED.organization_id,
        nome = EXCLUDED.nome,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id, email`,
      [user_id, organization_id, name, email, is_active !== false]
    );

    const uid = rows[0].id;

    // Remove papéis antigos e insere os novos
    await client.query('DELETE FROM govavalia.usuario_perfil WHERE usuario_id = $1', [uid]);

    const perfis = mapearRolesParaPerfis(roles || []);
    for (const perfil of perfis) {
      await client.query(
        'INSERT INTO govavalia.usuario_perfil (usuario_id, perfil) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [uid, perfil]
      );
    }

    await client.query('COMMIT');
    res.json({ user_id: uid, email });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

/**
 * Mapeia papéis do SaaS GovSistem para os perfis locais do módulo:
 * - PLATFORM_ADMIN / ADMIN / SUPER_ADMIN → gestor + ouvidoria
 * - GOVAVALIA_GESTOR                  → gestor
 * - GOVAVALIA_OUVIDORIA               → ouvidoria
 * - ORG_MEMBER                        → gestor (vê resumo da pesquisa)
 */
function mapearRolesParaPerfis(roles) {
  const r = new Set(roles);
  const perfis = [];
  if (r.has('PLATFORM_ADMIN') || r.has('SUPER_ADMIN') || r.has('ADMIN')) {
    return ['gestor', 'ouvidoria'];
  }
  if (r.has('GOVAVALIA_GESTOR')) perfis.push('gestor');
  if (r.has('GOVAVALIA_OUVIDORIA'))  perfis.push('ouvidoria');
  if (perfis.length === 0 && r.has('ORG_MEMBER')) perfis.push('gestor');
  return [...new Set(perfis)];
}

module.exports = router;
