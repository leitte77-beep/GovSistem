# Backup e Restore

## Estratégia

- **Frequência:** Backup completo diário
- **Retenção:** 30 dias
- **Criptografia:** AES-256-CBC com chave derivada
- **Armazenamento:** Local + offsite (opcional: S3 compatible)

## Backup

### Script Automatizado

```bash
./scripts/backup.sh [diretório_de_saída]
```

O script realiza:

1. **PostgreSQL dump** → gzip → AES-256-CBC
2. **Storage** (uploads + PDFs) → tar.gz → AES-256-CBC
3. **Limpeza** de backups com mais de 30 dias

### Saída

```
backups/
├── db/
│   └── doe_20260515_120000.sql.gz.enc
└── storage/
    └── storage_20260515_120000.tar.gz.enc
```

### Agendamento CRON

```bash
0 0 * * * root /opt/doe/scripts/backup.sh /opt/doe/backups
```

### Variáveis de Ambiente

| Variável | Default | Descrição |
|---|---|---|
| `POSTGRES_DB` | `doe` | Nome do banco |
| `POSTGRES_USER` | `doe_user` | Usuário do banco |
| `POSTGRES_PASSWORD` | `doe_password` | Senha do banco |
| `BACKUP_ENCRYPT_KEY` | `change-me` | Chave de criptografia |

**IMPORTANTE:** Em produção, definir `BACKUP_ENCRYPT_KEY` como uma senha forte
(32+ caracteres) e armazenar em cofre separado.

## Restore

### Script Automatizado

```bash
./scripts/restore.sh <backup.sql.gz.enc> [nome_do_banco]
```

Passos manuais:

```bash
# 1. Descriptografar e descomprimir
openssl enc -aes-256-cbc -d -salt -pbkdf2 \
  -pass pass:"$BACKUP_ENCRYPT_KEY" \
  -in backups/db/doe_20260515.sql.gz.enc | \
  gunzip > /tmp/doe_restore.sql

# 2. Restaurar no PostgreSQL
docker exec -i infra-postgres-1 psql -U doe_user -d doe < /tmp/doe_restore.sql

# 3. Verificar
docker exec infra-postgres-1 psql -U doe_user -d doe -c "
  SELECT 'editions', COUNT(*) FROM editions
  UNION ALL
  SELECT 'matters', COUNT(*) FROM matters;"
```

### Restore de Storage

```bash
openssl enc -aes-256-cbc -d -salt -pbkdf2 \
  -pass pass:"$BACKUP_ENCRYPT_KEY" \
  -in backups/storage/storage_20260515.tar.gz.enc | \
  tar xzf - -C /opt/doe/uploads
```

## Verificação de Integridade

```bash
python scripts/verify_integrity.py
```

Verifica se o SHA-256 de cada PDF publicado corresponde ao hash armazenado
no banco de dados. Opção `--fix` para corrigir divergências.

## Teste de Restauração

Realizar trimestralmente:

```bash
# 1. Criar banco de teste
createdb doe_restore_test

# 2. Restaurar
./scripts/restore.sh backups/db/doe_20260515.sql.gz.enc doe_restore_test

# 3. Validar
psql -d doe_restore_test -c "SELECT COUNT(*) FROM editions;"
psql -d doe_restore_test -c "SELECT COUNT(*) FROM matters;"

# 4. Limpar
dropdb doe_restore_test
```
