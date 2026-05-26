# Análise Multi-Tenant — Sistema DOE

## Cenário Atual

O sistema **Diário Oficial Eletrônico (DOE)** foi construído com uma **estrutura inicial de multi-tenancy**: existe o modelo `Organization` e a maioria das tabelas possui `organization_id`. Porém, o sistema **não isola dados entre organizações** — vários endpoints retornam dados de *todas* as organizações, e não há roteamento por domínio/subdomínio.

Abaixo está a análise completa do que existe, do que falta e do caminho para transformar em um SaaS multi-tenant vendável para prefeituras, câmaras e governos.

---

## Status da Implementação

| Fase | Status | Data |
|------|--------|------|
| **Fase 1 — Fundação** | ✅ Concluída | 2026-05-21 |
| **Fase 2 — Isolamento** | ✅ Concluída | 2026-05-21 |
| **Fase 3 — Frontend** | 🔄 Em andamento | - |
| **Fase 4 — Onboarding** | ⬜ Pendente | - |
| **Fase 5 — Faturamento** | ⬜ Pendente | - |

### Fase 1 (Concluído)
- [x] Adicionar `organization_id` nas tabelas `signing_documents`, `signing_jobs`, `search_index`
- [x] Alterar unique constraint da editions para incluir `organization_id`
- [x] Criar tabela `tenant_domains` + model Python
- [x] Criar middleware de tenant (`app.core.tenant.resolve_tenant_from_domain`)
- [x] Adicionar `organization_id` no payload do JWT
- [x] Migration `4ed27b7a7ed6` aplicada no banco

### Fase 2 (Concluído)
- [x] `GET /editions` — filtro por `user.organization_id`
- [x] `GET /matters` — filtro por `user.organization_id`
- [x] `GET /org-units` — filtro por `user.organization_id`
- [x] `GET /users` — filtro por `user.organization_id`
- [x] `GET /signing-credentials` — filtro por `user.organization_id`
- [x] `GET /public/editions` — filtro por tenant do domínio
- [x] `GET /public/editions/{year}/{number}` — filtro por tenant do domínio
- [x] `GET /public/matters/{id}` — filtro por tenant do domínio
- [x] `GET /public/verify/{code}` — filtro por tenant do domínio

---

## 1. Estratégia de Isolamento Recomendada

### Modelo: **Shared Database, Scoped by Organization**

- Banco de dados único (PostgreSQL), todas as organizações no mesmo schema
- Isolamento via `organization_id` em todas as queries
- Mais simples de operar que banco por tenant
- Único deployment para todos os clientes
- Custo operacional menor

### Alternativa: **Database per Tenant** (não recomendado para este estágio)

- Um banco PostgreSQL por cliente
- Mais isolamento, porém complexidade operacional muito maior
- Ideal apenas para conformidade regulatória específica (LGPD nível máximo)
- Para o estágio atual, o custo não compensa

---

## 2. Organização dos Dados

### 2.1. Correções Obrigatórias no Schema

| Tabela | Problema | Solução |
|--------|----------|---------|
| `editions` | Unique constraint global `(year, number, type)` | Alterar para `(organization_id, year, number, type)` |
| `signing_documents` | Sem `organization_id` | Adicionar coluna NOT NULL |
| `signing_jobs` | Sem `organization_id` | Adicionar coluna NOT NULL |
| `search_index` | Sem `organization_id` | Adicionar coluna NOT NULL |
| `audit_events` | `organization_id` é nullable | Tornar NOT NULL |
| `users` | `organization_id` é nullable | Tornar NOT NULL (apenas super-admin pode ser null) |

### 2.2. Tabelas Globais (Compartilhadas)

Estas tabelas permanecem globais, sem `organization_id`:

| Tabela | Motivo |
|--------|--------|
| `roles` | Papéis de usuário são padrão do sistema |
| `alembic_version` | Controle de migração |
| `refresh_tokens` | Tokens JWT, vinculados ao user (que tem org) |
| `user_roles` | Papéis são globais, associação via user (que tem org) |

### 2.3. Tabelas com `organization_id` Opcional para o Futuro

| Tabela | Recomendação |
|--------|-------------|
| `act_types` | Por ora global. Se houver demanda, adicionar `organization_id` nullable (null = global, preenchido = personalizado) |
| `system_settings` | Adicionar `organization_id` nullable (null = global, preenchido = por organização) |

---

## 3. Roteamento por Domínio/Subdomínio

### 3.1. Modelo de Domínios

Criar tabela `tenant_domains`:

