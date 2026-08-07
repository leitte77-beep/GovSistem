#!/usr/bin/env bash
# Teste de ponta a ponta do módulo Protocolo Digital.
#
# Exercita a API real contra o banco real: criação, validações, idempotência,
# tramitação, documentos, isolamento do portal do cidadão e SSL.
#
#   ./scripts/teste-protocolo-e2e.sh
#
# Requer: backend em execução, acesso ao container do postgres e curl/python3.

set -uo pipefail

API="${API_BASE:-http://localhost:3050/api/v1}"
PORTAL="${PORTAL_BASE:-https://prot.govsistem.com.br}"
PG="${PG_CONTAINER:-modulo-chatgov-postgres-1}"
TENANT="${TENANT_ID:-3a05da6a-888a-4f98-8d96-a282cc78415b}"
OPERADOR="${OPERADOR_ID:-2c92a08b-fc7d-47a0-a6c2-15db0ac31a8c}"

OK=0; FALHOU=0
verde() { printf '\033[32m✓\033[0m %s\n' "$1"; OK=$((OK+1)); }
vermelho() { printf '\033[31m✗\033[0m %s\n' "$1"; FALHOU=$((FALHOU+1)); }
secao() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

checa() { # checa <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then verde "$1"; else vermelho "$1 (esperado=$2 obtido=$3)"; fi
}

psql_() { docker exec "$PG" psql -U chatgov -d chatgov -tAc "$1" 2>/dev/null | tr -d ' '; }

