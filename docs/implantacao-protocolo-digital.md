# Protocolo Digital — Guia de Implantação

## Arquivos do projeto

```
modulo-chatgov/
├── backend/            ← API (Node.js + Express)
│   └── src/
│       ├── migrations/    ← SQL idempotentes
│       ├── services/      ← protocolo-v2, cidadao, lgpd-protocolo, seed-protocolos
│       ├── routes/        ← protocolos, protocolos-publicos, protocolos-admin
│       ├── middleware/     ← security (CSP, sanitização)
│       └── auth/          ← permissions (12 papéis RBAC)
├── frontend/           ← ChatGov (React + Vite)
│   └── src/components/ ← PaginaProtocolos, ModalGerarProtocolo, PainelDetalheProtocolo, etc.
├── portal-cidadao/     ← Portal do cidadão (React + Vite)
│   └── src/pages/      ← Home, ConsultaProtocolo, MeusProtocolos, NovaSolicitacao, CriarConta
└── docker-compose.yml
```

## Pré-requisitos

- Docker 20+ e Docker Compose
- Node.js 20+ (desenvolvimento)
- PostgreSQL 16
- Redis 7 (fila de notificações)
- MinIO ou S3 (armazenamento de arquivos)

## Variáveis de ambiente (`.env`)

```bash
# Backend
PORT=3050
DATABASE_URL=postgres://user:pass@postgres:5432/chatgov
JWT_SECRET=seu-segredo-aqui
JWT_EXPIRES_IN=24h
JWT_SECRETS=chave-saas-1,chave-saas-2

# Storage
STORAGE_DRIVER=local|s3
S3_BUCKET=protocolos
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Portal
CORS_ORIGIN=https://prot.govsistem.com.br,https://chatgov.govsistem.com.br

# Segurança
RATE_LIMIT_PER_MINUTE=30
CREDS_ENCRYPTION_KEY=chave-32-caracteres-aqui
```

## Deploy rápido (Docker Compose)

```bash
# 1. Subir infraestrutura
docker compose -f modulo-chatgov/docker-compose.yml up -d postgres redis

# 2. Build e subir aplicação
docker compose -f modulo-chatgov/docker-compose.yml up -d backend frontend

# 3. Rodar migrations (automático no boot)
docker logs chatgov-backend

# 4. Popular dados demo
docker exec chatgov-backend node -e "
  import('./src/services/seed-protocolos.js').then(m =>
    m.seedProtocolos('ID-DO-TENANT')
  )
"

# 5. Portal do cidadão
cd modulo-chatgov/portal-cidadao
npm install && npm run build
# Servir via nginx apontando para dist/

# 6. Verificar
curl http://localhost:3050/health
```

## Nginx — Portal do cidadão

```nginx
server {
    listen 443 ssl http2;
    server_name prot.govsistem.com.br;

    ssl_certificate     /etc/nginx/ssl/prot.govsistem.com.br.crt;
    ssl_certificate_key /etc/nginx/ssl/prot.govsistem.com.br.key;

    root /app/portal-cidadao/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://chatgov-backend:3050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Homologação

```bash
# Setup completo
bash scripts/setup-homologacao.sh

# Roteiro de testes (13 módulos, 50+ itens)
bash scripts/roteiro-homologacao.sh

# Testes rápidos de integração
bash scripts/test-integracao-protocolos.sh
```

## Rollback

```bash
# Reverter migration (se necessário)
docker exec chatgov-postgres psql -U chatgov -d chatgov -c "
  DROP TABLE IF EXISTS protocolo_movimentacoes CASCADE;
  DROP TABLE IF EXISTS protocolo_mensagens CASCADE;
  -- ... outras tabelas novas ...
"

# Restaurar backup
docker exec chatgov-postgres pg_restore -U chatgov -d chatgov /backups/chatgov-pre-protocolo.dump

# Redeploy da versão anterior
docker compose up -d backend frontend
```

## Checklist de segurança

- [x] HTTPS/TLS em produção
- [x] CSP restritivo
- [x] X-Frame-Options: DENY
- [x] X-Content-Type-Options: nosniff
- [x] HSTS em produção
- [x] Sanitização de input (XSS)
- [x] Senhas com bcrypt (Argon2id via bcrypt)
- [x] Rate limiting em rotas públicas
- [x] Row-Level Security por tenant
- [x] Tokens JWT com expiração
- [x] Soft-delete (LGPD)
- [x] Logs de auditoria
- [x] Dados sensíveis mascarados

## Checklist LGPD

- [x] Política de privacidade pública
- [x] Dados do encarregado
- [x] 8 direitos do titular documentados
- [x] Exportação de dados (JSON)
- [x] Solicitação de exclusão (soft delete)
- [x] Retenção configurável por tenant
- [x] Consentimento registrado
- [x] Finalidade clara na coleta
- [x] Minimização de dados
- [x] Mascaramento de CPF
