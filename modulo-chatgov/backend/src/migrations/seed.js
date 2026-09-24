import db from '../db.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export async function seedDemoData() {
  console.log('[Seed] Checking for demo data...');

  const existing = await db.oneOrNone("SELECT id FROM tenants WHERE slug = 'demo'");
  if (existing) {
    console.log('[Seed] Demo tenant already exists, skipping.');
    return;
  }

  const tenantId = uuidv4();
  await db.none(
    "INSERT INTO tenants (id, nome, slug) VALUES ($1, 'Prefeitura Demo', 'demo')",
    [tenantId]
  );
  console.log('[Seed] Created demo tenant:', tenantId);

  const deps = [
    { nome: 'Geral', cor: '#00A884' },
    { nome: 'Saúde', cor: '#FF6B6B' },
    { nome: 'Tributos', cor: '#4ECDC4' },
    { nome: 'Protocolo', cor: '#45B7D1' },
    { nome: 'Obras', cor: '#96CEB4' },
  ];

  for (const dep of deps) {
    const id = uuidv4();
    await db.none(
      'INSERT INTO departamentos (id, tenant_id, nome, cor) VALUES ($1, $2, $3, $4)',
      [id, tenantId, dep.nome, dep.cor]
    );
  }
  console.log('[Seed] Created departments');

  const adminPassword = 'admin123';
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const adminId = uuidv4();

  await db.none(
    `INSERT INTO operadores (id, tenant_id, nome, email, senha_hash, papel)
     VALUES ($1, $2, 'Administrador', 'admin@demo.gov.br', $3, 'admin')`,
    [adminId, tenantId, adminHash]
  );

  const operPassword = 'oper123';
  const operHash = await bcrypt.hash(operPassword, 10);
  const operId = uuidv4();

  await db.none(
    `INSERT INTO operadores (id, tenant_id, nome, email, senha_hash, papel)
     VALUES ($1, $2, 'Atendente', 'operador@demo.gov.br', $3, 'operador')`,
    [operId, tenantId, operHash]
  );

  console.log('[Seed] Created operators:');
  console.log('  admin@demo.gov.br / admin123');
  console.log('  operador@demo.gov.br / oper123');
  console.log('[Seed] Demo data created successfully!');
}
