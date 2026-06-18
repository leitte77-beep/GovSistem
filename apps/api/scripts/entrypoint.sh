#!/usr/bin/env bash
set -euo pipefail

echo "=== DOE API: Running database migrations ==="
cd /app
export PYTHONPATH=/app

# Apply missing column safely (idempotent)
python3 -c "
import os, sys
sys.path.insert(0, '/app')
from app.core.config import settings
import sqlalchemy as sa
from sqlalchemy import create_engine, text
engine = create_engine(settings.DATABASE_URL_SYNC)
with engine.connect() as conn:
    result = conn.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='require_password_change'\"))
    if not result.fetchone():
        conn.execute(text('ALTER TABLE users ADD COLUMN require_password_change BOOLEAN NOT NULL DEFAULT false'))
        conn.commit()
        print('ADDED: users.require_password_change column')
    else:
        print('SKIP: users.require_password_change already exists')
engine.dispose()
"

echo "=== DOE API: Starting application ==="
exec "$@"
