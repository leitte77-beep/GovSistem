#!/usr/bin/env bash
# Limpeza SEGURA de disco para o sistemaweb.
#
# REGRA ABSOLUTA: NUNCA apagar volumes nem dados de módulos em produção.
# Especialmente o chatgov (prefeitura em uso real) - banco, conversas,
# mensagens e midia sao INTOCAVEIS.
#
# Este script so limpa:
#   1. Build cache do docker (imagens intermediarias de build)
#   2. Imagens dangling/orfas (sem tag, nao usadas por nenhum container)
#
# NAO usa `docker system prune -a` nem `--volumes`, que apagariam imagens de
# modulos sem Dockerfile no disco e volumes de dados. Ver docs/RUNBOOK-DEPLOY.md.
set -euo pipefail

echo "=== Limpeza segura do Docker (somente cache + dangling) ==="

echo "[1/2] Removendo build cache..."
docker builder prune -f

echo "[2/2] Removendo imagens dangling..."
docker system prune -f

echo
echo "=== Uso do disco apos limpeza ==="
df -h / | tail -1
echo
echo "Importante: nenhum volume de dados foi tocado. Dados do chatgov intactos."
