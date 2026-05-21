#!/usr/bin/env bash
set -euo pipefail

# Deploy manual para staging
# Uso: bash scripts/deploy-staging.sh

echo "=== Deploy Staging ==="
cd "$(dirname "$0")/.."

git fetch origin
git reset --hard origin/develop

docker compose \
  -p sistemaweb-staging \
  -f infra/docker-compose.staging.yml \
  up -d --build --remove-orphans

docker system prune -f

echo "=== Staging atualizado ==="
echo "Portal: http://$(hostname -I | awk '{print $1}'):8080"
echo "Admin:  http://$(hostname -I | awk '{print $1}'):8081"
