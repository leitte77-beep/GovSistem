# Plano de Migração — Faltas por Fase

## Fase 1 — Fundação Financeira

**O que já existe:** invoices, receivables, payment_transactions, enums
**O que falta:**
- [ ] invoice_items (model + migration + endpoint)
- [ ] Use cases/services (CreateInvoiceUseCase, etc.)
- [ ] Endpoint POST /invoices/{id}/charges/{type} (PIX, BOLETO, CREDIT_CARD)
- [ ] Tests: partial payment, float prevention, balance update

## Fase 2 — Configuração do Provedor

**O que já existe:** PaymentProviderAdapter, AsaasPaymentProvider, payment_provider_configs CRUD
**O que falta:**
- [ ] "Testar conexão" no frontend
- [ ] PaymentProviderConfigService com validações

## Fase 3 — Sincronização de Clientes

**O que já existe:** customer sync inline em charges.py
**O que falta:**
- [ ] SyncCustomerWithPaymentProviderUseCase dedicado
- [ ] CustomerDocumentValidator
- [ ] UI mostrando status de sincronização

## Fase 4-6 — Pix/Boleto/Cartão

**O que já existe:** charges endpoint genérico
**O que falta:**
- [ ] POST /api/invoices/{id}/charges/pix específico
- [ ] POST /api/invoices/{id}/charges/boleto
- [ ] POST /api/invoices/{id}/charges/card-link
- [ ] GET /api/payment-charges/{id}/pix
- [ ] Refresh Pix endpoint

## Fase 7 — Webhooks

**O que já existe:** webhook endpoint com idempotência
**O que falta:**
- [ ] Processamento assíncrono (fila/job)
- [ ] Tabela webhook_events dedicada
- [ ] Job retry automático

## Fase 8 — Assinaturas

**O que já existe:** subscriptions, plans, auto-generate invoices
**O que falta:**
- [ ] subscription_events table
- [ ] subscription_billing_cycles
- [ ] dunning_rules + dunning_events
- [ ] customer_debts
- [ ] RenewSubscriptionsJob
- [ ] MarkOverdueInvoicesJob
- [ ] RunDunningRulesJob
- [ ] SuspendOverdueSubscriptionsJob

## Fase 9 — Contabilidade

**O que já existe:** chart_of_accounts, journal_entries, periods
**O que falta:**
- [ ] Cost centers CRUD
- [ ] Mapeamentos contábeis completos (receita diferida, etc.)
- [ ] Regras de lançamento automático para reembolso/chargeback

## Fase 10-11 — NFS-e + CBS/IBS

**O que já existe:** FiscalProviderAdapter, FocusNfseProvider, SandboxFiscalProvider
**O que falta:**
- [ ] tax_rule_sets + tax_rule_versions (tabelas versionadas)
- [ ] Motor de cálculo tributário com snapshot

## Fase 12 — Contas a Pagar

**O que já existe:** payables CRUD
**O que falta:**
- [ ] suppliers table
- [ ] payable_attachments
- [ ] approval_workflows + approval_steps

## Fase 13 — Conciliação

**O que já existe:** Implementado completo (OFX, CSV, CNAB, Asaas)
**O que falta:**
- [ ] Nada crítico

## Fase 14 — Relatórios

**O que já existe:** dashboard, DRE, balancete
**O que falta:**
- [ ] Sales by plan report
- [ ] Cash flow report
- [ ] Accounts receivable aging
- [ ] Export CSV/XLSX

## Fase 15 — Fechamento

**O que já existe:** accounting_periods
**O que falta:**
- [ ] closing_checklist_items
- [ ] accountant_exports
- [ ] Portal do contador
- [ ] Pacote ZIP mensal

## Fase 16 — Produção

**O que já existe:** logs sanitizados, correlation_id, rate limit, docs
**O que falta:**
- [ ] Métricas Prometheus
- [ ] Alertas
- [ ] E2E tests completos
- [ ] Sign-off checklist
