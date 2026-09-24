# Guia de Deploy para Produção

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Checklist de DNS](#2-checklist-de-dns)
3. [Variáveis de Ambiente](#3-variáveis-de-ambiente)
4. [Checklist de Storage](#4-checklist-de-storage)
5. [Checklist do Certificado A1](#5-checklist-do-certificado-a1)
6. [Deploy dos Serviços](#6-deploy-dos-serviços)
7. [Migração Automatizada](#7-migração-automatizada)
8. [Criação do Primeiro ADMIN](#8-criação-do-primeiro-admin)
9. [Checklist de Backup](#9-checklist-de-backup)
10. [Procedimento de Publicação da Primeira Edição](#10-procedimento-de-publicação-da-primeira-edição)
11. [Monitoramento e Alertas](#11-monitoramento-e-alertas)
12. [Rollback](#12-rollback)

---

## 1. Pré-requisitos

### Hardware mínimo

| Componente | Especificação |
|---|---|
| CPU | 4 vCPUs |
| RAM | 8 GB |
| Disco | 50 GB SSD (expansível) |
| SO | Ubuntu 22.04 LTS ou superior |
| Docker | 24+ |
| Docker Compose | 2.20+ |
| Domínios | `diariooficial.gov.br`, `admin.diariooficial.gov.br`, `api.diariooficial.gov.br` |

### Portas necessárias

| Porta | Serviço | Pública |
|---|---|---|
| 80 | HTTP redirect | Sim |
| 443 | HTTPS (Nginx) | Sim |
| 5432 | PostgreSQL | Não |
| 6379 | Redis | Não |
| 9000 | MinIO API | Não |
| 9001 | MinIO Console | Não (ou VPN) |

### Instalação inicial

```bash
# Atualizar sistema
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin curl wget

# Verificar instalação
docker --version
docker compose version

# Criar diretório do projeto
mkdir -p /opt/doe
cd /opt/doe
```

---

## 2. Checklist de DNS

| Domínio | Tipo | Valor | Propagado |
|---|---|---|---|
| `diariooficial.gov.br` | A | `SERVER_IP` | ✅ / ❌ |
| `admin.diariooficial.gov.br` | CNAME | `diariooficial.gov.br` | ✅ / ❌ |
| `api.diariooficial.gov.br` | CNAME | `diariooficial.gov.br` | ✅ / ❌ |
| `www.diariooficial.gov.br` | CNAME | `diariooficial.gov.br` | ✅ / ❌ |
| `_dmarc.diariooficial.gov.br` | TXT | `v=DMARC1; p=quarantine;` | ✅ / ❌ |
| `_smtp._tls.diariooficial.gov.br` | TLS | MTA-STS | ✅ / ❌ |

### Obter certificados TLS (Let's Encrypt)

```bash
# Primeira emissão
docker compose -f infra/docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d diariooficial.gov.br -d admin.diariooficial.gov.br -d api.diariooficial.gov.br \
  --email administrador@diariooficial.gov.br \
  --agree-tos --non-interactive

# Verificar
ls -la infra/nginx/ssl/live/
```

---

## 3. Variáveis de Ambiente

### Configuração (`infra/.env`)

```bash
# --- PostgreSQL ---
POSTGRES_DB=doe
POSTGRES_USER=doe_user
POSTGRES_PASSWORD=<gerar senha forte: openssl rand -base64 32>

# --- MinIO ---
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=<gerar senha forte>
MINIO_ACCESS_KEY=minio_access
MINIO_SECRET_KEY=<gerar chave>
MINIO_BUCKET=doe-publicacoes

# --- API ---
SECRET_KEY=<GERAR: openssl rand -hex 64>
SENTRY_DSN=<opcional, URL do Sentry>
CORS_ORIGINS=https://admin.diariooficial.gov.br,https://diariooficial.gov.br

# --- Signer ---
SIGNER_PROVIDER=a1
SIGNER_A1_PFX_PATH=/certs/cert.pfx
SIGNER_A1_PASSWORD=<senha do certificado A1>
SIGNER_CERTS_DIR=./certs

# --- Worker ---
WORKER_CONCURRENCY=2
```

### Gerar secrets

```bash
# Gerar todas as senhas de uma vez
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)"
echo "MINIO_SECRET_KEY=$(openssl rand -base64 32)"
echo "SECRET_KEY=$(openssl rand -hex 64)"
echo "SIGNER_A1_PASSWORD=<senha do PFX>"
```

---

## 4. Checklist de Storage

| Item | Configuração |
|---|---|
| MinIO Object Lock | Ativado (`mc mb --with-lock`) |
| Bucket `doe-publicacoes` | Criado e imutável |
| Backup storage | Montagem separada ou S3 compatível |
| Uploads persistentes | Volume Docker `uploads` |
| Criptografia em repouso | MinIO SSE-S3 ou disco criptografado LUKS |

```bash
# Verificar bucket
docker compose exec minio mc ls myminio/doe-publicacoes

# Verificar Object Lock
docker compose exec minio mc legalhold ls myminio/doe-publicacoes
```

---

## 5. Checklist do Certificado A1

| Item | Procedimento |
|---|---|
| Obter certificado | Contratar ICP-Brasil (Certisign, Soluti) |
| Formato | PFX/P12 com chave privada |
| Validade | Mínimo 12 meses |
| Senha | Armazenar em cofre (Bitwarden/LastPass) |
| Cópia de segurança | Backup criptografado do PFX |
| Alerta renovação | 60 dias antes do vencimento |

```bash
# Verificar certificado
openssl pkcs12 -in cert.pfx -nokeys -nodes | openssl x509 -noout -dates -subject

# Verificar validade
openssl pkcs12 -in cert.pfx -nokeys -nodes | openssl x509 -noout -enddate

# Testar assinatura
curl -X POST http://signer:8100/api/v1/health
```

### Preparação para Selo Eletrônico (futuro)

A arquitetura atual já suporta a troca do provedor via interface `SignerProvider`.
Para migrar para Selo Eletrônico, criar:

1. `apps/signer/app/providers/selo.py` — implementar `ElectronicSealProvider`
2. Registrar em `create_provider()`
3. Configurar `SIGNER_PROVIDER=selo`

---

## 6. Deploy dos Serviços

```bash
# 1. Clonar repositório
git clone <url> /opt/doe
cd /opt/doe

# 2. Configurar ambiente
cp infra/.env.example infra/.env
# Editar infra/.env com valores seguros

# 3. Copiar certificado A1
cp /path/to/cert.pfx infra/certs/

# 4. Subir serviços
docker compose -f infra/docker-compose.prod.yml up -d

# 5. Verificar healthchecks
docker compose -f infra/docker-compose.prod.yml ps
# Todos devem estar "healthy"
```

---

## 7. Migração Automatizada

```bash
# Executar migrações
docker compose -f infra/docker-compose.prod.yml exec api alembic upgrade head

# Verificar estado
docker compose -f infra/docker-compose.prod.yml exec api alembic current
```

**CI/CD:** Adicionar ao pipeline:

```yaml
# .github/workflows/deploy.yml (exemplo)
deploy:
  steps:
    - name: Run migrations
      run: docker compose exec api alembic upgrade head
    - name: Verify health
      run: curl -f https://api.diariooficial.gov.br/api/v1/health
```

---

## 8. Criação do Primeiro ADMIN

```bash
# Executar seed padrão (organização, roles, tipos de ato)
docker compose exec api python scripts/seed.py

# Criar usuário ADMIN manualmente pelo shell do Django
# (substituir email e senha)
docker compose exec api python -c "
import asyncio
from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from sqlalchemy import select

async def main():
    async with async_session() as db:
        user = User(
            name='Administrador',
            email='admin@diariooficial.gov.br',
            password_hash=hash_password('Admin@2026'),
            is_active=True,
        )
        db.add(user)
        await db.flush()
        
        result = await db.execute(select(Role))
        for role in result.scalars().all():
            db.add(UserRole(user_id=user.id, role_id=role.id))
        
        await db.commit()
        print(f'Admin criado: admin@diariooficial.gov.br')

asyncio.run(main())
"

# Após primeiro login, obrigar troca de senha
# (a política de senha exigirá 8+ chars, maiúsculas, minúsculas, dígitos)
```

---

## 9. Checklist de Backup

| Item | Frequência | Responsável |
|---|---|---|
| Backup PostgreSQL | Diário (00:00) | Automatizado (cron) |
| Backup storage (PDFs) | Diário | Automatizado (cron) |
| Backup certificado A1 | Mensal | DPO |
| Teste de restauração | Trimestral | Equipe DevOps |

### Configurar cron

```bash
# /etc/cron.d/doe-backup
0 0 * * * root /opt/doe/scripts/backup.sh /opt/doe/backups >> /var/log/doe-backup.log 2>&1

# /etc/cron.d/doe-verify
0 2 * * 0 root /opt/doe/scripts/verify_integrity.py >> /var/log/doe-verify.log 2>&1
```

### Verificar backup

```bash
# Listar backups
ls -la /opt/doe/backups/db/
ls -la /opt/doe/backups/storage/

# Testar descriptografia
openssl enc -aes-256-cbc -d -salt -pbkdf2 \
  -pass pass:"$BACKUP_ENCRYPT_KEY" \
  -in /opt/doe/backups/db/doe_*.sql.gz.enc | gunzip | head -5
```

---

## 10. Procedimento de Publicação da Primeira Edição

```bash
# 1. Fazer login como ADMIN
#    URL: https://admin.diariooficial.gov.br
#    Email: admin@diariooficial.gov.br
#    Senha: (definida na criação)

# 2. Criar matéria de teste
#    Navegar: Matérias → Nova Matéria
#    Título: "Ato de Instalação do Diário Oficial Eletrônico"
#    Tipo de Ato: "Outros"
#    Conteúdo: Texto de instalação
#    Salvar Rascunho → Enviar para Revisão

# 3. Aprovar matéria (outro usuário com role REVISOR)
#    Navegar: Matérias → (matéria em REVIEW) → Aprovar

# 4. Criar edição
#    Navegar: Edições → Nova Edição
#    Número: 1
#    Ano: corrente
#    Título: "Edição de Instalação"
#    Adicionar matéria aprovada

# 5. Fechar e gerar PDF
#    Fechar edição → Gerar PDF

# 6. Assinar (requer MFA configurado)
#    Configurar MFA: Perfil → Configurar MFA
#    Assinar edição

# 7. Publicar
#    Publicar edição

# 8. Verificar no portal público
#    https://diariooficial.gov.br/edicoes
#    Buscar pela edição publicada
#    Verificar código no pdf

# 9. Verificar QR Code
#    https://diariooficial.gov.br/verificar/{CODIGO}
```

---

## 11. Monitoramento e Alertas

### Healthchecks endpoints

| Serviço | URL |
|---|---|
| API | `https://api.diariooficial.gov.br/api/v1/health` |
| API ops | `https://api.diariooficial.gov.br/api/v1/operations/health` |
| Métricas | `https://api.diariooficial.gov.br/api/v1/metrics` |
| Dashboard | `https://admin.diariooficial.gov.br/operacoes` |

### Alertas recomendados

| Alerta | Condição | Ação |
|---|---|---|
| Serviço down | Healthcheck falha 3x | Notificar equipe |
| Certificado expirando | < 30 dias | Alertar DPO |
| Fila Celery crescente | > 50 tarefas | Escalar workers |
| Backup falhou | Arquivo não gerado | Notificar DevOps |
| Disco cheio | > 85% | Expandir volume |

---

## 12. Rollback

```bash
# Parar serviços
docker compose -f infra/docker-compose.prod.yml down

# Restaurar versão anterior do código
git checkout <tag-anterior>

# Reconstruir e subir
docker compose -f infra/docker-compose.prod.yml up -d --build

# Reverter banco (se necessário)
docker compose exec api alembic downgrade -1

# Restaurar backup (se necessário)
./scripts/restore.sh /opt/doe/backups/db/doe_*.sql.gz.enc

# Verificar
curl -f https://api.diariooficial.gov.br/api/v1/health
```

---

## Apêndices

### A. Comandos úteis

```bash
# Logs
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f nginx

# Executar comando em container
docker compose exec api python scripts/seed.py
docker compose exec worker celery -A app.worker status

# Escalar worker
docker compose -f infra/docker-compose.prod.yml up -d --scale worker=3 worker

# Atualizar certificado TLS
docker compose exec certbot certbot renew
docker compose exec nginx nginx -s reload
```

### B. Arquitetura de rede

```
Internet
    │
    ▼
  ┌───┴───┐
  │ Nginx │  (public network)
  └───┬───┘
      │
  ┌───┴──────────────────┐
  │                      │
  ▼                      ▼
api:8000           web-public:3000
web-admin:3000
  │                      │
  └──────────┬───────────┘
             │
             ▼  (internal network)
      ┌──────────────┐
      │  PostgreSQL  │
      │  Redis       │
      │  MinIO       │
      │  Worker      │
      │  Signer      │
      └──────────────┘
```

### C. Tags de versão

| Tag | Significado |
|---|---|
| `v0.1.0` | MVP — homologação |
| `v0.2.0` | Produção inicial |
| `v1.0.0` | Lançamento oficial |
