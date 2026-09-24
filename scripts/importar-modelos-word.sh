#!/usr/bin/env bash
# Importa como modelo documental todo .docx novo da pasta modelos/.
#
# Roda pelo cron (a cada 10 min). Só chama a IA para arquivo cujo conteúdo
# ainda não foi importado — arquivo inalterado não gera custo nem versão nova.
# Os modelos entram sempre como RASCUNHO: o administrador confere em
# "Modelos documentais" antes de ativar.
#
#   ./importar-modelos-word.sh            # importa (usa a organização padrão)
#   ./importar-modelos-word.sh --dry-run  # só mostra o que faria
set -euo pipefail

PASTA="${MODELOS_DIR:-/home/ubuntu/sistemaweb/modelos}"
ORG="${MODELOS_ORG:-460e554c-37df-4c65-9489-983d62035a69}"  # PREFEITURA DE FAROL
CONTAINER="${MODELOS_CONTAINER:-modulo-diario-api-1}"
DESTINO=/tmp/modelos-import

APPLY="--apply"
[ "${1:-}" = "--dry-run" ] && APPLY=""

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1; then
  echo "$(date '+%F %T') api fora do ar ($CONTAINER); nada a fazer"
  exit 0
fi

# Uma cópia limpa a cada execução: arquivo removido da pasta não fica para trás.
docker exec "$CONTAINER" rm -rf "$DESTINO"
docker exec "$CONTAINER" mkdir -p "$DESTINO"
shopt -s nullglob
for arquivo in "$PASTA"/*.docx "$PASTA"/*.doc; do
  nome="$(basename "$arquivo")"
  case "$nome" in '~$'*) continue ;; esac   # temporários do Word aberto
  docker cp "$arquivo" "$CONTAINER:$DESTINO/$nome" >/dev/null
done

echo "$(date '+%F %T') importando de $PASTA"
docker exec "$CONTAINER" sh -c \
  "cd /app && PYTHONPATH=/app python scripts/import_word_folder.py '$DESTINO' --organization '$ORG' $APPLY"
docker exec "$CONTAINER" rm -rf "$DESTINO"