```sql
CREATE TABLE tenant_domains (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE,
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Estratégia de domínios:
- **Subdomínio**: `prefeitura.doeapp.com.br` (fácil, SSL wildcard)
- **Domínio personalizado**: `diario.prefeitura.gov.br` (SSL por domínio)
- **Padrão**: `{slug}.doeapp.com.br` (automático, sem configuração)

### 3.2. Middleware de Tenant

Criar middleware FastAPI que:

1. Lê o header `Host` da requisição
2. Busca o `organization_id` correspondente na tabela `tenant_domains`
3. Injeta o tenant no `request.state` para uso em todas as rotas
4. Define o schema de CORS dinamicamente

### 3.3. Nginx

- Adicionar wildcard SSL: `*.doeapp.com.br`
- Proxy reverso único para a API (sem subdomínio por serviço)
- O Next.js faz o roteamento cliente-side baseado no domínio detectado

---

## 4. Autenticação e Contexto

### 4.1. JWT

Adicionar `organization_id` ao payload do token:

```python
payload = {
    "sub": str(user_id),
    "organization_id": str(user.organization_id),
    "roles": roles,
    "type": "access",
    ...
}
```

### 4.2. Dependência de Tenant

Criar `require_tenant()` que:
- Extrai `organization_id` do token JWT
- Verifica se a organização está ativa
- Injeta o tenant no endpoint

### 4.3. Middleware de Escopo

Criar middleware que adiciona automaticamente filtro de `organization_id` em queries SQLAlchemy (usando eventos ou query global).

---

## 5. Correções nos Endpoints

### 5.1. CRUD — Filtro por Organização

**Todos os endpoints de listagem** precisam adicionar filtro `WHERE organization_id = :tenant_id`:

| Endpoint | Situação Atual |
|----------|---------------|
| `GET /matters` | **Sem filtro** — retorna de todas as orgs |
| `GET /editions` | **Sem filtro** — retorna de todas as orgs |
| `GET /users` | **Sem filtro** — retorna de todas as orgs |
| `GET /org-units` | **Sem filtro** — retorna de todas as orgs |
| `GET /signing-credentials` | **Sem filtro** — retorna de todas as orgs |
| `GET /search-index` | **Sem filtro** — sem org_id na tabela |

**Correção:** Adicionar `WHERE` clause em todos os selects de listagem.

### 5.2. Endpoints Públicos

Os endpoints públicos precisam receber o tenant via subdomínio ou query param:

- `GET /public/editions` → filtrar por `organization_id` do tenant
- `GET /public/editions/{year}/{number}` → adicionar `organization_id` na busca
- `GET /public/search` → filtrar por `organization_id`
- `GET /public/verify/{code}` → filtrar por `organization_id`

### 5.3. Criação de Registros

Já está correto: `organization_id = user.organization_id` nos endpoints de criação. Mas **reforçar** com validação:

- Verificar se o usuário pertence à organização antes de criar
- Impedir criação de registros em organização diferente da do usuário

---

## 6. Armazenamento de Arquivos

### 6.1. Local Storage

Adicionar prefixo de organização nos paths:

```
antes:  uploads/pdf/edition_2026_1_abc123.pdf
depois: uploads/{org_slug}/pdf/edition_2026_1_abc123.pdf
```

### 6.2. MinIO

Criar um bucket por organização ou prefixo por organização:

```
antes:  doe-publicacoes/pdf/edition_2026_1_abc123.pdf
depois: doe-publicacoes/{org_slug}/pdf/edition_2026_1_abc123.pdf
```

### 6.3. Migração

Script para mover arquivos existentes para a estrutura com prefixo.

---

## 7. Frontend

### 7.1. Painel Admin (web-admin)

- Detectar organização via subdomínio ou config
- Adicionar seletor de organização se o usuário for multi-org
- Personalizar logo, nome e cores por organização
- Configurar `NEXT_PUBLIC_API_URL` dinamicamente

### 7.2. Portal Público (web-public)

- Detectar organização via subdomínio/domínio
- Renderizar portal personalizado (logo, cores, nome do município)
- Filtrar conteúdo pela organização detectada
- SEO: meta tags por organização

### 7.3. Onboarding

- Fluxo de cadastro de nova organização (self-service ou admin)
- Wizard: domínio → dados da organização → usuário admin → ativação

---

## 8. Deployment e Infraestrutura

### 8.1. Estratégia de Deployment

```
Opção A: Single Instance (recomendado)
  - Um deployment para todos os tenants
  - Escala vertical/horizontal conforme demanda
  - Custo: 1 servidor (ou cluster pequeno)

Opção B: Instance per Tenant (não recomendado agora)
  - Um deployment Docker por cliente
  - Custo: N servidores
  - Complexidade: orquestração, monitoramento, atualizações
