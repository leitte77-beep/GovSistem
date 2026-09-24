# Checklist de Deploy Seguro

## Pré-requisitos

- [ ] Servidor Linux (Ubuntu 22.04 LTS+)
- [ ] Docker 24+ e Docker Compose 2.20+
- [ ] Domínio com DNS configurado
- [ ] Certificado TLS (Let's Encrypt)
- [ ] ClamAV instalado (opcional, para varredura de uploads)
- [ ] PostgreSQL 16 (ou usar container gerenciado)
- [ ] MinIO ou S3 compatível para storage
- [ ] Redis 7 para cache/fila

## Segurança

### Antes do Deploy
- [ ] `SECRET_KEY=openssl rand -hex 32` (64 chars hex)
- [ ] `POSTGRES_PASSWORD` forte (32+ chars)
- [ ] `SIGNER_A1_PASSWORD` em cofre de senhas
- [ ] `CORS_ORIGINS` = domínios específicos do portal
- [ ] TLS habilitado no Nginx reverso
- [ ] Rede Docker isolada (`doe-network`)

### Configurações
- [ ] `PASSWORD_MIN_LENGTH=12`
- [ ] `PASSWORD_MAX_FAILURES=5`
- [ ] `PASSWORD_LOCKOUT_MINUTES=30`
- [ ] `ACCESS_TOKEN_EXPIRE_MINUTES=30`
- [ ] `REFRESH_TOKEN_EXPIRE_DAYS=7`
- [ ] `MFA_REQUIRED_ROLES=["ASSINADOR","ADMIN"]`
- [ ] `MAX_UPLOAD_SIZE_MB=50`
- [ ] `LOG_RETENTION_DAYS=365`

### Infraestrutura
- [ ] Container signer isolado (sem bind de porta pública)
- [ ] PostgreSQL bind apenas na rede interna
- [ ] MinIO com Object Lock (WORM)
- [ ] Volume de backups criptografados
- [ ] Nginx com rate limiting global
- [ ] Healthchecks em todos os serviços

## Deploy

### 1. Preparar ambiente
```bash
cp .env.example .env
# Editar .env com valores seguros
```

### 2. Construir e subir
```bash
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
```

### 3. Executar migrações
```bash
docker compose exec api alembic upgrade head
```

### 4. Popular dados iniciais
```bash
docker compose exec api python scripts/seed.py
```

### 5. Verificar healthchecks
```bash
docker compose ps
# Todos os serviços devem estar "healthy"
```

### 6. Configurar Nginx reverso
```nginx
server {
    listen 443 ssl;
    server_name api.diariooficial.gov.br;

    ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://localhost:7200;
    }

    location /admin/ {
        proxy_pass http://localhost:7201;
    }
}
```

## Pós-Deploy

### Verificações
- [ ] Acessar healthcheck: `/api/v1/health`
- [ ] Login funcional
- [ ] Upload de DOCX funcional
- [ ] Geração de PDF funcional
- [ ] Assinatura digital funcional
- [ ] Portal público carregando

### Monitoramento
- [ ] Logs centralizados (ELK/Loki)
- [ ] Métricas de performance (Prometheus)
- [ ] Alertas de falha de healthcheck
- [ ] Monitor de certificado A1 expiração

### Rotinas
- [ ] Backup diário automatizado
- [ ] Rotação de logs semanal
- [ ] Teste de restauração mensal
- [ ] Revisão de contas de usuário trimestral

## Rollback

```bash
# Restaurar versão anterior
docker compose down
git checkout <tag-anterior>
docker compose up -d --build
docker compose exec api alembic downgrade -1
```
