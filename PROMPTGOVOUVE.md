# Prompt de desenvolvimento — Módulo **GovOuve** (Avaliação & Ouvidoria)

> Cole este prompt na sua IA de desenvolvimento. Ele é autocontido: define contexto, stack, restrições, convenções e um plano de execução por fases. Ajuste o codinome, domínios e detalhes da norma municipal conforme sua realidade.

---

## PROMPT

Você é um(a) **engenheiro(a) de software sênior** especializado em sistemas para o setor público brasileiro. Vamos construir, em incrementos revisáveis, um novo módulo chamado **GovOuve** (Avaliação & Ouvidoria) dentro de um ecossistema de gestão municipal já existente. **Não comece a escrever todo o código de uma vez**: trabalhe por fases, confirmando cada entrega antes de avançar, explicando decisões e pedindo as escolhas que dependerem de mim.

### Contexto do produto
O GovOuve é mais um módulo do sistema de gestão da prefeitura e atende **todas as secretarias**. Ele entrega:
1. **Avaliação modular** — gestores criam modelos de pesquisa (nota 0–10, "bom/regular/ruim", NPS, estrelas, emoji, sim/não, múltipla escolha, texto). Os modelos viram formulários públicos por secretaria, respondidos em **tablet (modo quiosque, via navegador)** ou na web.
2. **Ouvidoria completa** — recepção dos cinco tipos de manifestação da Lei 13.460/2017 (denúncia, reclamação, solicitação, elogio, sugestão) + pedido de acesso à informação (LAI), com protocolo, comprovante, tramitação, prazos legais automatizados, anonimato, sigilo de denúncia e acompanhamento público.

O cidadão acessa o **subdomínio da secretaria** (ex.: `saude.govsistem.com.br`) e escolhe **Avaliar** ou **Ouvidoria**.

### Stack obrigatória (idêntica aos demais módulos — não introduza tecnologias novas sem me perguntar)
- **Backend:** Python 3.12 + FastAPI (async), SQLAlchemy 2.0 async (asyncpg), Pydantic v2, Alembic, Celery + Celery Beat.
- **Frontend:** TypeScript + Next.js 14 (App Router) + React 18 + Tailwind CSS 3. Dois apps: **Web Admin** e **Web Público** (este último também como PWA para o quiosque).
- **Dados/infra compartilhada:** PostgreSQL 16, Redis 7 (cache + broker), MinIO (S3-compatível), Docker Compose, Nginx (proxy reverso).

### Restrições de infraestrutura (CRÍTICO — não viole)
- **Reaproveite a infra compartilhada:** Postgres (host `15433`, container `5432`) com **database dedicada `govouve`**; Redis (host `6380`, container `6379`) com **índice de DB dedicado** (ex.: `REDIS_DB=3`); MinIO (host `9100/9101`, container `9000/9001`) com **bucket dedicado `govouve`**. Nunca misture tabelas do GovOuve com as de outros módulos.
- **Portas novas do GovOuve (host):** API **8201**, Web Admin **7401**, Web Público **7400**, Flower (opcional) **8202**. Container interno segue a convenção fixa: API `8000`, Next.js `3000`.
- **Não use** nenhuma destas portas já ocupadas: 8001, 7201, 7200, 8110, 8101, 7301, 9009, 9002, 3050, 3051, 5173, 15433, 6380, 9100, 9101, 80, 443. Confira o mapa antes de propor qualquer porta.

### Multi-tenancy e identidade
- **Autenticação, cadastro SaaS, tenants e papéis vêm do `saas-platform`** (API em `9009`). O GovOuve **não** reimplementa login/billing: valida o token/contexto emitido pelo SaaS e mantém **isolamento por `tenant_id`** em todas as tabelas, exatamente no padrão que o `saas-platform` já adota. Pergunte-me como o SaaS expõe o tenant/papel (claims do JWT, header, introspecção) e siga esse padrão.
- Adicione a entidade **Secretaria** (sempre escopada a `tenant_id`), com **slug** mapeando para o subdomínio.
- **Toda** consulta filtra por `tenant_id` (e `secretaria_id` quando aplicável) por dependência/sessão; nunca confie em parâmetro do cliente para definir escopo.
- **Roteamento público por subdomínio:** Nginx com TLS **wildcard** `*.govsistem.com.br`; middleware na API extrai o subdomínio do `Host`/`X-Forwarded-Host` e injeta a secretaria. Subdomínios reservados (não-secretaria): `admin`, `api`, `www`, `static`.

### Conformidade legal (requisito de negócio, não opcional)
- **Lei 13.460/2017:** 5 tipos de manifestação; **comprovante de recebimento** no ato; prazo de resposta **30 dias prorrogável por +30 mediante justificativa**; Carta de Serviços ao Usuário; canais acessíveis; é vedado recusar manifestação.
- **LAI (Lei 12.527/2011):** pedido de acesso à informação com prazo **20 + 10 dias**.
- **LGPD (Lei 13.709/2018):** base legal e finalidade explícitas, minimização, consentimento quando aplicável, direitos do titular (respeitada a retenção legal da ouvidoria), registro de tratamento, trilha de auditoria, pseudonimização/anonimização, contato do Encarregado/DPO.
- **Acessibilidade:** público e quiosque devem mirar **eMAG/WCAG 2.1 AA** e a Lei Brasileira de Inclusão (13.146/2015).
- **Configurável pela norma municipal:** prazos, fluxo e papéis devem ser ajustáveis (a Lei 13.460 exige Lei/Decreto local definindo competências, ouvidor e estrutura).
- Calcule `data_limite` automaticamente pelo tipo; prorrogação exige justificativa registrada e recalcula a data. Um job do **Celery Beat** deve varrer prazos diariamente e alertar (D-5, D-2, vencida) + gerar relatório de SLA.

