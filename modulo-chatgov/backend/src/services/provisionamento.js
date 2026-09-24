import db from '../db.js';

// Normaliza um slug: se vier vazio, deriva um estável a partir do id da org
// (o slug é UNIQUE NOT NULL, então nunca pode faltar). Slugs reais vindos da
// plataforma (ex.: "social") passam praticamente intactos.
function normalizarSlug(slug, organizationId, nome) {
  const base = (slug || nome || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `org-${String(organizationId).slice(0, 8)}`;
}

/**
 * Provisiona (idempotente) uma organização como tenant do ChatGov: cria/atualiza
 * o tenant e garante a secretaria "Geral" + departamentos "Geral" e "Recepção".
 *
 * Reutilizado por dois caminhos:
 *   1. Endpoint /api/internal/sync-organization (chamado pela plataforma no SSO).
 *   2. Provisionamento just-in-time no authMiddleware — rede de segurança para
 *      quando o sync da plataforma não tiver rodado (ex.: ChatGov fora do ar no
 *      primeiro acesso, ou mismatch de INTERNAL_API_KEY). Sem isso, a organização
 *      entra com token válido mas sem linha em `tenants`, e qualquer gravação
 *      ligada a tenant_id (ex.: whatsapp_sessoes) falha por foreign key.
 *
 * name/slug podem vir parciais (o token module_access nem sempre traz os dois);
 * a função aplica fallbacks para não quebrar. Um sync posterior com dados
 * completos corrige nome/slug via UPDATE.
 */
export async function ensureTenantProvisioned({ organization_id, name, slug, is_active = true }) {
  if (!organization_id) throw new Error('organization_id obrigatório');

  const slugFinal = normalizarSlug(slug, organization_id, name);
  const nomeFinal =
    (name && name.toString().trim()) ||
    (slug && slug.toString().trim()) ||
    `Organização ${String(organization_id).slice(0, 8)}`;
  const ativo = is_active !== false;

  const existing = await db.oneOrNone(
    'SELECT id FROM tenants WHERE id = $1 OR slug = $2',
    [organization_id, slugFinal]
  );

  if (!existing) {
    await db.none(
      'INSERT INTO tenants (id, nome, slug, ativo) VALUES ($1, $2, $3, $4)',
      [organization_id, nomeFinal, slugFinal, ativo]
    );
  } else {
    await db.none(
      'UPDATE tenants SET nome = $1, slug = $2, ativo = $3 WHERE id = $4',
      [nomeFinal, slugFinal, ativo, existing.id]
    );
  }

  let secGeral = await db.oneOrNone(
    "SELECT id FROM secretarias WHERE tenant_id = $1 AND nome = 'Geral'",
    [organization_id]
  );
  if (!secGeral) {
    secGeral = await db.one(
      "INSERT INTO secretarias (tenant_id, nome, cor) VALUES ($1, 'Geral', '#2563EB') RETURNING id",
      [organization_id]
    );
  }

  const depGeral = await db.oneOrNone(
    "SELECT id, secretaria_id, ativo FROM departamentos WHERE tenant_id = $1 AND nome = 'Geral' ORDER BY ativo DESC, criado_em DESC LIMIT 1",
    [organization_id]
  );
  if (!depGeral) {
    await db.none(
      "INSERT INTO departamentos (tenant_id, nome, cor, secretaria_id) VALUES ($1, 'Geral', '#2563EB', $2)",
      [organization_id, secGeral.id]
    );
  } else {
    const updates = [];
    if (!depGeral.ativo) updates.push('ativo = true');
    if (!depGeral.secretaria_id) updates.push(`secretaria_id = '${secGeral.id}'`);
    if (updates.length > 0) {
      await db.none(`UPDATE departamentos SET ${updates.join(', ')} WHERE id = $1`, [depGeral.id]);
    }
  }

  const depRecepcao = await db.oneOrNone(
    "SELECT id FROM departamentos WHERE tenant_id = $1 AND LOWER(nome) = 'recepção' AND ativo = true",
    [organization_id]
  );
  if (!depRecepcao) {
    await db.none(
      "INSERT INTO departamentos (tenant_id, nome, cor, secretaria_id) VALUES ($1, 'Recepção', '#00A884', $2)",
      [organization_id, secGeral.id]
    );
  }

  return organization_id;
}
