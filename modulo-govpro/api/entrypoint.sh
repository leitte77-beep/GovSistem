#!/bin/sh
set -e

echo "[entrypoint] Aplicando migrações (alembic upgrade head)..."
alembic upgrade head

echo "[entrypoint] Garantindo perfis e dados de referência do GovPro (idempotente)..."
python -m scripts.bootstrap || echo "[entrypoint] aviso: bootstrap falhou (seguindo)"

echo "[entrypoint] Iniciando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
