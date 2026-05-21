# Runbooks — Procedimentos para Incidentes Comuns

## Índice

1. [Falha na Geração de PDF](#1-falha-na-geração-de-pdf)
2. [Falha na Assinatura Digital](#2-falha-na-assinatura-digital)
3. [Certificado A1 Expirado](#3-certificado-a1-expirado)
4. [Fila Celery Bloqueada](#4-fila-celery-bloqueada)
5. [Banco de Dados Indisponível](#5-banco-de-dados-indisponível)
6. [Storage (MinIO) Indisponível](#6-storage-minio-indisponível)
7. [Alta Carga no Portal Público](#7-alta-carga-no-portal-público)
8. [Violação de Segurança](#8-violação-de-segurança)

---

## 1. Falha na Geração de PDF

**Sintomas:**
- Edição permanece em CLOSED sem transição para PDF_GENERATED
- Log de erro: `Signing failed` ou `WeasyPrint error`

**Causas comuns:**
- Template HTML inválido
- Matéria com conteúdo não suportado
- Falta de memória no container worker

**Procedimento:**

```bash
# 1. Verificar logs do worker
docker compose logs worker | grep -i "error\|exception\|traceback"

# 2. Verificar template HTML
docker compose exec api python -c "
from app.services.edition_pdf import generate_edition_pdf_sync
try:
    result = generate_edition_pdf_sync('EDITION_ID')
    print('PDF generated:', result['filename'])
except Exception as e:
    print('Error:', e)
"

# 3. Se erro de template: corrigir e regenerar
docker compose exec api python -c "
from app.services.edition_pdf import generate_edition_pdf_sync
result = generate_edition_pdf_sync('EDITION_ID')
print('OK:', result['filename'])
"
```

**Rollback:** Se necessário, reabrir a edição:
```
POST /api/v1/editions/{id}/reopen
```

## 2. Falha na Assinatura Digital

**Sintomas:**
- Edição permanece em PDF_GENERATED
- Log de erro: `Signing service failed` ou `Signer error`

**Causas comuns:**
- Signer service offline
- Certificado A1 inválido/expirado
- Senha do PFX incorreta

**Procedimento:**

```bash
# 1. Verificar signer
curl http://signer:8100/api/v1/health

# 2. Verificar certificado
docker compose exec signer python -c "
from app.providers import create_provider
try:
    p = create_provider('a1', pfx_bytes=open('/certs/cert.pfx','rb').read(), password='***')
    print('Cert:', p.get_certificate_info())
except Exception as e:
    print('Error:', e)
"

# 3. Se certificado expirado → renovar com novo PFX
```

## 3. Certificado A1 Expirado

**Procedimento:**

```bash
# 1. Verificar validade
openssl pkcs12 -in /certs/cert.pfx -nokeys -nodes | openssl x509 -noout -dates

# 2. Renovar junto à ICP-Brasil (Certisign, Soluti, etc.)

# 3. Substituir arquivo
cp novo_cert.pfx /certs/cert.pfx

# 4. Testar
curl -X POST http://signer:8100/internal/sign-pdf -H "Content-Type: application/json" \
  -d '{"edition_id":"test","unsigned_pdf_base64":"...","pfx_base64":"...","pfx_password":"..."}'
```

## 4. Fila Celery Bloqueada

**Sintomas:**
- Tarefas não são processadas
- Queue size cresce

**Procedimento:**

```bash
# 1. Verificar status dos workers
docker compose exec worker celery -A app.worker status

# 2. Verificar fila
docker compose exec worker celery -A app.worker inspect active

# 3. Se worker travado → reiniciar
docker compose restart worker

# 4. Se necessário, limpar fila
docker compose exec worker celery -A app.worker purge -f
```

## 5. Banco de Dados Indisponível

**Sintomas:**
- API retorna 500
- Healthcheck do PostgreSQL falha

**Procedimento:**

```bash
# 1. Verificar status
docker compose ps postgres

# 2. Verificar logs
docker compose logs postgres | tail -50

# 3. Tentar reiniciar
docker compose restart postgres

# 4. Se falhar, restaurar do último backup
./scripts/restore.sh backups/doe_20260515.sql.gz.enc
```

## 6. Storage (MinIO) Indisponível

**Sintomas:**
- Download de PDF falha
- Upload de arquivos falha

**Procedimento:**

```bash
# 1. Verificar status
docker compose ps minio

# 2. Verificar logs
docker compose logs minio | tail -20

# 3. Verificar bucket
docker compose exec minio mc ls myminio/doe-publicacoes

# 4. Reiniciar
docker compose restart minio
```

## 7. Alta Carga no Portal Público

**Sintomas:**
- Portal lento
- Timeout em buscas

**Procedimento:**

```bash
# 1. Verificar logs do Nginx
tail -f /var/log/nginx/access.log | grep -E " (499|502|503|504) "

# 2. Escalar web-public (se usando Swarm/K8s)
docker compose up -d --scale web-public=3

# 3. Ativar cache no Nginx
# Adicionar ao nginx.conf:
# proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=doe:10m max_size=1g;
# proxy_cache doe;
# proxy_cache_valid 200 60s;

# 4. Se persistir, ativar rate limiting global
```

## 8. Violação de Segurança

**Procedimento:**

```bash
# 1. Isolar o sistema imediatamente
docker compose down

# 2. Coletar logs
docker compose logs --timestamps > /tmp/doe_logs_$(date +%Y%m%d).txt

# 3. Exportar trilha de auditoria
curl -H "Authorization: Bearer $TOKEN" http://api:8000/api/v1/security/audit/export > audit.csv

# 4. Notificar DPO e equipe de segurança

# 5. Investigar: verificar sessões ativas, tokens emitidos, acessos não autorizados

# 6. Após contenção, restaurar de backup limpo
./scripts/restore.sh backups/doe_backup_clean.sql.gz.enc

# 7. Trocar todas as senhas e certificados

# 8. Revisar regras de firewall e CORS
```
