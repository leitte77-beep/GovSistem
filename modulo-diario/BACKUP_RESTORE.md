# Backup & Restauração

## Estratégia

Objetivo: **3-2-1** (3 cópias, 2 mídias, 1 off-site). Atual: cópia única local + dumps manuais.
Evoluir para PITR + incremental + versão de storage + off-site criptografado + teste de restauração.

## O que backupar

| Dado | Fonte |
|------|-------|
| PostgreSQL | `pg_dump -Fc` |
| Objetos/PDFs | MinIO (bucket `diario-publicacoes`) e volume `uploads` |
| Configuração/segredos | `.env` / secret manager |
| Trust store | `trust_anchors` |
| Metadados criptográficos | `signature_operation_audits`, timestamps, assinaturas |

## Backup realizado (referência)

Backup de produção em `backups/diario-prod-YYYYMMDD_HHMMSS/`:
- `diario_prod.dump` (Postgres custom)
- `minio_data.tar.gz`, `uploads_data.tar.gz`
- `env_prod.txt`, `docker-compose.yml`, `source_HEAD.txt`, `source_dirty_diff.txt`

## Comandos

Banco (dump consistente):
```bash
docker exec -i modulo-diario-postgres-1 pg_dump -U diario_user -d modulo_diario -Fc > diario.dump
```

Restauração:
```bash
docker exec -i modulo-diario-postgres-1 pg_restore -U diario_user -d modulo_diario --clean --no-owner < diario.dump
```

Object storage (MinIO volume):
```bash
docker run --rm -v modulo-diario_modulo_diario_miniodata:/data -v $PWD:/b alpine tar czf /b/minio.tar.gz -C /data .
```

## RPO / RTO

- **RPO (objetivo):** diário (dump noturno) → 24h; com PITR, minutos.
- **RTO (objetivo):** < 1 hora com procedimentos documentados.
- Política a confirmar com a administração.

## Teste de restauração

Um backup nunca restaurado não é comprovadamente válido. Rodar periodicamente `restore-test`:
restaurar o dump num banco temporário e validar contagens/última edição/lacunas.

## Object Lock / WORM

Avaliar (POC em homologação) Object Lock no MinIO para PDFs publicados, manifests, assinaturas e
tokens de timestamp. **Não ativar destrutivamente em produção sem validar infraestrutura.**

Ver `SECURITY.md` (recomendações) e `MIGRATION.md`.
