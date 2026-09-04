# Runbook Operacional

## Saúde

```bash
curl -sf http://127.0.0.1:9203/api/v1/health          # API
curl -sf http://127.0.0.1:9200/api/health              # web-public
curl -sf http://127.0.0.1:9202/api/health              # web-admin
```

## Diagnóstico rápido

- `docker compose ps` — verificar status/healthy.
- `docker compose logs -f api signer worker` — logs recentes.
- Logs JSON sem segredos; correlação via `correlation_id` em operações críticas.

## Backup

```bash
# conforme BACKUP_RESTORE.md — dump custom + volumes MinIO/uploads
docker exec -i modulo-diario-postgres-1 pg_dump -U diario_user -d modulo_diario -Fc > /backups/diario.dump
```

## Restauração

```bash
docker exec -i modulo-diario-postgres-1 pg_restore -U diario_user -d modulo_diario --clean --no-owner < /backups/diario.dump
```

## Rebuild / deploy

```bash
docker compose build api signer web-public web-admin worker
docker compose up -d --build
```

## Migração/DDL

```bash
docker compose exec api alembic upgrade head
docker compose exec -T postgres psql -U diario_user -d modulo_diario < api/sql/hardening_timestamp_and_audit.sql
```

## Incidentes frequentes

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| API não sobe no startup | Alembic head divergente | `alembic upgrade head` |
| Assinatura falha | signer sem chave interna / cert vencido | validar `INTERNAL_API_KEY`, inspecionar credencial |
| `SIGNER_PROVIDER=mock` em produção | config errada | corrigir para `a1` (startup aborta) |
| Verificação retorna inválido | PDF adulterado/storage perdido | ver re-assinatura administrativa (nunca automática) |

## Disastres

Procedimento: `restore-db` → `restore-storage` → `restore-config` → `rebuild-search-index`.
O índice de busca é reconstruível integralmente a partir da base canônica (ver `ARCHITECTURE.md`).
