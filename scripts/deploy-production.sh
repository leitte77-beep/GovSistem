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
# `git reset --hard` alinha o disco ao master remoto. Todo compose/Dockerfile de
# producao PRECISA estar versionado em master, senao e apagado aqui (foi assim que
# se perderam composes e Dockerfiles dos modulos). Ver docs/RUNBOOK-DEPLOY.md.
git reset --hard origin/"$BRANCH"

# IMPORTANTE: sem --remove-orphans. Os modulos govsocial/chatgov/saas-platform/preco
# NAO estao neste arquivo; --remove-orphans os removeria (derrubando producao).
# Este deploy atualiza SOMENTE os servicos do stack `infra`.
docker compose \
  -f infra/docker-compose.prod.yml \
  up -d --build

# `prune -f` remove apenas imagens dangling e redes sem uso (nao toca volumes nem
# imagens/containers em uso). NUNCA usar `-a` ou `--volumes` aqui.
docker system prune -f

echo "=== Produção atualizada (stack infra) ==="
echo "Modulos fora deste deploy (subir/atualizar manualmente): govsocial, chatgov, saas-platform, preco"
