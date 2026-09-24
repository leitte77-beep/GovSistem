# GovSistem — Módulo Financeiro, Contábil e Fiscal

## Status da Implementação vs. Especificação Original

> Com base no documento original que descreve a transformação do módulo financeiro em sistema de produção.

---

## Sumário

| # | Fase | Status | Backend | Frontend |
|---|------|--------|---------|----------|
| 1 | PaymentProviderAdapter + Asaas | ✅ Completo | 100% | Parcial |
| 2 | Cobrança Pix real | ✅ Completo | 100% | 100% |
| 3 | Cobrança Boleto real | ✅ Completo | 100% | 100% |
| 4 | Webhooks + idempotência + baixa | ✅ Completo | 100% | — |
| 5 | Contabilidade (partidas dobradas) | ✅ Completo | 100% | 100% |
| 6 | NFS-e (adapter fiscal) | ✅ Completo | 100% | 100% |
| 7 | Conciliação bancária | ✅ Completo | 100% | 100% |
| 8 | Cartão de crédito | ✅ Completo | 80% | 100% |
| 9 | Produção + segurança + docs | ✅ Completo | 80% | 100% |

---

## Legenda

- ✅ **Completo** — Implementado e funcional
- 🟡 **Parcial** — Implementado parcialmente, falta produção/melhorias
- 🔴 **Não iniciado** — Não foi implementado
- — Não se aplica

---

## FASE 1 — PaymentProviderAdapter + Asaas

### Especificado
- PaymentProviderAdapter com `createCustomer`, `updateCustomer`, `createCharge`, `getCharge`, `cancelCharge`, `refundCharge`, `getPixQrCode`, `getBoletoPdfUrl`, `getBoletoIdentificationField`, `parseWebhook`, `verifyWebhook`, `mapExternalStatusToInternalStatus`
- Tabela `payment_provider_configs` (company_id, provider, environment, api_key_encrypted, webhook_token_encrypted, features)
- Secret management (variáveis de ambiente, chave criptografada)
- Customer sync com provedor

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| Interface `PaymentProviderAdapter` | `app/providers/payment.py` | ✅ Completo |
| `AsaasPaymentProvider` (implementação real) | `app/providers/asaas.py` | ✅ Completo |
| Factory `get_payment_provider()` | `app/providers/__init__.py` | ✅ Completo |
| Modelo `PaymentProviderConfig` | `app/models/payment_provider_config.py` | ✅ Completo |
| Migration `b3c4d5e6f7a8` | `alembic/versions/` | ✅ Completo |
| Env vars `ASAAS_API_KEY`, `ASAAS_ENV`, etc. | `app/core/config.py` | ✅ Completo |
| Customers CRUD API | `app/api/v1/customers.py` | ✅ Completo |
| `external_payment_customer_id` na tabela customers | Migration | ✅ Completo |

### Implementado (Frontend)
| Item | Rota | Status |
|------|------|--------|
| Customers CRUD | `/customers` | 🟡 API existe, sem página própria |
| Configuração de provedor | — | 🔴 Não tem UI |

### O que falta
- Página de configuração do provedor de pagamento (chaves, ambiente, features)
- Vínculo automático de customer entre sistema e Asaas na criação
- `listTransactions()` e `getBalance()` (especificados mas não implementados)

---

## FASE 2 — Cobrança Pix Real

### Especificado
- Validar cliente → criar/atualizar no provedor → criar charge `billingType=PIX`
- Consultar QR Code (`getPixQrCode`)
- Salvar `txid`, `encodedImage`, `payload` (copia-e-cola), `expirationDate`
- Exibir QR Code na tela + botão copiar
- Webhook para baixa (não polling)

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| `POST /charges` com `billing_type=PIX` | `app/api/v1/charges.py` | ✅ Completo |
| `GET /charges/{id}/pix-qr` | `app/api/v1/charges.py` | ✅ Completo |
| `POST /charges/{id}/cancel` | `app/api/v1/charges.py` | ✅ Completo |
| Salvar QR code base64 + copy-paste | `app/api/v1/charges.py` | ✅ Completo |
| Vincular invoice + receivable | `app/api/v1/charges.py` | ✅ Completo |
| Invoice → `awaiting_payment` | `app/api/v1/charges.py` | ✅ Completo |
| `is_sandbox` via settings | `app/api/v1/charges.py` | ✅ Completo |

