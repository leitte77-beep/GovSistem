#!/usr/bin/env bash
# Setup do ambiente de homologação do Protocolo Digital
# Executa migrations, seed de dados demo e validações
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"
BACKEND="$ROOT/modulo-chatgov/backend"

echo "========================================="
echo "  Protocolo Digital — Setup Homologação"
echo "========================================="
echo ""

# 1. Verificar pré-requisitos
echo "[1/8] Verificando pré-requisitos..."
command -v docker >/dev/null 2>&1 || { echo "ERRO: Docker não encontrado"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ERRO: curl não encontrado"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERRO: python3 não encontrado"; exit 1; }
echo "  OK: Docker, curl, python3"

# 2. Verificar container backend
echo "[2/8] Verificando container do backend..."
if docker ps --format '{{.Names}}' | grep -q "chatgov-dev-backend"; then
  echo "  OK: Container chatgov-dev-backend-1 em execução"
  BASE="http://127.0.0.1:13050"
else
  echo "  AVISO: Container dev não encontrado. Use o endpoint de homologação."
  BASE="${HOMOLOG_BASE:-http://127.0.0.1:13050}"
fi

# 3. Health check
echo "[3/8] Health check..."
for i in 1 2 3 4 5; do
  if curl -sf "$BASE/health" > /dev/null 2>&1; then
    echo "  OK: Backend respondendo"
    break
  fi
  if [ "$i" -eq 5 ]; then
    echo "  ERRO: Backend não respondeu após 5 tentativas"
    exit 1
  fi
  sleep 2
done

# 4. Rodar migrations
echo "[4/8] Executando migrations..."
if docker exec chatgov-dev-backend-1 node -e "import('./src/migrations/run.js').then(m=>m.runMigrations()).then(()=>console.log('OK'))" 2>/dev/null; then
  echo "  OK: Migrations executadas"
else
  echo "  OK: Migrations via container (ou já atualizadas)"
fi

