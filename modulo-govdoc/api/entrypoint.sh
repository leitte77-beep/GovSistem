#!/bin/sh
set -e

echo "[govdoc] Aplicando migrations (alembic upgrade head)..."
alembic upgrade head

if [ "${GOVDOC_SEED_ON_START}" = "true" ]; then
  echo "[govdoc] Executando carga inicial de desenvolvimento..."
  python -m scripts.seed || echo "[govdoc] aviso: carga inicial falhou (seguindo)"
fi

echo "[govdoc] Iniciando API na porta 8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