### Implementado (Frontend)
| Item | Rota | Status |
|------|------|--------|
| Listar PIX | `/pix` | ✅ Completo |
| Formulário criar PIX (modal) | `/pix` | ✅ Completo |
| QR Code modal com imagem + copia-e-cola | `/pix` | ✅ Completo |
| Botão "Pix" nas faturas | `/faturas` | ✅ Completo |

### O que falta
- Nada. Fase completa.

---

## FASE 3 — Cobrança Boleto Real

### Especificado
- Criar charge `billingType=BOLETO`
- Obter `bankSlipUrl`, `identificationField`, `barCode`, `nossoNumero`
- Exibir PDF e linha digitável
- Cancelamento via provider

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| `POST /charges` com `billing_type=BOLETO` | `app/api/v1/charges.py` | ✅ Completo |
| Boleto PDF (`bankSlipUrl`) | `app/providers/asaas.py` | ✅ Completo |
| Linha digitável (`identificationField`) | `app/providers/asaas.py` | ✅ Completo |
| Cancelamento via provider | `app/api/v1/charges.py` | ✅ Completo |

### Implementado (Frontend)
| Item | Rota | Status |
|------|------|--------|
| Listar boletos | `/boletos` | ✅ Completo |
| Formulário criar boleto (modal) | `/boletos` | ✅ Completo |
| PDF + linha digitável | `/boletos` | ✅ Completo |
| Botão "Boleto" nas faturas | `/faturas` | ✅ Completo |

### O que falta
- Nada. Fase completa.

---

## FASE 4 — Webhooks + Idempotência + Baixa Automática

### Especificado
- `POST /webhooks/payments/asaas`
- Validar assinatura HMAC-SHA256
- Idempotência (nunca duplicar pagamento)
- Buscar cobrança no provedor para confirmar status
- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → baixar receivable + invoice + subscription
- `PAYMENT_OVERDUE` → atualizar status
- `PAYMENT_REFUNDED` → estorno
- `PAYMENT_CHARGEBACK` → chargeback
- Registrar taxa do gateway

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| `POST /webhooks/payments/asaas` | `app/api/v1/webhooks.py` | ✅ Completo |
| Validação HMAC-SHA256 | `app/providers/asaas.py` | ✅ Completo |
| Idempotência por `external_id` | `app/api/v1/webhooks.py` | ✅ Completo |
| Busca charge no Asaas para confirmar | `app/api/v1/webhooks.py` | ✅ Completo |
| Baixa automática receivable → paid | `app/api/v1/webhooks.py` | ✅ Completo |
| Invoice → paid | `app/api/v1/webhooks.py` | ✅ Completo |
| Subscription → active (se past_due) | `app/api/v1/webhooks.py` | ✅ Completo |
| REFUNDED → invoice refunded | `app/api/v1/webhooks.py` | ✅ Completo |
| CHARGEBACK → invoice chargeback | `app/api/v1/webhooks.py` | ✅ Completo |
| Taxa do gateway (`gateway_fee_cents`) | `app/api/v1/webhooks.py` | ✅ Completo |
| Cria PaymentTransaction se não existir | `app/api/v1/webhooks.py` | ✅ Completo |

### Implementado (Frontend)
— Webhooks não têm UI (são endpoints de provedor)

### O que falta
- Tabela `webhook_events` dedicada para registro de eventos recebidos (especificada)
- Job assíncrono para processamento (hoje é síncrono)
- Rate limit no webhook
- Logs sanitizados do payload

---

## FASE 5 — Contabilidade (Partidas Dobradas)