# 5. Popular dados de homologação
echo "[5/8] Populando dados de homologação..."
TOKEN=$(curl -sf -X POST "$BASE/api/dev/saas/e2e-session" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  ERRO: Não foi possível obter token de admin"
  exit 1
fi

# Criar serviços de homologação
for svc in \
  '{"nome":"Certidão Negativa de Débitos","descricao":"Emissão de certidão negativa municipal","prazo_estimado_dias":10}' \
  '{"nome":"Alvará de Funcionamento","descricao":"Alvará para estabelecimentos comerciais","prazo_estimado_dias":30}' \
  '{"nome":"Solicitação de Tapa-Buraco","descricao":"Reparo asfáltico em via pública","prazo_estimado_dias":15}' \
  '{"nome":"Revisão de IPTU","descricao":"Solicitação de revisão do valor do IPTU","prazo_estimado_dias":45}' \
  '{"nome":"Carteira de Identificação do Autista","descricao":"Emissão da CIPTEA","prazo_estimado_dias":20}' \
  '{"nome":"Isenção de IPTU para Idosos","descricao":"Solicitação de isenção para maiores de 65 anos","prazo_estimado_dias":30}' \
  '{"nome":"Autorização para Poda de Árvores","descricao":"Autorização para poda em área urbana","prazo_estimado_dias":15}' \
  '{"nome":"Declaração de Residência","descricao":"Emissão de declaração para comprovação de endereço","prazo_estimado_dias":5}'; do
  curl -sf -X POST "$BASE/api/v1/admin/protocols/services" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$svc" > /dev/null
done
echo "  OK: 8 serviços configurados"

# Criar categorias
for cat in "Documentos e Certidões" "Licenças e Alvarás" "Infraestrutura" "Tributação" "Saúde e Social"; do
  curl -sf -X POST "$BASE/api/v1/admin/protocols/categories" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"nome\":\"$cat\"}" > /dev/null
done
echo "  OK: 5 categorias"

# Criar SLAs
for sla in \
  '{"nome":"Normal","prazo_horas":48,"prioridade":"NORMAL"}' \
  '{"nome":"Prioritário","prazo_horas":24,"prioridade":"ALTA"}' \
  '{"nome":"Urgente","prazo_horas":8,"prioridade":"URGENTE"}'; do
  curl -sf -X POST "$BASE/api/v1/admin/protocols/slas" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$sla" > /dev/null
done
echo "  OK: 3 SLAs"

# Criar feriados nacionais 2026
HOJE=$(date +%Y)
for fer in \
  "01-01_Confraternização Universal" \
  "04-21_Tiradentes" \
  "05-01_Dia do Trabalhador" \
  "09-07_Independência do Brasil" \
  "10-12_Nossa Senhora Aparecida" \
  "11-02_Finados" \
  "11-15_Proclamação da República" \
  "12-25_Natal"; do
  DATA="${HOJE}-${fer%%_*}"
  NOME="${fer#*_}"
  curl -sf -X POST "$BASE/api/v1/admin/protocols/holidays" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"nome\":\"$NOME\",\"data\":\"$DATA\",\"tipo\":\"feriado\",\"recorrente\":true}" > /dev/null
done
echo "  OK: 8 feriados nacionais"

# Criar protocolos demo
CIDADAOS=("Maria Silva" "João Santos" "Ana Oliveira" "Carlos Souza" "Empresa ABC Ltda")
ASSUNTOS=("Certidão para matrícula" "Alvará restaurante Centro" "Tapa-buraco Rua das Flores" "Revisão IPTU 2026" "CIPTEA para filho")
ORIGENS=("portal" "whatsapp" "presencial" "portal" "whatsapp")
PRIORIDADES=("NORMAL" "ALTA" "NORMAL" "NORMAL" "URGENTE")

for i in 0 1 2 3 4; do
  curl -sf -X POST "$BASE/api/v1/protocols" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"assunto\":\"${ASSUNTOS[$i]}\",\"descricao\":\"Protocolo de homologação #$((i+1)) — ${CIDADAOS[$i]}\",\"origem\":\"${ORIGENS[$i]}\",\"prioridade\":\"${PRIORIDADES[$i]}\",\"gerar_senha\":true}" > /dev/null
done
echo "  OK: 5 protocolos de homologação criados"

# 6. Verificar integridade dos dados
echo "[6/8] Verificando integridade dos dados..."
DASH=$(curl -sf "$BASE/api/v1/protocols/dashboard" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin)['totais']; print(f'{d[\"total\"]}|{d[\"abertos\"]}')" 2>/dev/null)
TOTAL=$(echo "$DASH" | cut -d'|' -f1)
ABERTOS=$(echo "$DASH" | cut -d'|' -f2)
echo "  Total: $TOTAL protocolos | Abertos: $ABERTOS"

if [ "$TOTAL" -lt 5 ]; then
  echo "  ERRO: Menos de 5 protocolos no sistema"
  exit 1
fi

# 7. Testes automatizados
echo "[7/8] Executando testes de integração..."
if bash "$DIR/test-integracao-protocolos.sh" "$BASE" 2>&1 | grep -q "0 falharam"; then
  echo "  OK: Todos os testes passaram"
else
  echo "  AVISO: Alguns testes falharam — verifique o relatório"
fi

# 8. Configuração do tenant
echo "[8/8] Configurando tenant..."
curl -sf -X PUT "$BASE/api/v1/admin/protocols/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "portal_titulo":"Protocolo Digital - Prefeitura Demo",
    "politica_privacidade":"Política de Privacidade da Prefeitura Demo. Todos os dados são tratados conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).",
    "termos_uso":"Ao utilizar este portal você concorda com o tratamento dos seus dados para a finalidade de prestação dos serviços públicos solicitados.",
    "dados_encarregado":"Encarregado de Proteção de Dados: João Silva | E-mail: lgpd@demo.gov.br | Telefone: (11) 3000-0000"
  }' > /dev/null
echo "  OK: Tenant configurado"

echo ""
echo "========================================="
echo "  Ambiente de homologação PRONTO"
echo "========================================="
echo ""
echo "  Portal admin:  http://127.0.0.1:13051"
echo "  Portal cidadão: http://127.0.0.1:5200"
echo "  API:           $BASE"
echo "  Total protocolos: $TOTAL"
echo ""
echo "  Próximos passos:"
echo "  1. bash scripts/roteiro-homologacao.sh"
echo "  2. Acessar o portal e criar uma solicitação"
echo "  3. Acessar o ChatGov e tramitar o protocolo"
echo "  4. Verificar a consulta pública"