TOKEN=$(docker exec modulo-chatgov-backend-1 node -e "
const jwt=require('jsonwebtoken');
console.log(jwt.sign({sub:'$OPERADOR',nome:'Teste E2E',email:'e2e@teste.org',papel:'admin',tenantId:'$TENANT'},process.env.JWT_SECRET,{expiresIn:'1h'}));
" 2>/dev/null | tail -1)

if [ -z "$TOKEN" ]; then echo "Não foi possível gerar token."; exit 1; fi
AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"

api() { # api <metodo> <caminho> [body]
  if [ -n "${3:-}" ]; then
    curl -s -X "$1" "$API$2" -H "$AUTH" -H "$JSON" -d "$3"
  else
    curl -s -X "$1" "$API$2" -H "$AUTH"
  fi
}
status_de() { # status_de <metodo> <caminho> [body]
  if [ -n "${3:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H "$AUTH" -H "$JSON" -d "$3"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H "$AUTH"
  fi
}
campo() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('$1',''))" 2>/dev/null; }

secao "1. Validações na criação"

checa "protocolo externo sem solicitante é bloqueado" 422 \
  "$(status_de POST /protocols '{"assunto":"Sem cidadao","origem":"presencial"}')"

checa "assunto obrigatório" 422 \
  "$(status_de POST /protocols '{"origem":"presencial","nome_cidadao":"X","telefone_cidadao":"44999887766"}')"

checa "origem obrigatória e explícita" 422 \
  "$(status_de POST /protocols '{"assunto":"Sem origem","nome_cidadao":"X","telefone_cidadao":"44999887766"}')"

checa "origem whatsapp exige conversa vinculada" 422 \
  "$(status_de POST /protocols '{"assunto":"Origem errada","origem":"whatsapp","nome_cidadao":"X","telefone_cidadao":"44999887766"}')"

checa "CPF inválido é recusado" 422 \
  "$(status_de POST /protocols '{"assunto":"CPF ruim","origem":"presencial","nome_cidadao":"X","cpf_cidadao":"111.111.111-11"}')"

checa "prazo no passado é recusado" 422 \
  "$(status_de POST /protocols '{"assunto":"Prazo passado","origem":"presencial","nome_cidadao":"X","cpf_cidadao":"529.982.247-25","prazo":"2020-01-01"}')"

secao "2. Criação e origem"

CRIADO=$(api POST /protocols '{"assunto":"E2E - poda de arvore","descricao":"Teste automatizado","origem":"presencial","nome_cidadao":"Cidadao E2E","cpf_cidadao":"529.982.247-25","telefone_cidadao":"44999887766"}')
PID=$(echo "$CRIADO" | campo id)
NUM=$(echo "$CRIADO" | campo numero)
SENHA=$(echo "$CRIADO" | campo senha_acesso)

[ -n "$PID" ] && verde "protocolo criado ($NUM)" || vermelho "falha ao criar protocolo"
checa "origem gravada como 'presencial', não whatsapp" presencial "$(echo "$CRIADO" | campo origem)"
[ -n "$(echo "$CRIADO" | campo cidadao_id)" ] && verde "cidadão vinculado ao protocolo" || vermelho "cidadão não vinculado"
[ -n "$SENHA" ] && verde "código de acesso gerado" || vermelho "código de acesso não gerado"

DEP=$(psql_ "SELECT id FROM departamentos WHERE tenant_id='$TENANT' LIMIT 1;")
INTERNO=$(api POST /protocols "{\"assunto\":\"E2E - requisicao interna\",\"origem\":\"interno\",\"tipo\":\"INTERNO\",\"departamento_id\":\"$DEP\"}")
checa "protocolo interno é aceito sem cidadão" False "$(echo "$INTERNO" | campo externo)"

secao "3. Segurança do código de acesso"

VAZOU=$(psql_ "SELECT count(*) FROM protocolo_credenciais WHERE acesso_hash LIKE '%$SENHA%';")
checa "código não é armazenado em texto puro" 0 "$VAZOU"

secao "4. Idempotência"

KEY="e2e-$(date +%s)-$RANDOM"
BODY='{"assunto":"E2E - clique duplo","origem":"presencial","nome_cidadao":"Cidadao E2E","cpf_cidadao":"529.982.247-25"}'
N1=$(curl -s -X POST "$API/protocols" -H "$AUTH" -H "$JSON" -H "Idempotency-Key: $KEY" -d "$BODY" | campo numero)
N2=$(curl -s -X POST "$API/protocols" -H "$AUTH" -H "$JSON" -H "Idempotency-Key: $KEY" -d "$BODY" | campo numero)
checa "clique duplo não cria protocolo duplicado" "$N1" "$N2"

secao "5. Listagem, total e paginação"

LISTA=$(api GET "/protocols?limite=3")
TOTAL=$(echo "$LISTA" | campo total)
[ -n "$TOTAL" ] && [ "$TOTAL" -gt 0 ] && verde "listagem devolve total real ($TOTAL)" || vermelho "listagem sem total"

P1=$(api GET "/protocols?limite=2&offset=0" | python3 -c "import json,sys;print(','.join(p['numero'] for p in json.load(sys.stdin)['data']))")
P2=$(api GET "/protocols?limite=2&offset=2" | python3 -c "import json,sys;print(','.join(p['numero'] for p in json.load(sys.stdin)['data']))")
[ "$P1" != "$P2" ] && verde "paginação por offset funciona" || vermelho "paginação retorna a mesma página"

for filtro in atrasados proximos_prazo sem_responsavel com_pendencia; do
  R=$(api GET "/protocols?$filtro=true&limite=1" | campo total)
  [ -n "$R" ] && verde "filtro '$filtro' é aplicado no backend" || vermelho "filtro '$filtro' não responde"
done

BUSCA=$(api GET "/protocols?busca=Cidadao%20E2E" | campo total)
[ "${BUSCA:-0}" -gt 0 ] && verde "busca encontra pelo nome do cidadão" || vermelho "busca não acha o cidadão"

secao "6. Tramitação e histórico"

D2=$(psql_ "SELECT id FROM departamentos WHERE tenant_id='$TENANT' LIMIT 1;")
checa "encaminhamento entre setores" 200 \
  "$(status_de POST "/protocols/$PID/forward" "{\"setor_destino_id\":\"$D2\",\"motivo\":\"Analise tecnica\"}")"
checa "encaminhamento sem setor é recusado" 422 \
  "$(status_de POST "/protocols/$PID/forward" '{"motivo":"sem destino"}')"
checa "recebimento no setor" 200 "$(status_de POST "/protocols/$PID/receive" '{}')"
checa "mensagem pública ao cidadão" 201 \
  "$(status_de POST "/protocols/$PID/messages" '{"conteudo":"Sua solicitacao esta em analise."}')"
checa "mensagem vazia é recusada" 422 "$(status_de POST "/protocols/$PID/messages" '{"conteudo":"   "}')"
checa "anotação interna" 201 \
  "$(status_de POST "/protocols/$PID/internal-notes" '{"conteudo":"SEGREDO: verificar cadastro."}')"
checa "pendência criada" 201 \
  "$(status_de POST "/protocols/$PID/pending-items" '{"tipo":"documento","titulo":"Enviar comprovante","prazo_dias":10}')"

EVENTOS=$(api GET "/protocols/$PID/history" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
[ "${EVENTOS:-0}" -ge 5 ] && verde "histórico registra o fluxo ($EVENTOS eventos)" || vermelho "histórico incompleto ($EVENTOS eventos)"

secao "7. Documentos"

printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > /tmp/e2e.pdf
echo "nao é pdf" > /tmp/e2e-falso.pdf

checa "arquivo de tipo não permitido é recusado com 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/protocols/$PID/documents/upload" -H "$AUTH" -F "arquivo=@/tmp/e2e-falso.pdf")"
checa "PDF falsificado é detectado pelo conteúdo" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/protocols/$PID/documents/upload" -H "$AUTH" -F "arquivo=@/tmp/e2e-falso.pdf;type=application/pdf")"

DOC=$(curl -s -X POST "$API/protocols/$PID/documents/upload" -H "$AUTH" -F "arquivo=@/tmp/e2e.pdf" -F "nivel_acesso=restrito_setor")
DOCID=$(echo "$DOC" | campo id)
checa "documento anexado nasce interno" restrito_setor "$(echo "$DOC" | campo nivel_acesso)"
checa "rejeição sem motivo é recusada" 400 \
  "$(status_de PATCH "/protocols/$PID/documents/$DOCID" '{"status":"rejeitado"}')"

secao "8. Portal do cidadão"

ACESSO=$(curl -s -X POST "$PORTAL/api/v1/public/protocols/access" -H "$JSON" -d "{\"numero\":\"$NUM\",\"senha\":\"$SENHA\"}")
PTOKEN=$(echo "$ACESSO" | campo token)
PROTO_PUB=$(echo "$ACESSO" | campo protocolo_id)
[ -n "$PTOKEN" ] && verde "consulta pública com número + código funciona" || vermelho "consulta pública falhou"

checa "código errado é recusado" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$PORTAL/api/v1/public/protocols/access" -H "$JSON" -d "{\"numero\":\"$NUM\",\"senha\":\"ERRADO99\"}")"

PAUTH="Authorization: Bearer $PTOKEN"
MSGS=$(curl -s "$PORTAL/api/v1/public/protocols/$PROTO_PUB/messages" -H "$PAUTH")
echo "$MSGS" | grep -q "SEGREDO" && vermelho "ANOTAÇÃO INTERNA VAZOU PARA O CIDADÃO" || verde "anotação interna não aparece no portal"

DOCS_PUB=$(curl -s "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents" -H "$PAUTH" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
checa "documento interno não é listado ao cidadão" 0 "$DOCS_PUB"
checa "download de documento interno é negado" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents/$DOCID/download" -H "$PAUTH")"

status_de PATCH "/protocols/$PID/documents/$DOCID" '{"status":"liberado_cidadao"}' > /dev/null
DOCS_LIB=$(curl -s "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents" -H "$PAUTH" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
checa "documento liberado passa a ser visível" 1 "$DOCS_LIB"
checa "download do documento liberado funciona" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents/$DOCID/download" -H "$PAUTH")"

VAZA_CAMINHO=$(curl -s "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents" -H "$PAUTH" | grep -c nome_interno)
checa "portal não expõe caminho físico do arquivo" 0 "$VAZA_CAMINHO"

# O cidadão envia documento pelo portal e precisa ver o que enviou.
# Conteudo unico por arquivo: documentos identicos sao deduplicados por hash
printf '%%PDF-1.4\n%% cidadao %s\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' "$RANDOM" > /tmp/e2e-cidadao.pdf
ENVIO=$(curl -s -X POST "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents/upload" \
  -H "$PAUTH" -F "arquivo=@/tmp/e2e-cidadao.pdf")
DOC_CID=$(echo "$ENVIO" | campo id)
[ -n "$DOC_CID" ] && verde "cidadão consegue enviar documento pelo portal" || vermelho "envio pelo cidadão falhou: $ENVIO"
checa "documento do cidadão entra para análise" em_analise "$(echo "$ENVIO" | campo status)"

VISTOS=$(curl -s "$PORTAL/api/v1/public/protocols/$PROTO_PUB/documents" -H "$PAUTH" \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
[ "${VISTOS:-0}" -ge 2 ] && verde "cidadão vê o documento que enviou" || vermelho "documento enviado não aparece para o cidadão"

SERVIDOR_VE=$(api GET "/protocols/$PID/documents" \
  | python3 -c "import json,sys;print(sum(1 for d in json.load(sys.stdin) if d.get('origem')=='cidadao'))")
[ "${SERVIDOR_VE:-0}" -ge 1 ] && verde "setor recebe o documento enviado pelo cidadão" || vermelho "setor não recebeu o documento"

# Nome com acento não pode chegar como mojibake (multer entrega latin1).
printf '%%PDF-1.4\n%% acento %s\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' "$RANDOM" > "/tmp/certidão e2e.pdf"
NOME=$(curl -s -X POST "$API/protocols/$PID/documents/upload" -H "$AUTH" \
  -F "arquivo=@/tmp/certidão e2e.pdf" | campo nome_amigavel)
checa "nome de arquivo com acento é preservado" "certidão e2e.pdf" "$NOME"

checa "linha do tempo pública responde" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$PORTAL/api/v1/public/protocols/$PROTO_PUB/timeline" -H "$PAUTH")"

secao "9. Comprovante"

REC=$(curl -s "$API/protocols/$PID/receipt" -H "$AUTH")
echo "$REC" | grep -q "data:image/png;base64" && verde "comprovante traz QR Code real" || vermelho "comprovante sem QR Code"
echo "$REC" | grep -q "$NUM" && verde "comprovante mostra o número do protocolo" || vermelho "comprovante sem número"

secao "10. Infraestrutura do portal"

CERT=$(echo | timeout 10 openssl s_client -connect prot.govsistem.com.br:443 -servername prot.govsistem.com.br 2>/dev/null)
echo "$CERT" | grep -q "Verify return code: 0 (ok)" && verde "cadeia TLS válida" || vermelho "cadeia TLS inválida"
echo "$CERT" | openssl x509 -noout -text 2>/dev/null | grep -q "DNS:prot.govsistem.com.br" \
  && verde "certificado cobre prot.govsistem.com.br" || vermelho "certificado não cobre o domínio"
checa "HTTP redireciona para HTTPS" 301 \
  "$(curl -s -o /dev/null -w '%{http_code}' http://prot.govsistem.com.br)"
checa "portal responde em HTTPS" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$PORTAL")"

secao "11. Isolamento entre municípios"

# Pega um protocolo que pertence a outro município (com dados de verdade).
ALHEIO=$(psql_ "SELECT p.id FROM protocolos p
                WHERE p.tenant_id <> '$TENANT' AND p.deleted_at IS NULL LIMIT 1;")

if [ -n "$ALHEIO" ]; then
  checa "protocolo de outro município não é acessível" 404 "$(status_de GET "/protocols/$ALHEIO")"
  checa "histórico de protocolo alheio não é acessível" 200 \
    "$(status_de GET "/protocols/$ALHEIO/history")"
  EVT_ALHEIO=$(api GET "/protocols/$ALHEIO/history" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))" 2>/dev/null)
  checa "histórico alheio vem vazio (isolado por tenant)" 0 "${EVT_ALHEIO:-0}"

  # O mesmo número existe em vários municípios: o código de acesso é que
  # define qual protocolo é aberto no portal.
  NUM_ALHEIO=$(psql_ "SELECT numero FROM protocolos WHERE id='$ALHEIO';")
  checa "número de outro município não abre com código errado" 401 \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$PORTAL/api/v1/public/protocols/access" \
        -H "$JSON" -d "{\"numero\":\"$NUM_ALHEIO\",\"senha\":\"$SENHA\"}")"
else
  vermelho "não há protocolo de outro município para testar isolamento"
fi

printf '\n\033[1mResultado: %d passaram, %d falharam\033[0m\n' "$OK" "$FALHOU"
[ "$FALHOU" -eq 0 ] || exit 1