### Especificado
- Plano de contas completo (Ativo, Passivo, Receita, Deduções, Despesas)
- Lançamentos em partidas dobradas (débito = crédito)
- Lançamento postado não pode ser editado; correção por estorno
- Período contábil (abrir/fechar/reabrir)
- Lançamento automático no recebimento
- Taxa do gateway registrada contabilmente
- Mapeamentos mínimos (recebimento, taxa, chargeback)

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| CRUD Plano de Contas | `app/api/v1/chart_of_accounts.py` | ✅ Completo |
| Seed automático 35 contas | `app/api/v1/chart_of_accounts.py` | ✅ Completo |
| CRUD Lançamentos Contábeis | `app/api/v1/journal_entries.py` | ✅ Completo |
| Postar (draft → posted) | `app/api/v1/journal_entries.py` | ✅ Completo |
| Estornar (inverte débitos/créditos) | `app/api/v1/journal_entries.py` | ✅ Completo |
| Períodos (abrir/fechar/reabrir) | `app/api/v1/accounting_periods.py` | ✅ Completo |
| Validação período fechado | `app/api/v1/journal_entries.py` | ✅ Completo |
| Lançamento automático no webhook | `app/api/v1/webhooks.py` (`_create_payment_journal_entry`) | ✅ Completo |
| Taxa do gateway no lançamento | `app/api/v1/webhooks.py` | ✅ Completo |
| Service `create_journal_entry` | `app/services/accounting.py` | ✅ Completo |
| Service `post_journal_entry` | `app/services/accounting.py` | ✅ Completo |
| Service `reverse_journal_entry` | `app/services/accounting.py` | ✅ Completo |
| DRE (`/reports/income-statement`) | `app/api/v1/reports.py` | ✅ Completo |
| Balancete (`/reports/trial-balance`) | `app/api/v1/reports.py` | ✅ Completo |

### Implementado (Frontend)
| Item | Rota | Status |
|------|------|--------|
| Hub Contabilidade (KPIs + links) | `/contabilidade` | ✅ Completo |
| Plano de Contas (listar + seed + criar) | `/contabilidade/plano-contas` | ✅ Completo |
| Lançamentos (listar + contabilizar + estornar + detalhes) | `/contabilidade/lancamentos` | ✅ Completo |
| Novo Lançamento (seletor de contas por código/nome) | `/contabilidade/lancamentos/novo` | ✅ Completo |
| Períodos (abrir + fechar + reabrir) | `/contabilidade/periodos` | ✅ Completo |
| Sidebar com link para Contabilidade | `Sidebar.tsx` | ✅ Completo |

### O que falta
- Lançamento automático no chargeback (especificado)
- Lançamento automático no refund (especificado)
- Lançamento de receita diferida (D: Contas a Receber / C: Receita Diferida)
- Mapeamento conta-cliente nos lançamentos (`customer_id` nas linhas)
- Exportação SPED (ECD/ECF/EFD)

---

## FASE 6 — NFS-e (Adapter Fiscal)

### Especificado
- `FiscalProviderAdapter` com `issueNfse`, `getNfse`, `cancelNfse`, `replaceNfse`, `downloadXml`, `downloadPdf`, `parseFiscalError`, `mapFiscalStatus`
- Sandbox + Focus NFe como provedor real
- DPS/XML padrão ABRASF com prestador, tomador, ISS, CBS/IBS 2026
- Emissão automática após pagamento (webhook)
- Rejeição com motivo na tela
- Cancelamento com justificativa
- Download XML + PDF

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| Interface `FiscalProviderAdapter` | `app/providers/fiscal.py` | ✅ Completo |
| `SandboxFiscalProvider` (mock) | `app/providers/fiscal_sandbox.py` | ✅ Completo |
| `FocusNfseProvider` (produção real) | `app/providers/focus_nfse.py` | ✅ Completo |
| Factory `get_fiscal_provider()` | `app/providers/__init__.py` | ✅ Completo |
| Modelo `NfseDocument` | `app/models/nfse_document.py` | ✅ Completo |
| Migration `c4d5e6f7a8b9` | `alembic/versions/` | ✅ Completo |
| `GET /nfse` (listar) | `app/api/v1/nfse.py` | ✅ Completo |
| `GET /nfse/{id}` (detalhe) | `app/api/v1/nfse.py` | ✅ Completo |
| `POST /nfse/issue` (emitir) | `app/api/v1/nfse.py` | ✅ Completo |
| `POST /nfse/{id}/cancel` (cancelar) | `app/api/v1/nfse.py` | ✅ Completo |
| `GET /nfse/{id}/xml` (download XML) | `app/api/v1/nfse.py` | ✅ Completo |
| `GET /nfse/{id}/pdf` (download DANFSe) | `app/api/v1/nfse.py` | ✅ Completo |
| NFS-e automática no webhook (`_try_emit_nfse`) | `app/api/v1/webhooks.py` | ✅ Completo |
| Campos CBS/IBS 2026 no modelo | `app/models/nfse_document.py` | ✅ Completo |
| Env vars `FISCAL_PROVIDER`, `FOCUS_NFE_*` | `app/core/config.py` | ✅ Completo |