```

### 8.2. SSL

- Certificado wildcard para `*.doeapp.com.br` (Let's Encrypt)
- Para domínios personalizados: auto-setup via Certbot + Nginx dinâmico

### 8.3. Recursos Compartilhados

| Recurso | Estratégia |
|---------|-----------|
| PostgreSQL | Banco único, schema único |
| Redis | Instância única |
| MinIO | Bucket único, prefixos por org |
| Worker/Celery | Fila única, tasks com org_id |
| Signer | Instância única |

---

## 9. Planos e Faturamento (Futuro)

### 9.1. Tabela `plans`

```sql
CREATE TABLE plans (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    max_users INT NOT NULL,
    max_editions_per_month INT NOT NULL,
    max_storage_mb INT NOT NULL,
    has_custom_domain BOOLEAN DEFAULT FALSE,
    has_white_label BOOLEAN DEFAULT FALSE,
    price_cents INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
```

### 9.2. Tabela `subscriptions`

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 10. Roadmap de Implementação

### Fase 1 — Fundação ✅
- [x] Adicionar `organization_id` nas tabelas faltantes (signing_documents, signing_jobs, search_index)
- [x] Alterar unique constraint da editions para incluir `organization_id`
- [ ] ~~Tornar `organization_id` NOT NULL onde for nullable~~ (parcial — audit_events e users ainda nullable)
- [x] Criar tabela `tenant_domains`
- [x] Criar middleware de tenant (detecção por domínio)
- [x] Adicionar `organization_id` no JWT

### Fase 2 — Isolamento de Dados ✅
- [x] Adicionar filtro `organization_id` em TODOS os endpoints de listagem
- [x] Corrigir endpoints públicos para filtrar por tenant
- [ ] ~~Adicionar prefixo de organização no storage de arquivos~~ (pendente)
- [ ] ~~Migrar arquivos existentes para nova estrutura~~ (pendente)
- [ ] ~~Adicionar per-org settings no system_settings~~ (pendente)

### Fase 3 — Frontend Multi-Tenant (em andamento)
- [x] Model Organization com `theme_config` (JSON) e `public_url`
- [x] Migration `5a6b7c8d9e0f` adicionando campos ao banco
- [x] Endpoint `GET /api/public/v1/organization` — retorna config do tenant por domínio
- [x] Frontend `api.ts` — método `getOrganization()` adicionado
- [x] OrgContext (React context) criado no frontend
- [x] Navbar exibe logo, nome e cores dinâmicos da organização
- [x] Homepage exibe nome e descrição dinâmicos do tenant
- [x] Endpoint retorna default quando não há tenant configurado
- [x] Seletor de organização no admin sidebar (multi-org)
- [x] Endpoint `GET /auth/organizations` — lista orgs acessíveis
- [x] Endpoint `POST /auth/switch-organization` — reemite JWT com nova org
- [x] Frontend: `switchOrganization()` no auth context + dropdown no sidebar

### Fase 4 — Onboarding e Deploy (2 semanas) ✅ (em andamento)
- [x] `POST /auth/register` — endpoint de auto-cadastro (cria org + admin + JWT)
- [x] Página `/cadastrar` no portal público
- [x] Link "Criar Organização" no footer
- [ ] Setup automático de domínio personalizado (pendente)
- [ ] Wildcard SSL + Nginx dinâmico (pendente)

### Fase 5 — Planos e Faturamento (preparação) ✅
- [x] Model `Plan` + migration com seed de 4 planos (Gratuito, Básico, Profissional, Enterprise)
- [x] `plan_id` na tabela `organizations` (FK para plans)
- [x] CRUD completo de planos (`GET/POST/PUT/DELETE /api/v1/plans`)
- [x] Endpoint público `GET /api/v1/plans/public` (sem auth)
- [x] Plano gratuito atribuído automaticamente no registro
- [ ] Integração com gateway de pagamento (Stripe/PagSeguro) — pendente
- [ ] Gating de features por plano — pendente

---

## 11. Riscos e Considerações

### LGPD

- Cada organização é controladora independente dos seus dados
- O operador (SaaS) precisa de contrato com cada cliente
- Política de retenção e exclusão por organização
- Exportação de dados por organização (direito de portabilidade)

### Performance

- Índices com `organization_id` como primeira coluna
- Particionamento por organização em tabelas grandes
- Pool de conexões PostgreSQL dimensionado

### Backup e Disaster Recovery

- Backup atual já inclui todas as organizações
- Ponto de restauração: todo o sistema ou por organização (extração seletiva)
- RTO/RPD iguais para todos os tenants

### isolamento Técnico vs. Legal

- O shared database oferece isolamento técnico suficiente para a maioria dos clientes
- Para clientes com exigências regulatórias específicas: opção de instância dedicada (premium)

---

## 12. Estimativa de Esforço

| Fase | Estimativa | Real (acumulado) | Recursos |
|------|-----------|-------------------|----------|
| Fase 1 — Fundação | 12-15 dias | ✅ ~4h (assistido por IA) | 1 dev backend |
| Fase 2 — Isolamento | 8-10 dias | ✅ ~1h (assistido por IA) | 1 dev backend |
| Fase 3 — Frontend | 10-15 dias | 🔄 Em andamento | 1 dev fullstack |
| Fase 4 — Onboarding | 8-10 dias | ⬜ Pendente | 1 dev fullstack + DevOps |
| Fase 5 — Faturamento | 5-8 dias | ⬜ Pendente | 1 dev fullstack |
| **Total** | **43-58 dias** | **~5h** | |

---

## Conclusão

O sistema tem uma **base sólida** — o modelo `Organization` e os `organization_id` nas tabelas principais já existem. O que falta é:

1. **Completar o isolamento** nas tabelas e queries que ainda não filtram por organização
2. **Adicionar roteamento por domínio** para detectar qual organização está acessando
3. **Personalizar a experiência** (logo, cores, conteúdo) por tenant
4. **Criar o fluxo de onboarding** para novos clientes

Com ~2 meses de desenvolvimento, é possível transformar o DOE em um SaaS multi-tenant pronto para venda.
