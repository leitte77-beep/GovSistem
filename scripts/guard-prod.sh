#!/usr/bin/env bash
# Sourced por scripts de produção para garantir que só rode na branch certa
# Uso: source scripts/guard-prod.sh

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

if [ "$BRANCH" != "master" ] && [ "$BRANCH" != "main" ]; then
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ERRO: Operação de produção bloqueada!"
  echo "  Você está na branch: '$BRANCH'"
  echo "  Produção só pode ser alterada a partir de 'master' ou 'main'."
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "  Comando correto:  make deploy-prod"
  echo "  Ou:               bash scripts/deploy-production.sh"
  echo ""
  return 1 2>/dev/null || exit 1
fi
