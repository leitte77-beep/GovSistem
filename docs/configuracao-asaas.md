# Configuração — Asaas (Provedor de Pagamento)

## Pré-requisitos

1. Conta no [Asaas](https://www.asaas.com/) (sandbox ou produção)
2. API Key gerada no painel Asaas
3. Webhook Token gerado no painel Asaas

## Variáveis de Ambiente

```bash
# Ambiente: sandbox | production
ASAAS_ENV=sandbox

# Chave da API (gerada no painel Asaas > Integrações > Chave de API)
ASAAS_API_KEY=seu_api_key_aqui

# Token do webhook (painel Asaas > Configurações > Webhook > Token)
ASAAS_WEBHOOK_TOKEN=seu_webhook_token_aqui

# URLs base (já configuradas no sistema, não alterar sem necessidade)
# ASAAS_BASE_URL_SANDBOX=https://sandbox.asaas.com/api/v3
# ASAAS_BASE_URL_PRODUCTION=https://api.asaas.com/v3

# URL pública onde o webhook será recebido (obrigatório para webhook)
PAYMENT_WEBHOOK_PUBLIC_URL=https://seudominio.com/api/v1/webhooks/payments/asaas
```

## Configuração do Webhook no Asaas

1. Acesse o painel Asaas
2. Vá em **Configurações > Webhook**
3. URL: `https://seudominio.com/api/v1/webhooks/payments/asaas`
4. Versão: v3
5. Gere e copie o **Webhook Token**
6. Ative os eventos:
   - `PAYMENT_CREATED`
   - `PAYMENT_PENDING`
   - `PAYMENT_RECEIVED`
   - `PAYMENT_CONFIRMED`
   - `PAYMENT_OVERDUE`
   - `PAYMENT_DELETED`
   - `PAYMENT_RESTORED`
   - `PAYMENT_REFUNDED`
   - `PAYMENT_CHARGEBACK_REQUESTED`
   - `PAYMENT_DUNNING_RECEIVED`

## Testando a Integração

```bash
# Testar ambiente sandbox
curl -X GET https://sandbox.asaas.com/api/v3/payments \
  -H "access_token: $ASAAS_API_KEY"

# Verificar health check
curl http://localhost:9009/api/v1/health
```

## Fluxo de Homologação

1. Configure `ASAAS_ENV=sandbox`
2. Crie um cliente no sistema → deve criar no Asaas automaticamente
3. Gere um boleto → deve aparecer no painel Asaas sandbox
4. Gere um PIX → deve mostrar QR Code
5. Simule pagamento via webhook (Asaas > Cobrança > Simular Pagamento)
6. Confirme que a fatura foi baixada automaticamente
7. Confirme que o lançamento contábil foi gerado

## Produção

1. Crie conta Asaas produção (se não tiver)
2. Gere API Key de produção
3. Configure `ASAAS_ENV=production`
4. Configure `ASAAS_API_KEY` com a chave de produção
5. Teste com valor mínimo (R$ 1,00) antes de liberar
6. Execute o checklist de homologação completo
