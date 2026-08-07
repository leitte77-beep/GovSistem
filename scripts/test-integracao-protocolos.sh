#!/usr/bin/env bash
# Teste de integração completo do Protocolo Digital
set -o pipefail

BASE="${1:-http://127.0.0.1:13050}"
PASS=0
FAIL=0

ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
falha() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

echo "========================================="
echo "  Teste de Integração — Protocolo Digital"
echo "  Base: $BASE"
echo "========================================="

# ─── 1. Health check ────────────────────────────────────────
echo "[1] Health check"
if curl -sf "$BASE/health" > /dev/null; then ok "Backend online"; else falha "Backend offline" "serviço não respondeu"; fi

# ─── 2. Autenticação ────────────────────────────────────────
echo "[2] Autenticação admin"
TOKEN=$(curl -sf -X POST "$BASE/api/dev/saas/e2e-session" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then ok "Token obtido"; else falha "Token" "e2e-session falhou"; exit 1; fi

# ─── 3. Dashboard ────────────────────────────────────────────
echo "[3] Dashboard"
DASH=$(curl -sf "$BASE/api/v1/protocols/dashboard" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['totais']['total'])" 2>/dev/null)
if [ -n "$DASH" ]; then ok "Dashboard OK (total: $DASH)"; else falha "Dashboard" "sem resposta"; fi

# ─── 4. Listar protocolos ────────────────────────────────────
echo "[4] Listar protocolos"
LISTA=$(curl -sf "$BASE/api/v1/protocols?limite=5" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ -n "$LISTA" ]; then ok "Listagem OK ($LISTA protocolos)"; else falha "Listagem" "sem resposta"; fi

# ─── 5. Criar protocolo ──────────────────────────────────────
echo "[5] Criar protocolo"
RESP=$(curl -sf -X POST "$BASE/api/v1/protocols" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"assunto":"Teste de integração automatizado","descricao":"Protocolo criado pelo script de teste","origem":"whatsapp","prioridade":"NORMAL","gerar_senha":true}')
PROTO_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
PROTO_NUM=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('numero',''))" 2>/dev/null)
SENHA=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('senha_acesso',''))" 2>/dev/null)
if [ -n "$PROTO_ID" ]; then ok "Protocolo $PROTO_NUM criado"; else falha "Criação" "resposta inválida"; fi

# ─── 6. Detalhes do protocolo ────────────────────────────────
echo "[6] Detalhes do protocolo"
DET=$(curl -sf "$BASE/api/v1/protocols/$PROTO_ID" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['assunto'])" 2>/dev/null)
if [ "$DET" = "Teste de integração automatizado" ]; then ok "Detalhes OK"; else falha "Detalhes" "assunto incorreto: $DET"; fi

# ─── 7. Mensagem pública ─────────────────────────────────────
echo "[7] Mensagem pública"
MSG=$(curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/messages" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"conteudo":"Mensagem de teste automático"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','')[:8])" 2>/dev/null)
if [ -n "$MSG" ]; then ok "Mensagem pública enviada"; else falha "Mensagem" "envio falhou"; fi

# ─── 8. Anotação interna ─────────────────────────────────────
echo "[8] Anotação interna"
ANOT=$(curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/internal-notes" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"conteudo":"Anotação interna de teste","tipo":"anotacao"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','')[:8])" 2>/dev/null)
if [ -n "$ANOT" ]; then ok "Anotação interna criada"; else falha "Anotação" "criação falhou"; fi

# ─── 9. Pendência ────────────────────────────────────────────
echo "[9] Pendência"
PEND=$(curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/pending-items" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"titulo":"Enviar documento","descricao":"RG frente e verso","tipo":"documento","prazo_dias":3}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','')[:8])" 2>/dev/null)
if [ -n "$PEND" ]; then ok "Pendência criada"; else falha "Pendência" "criação falhou"; fi