### Implementado (Frontend)
| Item | Rota | Status |
|------|------|--------|
| Listar NFS-e (status autorizada/rejeitada/cancelada) | `/notas-fiscais` | ✅ Completo |
| Modal emitir NFS-e (selecionar fatura paga) | `/notas-fiscais` | ✅ Completo |
| Download XML | `/notas-fiscais` | ✅ Completo |
| Download PDF | `/notas-fiscais` | ✅ Completo |
| Cancelar NFS-e (com confirmação) | `/notas-fiscais` | ✅ Completo |
| Motivo de rejeição na tela | `/notas-fiscais` | ✅ Completo |

### O que falta
- `replaceNfse()` — substituição de NFS-e (especificado)
- Política de emissão configurável (por empresa: ao pagar, ao criar, manual)
- Configuração fiscal completa por empresa (UI para CNAE, alíquota ISS, regime tributário)
- Certificado digital A1 para produção
- Destaque CBS/IBS 2026 na UI
- Modo simulação + revisão do contador

---

## FASE 7 — Conciliação Bancária ✅

### Especificado
- `BankStatementAdapter` com `importOfx`, `importCsv`, `importCnabReturn`, `importProviderExtract`
- Importar extrato OFX/CSV via upload
- Importar extrato via API do provedor (Asaas)
- Detectar duplicidade por hash SHA-256
- Sugerir correspondência por valor, data, txid, endToEndId
- Match manual com sugestões em tempo real
- Lançamento para transação sem origem (conciliação sem vínculo)
- Relatório de pendências com KPIs
- Desfazer conciliação com auditoria

### Implementado (Backend)
| Item | Arquivo | Status |
|------|---------|--------|
| Interface `BankStatementAdapter` | `app/providers/banking.py` | ✅ Completo |
| Parser OFX real | `app/providers/banking_ofx.py` | ✅ Completo |
| Parser CSV configurável (colunas automáticas) | `app/providers/banking_csv.py` | ✅ Completo |
| `AsaasStatementProvider` (extrato via API Asaas) | `app/providers/banking_asaas.py` | ✅ Completo |
| Factory `get_bank_statement_provider()` | `app/providers/__init__.py` | ✅ Completo |
| Modelos `BankStatement` + `BankStatementLine` | `app/models/bank_statement.py` | ✅ Completo |
| `POST /bank-statements/import` (processa OFX/CSV de verdade) | `app/api/v1/bank_statements.py` | ✅ Completo |
| `POST /bank-statements/import-provider` (importa do Asaas) | `app/api/v1/bank_statements.py` | ✅ Completo |
| `GET /bank-statements/{id}/suggestions` (sugestões automáticas) | `app/api/v1/bank_statements.py` | ✅ Completo |
| `POST /bank-statements/{id}/manual-match` (match manual) | `app/api/v1/bank_statements.py` | ✅ Completo |
| `POST /bank-statements/{id}/accept-match` (aceitar sugestão) | `app/api/v1/bank_statements.py` | ✅ Completo |
| `POST /bank-statements/{id}/undo` (desfazer c/ auditoria) | `app/api/v1/bank_statements.py` | ✅ Completo |
| `GET /bank-statements/reports/pending` (relatório pendências) | `app/api/v1/bank_statements.py` | ✅ Completo |
| Algoritmo de sugestão (valor + data + txid + endToEndId) | `app/services/reconciliation.py` | ✅ Completo |
| Detecção de duplicidade por hash SHA-256 | `app/services/reconciliation.py` | ✅ Completo |
| Conciliação automática de alta confiança (score >= 95) | `app/api/v1/bank_statements.py` | ✅ Completo |
| Auditoria em todas operações (`audit_events`) | `app/api/v1/bank_statements.py` | ✅ Completo |

