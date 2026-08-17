#!/bin/bash
# Restore PostgreSQL database or storage from encrypted backup
# Usage:
#   ./scripts/restore.sh db <backup_file.sql.gz.enc> [db_name]
#   ./scripts/restore.sh storage <backup_file.tar.gz.enc> [target_dir]

set -euo pipefail

TYPE="${1:?Usage: $0 <db|storage> <backup_file> [target]}"
BACKUP_FILE="${2:?Usage: $0 <db|storage> <backup_file> [target]}"
TARGET="${3:-}"
DB_CONTAINER="${DB_CONTAINER:-infra-postgres-1}"
DB_USER="${POSTGRES_USER:-doe_user}"
ENCRYPT_KEY="${BACKUP_ENCRYPT_KEY:?BACKUP_ENCRYPT_KEY must be set}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Arquivo de backup nao encontrado: $BACKUP_FILE"
  exit 1
fi

case "$TYPE" in
  db)
    DB_NAME="${TARGET:-doe}"
    echo "[$(date)] Iniciando restauracao do banco $DB_NAME..."
    echo "[$(date)] ATENCAO: Isso vai SOBRESCREVER o banco $DB_NAME!"
    echo "[$(date)] Pressione Ctrl+C para cancelar (5s)..."
    sleep 5

    # Cria o banco se nao existir
    EXISTS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "0")
    if [ "$EXISTS" != "1" ]; then
      echo "[$(date)] Criando banco $DB_NAME..."
      docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
    fi

    # Fecha conexoes ativas para permitir o drop
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c \
      "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity \
       WHERE pg_stat_activity.datname = '$DB_NAME' AND pid <> pg_backend_pid()" 2>/dev/null || true

    # Decrypt -> decompress -> restore
    openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 -pass pass:"$ENCRYPT_KEY" \
      -in "$BACKUP_FILE" | gunzip | \
      docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

    echo "[$(date)] Restauracao do banco $DB_NAME concluida."

    # Verificacao basica
    echo "[$(date)] Verificando integridade..."
    TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")
    echo "[$(date)]   Tabelas restauradas: $TABLE_COUNT"
    ;;

  storage)
    TARGET_DIR="${TARGET:-./restored_storage}"
    echo "[$(date)] Restaurando storage para $TARGET_DIR..."
    mkdir -p "$TARGET_DIR"

    openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 -pass pass:"$ENCRYPT_KEY" \
      -in "$BACKUP_FILE" | tar xzf - -C "$TARGET_DIR"

    FILE_COUNT=$(find "$TARGET_DIR" -type f | wc -l)
    echo "[$(date)] Restauracao concluida: $FILE_COUNT arquivos em $TARGET_DIR"
    ;;

  *)
    echo "ERROR: Tipo invalido '$TYPE'. Use 'db' ou 'storage'."
    exit 1
    ;;
esac

echo "[$(date)] Operacao concluida com sucesso."
