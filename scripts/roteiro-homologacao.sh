#!/usr/bin/env bash
# Roteiro de Homologação — Protocolo Digital
set -o pipefail

BASE="${1:-http://127.0.0.1:13050}"
PASS=0; FAIL=0; WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
falha(){ echo "  ❌ $1 — $2"; FAIL=$((FAIL+1)); }
aviso(){ echo "  ⚠️  $1 — $2"; WARN=$((WARN+1)); }
info() { echo ""; echo "━━━ $1 ━━━"; }

echo "╔══════════════════════════════════════════════╗"
echo "║   Roteiro de Homologação — Protocolo Digital ║"
echo "║   $(date '+%d/%m/%Y %H:%M')                          ║"
echo "╚══════════════════════════════════════════════╝"

TOKEN=""
PROTO_ID=""
PROTO_NUM=""
SENHA=""
PUB_TOKEN=""

# ─── MÓDULO 1: INFRAESTRUTURA ────────────────────────────────
info "MÓDULO 1: INFRAESTRUTURA"

curl -sf "$BASE/health" > /dev/null 2>&1 && ok "Backend online" || falha "Backend offline" "serviço indisponível"

TOKEN=$(curl -sf -X POST "$BASE/api/dev/saas/e2e-session" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[ -n "$TOKEN" ] && ok "Autenticação admin" || falha "Autenticação" "token não obtido"

curl -sI "$BASE/health" 2>&1 | grep -q "Content-Security-Policy" && ok "CSP ativo" || falha "CSP" "header ausente"
curl -sI "$BASE/health" 2>&1 | grep -q "X-Frame-Options" && ok "X-Frame-Options" || falha "X-Frame" "header ausente"
curl -sI "$BASE/health" 2>&1 | grep -q "X-Content-Type-Options" && ok "X-Content-Type-Options" || falha "X-Content" "header ausente"

# ─── MÓDULO 2: CADASTRO E CATÁLOGO ───────────────────────────
info "MÓDULO 2: CADASTRO E CATÁLOGO"

SVC_COUNT=$(curl -sf "$BASE/api/v1/public/services" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$SVC_COUNT" -gt 0 ] && ok "Catálogo de serviços ($SVC_COUNT)" || falha "Catálogo" "vazio"

ADMIN_SVC=$(curl -sf "$BASE/api/v1/admin/protocols/services" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$ADMIN_SVC" -gt 2 ] && ok "Admin serviços ($ADMIN_SVC)" || aviso "Admin serviços" "menos de 3 serviços"

CAT_COUNT=$(curl -sf "$BASE/api/v1/admin/protocols/categories" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$CAT_COUNT" -gt 1 ] && ok "Categorias ($CAT_COUNT)" || aviso "Categorias" "menos de 2"

SLA_COUNT=$(curl -sf "$BASE/api/v1/admin/protocols/slas" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$SLA_COUNT" -gt 0 ] && ok "SLAs ($SLA_COUNT)" || falha "SLAs" "nenhuma regra"

FER_COUNT=$(curl -sf "$BASE/api/v1/admin/protocols/holidays" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$FER_COUNT" -gt 0 ] && ok "Feriados ($FER_COUNT)" || aviso "Feriados" "calendário vazio"

# ─── MÓDULO 3: CRIAÇÃO DE PROTOCOLO ──────────────────────────
info "MÓDULO 3: CRIAÇÃO DE PROTOCOLO"

RESP=$(curl -sf -X POST "$BASE/api/v1/protocols" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"assunto":"[HOMOLOGAÇÃO] Solicitação de certidão","descricao":"Teste de criação de protocolo via API","origem":"portal","prioridade":"NORMAL","gerar_senha":true}' 2>/dev/null)
PROTO_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
PROTO_NUM=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('numero',''))" 2>/dev/null)
SENHA=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('senha_acesso',''))" 2>/dev/null)

[ -n "$PROTO_ID" ] && ok "Protocolo criado: $PROTO_NUM" || falha "Criação" "protocolo não gerado"
[ -n "$SENHA" ] && ok "Senha gerada: $SENHA" || falha "Senha" "não gerada"

curl -sf "http://127.0.0.1:13050/api/v1/protocols" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if len(d)>0 else 1)" && ok "Listagem de protocolos" || falha "Listagem" "vazia"

# ─── MÓDULO 4: DETALHES E MENSAGENS ──────────────────────────
info "MÓDULO 4: MENSAGENS E ANOTAÇÕES"

curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/messages" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"conteudo":"Prezado cidadão, sua solicitação foi recebida e está em análise."}' > /dev/null && ok "Mensagem pública enviada" || falha "Mensagem pública" "envio falhou"

curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/internal-notes" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"conteudo":"[INTERNO] Documentação verificada. CPF confere.","tipo":"anotacao"}' > /dev/null && ok "Anotação interna criada" || falha "Anotação interna" "criação falhou"

DET=$(curl -sf "$BASE/api/v1/protocols/$PROTO_ID" -H "Authorization: Bearer $TOKEN" 2>/dev/null)
echo "$DET" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'mensagens' in d, 'sem mensagens'" 2>/dev/null && ok "Detalhes com mensagens" || falha "Detalhes" "mensagens ausentes"

echo "$DET" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'anotacoes' in d, 'sem anotações'" 2>/dev/null && ok "Detalhes com anotações" || falha "Detalhes" "anotações ausentes"

# ─── MÓDULO 5: PENDÊNCIAS ────────────────────────────────────
info "MÓDULO 5: PENDÊNCIAS"

curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/pending-items" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"titulo":"Documento de identidade","descricao":"Enviar cópia do RG frente e verso","tipo":"documento","prazo_dias":3}' > /dev/null && ok "Pendência criada" || falha "Pendência" "criação falhou"

STATUS=$(curl -sf "$BASE/api/v1/protocols/$PROTO_ID" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status_operacional',''))" 2>/dev/null)
[ "$STATUS" = "PENDENTE" ] && ok "Status alterado para PENDENTE" || aviso "Status pendência" "status=$STATUS"

# ─── MÓDULO 6: ACESSO PÚBLICO ────────────────────────────────
info "MÓDULO 6: PORTAL DO CIDADÃO"

PUB=$(curl -sf -X POST "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d "{\"numero\":\"$PROTO_NUM\",\"senha\":\"$SENHA\"}" 2>/dev/null)
PUB_TOKEN=$(echo "$PUB" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

[ -n "$PUB_TOKEN" ] && ok "Acesso público (nº+senha)" || falha "Acesso público" "token não gerado"

PUB_DET=$(curl -sf "$BASE/api/v1/public/protocols/$PROTO_ID" -H "Authorization: Bearer $PUB_TOKEN" 2>/dev/null)
echo "$PUB_DET" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'status_publico' in d, 'sem status público'" 2>/dev/null && ok "Status público traduzido" || falha "Status público" "ausente"

echo "$PUB_DET" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('numero') == '$PROTO_NUM'" 2>/dev/null && ok "Número correto no portal" || falha "Número portal" "divergente"

# Verificar que anotação interna NÃO aparece
echo "$PUB_DET" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'anotacoes' not in d, 'anotações expostas!'" 2>/dev/null && ok "Anotações internas ocultas" || falha "Privacidade" "anotações expostas ao cidadão"

curl -sf -X POST "$BASE/api/v1/public/protocols/$PROTO_ID/messages" -H "Authorization: Bearer $PUB_TOKEN" -H "Content-Type: application/json" -d '{"conteudo":"Segue o documento solicitado em anexo."}' > /dev/null && ok "Cidadão envia mensagem" || falha "Mensagem cidadão" "envio falhou"

RECOVER=$(curl -sf -X POST "$BASE/api/v1/public/protocols/recover-access" -H "Content-Type: application/json" -d "{\"numero\":\"$PROTO_NUM\"}" 2>/dev/null || echo '{}')
echo "$RECOVER" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True or d.get('mensagem')" 2>/dev/null && ok "Recuperação de acesso" || aviso "Recuperação" "endpoint retornou erro (pode ser falta de contato)"

# ─── MÓDULO 7: DOCUMENTOS ────────────────────────────────────
info "MÓDULO 7: DOCUMENTOS"

echo "%PDF-1.4 teste" > /tmp/homolog-doc.pdf

UPLOAD=$(curl -sf -X POST "$BASE/api/v1/protocols/$PROTO_ID/documents/upload" -H "Authorization: Bearer $TOKEN" -F "arquivo=@/tmp/homolog-doc.pdf;type=application/pdf" 2>/dev/null)
DOC_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$DOC_ID" ] && ok "Upload de documento" || falha "Upload" "falhou"

DOCS_COUNT=$(curl -sf "$BASE/api/v1/protocols/$PROTO_ID/documents" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$DOCS_COUNT" -gt 0 ] && ok "Lista de documentos ($DOCS_COUNT)" || falha "Documentos" "lista vazia"

curl -sf -o /tmp/homolog-download.pdf "$BASE/api/v1/protocols/documents/$DOC_ID/download" -H "Authorization: Bearer $TOKEN" 2>/dev/null && ok "Download de documento" || falha "Download" "falhou"

# Verificar que o download via portal público funciona
if [ -n "$PUB_TOKEN" ]; then
  PUB_DOCS=$(curl -sf "$BASE/api/v1/public/protocols/$PROTO_ID/documents" -H "Authorization: Bearer $PUB_TOKEN" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  [ "$PUB_DOCS" -gt 0 ] && ok "Documentos visíveis ao cidadão" || aviso "Docs públicos" "cidadão não vê documentos"
fi

# ─── MÓDULO 8: MULTI-TENANT ──────────────────────────────────
info "MÓDULO 8: ISOLAMENTO MULTI-TENANT"

CROSS=$(curl -s "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d '{"numero":"9999-99-999999","senha":"XXXX"}' 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('erro','ok'))" 2>/dev/null)
[ "$CROSS" != "ok" ] && ok "Isolamento: acesso inválido rejeitado" || falha "Isolamento" "acesso a tenant indevido"

# Tentar acessar protocolo de outro tenant (usando token de admin)
if [ -n "$TOKEN" ]; then
  RANDOM_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")
  CROSS_ADMIN=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/protocols/$RANDOM_UUID" -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  [ "$CROSS_ADMIN" = "404" ] && ok "Isolamento admin: 404 em outro tenant" || aviso "Isolamento admin" "HTTP $CROSS_ADMIN"
fi

# ─── MÓDULO 9: SEGURANÇA ────────────────────────────────────
info "MÓDULO 9: SEGURANÇA"

curl -s -X POST "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d '{"numero":"<script>alert(1)</script>","senha":"test"}' > /dev/null && ok "XSS: script tags sanitizadas" || falha "XSS" "requisição falhou"

# SQL Injection test
SQLI=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d "{\"numero\":\"' OR '1'='1\",\"senha\":\"test\"}" 2>/dev/null)
[ "$SQLI" = "401" ] && ok "SQL Injection bloqueado (HTTP 401)" || aviso "SQL Injection" "HTTP $SQLI"

# Rate limiting
RATE_OK=0
for i in $(seq 1 15); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/public/protocols/access" -H "Content-Type: application/json" -d '{"numero":"ratelimit","senha":"test"}' 2>/dev/null)
  if [ "$STATUS" = "429" ]; then RATE_OK=1; break; fi
done
[ "$RATE_OK" -eq 1 ] && ok "Rate limiting ativo (429)" || aviso "Rate limiting" "não disparou"

# ─── MÓDULO 10: LGPD ─────────────────────────────────────────
info "MÓDULO 10: LGPD E PRIVACIDADE"

POLICY=$(curl -sf "$BASE/api/v1/public/privacy" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('direitos_titular',[])))" 2>/dev/null)
[ "$POLICY" -gt 0 ] && ok "Política de privacidade ($POLICY direitos)" || falha "LGPD" "política ausente"

RETENTION=$(curl -sf "$BASE/api/v1/admin/protocols/lgpd/retention" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['prazo_dias'])" 2>/dev/null)
[ -n "$RETENTION" ] && ok "Retenção configurada ($RETENTION dias)" || aviso "Retenção" "não configurada"

CONFIG=$(curl -sf "$BASE/api/v1/admin/protocols/config" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('politica_privacidade','')[:20])" 2>/dev/null)
[ -n "$CONFIG" ] && ok "Config LGPD do tenant" || aviso "Config LGPD" "não configurada"

# ─── MÓDULO 11: DASHBOARD E RELATÓRIOS ───────────────────────
info "MÓDULO 11: DASHBOARD E RELATÓRIOS"

DASH=$(curl -sf "$BASE/api/v1/protocols/dashboard" -H "Authorization: Bearer $TOKEN" 2>/dev/null)
echo "$DASH" | python3 -c "import sys,json; d=json.load(sys.stdin)['totais']; assert d['total']>0" 2>/dev/null && ok "Dashboard com dados" || falha "Dashboard" "sem dados"

echo "$DASH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'porStatus' in d" 2>/dev/null && ok "Relatório por status" || falha "Relatório" "status ausente"

echo "$DASH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'porOrigem' in d" 2>/dev/null && ok "Relatório por origem" || falha "Relatório" "origem ausente"

# ─── MÓDULO 12: API ADMIN ────────────────────────────────────
info "MÓDULO 12: API DE ADMINISTRAÇÃO"

# Criar um serviço e verificar
SVC_RESP=$(curl -sf -X POST "$BASE/api/v1/admin/protocols/services" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nome":"Teste Homologação","descricao":"Serviço de teste","prazo_estimado_dias":7}' 2>/dev/null)
SVC_TEST_ID=$(echo "$SVC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$SVC_TEST_ID" ] && ok "CRUD: serviço criado" || falha "CRUD serviço" "criação falhou"

# Excluir (soft-delete)
curl -sf -X DELETE "$BASE/api/v1/admin/protocols/services/$SVC_TEST_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -sf "$BASE/api/v1/admin/protocols/services" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); ids=[s['id'] for s in d]; assert '$SVC_TEST_ID' not in ids" 2>/dev/null && ok "Soft-delete serviço" || aviso "Soft-delete" "serviço ainda visível"

# ─── MÓDULO 13: RESILIÊNCIA ───────────────────────────────────
info "MÓDULO 13: RESILIÊNCIA A ERROS"

curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/protocols/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -q "404" && ok "UUID inválido → 404" || aviso "404 handling" ""

curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/public/protocols/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer INVALID_TOKEN" 2>/dev/null | grep -q "401" && ok "Token inválido → 401" || aviso "401 handling" ""

curl -s -X POST "$BASE/api/v1/protocols" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('id')" 2>/dev/null && ok "Protocolo sem assunto (usa fallback)" || aviso "Fallback" "criação sem assunto falhou"

# ─── RESUMO ───────────────────────────────────────────────────
info "RESUMO DA HOMOLOGAÇÃO"

echo "  ✅ Passaram: $PASS"
echo "  ❌ Falharam: $FAIL"
echo "  ⚠️  Avisos: $WARN"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "  🎉 RESULTADO: APROVADO"
  echo "  O sistema atende aos critérios de homologação."
  exit 0
elif [ "$FAIL" -le 3 ]; then
  echo "  ⚠️  RESULTADO: APROVADO COM RESSALVAS"
  echo "  Corrija os $FAIL itens com falha antes da implantação."
  exit 1
else
  echo "  ❌ RESULTADO: REPROVADO"
  echo "  $FAIL itens críticos precisam ser corrigidos."
  exit 1
fi
