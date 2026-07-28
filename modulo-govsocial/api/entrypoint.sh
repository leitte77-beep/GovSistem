#!/bin/sh
set -e

echo "[entrypoint] Aplicando migrações (alembic upgrade head)..."
alembic upgrade head

echo "[entrypoint] Garantindo papéis do SUAS (idempotente)..."
python -m scripts.bootstrap_roles || echo "[entrypoint] aviso: bootstrap de papéis falhou (seguindo)"

echo "[entrypoint] Iniciando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