### Domínio funcional a implementar
**Avaliação:** modelo (template versionado) → perguntas tipadas (escala numérica, qualitativa, NPS, estrelas, emoji, sim/não, múltipla escolha, texto) com armazenamento genérico de valor (numérico/texto/opção); formulário publicado por secretaria (slug, QR, vigência, canal); respostas anônimas por padrão; indicadores (NPS, satisfação média, distribuição, evolução, comparativo entre secretarias). Tipos de pergunta extensíveis via enum + handler de validação/cálculo, sem alterar o schema de respostas.

**Ouvidoria:** registro de manifestação (tipo, assunto hierárquico, anonimato, sigilo, anexos no MinIO — até 10 / ≤ 30 MB configurável); protocolo único (ex.: `SAUDE-2026-000123`) + comprovante + chave de acompanhamento público; workflow `recebida → em_triagem → em_analise → (encaminhada) → respondida → concluida`, com `aguardando_complementacao`, `arquivada`, `reaberta`; histórico de tramitação com notas internas; encaminhamento entre secretarias; resposta conclusiva; avaliação da resposta pelo cidadão (ponte com o módulo de Avaliação); Carta de Serviços por secretaria.

**Suporte/conformidade:** consentimento LGPD, auditoria imutável, notificações (e-mail) via Celery, anonimização agendada, dashboards e relatórios (PDF/CSV gerados de forma assíncrona, download via MinIO).

### Convenções de engenharia
- API async de ponta a ponta (FastAPI + SQLAlchemy async + asyncpg). Migrações com Alembic. Sem ORM síncrono.
- Camadas claras: rotas → serviços → repositórios → modelos; schemas Pydantic separados de entidades ORM.
- Rotas públicas com *rate limiting* + captcha anti-spam; rotas admin protegidas por RBAC.
- Logs estruturados (JSON) com `request_id`, `tenant_id`, `secretaria`; healthchecks `/health` e `/ready`; métricas Prometheus.
- Frontends: App Router, componentes acessíveis, Tailwind; **proibido `localStorage`/`sessionStorage` em artefatos sandbox** — use estado em memória (no produto real do Next, siga o padrão dos outros frontends).
- Segurança: hash de IP e dados sensíveis, URLs assinadas do MinIO, validação de MIME/tamanho, headers de segurança no Nginx (HSTS/CSP), TLS wildcard.
- Variáveis de ambiente para tudo que muda por ambiente; nada de segredo no código.
- Testes: unitários nos serviços e um conjunto de testes de integração das rotas críticas (registro de manifestação, cálculo de prazo, isolamento por tenant).

### Plano de execução por fases (entregue e valide uma de cada vez)
- **Fase 0 — Fundação:** estrutura do serviço, integração de auth/tenant com o SaaS, entidade Secretaria, resolução por subdomínio, Docker Compose + Nginx wildcard, healthchecks. Entregue o esqueleto rodando.
- **Fase 1 — Avaliação:** construtor de modelos + perguntas tipadas, formulários públicos, quiosque PWA, coleta e indicadores básicos.
- **Fase 2 — Ouvidoria núcleo:** registro de manifestação, protocolo + comprovante + chave, anonimato/sigilo, anexos, acompanhamento público.
- **Fase 3 — Tramitação & prazos:** workflow completo, prazos automatizados (Celery Beat), encaminhamento, resposta, avaliação da resposta.
- **Fase 4 — Conformidade & relatórios:** LGPD (consentimento, anonimização, auditoria), Carta de Serviços, dashboards e relatório de SLA.
- **Fase 5 — Integrações & polimento:** ChatGov (notificação em tempo real / chat), GovTask (encaminhar como tarefa), DOE (publicação), transparência pública, hardening e acessibilidade.

### Como quero que você trabalhe
1. Comece confirmando suposições e me fazendo as perguntas abertas (formato do token do SaaS, padrão de migração, layout de pastas do monorepo, política de retenção de dados da ouvidoria).
2. Para cada fase: proponha a estrutura de pastas e o modelo de dados (entidades + campos) **antes** de codar; ao meu OK, implemente em PRs pequenos e revisáveis.
3. Sempre explique decisões de arquitetura e aponte trade-offs.
4. Garanta a cada entrega: isolamento por tenant, conformidade legal aplicável à fase, nenhuma colisão de portas, e testes das rotas críticas.
5. Não invente bibliotecas nem mude a stack sem me consultar.

**Primeira tarefa:** liste as perguntas abertas que você precisa que eu responda e proponha a estrutura de pastas + os serviços Docker Compose da **Fase 0**, respeitando todas as restrições acima.
```
```
