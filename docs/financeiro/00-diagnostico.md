# Diagnóstico do Módulo Financeiro — GovSistem

## 1. Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.10+ / FastAPI |
| Frontend | Next.js 14 (App Router) / React / TypeScript |
| Banco | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 (async) |
| Migrações | Alembic |
| Cache | Redis 7 |
| Fila | Celery (worker separado) |
| Pagamento | Asaas (API v3) |
| Fiscal | Focus NFe (API v2) / Sandbox mock |

## 2. Diretório do módulo financeiro

Todo o módulo financeiro está em `saas-platform/`:

- `saas-platform/api/` — Backend Python/FastAPI
- `saas-platform/web-admin/` — Frontend Next.js

## 3. Telas existentes (frontend)

| Rota | Status | Dados reais? | Mock? |
|------|--------|-------------|-------|
| `/faturas` | ✅ Real | ✅ API `/invoices` | ❌ |
| `/boletos` | ✅ Real | ✅ API `/charges?billing_type=BOLETO` | ❌ |
| `/pix` | ✅ Real | ✅ API `/charges?billing_type=PIX` | ❌ |
| `/cartoes` | ✅ Real | ✅ API `/charges?billing_type=CREDIT_CARD` | ❌ |
| `/contas-receber` | ✅ Real | ✅ API `/receivables` | ❌ |
| `/contas-pagar` | ✅ Real | ✅ API `/payables` | ❌ |
| `/conciliacao` | ✅ Real | ✅ API `/bank-statements` | ❌ |
| `/notas-fiscais` | ✅ Real | ✅ API `/nfse` | ❌ |
| `/contabilidade` | ✅ Real | ✅ API `/reports`, `/journal-entries` | ❌ |
| `/financeiro/dashboard` | ✅ Real | ✅ API `/reports/dashboard` | ❌ |

**Conclusão:** Nenhuma tela está mockada. Todas chamam API real do backend.

## 4. Tabelas existentes (40 modelos)

### Financeiro
| Tabela | Existe? | organization_id? | Status |
|--------|---------|-----------------|--------|
| `customers` | ✅ | ✅ | Completa |
| `invoices` | ✅ | via subscription | Sem invoice_items |
| `invoice_items` | ❌ | — | **FALTA** |
| `receivables` | ✅ | ✅ | Completa |
| `payment_transactions` | ✅ | ✅ | Funciona como payment_charges |
| `payables` | ✅ | via organization | ✅ |
| `suppliers` | ❌ | — | **FALTA** |
| `bank_statements` | ✅ | via bank_account | ✅ |
| `bank_statement_lines` | ✅ | via statement | ✅ |
| `nfse_documents` | ✅ | ✅ | ✅ |
| `fiscal_profiles` | ✅ | ✅ | ✅ |
| `payment_provider_configs` | ✅ | ✅ | ✅ |
| `webhook_events` | ❌ | — | **FALTA** (eventos salvos inline) |

### Assinaturas
| Tabela | Existe? | Status |
|--------|---------|--------|
| `plans` | ✅ | ✅ |
| `subscriptions` | ✅ | ✅ |
| `subscription_events` | ❌ | **FALTA** |
| `dunning_rules` | ❌ | **FALTA** |

### Contabilidade
| Tabela | Existe? | Status |
|--------|---------|--------|
| `chart_of_accounts` | ✅ | ✅ |
| `journal_entries` | ✅ | ✅ |
| `journal_entry_lines` | ✅ | ✅ |
| `accounting_periods` | ✅ | ✅ |
| `cost_centers` | ❌ | **FALTA** |

### Segurança/Auditoria
| Tabela | Existe? | Status |
|--------|---------|--------|
| `audit_events` | ✅ | ✅ |

## 5. Endpoints existentes

| Endpoint | Status |
|----------|--------|
| `POST /charges` | ✅ Real (cria no Asaas) |
| `GET /charges` | ✅ Real |
| `GET /charges/{id}/pix-qr` | ✅ Real |
| `POST /charges/{id}/cancel` | ✅ Real |
| `POST /webhooks/payments/asaas` | ✅ Real (com idempotência) |
| `GET /invoices` | ✅ Real |
| `POST /invoices` | ✅ Real |
| `POST /invoices/auto-generate` | ✅ Real |
| `GET /receivables` | ✅ Real |
| `GET /payables` | ✅ Real |
| `POST /bank-statements/import` | ✅ Real (OFX/CSV/CNAB) |
| `GET /nfse` | ✅ Real |
| `POST /nfse/issue` | ✅ Real |
| `GET /reports/dashboard` | ✅ Real |
| `GET /reports/income-statement` | ✅ Real |
| `GET /reports/trial-balance` | ✅ Real |
| `POST /payment-provider-configs` | ✅ Real (criptografado) |

## 6. Integrações externas

| Provedor | Tipo | Status |
|----------|------|--------|
| Asaas | Pagamento | ✅ Real (282 linhas) |
| Focus NFe | Fiscal | ✅ Real (303 linhas) |
| Sandbox Fiscal | Mock | ✅ Mock |

## 7. Riscos identificados

1. **Webhook síncrono**: processamento acontece dentro do request do webhook, sem fila
2. **Sem subscription_events**: histórico de eventos de assinatura não existe
3. **Sem invoice_items**: faturas sem itens
4. **Sem suppliers**: contas a pagar sem tabela de fornecedores
5. **Cost centers**: existem no model de linha contábil mas sem CRUD
6. **Sem régua de cobrança**: dunning não implementado
7. **Sem fechamento contábil mensal dedicado**: períodos existem, mas sem checklist
8. **Sem portal do contador**: exportação para contador não existe
9. **Sem webhook_events table**: eventos webhook salvos inline, sem tabela dedicada
10. **Sem métricas/monitoring**: sem Prometheus metrics ou alertas