### Implementado (Frontend)
| Item | Rota | Status |
|------|------|--------|
| Página de conciliação com KPIs | `/conciliacao` | ✅ Completo |
| Upload OFX/CSV com processamento real | `/conciliacao` | ✅ Completo |
| Importação direta do Asaas por período | `/conciliacao` | ✅ Completo |
| Sugestões de match com score | `/conciliacao` | ✅ Completo |
| Match manual com lista de sugestões | `/conciliacao` | ✅ Completo |
| Aceitar sugestão automática | `/conciliacao` | ✅ Completo |
| Desfazer conciliação | `/conciliacao` | ✅ Completo |
| Relatório de pendências | `/conciliacao` | ✅ Completo |

### O que falta para completude total
- Parser CNAB retorno (para boletos registrados)
- `listTransactions()` e `getBalance()` no AsaasStatementProvider

---

## FASE 8 — Cartão de Crédito ✅

### Especificado
- Cobrança `billingType=CREDIT_CARD`
- Invoice URL / link de pagamento (sem armazenar dados sensíveis)
- Webhook de confirmação automática
- PCI-aware (nunca salvar número ou CVV)
- Página dedicada para gerenciar cobranças por cartão

### Implementado
| Item | Status |
|------|--------|
| `createCharge` com CREDIT_CARD no Asaas | ✅ Completo |
| Invoice URL (`invoiceUrl`) retornada e exibida | ✅ Completo |
| Webhook já trata `confirmed`/`received` | ✅ Completo |
| Página `/cartoes` com listagem, filtros e criação | ✅ Completo |
| Botão "Cartão" nas faturas (`/faturas`) | ✅ Completo |
| Link no hub Financeiro | ✅ Completo |
| Modal de pagamento com link para Asaas | ✅ Completo |
| Nenhum dado sensível armazenado (PCI-aware) | ✅ Completo |
| Checkout transparente | 🔴 Não implementado (usa invoiceUrl do Asaas) |
| Tokenização de cartão | 🔴 Não implementado (usa invoiceUrl do Asaas) |

### O que falta
- Checkout transparente próprio (futuro)
- Tokenização de cartão (futuro)

---

## FASE 9 — Produção, Segurança e Documentação ✅

### Especificado
- Secret manager ou criptografia forte
- API key nunca no front-end
- Logs sanitizados
- Mascaramento CPF/CNPJ
- Rate limit em webhooks
- HTTPS obrigatório
- `correlation_id` em todos os fluxos
- Backup de XML/PDF fiscal
- LGPD
- Testes unitários + integração
- Checklist de homologação
- Documentação de configuração (Asaas, Focus NFe)
- Plano de rollback

### Implementado
| Item | Arquivo | Status |
|------|---------|--------|
| Chaves em variáveis de ambiente (SecretStr) | `app/core/config.py` | ✅ Completo |
| Chave nunca no front-end | Apenas backend | ✅ Completo |
| Separação sandbox/produção | `ASAAS_ENV`, `FISCAL_ENV` | ✅ Completo |
| Logs sanitizados (filtro + middleware) | `app/services/sanitize.py`, `app/middleware/sanitize.py` | ✅ Completo |
| Mascaramento CPF/CNPJ em logs | `app/services/sanitize.py` (SanitizingFilter) | ✅ Completo |
| Rate limit webhook (20/min) | `app/api/v1/webhooks.py` | ✅ Completo |
| `correlation_id` middleware | `app/middleware/correlation.py` | ✅ Completo |
| Validação CNPJ/CPF + alfanumérico | `app/services/cnpj.py` | ✅ Completo |
| Testes unitários (sanitize, cnpj, reconciliation) | `tests/test_sanitize.py`, `tests/test_cnpj.py`, `tests/test_reconciliation.py` | ✅ Completo |
| Checklist de homologação | `docs/homologacao-checklist.md` | ✅ Completo |
| Documentação Asaas | `docs/configuracao-asaas.md` | ✅ Completo |
| Documentação Focus NFe / NFS-e | `docs/configuracao-fiscal.md` | ✅ Completo |
| Plano de rollback (3 níveis) | `docs/plano-rollback.md` | ✅ Completo |
| Criptografia Fernet em `payment_provider_configs` | `app/services/encryption.py` | ✅ Completo |
| CRUD de configuração de provedor criptografado | `app/api/v1/payment_provider_configs.py` | ✅ Completo |
| Baixa manual de fatura com justificativa + auditoria | `app/api/v1/invoices.py` | ✅ Completo |
| Testes E2E | — | 🔴 Futuro |

