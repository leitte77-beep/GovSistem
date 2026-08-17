#!/bin/bash
# Daily encrypted backup of PostgreSQL databases and storage volumes
# Usage: ./scripts/backup.sh [output_dir]

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_CONTAINER="${DB_CONTAINER:-infra-postgres-1}"
DB_USER="${POSTGRES_USER:-doe_user}"
ENCRYPT_KEY="${BACKUP_ENCRYPT_KEY:?BACKUP_ENCRYPT_KEY must be set}"

# Bancos de dados a backupear
DATABASES=("${POSTGRES_DB:-doe}" "${GOVSOCIAL_POSTGRES_DB:-govsocial}" "${GOVTASK_POSTGRES_DB:-govtask}")

# Volumes de storage a backupear (path no host)
STORAGE_PATHS=("./uploads" "./govtask_uploads" "./govsocial_uploads")

mkdir -p "$BACKUP_DIR"/{db,storage,logs}

echo "[$(date)] =========================================="
echo "[$(date)] Iniciando backup completo..."
echo "[$(date)] =========================================="

# ── 1. Bancos de dados ──────────────────────────────────────
for DB_NAME in "${DATABASES[@]}"; do
  echo "[$(date)] Dumping banco: $DB_NAME..."

  # Verifica se o banco existe antes de tentar dump
  EXISTS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "0")

  if [ "$EXISTS" != "1" ]; then
    echo "[$(date)]   SKIP: banco $DB_NAME nao encontrado"
    continue
  fi

  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" 2>/dev/null | \
    gzip | \
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass pass:"$ENCRYPT_KEY" \
    > "$BACKUP_DIR/db/${DB_NAME}_${TIMESTAMP}.sql.gz.enc"

  SIZE=$(ls -lh "$BACKUP_DIR/db/${DB_NAME}_${TIMESTAMP}.sql.gz.enc" | awk '{print $5}')
  echo "[$(date)]   OK: db/${DB_NAME}_${TIMESTAMP}.sql.gz.enc ($SIZE)"
done

# ── 2. Storage (uploads de todos os modulos) ────────────────
for STORAGE_PATH in "${STORAGE_PATHS[@]}"; do
  if [ ! -d "$STORAGE_PATH" ]; then
    echo "[$(date)]   SKIP: path $STORAGE_PATH nao encontrado"
    continue
  fi

  DIRNAME=$(basename "$STORAGE_PATH")
  echo "[$(date)] Backupeando storage: $DIRNAME..."

  tar czf - -C "$STORAGE_PATH" . 2>/dev/null | \
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass pass:"$ENCRYPT_KEY" \
    > "$BACKUP_DIR/storage/${DIRNAME}_${TIMESTAMP}.tar.gz.enc"

  SIZE=$(ls -lh "$BACKUP_DIR/storage/${DIRNAME}_${TIMESTAMP}.tar.gz.enc" | awk '{print $5}')
  echo "[$(date)]   OK: storage/${DIRNAME}_${TIMESTAMP}.tar.gz.enc ($SIZE)"
done

# ── 3. Retencao: 30 dias para DB, 90 dias para storage ─────
echo "[$(date)] Limpando backups antigos..."
find "$BACKUP_DIR/db" -name "*.enc" -mtime +30 -delete -printf "[$(date)]   Deleted: %p\n"
find "$BACKUP_DIR/storage" -name "*.enc" -mtime +90 -delete -printf "[$(date)]   Deleted: %p\n"

# ── 4. Log de resumo ────────────────────────────────────────
echo "[$(date)] =========================================="
echo "[$(date)] Backup concluido com sucesso."
echo "[$(date)] =========================================="
ls -lh "$BACKUP_DIR/db/"*_${TIMESTAMP}*.enc 2>/dev/null || echo "  (sem backups de banco gerados)"
ls -lh "$BACKUP_DIR/storage/"*_${TIMESTAMP}*.enc 2>/dev/null || echo "  (sem backups de storage gerados)"
