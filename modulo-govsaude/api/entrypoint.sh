#!/usr/bin/env sh
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Aplicando migrações do GovSaúde..."
  alembic upgrade head
fi

exec "$@"
