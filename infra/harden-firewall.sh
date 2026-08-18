#!/usr/bin/env bash
# Fecha as portas publicadas pelo Docker para o mundo externo.
#
# PROBLEMA: o Docker insere regras de DNAT (chain nat/DOCKER) que sao avaliadas
# ANTES da chain filter/INPUT e da regra REJECT do host. Por isso um
# `iptables -A INPUT ... REJECT` (ou UFW) NAO protege portas publicadas em
# 0.0.0.0 — Postgres, Redis, MinIO e as APIs dos modulos ficavam acessiveis
# pelo IP publico. A protecao correta e feita na chain DOCKER-USER (avaliada
# dentro de FORWARD, no caminho do trafego roteado para os containers).
#
# ESTRATEGIA (whitelist na NIC fisica de ingresso):
#   - trafego ja estabelecido: RETURN
#   - somente as portas realmente publicas (80/443 + apps preco): RETURN
#   - qualquer outra conexao NOVA vinda da NIC fisica p/ containers: DROP
# Trafego container<->container usa as bridges br-* (nao casa -i $WAN_IF) e
# segue normal. Acesso local do host (loopback / OUTPUT) tambem nao e afetado.
#
# Idempotente: pode rodar varias vezes. Requer root.
set -euo pipefail

WAN_IF="${WAN_IF:-enp0s6}"          # NIC que recebe o trafego externo (NAT Oracle)
PUBLIC_TCP="${PUBLIC_TCP:-80,443}"  # portas que DEVEM ficar publicas via Docker
# Portas de apps ja intencionalmente expostas no host (stack "preco"):
EXTRA_PUBLIC_TCP="${EXTRA_PUBLIC_TCP:-7000,7001,7002,5177}"

CHAIN=DOCKER-USER

echo "[harden] limpando regras anteriores deste script em $CHAIN..."
# Remove marcadores antigos (comment) para reaplicar limpo
while iptables -L "$CHAIN" --line-numbers -n 2>/dev/null | grep -q "govsistem-harden"; do
  line=$(iptables -L "$CHAIN" --line-numbers -n | awk '/govsistem-harden/{print $1; exit}')
  iptables -D "$CHAIN" "$line"
done

echo "[harden] aplicando whitelist na interface $WAN_IF..."
# 1) conexoes ja estabelecidas continuam
iptables -I "$CHAIN" 1 -i "$WAN_IF" -m conntrack --ctstate RELATED,ESTABLISHED \
  -m comment --comment "govsistem-harden" -j RETURN
# 2) portas publicas legitimas
iptables -I "$CHAIN" 2 -i "$WAN_IF" -p tcp -m multiport --dports "$PUBLIC_TCP" \
  -m comment --comment "govsistem-harden" -j RETURN
iptables -I "$CHAIN" 3 -i "$WAN_IF" -p tcp -m multiport --dports "$EXTRA_PUBLIC_TCP" \
  -m comment --comment "govsistem-harden" -j RETURN
# 3) todo o resto vindo de fora para os containers: DROP
iptables -A "$CHAIN" -i "$WAN_IF" \
  -m comment --comment "govsistem-harden" -j DROP

echo "[harden] regras atuais em $CHAIN:"
iptables -L "$CHAIN" -n --line-numbers
echo "[harden] OK. Para persistir apos reboot: 'netfilter-persistent save' ou salvar em /etc/iptables/rules.v4"
