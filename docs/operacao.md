# Manual de Operação

## Sumário
1. Monitoramento
2. Métricas
3. Logs
4. Alertas
5. Filas
6. Jobs Agendados

---

## 1. Monitoramento

### Healthchecks

Cada serviço expõe um healthcheck endpoint:

| Serviço | Endpoint | Docker Healthcheck |
|---|---|---|
| API | `/api/v1/operations/health` | `curl -f http://localhost:8000/api/v1/health` |
| PostgreSQL | — | `pg_isready -U doe_user` |
| Redis | — | `redis-cli ping` |
| MinIO | — | `curl -f http://localhost:9000/minio/health/live` |

### Dashboard Administrativo

URL: `http://admin:7201/operacoes`

Exibe:
- Uptime do serviço
- Status do banco de dados
- Quantidade de edições por status
- Status das filas Celery
- Alertas ativos

## 2. Métricas Prometheus

Endpoint: `GET /api/v1/metrics` (formato texto Prometheus)

```prometheus
# HELP doe_info System info
doe_info{version="0.1.0"} 1
# HELP doe_up Service up
doe_up 1
```

Para integrar com Prometheus:

```yaml
scrape_configs:
  - job_name: 'doe-api'
    static_configs:
      - targets: ['api:8000']
    metrics_path: '/api/v1/metrics'
```

## 3. Logs Estruturados JSON

Toda requisição HTTP é logada em formato JSON:

```json
{
  "timestamp": "2026-05-15T10:00:00.000Z",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "query": "",
  "status": 200,
  "duration_ms": 45.23,
  "ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0..."
}
```

Configuração para coletar com Filebeat ou Fluentd:

```yaml
# filebeat.yml
filebeat.inputs:
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

## 4. Alertas

### Por CRON (recomendado)

Executar scripts de verificação periodicamente via cron ou Kubernetes CronJob:

```bash
# A cada hora: verificar filas
* * * * * /usr/bin/curl -sf http://api:8000/api/v1/operations/queue-status || alert

# Diariamente: verificar certificados
0 6 * * * python /app/scripts/check_certificates.py

# Semanalmente: verificar integridade
0 2 * * 0 python /app/scripts/verify_integrity.py
```

### Alertas Implementados

| Alerta | Gatilho | Ação |
|---|---|---|
| Falha geração PDF | Status edition != PDF_GENERATED após 5 min | Notificar equipe |
| Falha assinatura | Status edition != SIGNED após tentativa | Notificar assinadores |
| Certificado próximo vencimento | < 30 dias para expirar | Alertar admin |
| Fila crescente | > 100 itens na fila | Escalar workers |
| Integridade | Hash SHA-256 não confere | Regerar PDF |

## 5. Filas (Celery)

Status disponível em: `GET /api/v1/operations/queue-status`

```json
{
  "queue_length": 0,
  "active_tasks": 0,
  "reserved_tasks": 0,
  "status": "ok"
}
```

Comandos úteis:

```bash
# Ver workers
docker compose exec worker celery -A app.worker status

# Ver filas
docker compose exec worker celery -A app.worker inspect active

# Limpar fila
docker compose exec worker celery -A app.worker purge -f
```

## 6. Jobs Agendados

| Job | Frequência | Descrição |
|---|---|---|
| `scripts/backup.sh` | Diária (00:00) | Backup criptografado do banco + storage |
| `scripts/verify_integrity.py` | Semanal (dom 02:00) | Verificar SHA-256 dos PDFs publicados |
| `scripts/check_certificates.py` | Diária (06:00) | Alertar certificados próximos do vencimento |

### Configuração CRON

```bash
# /etc/cron.d/doe
0 0 * * * root /opt/doe/scripts/backup.sh /opt/doe/backups >> /var/log/doe-backup.log 2>&1
0 2 * * 0 root /opt/doe/scripts/verify_integrity.py >> /var/log/doe-verify.log 2>&1
0 6 * * * root /opt/doe/scripts/check_certificates.py >> /var/log/doe-certs.log 2>&1
```
