#!/usr/bin/env bash
set -euo pipefail

echo "=== DOE API: Running database migrations ==="
cd /app
alembic upgrade head

echo "=== DOE API: Starting application ==="
exec "$@"
