# Riscos — Módulo Financeiro

## Risco 1: Webhook síncrono sem fila

**Impacto:** Se o processamento do webhook falhar, a requisição HTTP já respondeu. Não há retry automático.

**Mitigação:** Criar fila com retry (Celery + Redis). Prioridade: ALTA.

## Risco 2: Sem invoice_items

**Impacto:** Faturas sem itens não permitem rateio contábil por serviço/produto.

**Mitigação:** Criar model e endpoint. Prioridade: ALTA.

## Risco 3: Sem subscription_events

**Impacto:** Não há histórico de alterações na assinatura (upgrade, downgrade, cancelamento).

**Mitigação:** Criar model e registrar eventos. Prioridade: MÉDIA.

## Risco 4: Dunning não implementado

**Impacto:** Assinaturas vencidas não têm régua de cobrança automática.

**Mitigação:** Implementar dunning_rules + jobs. Prioridade: MÉDIA.

## Risco 5: Sem fornecedores (suppliers)

**Impacto:** Contas a pagar sem entidade de fornecedor.

**Mitigação:** Criar model. Prioridade: MÉDIA.

## Risco 6: Tax rules fixas no código

**Impacto:** Reforma tributária 2026 pode exigir alteração no código.

**Mitigação:** Criar tax_rule_sets versionados. Prioridade: BAIXA (até 2026).

## Risco 7: Sem métricas/monitoring

**Impacto:** Não é possível detectar falhas de webhook, fila parada, etc.

**Mitigação:** Adicionar Prometheus metrics + alertas. Prioridade: MÉDIA.

## Risco 8: Dados sensíveis em texto plano

**Impacto:** API key no payment_provider_configs pode estar em texto plano.

**Mitigação:** ✅ Já resolvido — encryption.py com Fernet.

## Risco 9: Sem webhook_events table

**Impacto:** Eventos webhook são salvos inline, sem possibilidade de consulta histórica.

**Mitigação:** Criar tabela. Prioridade: MÉDIA.

## Risco 10: Testes E2E dependem de API externa

**Impacto:** Testes quebram se Asaas sandbox estiver fora.

**Mitigação:** ✅ Já resolvido — testes E2E não chamam API externa.
