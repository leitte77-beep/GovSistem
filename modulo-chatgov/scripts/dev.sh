#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CHATGOV_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${CHATGOV_DIR}/.env.dev"
PRODUCTION_ENV_FILE="${CHATGOV_DIR}/.env"
COMPOSE_FILE="${CHATGOV_DIR}/docker-compose.dev.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Arquivo ausente: ${ENV_FILE}"
  echo "Copie .env.dev.example para .env.dev e ajuste os valores."
  exit 1
fi

env_value() {
  local key="$1"
  local fallback="$2"
  local value
  value="$(sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1)"
  printf '%s' "${value:-${fallback}}"
}

BACKEND_PORT="$(env_value CHATGOV_DEV_BACKEND_PORT 13050)"
FRONTEND_PORT="$(env_value CHATGOV_DEV_FRONTEND_PORT 13051)"
CHATGOV_SAAS_JWT_SECRET="$(sed -n 's/^JWT_SECRETS=//p' "${PRODUCTION_ENV_FILE}" | tail -n 1)"
if [[ -z "${CHATGOV_SAAS_JWT_SECRET}" ]]; then
  echo "JWT_SECRETS ausente em ${PRODUCTION_ENV_FILE}; não é possível validar o SaaS."
  exit 1
fi
export CHATGOV_SAAS_JWT_SECRET

compose() {
  docker compose \
    --project-name chatgov-dev \
    --env-file "${ENV_FILE}" \
    --file "${COMPOSE_FILE}" \
    "$@"
}

case "${1:-up}" in
  up)
    compose config --quiet
    compose up -d --build
    compose ps
    echo
    echo "Frontend interno: http://127.0.0.1:${FRONTEND_PORT}"
    echo "Backend interno:  http://127.0.0.1:${BACKEND_PORT}/health"
    ;;
  stop)
    compose stop
    ;;
  restart)
    compose restart
    ;;
  down)
    compose down
    ;;
  logs)
    compose logs --follow --tail=150 "${@:2}"
    ;;
  ps|status)
    compose ps
    ;;
  build)
    compose build
    ;;
  reset-data)
    echo "Isto apaga somente banco, uploads e node_modules do projeto chatgov-dev."
    read -r -p "Digite RESETAR-DEV para continuar: " confirmation
    [[ "${confirmation}" == "RESETAR-DEV" ]] || {
      echo "Cancelado."
      exit 1
    }
    compose down --volumes
    ;;
  *)
    echo "Uso: $0 {up|stop|restart|down|logs [servico]|ps|build|reset-data}"
    exit 2
    ;;
esac
