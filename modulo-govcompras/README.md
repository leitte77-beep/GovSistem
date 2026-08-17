# GovCompras

**Gestão Integrada de Compras, Licitações e Contratos**

Sistema para a Administração Pública Municipal controlar todo o ciclo de uma contratação — do surgimento da necessidade em uma secretaria até o encerramento, renovação ou substituição do contrato — com responsável, etapa, prazo e pendências sempre visíveis. Módulo do ecossistema **GovSistem**, seguindo os mesmos padrões arquiteturais de `modulo-govdoc`, `modulo-govinfra` e `modulo-govsocial`.

## Arquitetura

```
modulo-govcompras/
  api/     FastAPI + SQLAlchemy (async) + Alembic + PostgreSQL
  web/     React 19 + TypeScript + Vite + Tailwind CSS v4
  docker-compose.yml
  .env.example
```

**Backend** (`api/`)
- `app/core/` — configuração, banco, segurança (Argon2 + JWT), RBAC (`permissoes.py`), middlewares, tratamento de erros
- `app/models/` — SQLAlchemy, um arquivo por domínio + `base.py` (mixins de auditoria/soft-delete/concorrência)
- `app/schemas/` — Pydantic v2
- `app/services/` — regra de negócio, com destaque para `workflow.py` (motor de workflow — ver abaixo)
- `app/api/v1/` — routers REST, montados em `/api/govcompras/v1`
- `alembic/` — 2 migrations (`inicial`, `fks_use_alter` — as FKs `use_alter=True` do `ActorMixin`/`SoftDeleteMixin` exigem uma segunda migration, mesmo padrão de `modulo-govinfra`)
- `scripts/seed.py` — dados de demonstração, idempotente
- `tests/` — pytest + httpx, roda contra SQLite isolado (29 testes)

**Frontend** (`web/`)
- `src/nucleo/` — sessão (SSO + login de demonstração), cliente HTTP, tipos compartilhados
- `src/ui/` — biblioteca de componentes própria em Tailwind (Botão, Chip de status, Tabela, Modal, FluxoStatus/timeline, Abas, campos de formulário)
- `src/layout/` — sidebar, cabeçalho, shell, guarda de rota por permissão
- `src/paginas/` — uma pasta por domínio, rotas carregadas com `React.lazy`

### Autenticação

O módulo é satélite SSO da plataforma GovSistem, igual aos demais: recebe um token `module_access` via `?token=` do shell central e provisiona organização/usuário na hora — **nenhuma senha de servidor real é armazenada aqui**. Para permitir demonstrar a POC sem depender da plataforma central, existe uma ponte de login de demonstração (`ENABLE_DEV_LOGIN=true`, desligada por padrão em produção) que emite token para as 7 personas fictícias da seção 128 da especificação.

### Motor de workflow (núcleo do sistema)

Cada tipo de processo (Pregão, Dispensa, Inexigibilidade, Credenciamento, Adesão a Ata, Contratação Emergencial) tem um `WorkflowTemplate` próprio com etapas, requisitos de avanço e transições — configurável pelo administrador, nunca hardcoded no serviço. Editar um template ativo cria uma nova versão; processos em andamento continuam presos à versão em que nasceram. O SLA (dentro do prazo / atenção / atrasado / crítico) nunca é persistido — é sempre calculado a partir de `agora() - etapa_atual_iniciada_em`. Ver `api/app/services/workflow.py` e `api/app/models/workflow.py` para o desenho completo comentado.

## Instalação

### Com Docker (recomendado)

```bash
cd modulo-govcompras
cp .env.example .env.local
docker compose up -d --build
```

Isso sobe PostgreSQL, roda as migrations, popula o banco com o cenário de demonstração (idempotente — não duplica em reinícios) e inicia a API e o frontend.

- Frontend: http://127.0.0.1:45001
- API: http://127.0.0.1:45101/docs (Swagger)
- Login: abra o frontend e escolha uma das 7 personas de demonstração

### Desenvolvimento local sem Docker

```bash
# Backend
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
# suba um PostgreSQL local e ajuste as variáveis de ambiente (ver .env.example)
alembic upgrade head
python -m scripts.seed
ENABLE_DEV_LOGIN=true uvicorn app.main:app --reload --port 45101

# Frontend (em outro terminal)
cd web
npm install
npm run dev  # http://127.0.0.1:5173, com proxy de /api/govcompras para a API
```

## Portas (bloco reservado 45000–45699)

| Serviço              | Porta | Variável             |
|----------------------|-------|-----------------------|
| Frontend (web)        | 45001 | `FRONTEND_PORT`       |
| API                    | 45101 | `API_PORT`            |
| PostgreSQL (host)      | 45501 | `POSTGRES_HOST_PORT`  |

Confirmado sem conflito com nenhum outro módulo do monorepo (govdoc usa 43xxx, govinfra usa 44xxx) antes de reservar este bloco.

## Usuários de demonstração

Todas as personas usam a senha **`Govcompras@123`** (documentada aqui de propósito — é só para desenvolvimento; a ponte que aceita essa senha responde 404 quando `ENABLE_DEV_LOGIN=false`, o padrão implícito em produção).

| E-mail                          | Perfil          | Papel na POC                              |
|----------------------------------|------------------|--------------------------------------------|
| admin@govcompras.local           | Administrador    | Configuração, autoridade competente, homologação |
| compras@govcompras.local         | Compras          | DFD, ETP, TR, pesquisa de preços           |
| licitacao@govcompras.local       | Licitação        | Edital, sessão, adjudicação, contratos     |
| saude@govcompras.local           | Solicitante      | Secretaria Municipal de Saúde              |
| contabilidade@govcompras.local   | Contabilidade    | Dotação orçamentária                       |
| juridico@govcompras.local        | Jurídico         | Parecer jurídico                           |
| fiscal@govcompras.local          | Fiscal           | Fiscalização contratual                    |

## Comandos úteis

```bash
# Backend
cd api
pytest -q                 # 29 testes
ruff check app scripts tests
alembic revision --autogenerate -m "descricao"
python -m scripts.seed    # idempotente

# Frontend
cd web
npm run build              # tsc -b && vite build
npm run lint                # oxlint
```

## Endpoint de saúde

`GET /api/govcompras/health`, `/health/live`, `/health/ready` — usados pelo healthcheck do container.

## Publicando atrás do nginx de borda

Este repositório usa um nginx compartilhado (`infra/nginx`) na frente de todos os módulos. Para publicar o GovCompras em `govcompras.govsistem.com.br`, replicando o padrão de `govdoc`/`govinfra` (ver `infra/nginx/sites/default.conf`):

1. Emitir/estender o certificado: adicionar `govcompras.govsistem.com.br` a `infra/nginx/ssl/renewal/govsistem-farol.conf` e rodar `certbot certonly --webroot -d ... -d govcompras.govsistem.com.br`.
2. Adicionar um `server{}` em `infra/nginx/sites/default.conf` com `proxy_pass http://host.docker.internal:45001;` (mesmo modelo do bloco de `govdoc`).
3. Adicionar `govcompras.govsistem.com.br` à lista de `server_name` do redirecionamento HTTP→HTTPS no topo do arquivo.
4. `docker exec infra-nginx-1 nginx -s reload`.

**Nenhum desses passos foi executado nesta entrega** — mexer no nginx compartilhado de produção está fora do escopo de uma POC local e exige DNS que não está disponível aqui. Documentado para quando o módulo for de fato implantado.

## Limitações conhecidas desta POC

Ver `POC-GOVCOMPRAS.md` para a lista completa de limitações e o que está sinalizado como "previsto para próxima fase" na própria interface.
