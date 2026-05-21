#!/bin/bash
# Daily encrypted backup of PostgreSQL and storage
# Usage: ./scripts/backup.sh [output_dir]

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_CONTAINER="${DB_CONTAINER:-infra-postgres-1}"
DB_NAME="${POSTGRES_DB:-doe}"
DB_USER="${POSTGRES_USER:-doe_user}"
DB_PASS="${POSTGRES_PASSWORD:-doe_password}"
ENCRYPT_KEY="${BACKUP_ENCRYPT_KEY:?BACKUP_ENCRYPT_KEY must be set}"

mkdir -p "$BACKUP_DIR"/{db,storage,logs}

echo "[$(date)] Starting backup..."

# 1. PostgreSQL dump
echo "[$(date)] Dumping PostgreSQL..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | \
  gzip | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:"$ENCRYPT_KEY" \
  > "$BACKUP_DIR/db/doe_$TIMESTAMP.sql.gz.enc"

echo "[$(date)] DB backup: $BACKUP_DIR/db/doe_$TIMESTAMP.sql.gz.enc"

# 2. Storage (uploads + pdfs)
echo "[$(date)] Backing up storage..."
tar czf - -C ./uploads . 2>/dev/null | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:"$ENCRYPT_KEY" \
  > "$BACKUP_DIR/storage/storage_$TIMESTAMP.tar.gz.enc"

echo "[$(date)] Storage backup: $BACKUP_DIR/storage/storage_$TIMESTAMP.tar.gz.enc"

# 3. Retention: keep 30 days
find "$BACKUP_DIR/db" -name "*.enc" -mtime +30 -delete
find "$BACKUP_DIR/storage" -name "*.enc" -mtime +30 -delete

echo "[$(date)] Backup complete."
echo "summary|$TIMESTAMP|db:$(ls -lh "$BACKUP_DIR/db/doe_$TIMESTAMP.sql.gz.enc" | awk '{print $5}')|storage:$(ls -lh "$BACKUP_DIR/storage/storage_$TIMESTAMP.tar.gz.enc" | awk '{print $5}')"
