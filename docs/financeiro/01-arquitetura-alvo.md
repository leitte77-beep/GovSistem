# Arquitetura Alvo — Módulo Financeiro

## 1. Fluxo de Dados

```
Usuário → Plano → Assinatura → Fatura → Conta a Receber → Cobrança → Pagamento → NFS-e → Contabilidade
```

## 2. Camadas

```
Frontend (Next.js)
    ↓ HTTP REST
API Layer (FastAPI routers)
    ↓
Service Layer (Use Cases)
    ↓
Provider Layer (Adapters) ← → Asaas / Focus NFe / Bancos
    ↓
Repository Layer (SQLAlchemy) ← → PostgreSQL
```

## 3. Estrutura de pastas alvo

```
saas-platform/api/app/
├── api/v1/           # Endpoints REST
├── core/             # Config, auth, database
├── middleware/        # Correlation, sanitize
├── models/           # SQLAlchemy models
├── providers/        # Adapters (Asaas, Focus, Banking)
├── services/         # Use cases / business logic
│   ├── accounting.py
│   ├── billing.py
│   ├── cnpj.py
│   ├── encryption.py
│   ├── reconciliation.py
│   ├── sanitize.py
│   └── subscription.py
├── schemas/          # Pydantic schemas
├── templates/        # Jinja2 templates
└── main.py           # FastAPI app
```

## 4. Separação de entidades

| Entidade | O que representa | Exemplo |
|----------|-----------------|---------|
| Plano | Produto vendido | Plano Básico R$ 99/mês |
| Assinatura | Vínculo cliente + plano | João assinou Plano Pro |
| Fatura | Documento financeiro interno | Fatura INV-202605-0001 |
| Conta a Receber | Direito financeiro | R$ 99 a receber até 30/05 |
| Cobrança | Objeto no provedor externo | Pix gerado no Asaas (pay_abc123) |
| Pagamento | Confirmação do dinheiro | R$ 99 recebidos em 29/05 |
| Webhook Event | Evento recebido do provedor | PAYMENT_RECEIVED |
| NFS-e | Documento fiscal | NFS-e 12345 autorizada |
| Lançamento Contábil | Partida dobrada | D: Banco / C: Contas a Receber |

## 5. Princípios

- **Centavos ou Decimal**: nunca float para dinheiro
- **Provedor via Adapter**: nenhum controller chama Asaas diretamente
- **Idempotência**: toda operação pode ser repetida sem efeito colateral
- **Tenant isolado**: toda query filtra por `organization_id`
- **Auditoria**: toda operação financeira registra `audit_events`
- **Correção contábil**: nunca editar lançamento postado; usar estorno
- **Período fechado**: bloqueia alterações após fechamento mensal
