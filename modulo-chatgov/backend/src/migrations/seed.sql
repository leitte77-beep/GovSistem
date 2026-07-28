# SQL para criar tenant de exemplo e operador admin
# Execute apos rodar as migrations: make chatgov-migrate

-- Criar tenant de exemplo
INSERT INTO tenants (nome, slug) VALUES ('Prefeitura de Exemplo', 'prefeitura-exemplo');

-- Criar departamentos
INSERT INTO departamentos (tenant_id, nome, cor) VALUES
  ((SELECT id FROM tenants WHERE slug = 'prefeitura-exemplo'), 'Geral', '#00A884');

-- Criar operador admin (senha: admin123)
-- O hash bcrypt sera gerado pelo seed endpoint ou pode ser gerado via Node.js

-- Nota: use o endpoint POST /api/admin/seed para criar os dados iniciais via API
