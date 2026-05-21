#!/usr/bin/env bash
set -euo pipefail

# Deploy manual para produção
# Uso: bash scripts/deploy-production.sh

echo "=== Deploy Produção ==="
cd "$(dirname "$0")/.."

# Verificar se está na branch correta
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "master" ] && [ "$BRANCH" != "main" ]; then
  echo "ERRO: Você está na branch '$BRANCH'. Mude para 'master' ou 'main'."
  exit 1
fi

# Verificar se há commits não enviados
if [ "$(git rev-list HEAD@{upstream}..HEAD 2>/dev/null)" != "" ]; then
  echo "AVISO: Existem commits locais não enviados ao remoto."
  read -p "Continuar mesmo assim? (s/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    exit 1
  fi
fi

git fetch origin
git reset --hard origin/"$BRANCH"

docker compose \
  -f infra/docker-compose.prod.yml \
  up -d --build --remove-orphans

docker system prune -f

echo "=== Produção atualizada ==="