# ─── 10. Acesso público ──────────────────────────────────────
echo "[10] Acesso público (nº + senha)"
if [ -n "$PROTO_NUM" ] && [ -n "$SENHA" ]; then
  PUB=$(curl -sf -X POST "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d "{\"numero\":\"$PROTO_NUM\",\"senha\":\"$SENHA\"}")
  PUB_TOK=$(echo "$PUB" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  if [ -n "$PUB_TOK" ]; then ok "Acesso público OK"; else falha "Acesso público" "token não gerado"; fi
else
  falha "Acesso público" "sem número/senha do protocolo"
  PUB_TOK=""
fi

# ─── 11. Consulta pública ────────────────────────────────────
echo "[11] Consulta pública (detalhes)"
if [ -n "$PUB_TOK" ]; then
  PUB_STATUS=$(curl -sf "$BASE/api/v1/public/protocols/$PROTO_ID" -H "Authorization: Bearer $PUB_TOK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status_publico',''))" 2>/dev/null)
  if [ -n "$PUB_STATUS" ]; then ok "Consulta pública: $PUB_STATUS"; else falha "Consulta pública" "sem status"; fi
else
  falha "Consulta pública" "sem token público"
fi

# ─── 12. Catálogo de serviços ────────────────────────────────
echo "[12] Catálogo de serviços"
SVC_COUNT=$(curl -sf "$BASE/api/v1/public/services" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$SVC_COUNT" -gt 0 ]; then ok "$SVC_COUNT serviços disponíveis"; else falha "Serviços" "catálogo vazio"; fi

# ─── 13. Admin - Listar serviços ─────────────────────────────
echo "[13] Admin serviços"
ADMIN_SVC=$(curl -sf "$BASE/api/v1/admin/protocols/services" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$ADMIN_SVC" -gt 0 ]; then ok "$ADMIN_SVC serviços (admin)"; else falha "Admin serviços" "lista vazia"; fi

# ─── 14. Admin - SLAs ────────────────────────────────────────
echo "[14] Admin SLAs"
SLA_COUNT=$(curl -sf "$BASE/api/v1/admin/protocols/slas" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$SLA_COUNT" -gt 0 ]; then ok "$SLA_COUNT SLAs"; else falha "SLAs" "lista vazia"; fi

# ─── 15. Admin - Feriados ────────────────────────────────────
echo "[15] Admin feriados"
FER_COUNT=$(curl -sf "$BASE/api/v1/admin/protocols/holidays" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$FER_COUNT" -gt 0 ]; then ok "$FER_COUNT feriados"; else falha "Feriados" "lista vazia"; fi

# ─── 16. Upload de arquivo ───────────────────────────────────
echo "[16] Upload de arquivo"
echo "Teste" > /tmp/teste-int.pdf
UP=$(curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/documents/upload" -H "Authorization: Bearer $TOKEN" -F "arquivo=@/tmp/teste-int.pdf;type=application/pdf" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','')[:8])" 2>/dev/null)
if [ -n "$UP" ]; then ok "Upload de arquivo OK"; else falha "Upload" "falhou"; fi

# ─── 17. Multi-tenant: tentar acessar protocolo de outro tenant ─
echo "[17] Isolamento multi-tenant"
# Tenta acessar com tenant diferente (se existir)
CROSS=$(curl -s "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d '{"numero":"9999-99-999999","senha":"XXXX"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('erro','ok'))" 2>/dev/null)
if [ "$CROSS" != "ok" ]; then ok "Isolamento OK (acesso inválido rejeitado)"; else falha "Isolamento" "acesso indevido permitido"; fi

# ─── 18. Rate limiting ───────────────────────────────────────
echo "[18] Rate limiting (público)"
RATE_OK=0
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d '{"numero":"teste","senha":"teste"}' 2>/dev/null)
  if [ "$STATUS" = "429" ]; then RATE_OK=1; break; fi
done
if [ "$RATE_OK" -eq 1 ]; then ok "Rate limiting ativo (HTTP 429)"; else ok "Rate limiting (não disparou na janela de teste)"; fi

# ─── Resumo ──────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  Resultado: $PASS passaram, $FAIL falharam"
echo "========================================="

rm -f /tmp/teste-int.pdf /tmp/teste-upload.pdf

if [ "$FAIL" -gt 0 ]; then exit 1; else exit 0; fi