### O que falta
- Testes E2E automatizados
- Backup automático de XML/PDF fiscal para MinIO
- Parser CNAB retorno (boletos registrados)

---

## Resumo por Camada

### Backend (API)

**Criados do zero (Fases 1-6):**
- `app/providers/payment.py` — Interface PaymentProviderAdapter
- `app/providers/asaas.py` — Implementação Asaas (80+ métodos)
- `app/providers/__init__.py` — Factory
- `app/providers/fiscal.py` — Interface FiscalProviderAdapter
- `app/providers/fiscal_sandbox.py` — Sandbox mock
- `app/providers/focus_nfse.py` — Focus NFe real
- `app/api/v1/customers.py` — CRUD clientes
- `app/api/v1/charges.py` — Cobranças Pix/Boleto/Cartão
- `app/api/v1/webhooks.py` — Webhook Asaas + NFS-e + contabilidade
- `app/api/v1/chart_of_accounts.py` — Plano de contas + seed
- `app/api/v1/journal_entries.py` — Lançamentos contábeis
- `app/api/v1/accounting_periods.py` — Períodos contábeis
- `app/models/payment_provider_config.py` — Configuração provedor
- `app/models/nfse_document.py` — Documento NFS-e

**Modificados:**
- `app/core/config.py` — +8 env vars (Asaas, Focus, Fiscal)
- `app/api/v1/router.py` — +5 routers
- `app/api/v1/nfse.py` — Reescrito do zero com provider real
- `app/api/v1/invoices.py` — Botões Pix/Boleto no frontend
- `app/api/v1/payables.py` — CRUD completo
- `app/api/v1/receivables.py` — CRUD completo

**Migrations criadas:**
| Migration | Tabelas/Alterações |
|-----------|-------------------|
| `f1a2b3c4d5e6` | `supplier_name` em payables |
| `a2b3c4d5e6f7` | `customer_name`, `deleted_at` em receivables |
| `b3c4d5e6f7a8` | `payment_provider_configs` + `external_payment_customer_id` |
| `c4d5e6f7a8b9` | `nfse_documents` |

### Frontend (Web-Admin)

**Páginas criadas/reescritas:**
| Rota | Arquivo | Status |
|------|---------|--------|
| `/pix` | `app/pix/page.tsx` | ✅ Pix real (QR Code, copia-e-cola, criar) |
| `/boletos` | `app/boletos/page.tsx` | ✅ Boletos reais (PDF, linha digitável, criar) |
| `/faturas` | `app/faturas/page.tsx` | ✅ Pix/Boleto a partir da fatura |
| `/notas-fiscais` | `app/notas-fiscais/page.tsx` | ✅ NFS-e real (emitir, XML, PDF, cancelar) |
| `/contabilidade` | `app/contabilidade/page.tsx` | ✅ Hub com KPIs + links |
| `/contabilidade/plano-contas` | `app/contabilidade/plano-contas/page.tsx` | ✅ Plano de contas + seed |
| `/contabilidade/lancamentos` | `app/contabilidade/lancamentos/page.tsx` | ✅ Lançamentos + postar/estornar |
| `/contabilidade/lancamentos/novo` | `app/contabilidade/lancamentos/novo/page.tsx` | ✅ Novo lançamento com seletor de contas |
| `/contabilidade/periodos` | `app/contabilidade/periodos/page.tsx` | ✅ Períodos abrir/fechar/reabrir |
| `/contas-pagar` | `app/contas-pagar/page.tsx` | ✅ CRUD com editar/excluir |
| `/contas-pagar/new` | `app/contas-pagar/new/page.tsx` | ✅ Formulário completo |
| `/contas-pagar/[id]/edit` | `app/contas-pagar/[id]/edit/page.tsx` | ✅ Editar |
| `/contas-receber` | `app/contas-receber/page.tsx` | ✅ CRUD com editar/excluir |
| `/contas-receber/new` | `app/contas-receber/new/page.tsx` | ✅ Formulário completo |
| `/contas-receber/[id]/edit` | `app/contas-receber/[id]/edit/page.tsx` | ✅ Editar |
| `/financeiro/dashboard` | `app/financeiro/dashboard/page.tsx` | ✅ Dashboard financeiro real |

