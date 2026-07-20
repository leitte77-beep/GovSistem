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

# Convert timezone-naive datetime columns to timezone-aware (idempotent).
# The app writes tz-aware UTC datetimes; naive columns raise asyncpg DataError
# ('can't subtract offset-naive and offset-aware datetimes') on publish/login.
python3 -c "
import sys
sys.path.insert(0, '/app')
from app.core.config import settings
from sqlalchemy import create_engine, text
engine = create_engine(settings.DATABASE_URL_SYNC)
targets = [
    ('editions', 'published_at'),
    ('matters', 'published_at'),
    ('users', 'password_changed_at'),
    ('users', 'locked_until'),
]
with engine.connect() as conn:
    for table, column in targets:
        dtype = conn.execute(text(
            'SELECT data_type FROM information_schema.columns '
            'WHERE table_name=:t AND column_name=:c'
        ), {'t': table, 'c': column}).scalar()
        if dtype == 'timestamp without time zone':
            conn.execute(text(
                f'ALTER TABLE {table} ALTER COLUMN {column} TYPE timestamptz '
                f'USING {column} AT TIME ZONE \'UTC\''
            ))
            conn.commit()
            print(f'MIGRATED: {table}.{column} -> timestamptz')
        else:
            print(f'SKIP: {table}.{column} already {dtype}')
engine.dispose()
"

echo "=== DOE API: Starting application ==="
exec "$@"
