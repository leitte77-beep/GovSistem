#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CHATGOV_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd -- "${CHATGOV_DIR}/.." && pwd)"
COMPOSE_FILE="${CHATGOV_DIR}/docker-compose.yml"
PROD_ENV="${CHATGOV_DIR}/.env"
BACKUP_DIR="${REPO_DIR}/backups/chatgov-promotions"
TARGET_COMMIT="${1:-}"

if [[ -z "${TARGET_COMMIT}" ]]; then
  echo "Uso: $0 <commit-git-validado>"
  exit 2
fi

cd "${REPO_DIR}"
resolved_commit="$(git rev-parse --verify "${TARGET_COMMIT}^{commit}")"
current_commit="$(git rev-parse HEAD)"
short_commit="$(git rev-parse --short=12 "${resolved_commit}")"

if [[ "${resolved_commit}" != "${current_commit}" ]]; then
  echo "O checkout atual não corresponde ao commit solicitado."
  echo "Atual:     ${current_commit}"
  echo "Solicitado:${resolved_commit}"
  exit 1
fi

if [[ -n "$(git status --porcelain -- modulo-chatgov)" ]]; then
  echo "Há alterações não commitadas em modulo-chatgov. Promoção cancelada."
  exit 1
fi

docker inspect modulo-chatgov-backend-1 modulo-chatgov-frontend-1 \
  modulo-chatgov-postgres-1 >/dev/null
docker compose --env-file "${PROD_ENV}" --file "${COMPOSE_FILE}" config --quiet

release_backend="chatgov-release-backend:${short_commit}"
release_frontend="chatgov-release-frontend:${short_commit}"

echo "Construindo release imutável ${short_commit}..."
docker build --tag "${release_backend}" "${CHATGOV_DIR}/backend"
docker build --tag "${release_frontend}" "${CHATGOV_DIR}/frontend"

echo "Validando build do frontend..."
docker run --rm --entrypoint test "${release_frontend}" -f /app/dist/index.html

mkdir -p "${BACKUP_DIR}"
backup_file="${BACKUP_DIR}/chatgov-${short_commit}-$(date -u +%Y%m%dT%H%M%SZ).sql"
echo "Criando backup do banco de produção em ${backup_file}..."
docker exec modulo-chatgov-postgres-1 sh -c \
  'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' >"${backup_file}"

old_backend="$(docker inspect --format '{{.Image}}' modulo-chatgov-backend-1)"
old_frontend="$(docker inspect --format '{{.Image}}' modulo-chatgov-frontend-1)"

echo
echo "Release pronta: ${short_commit}"
echo "A próxima etapa recria somente backend e frontend do ChatGov."
read -r -p "Digite PROMOVER para atualizar a produção: " confirmation
[[ "${confirmation}" == "PROMOVER" ]] || {
  echo "Cancelado. Produção não foi alterada."
  exit 1
}

# O nginx da borda resolve o hostname do upstream uma vez, no start, e cacheia o
# IP no worker. Recriar o container do módulo lhe dá um IP novo e a borda passa a
# responder 502 mesmo com o módulo saudável — só o reload re-resolve.
recarregar_borda() {
  if ! docker inspect infra-nginx-1 >/dev/null 2>&1; then
    echo "AVISO: infra-nginx-1 não encontrado; recarregue a borda manualmente."
    return 0
  fi
  docker exec infra-nginx-1 nginx -s reload ||
    echo "AVISO: falha ao recarregar infra-nginx-1; a borda pode responder 502."
}

rollback() {
  trap - ERR
  echo "Falha de saúde detectada; restaurando imagens anteriores..."
  docker tag "${old_backend}" modulo-chatgov-backend:latest
  docker tag "${old_frontend}" modulo-chatgov-frontend:latest
  docker compose --env-file "${PROD_ENV}" --file "${COMPOSE_FILE}" \
    up -d --no-deps --force-recreate backend frontend
  recarregar_borda
}
trap rollback ERR

docker tag "${release_backend}" modulo-chatgov-backend:latest
docker tag "${release_frontend}" modulo-chatgov-frontend:latest
docker compose --env-file "${PROD_ENV}" --file "${COMPOSE_FILE}" \
  up -d --no-deps --force-recreate backend frontend

for _ in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3050/health >/dev/null &&
     curl --fail --silent http://127.0.0.1:3051/ >/dev/null; then
    trap - ERR
    recarregar_borda
    echo "Produção atualizada com sucesso para ${short_commit}."
    echo "Backup: ${backup_file}"
    exit 0
  fi
  sleep 2
done

echo "Os serviços não ficaram saudáveis no prazo."
false
