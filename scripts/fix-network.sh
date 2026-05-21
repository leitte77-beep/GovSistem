#!/usr/bin/env bash
set -euo pipefail

# Garante que os containers do dev compose estejam na rede infra_public
# para que o nginx de produção consiga alcançá-los.

echo "=== Fix: Conectando containers à rede infra_public ==="

NETWORK="infra_public"
SERVICES=(
  "infra-api-1:api"
  "infra-web-public-1:web-public"
  "infra-web-admin-1:web-admin"
  "infra-worker-1"
  "infra-beat-1"
  "infra-signer-1"
)

for entry in "${SERVICES[@]}"; do
  IFS=":" read -r container alias <<< "$entry"
  if docker ps --format "{{.Names}}" | grep -q "$container"; then
    if [ -n "$alias" ]; then
      docker network connect --alias "$alias" "$NETWORK" "$container" 2>/dev/null && \
        echo "  ✔ $container conectado como $alias" || \
        echo "  ℹ $container já conectado"
    else
      docker network connect "$NETWORK" "$container" 2>/dev/null && \
        echo "  ✔ $container conectado" || \
        echo "  ℹ $container já conectado"
    fi
  fi
done

# Recarrega o nginx para usar os novos IPs
echo "  ↻ Recarregando nginx..."
docker exec infra-nginx-1 nginx -s reload 2>/dev/null && echo "  ✔ nginx recarregado" || echo "  ✘ falha ao recarregar nginx"

echo "=== Fix concluído ==="
