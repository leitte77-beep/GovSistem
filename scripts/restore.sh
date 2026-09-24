#!/bin/bash
# Restore PostgreSQL from encrypted backup
# Usage: ./scripts/restore.sh <backup_file.sql.gz.enc> [db_name]

set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz.enc> [db_name]}"
DB_NAME="${2:-doe}"
DB_CONTAINER="${DB_CONTAINER:-infra-postgres-1}"
DB_USER="${POSTGRES_USER:-doe_user}"
DB_PASS="${POSTGRES_PASSWORD:-doe_password}"
ENCRYPT_KEY="${BACKUP_ENCRYPT_KEY:?BACKUP_ENCRYPT_KEY must be set}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Starting restore from $BACKUP_FILE..."
echo "[$(date)] WARNING: This will OVERWRITE the database $DB_NAME"

# Decrypt → decompress → restore
openssl enc -aes-256-cbc -d -salt -pbkdf2 -pass pass:"$ENCRYPT_KEY" \
  -in "$BACKUP_FILE" | \
  gunzip | \
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

echo "[$(date)] Restore complete."

# Verify
echo "[$(date)] Running verification..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM editions;"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM matters;"
echo "[$(date)] Verification done."