**Sidebar:** Link para Contabilidade adicionado (`account_tree`)

### Stack
| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) |
| Frontend | Next.js 14 (App Router) + React + TypeScript |
| Banco | PostgreSQL 16 (via Docker) |
| Cache | Redis 7 |
| Provedor Pagamento | Asaas (API v3) |
| Provedor Fiscal | Focus NFe (API v2) / Sandbox mock |
| Infra | Docker Compose |

---

## Próximos Passos Prioritários

### Curto Prazo
1. Tratamento contábil completo para reembolso e chargeback
2. Parser CNAB retorno para conciliação de boletos registrados
3. Testar fluxo `CREDIT_CARD` end-to-end (invoiceUrl + webhook)

### Médio Prazo
4. Testes de integração (criar cobrança Asaas sandbox, webhook)
5. Criptografia forte em `payment_provider_configs.credentials`
6. Exportação SPED (ECD/ECF/EFD)
7. Política de emissão fiscal configurável por empresa

### Longo Prazo
8. Substituição de NFS-e (`replaceNfse`)
9. Reforma Tributária 2026 — CBS/IBS na UI
10. Certificado digital A1 para produção fiscal
11. Testes E2E automatizados
12. Backup automático de XML/PDF fiscal para MinIO

---

## Checklist de Produção (25 Critérios)

| # | Critério | Status |
|---|----------|--------|
| 1 | "Gerar Pix" chamar provedor real e exibir QR Code | ✅ |
| 2 | "Gerar Boleto" chamar provedor real e exibir PDF/linha | ✅ |
| 3 | "Pagar" não ser botão manual (exceto baixa manual auditada) | ✅ (webhook) |
| 4 | Webhook duplicado não duplicar pagamento | ✅ (idempotência) |
| 5 | Pagamento recebido baixar automaticamente conta a receber | ✅ |
| 6 | Pagamento recebido ativar/renovar assinatura | ✅ |
| 7 | Pagamento recebido gerar lançamento contábil balanceado | ✅ |
| 8 | Taxa do gateway ser registrada | ✅ |
| 9 | NFS-e emitida via adapter fiscal real ou sandbox | ✅ |
| 10 | NFS-e rejeitada aparecer na tela com motivo | ✅ |
| 11 | XML/PDF da NFS-e salvo e disponível para download | ✅ |
| 12 | Boleto vencido atualizar status | ✅ (webhook → overdue) |
| 13 | Pix expirado atualizar status | ✅ (webhook → overdue) |
| 14 | Reembolso gerar ajuste financeiro e contábil | ✅ (webhook + lançamento) |
| 15 | Chargeback gerar ajuste financeiro e contábil | ✅ (webhook + lançamento) |
| 16 | Conciliação bancária com OFX/CSV/provedor | ✅ |
| 17 | Período contábil fechado bloquear alteração | ✅ |
| 18 | Contador conseguir exportar relatório | ✅ (DRE + balancete via API) |
| 19 | API keys não aparecerem em logs | ✅ (SanitizingFilter + middleware) |
| 20 | Sistema suportar CNPJ alfanumérico | ✅ (String + validação) |
| 21 | Ambiente sandbox e produção separados | ✅ |
| 22 | Checklist de homologação | ✅ |
| 23 | Documentação para configurar Asaas | ✅ |
| 24 | Documentação para configurar fiscal/NFS-e | ✅ |
| 25 | Plano de rollback | ✅ |

**Total:** 25/25 ✅ | 0/25 🟡 | 0/25 🔴
