# Sistema de Diário Oficial Eletrônico

Sistema web para criação, montagem, assinatura digital e publicação do Diário
Oficial de órgão público brasileiro.

## Stack

| Serviço | Tecnologia | Porta |
|---|---|---|
| **api** | Python FastAPI + SQLAlchemy async | 8000 |
| **web-admin** | Next.js 14 + Tailwind CSS | 3000 |
| **web-public** | Next.js 14 + Tailwind CSS | 3001 |
| **worker** | Celery + Redis | — |
| **signer** | Python FastAPI (isolado) | 8100 |
| **postgres** | PostgreSQL 16 | 5432 |
| **redis** | Redis 7 | 6379 |
| **minio** | MinIO (S3-compatible) | 9000 / 9001 |

## Estrutura do Projeto

```
sistemaweb/
├── apps/
│   ├── api/           # API REST (FastAPI)
│   ├── web-admin/     # Painel de administração (Next.js)
│   ├── web-public/    # Portal público (Next.js)
│   ├── worker/        # Workers assíncronos (Celery)
│   └── signer/        # Serviço de assinatura digital (isolado)
├── infra/
│   ├── docker-compose.yml
│   └── nginx/
├── docs/
│   └── arquitetura.md
├── Makefile
└── README.md
```

## Pré-requisitos

- Docker 24+
- Docker Compose 2.20+

## Desenvolvimento

```bash
# Clonar e entrar no diretório
git clone <url> sistemaweb
cd sistemaweb

# Subir todos os serviços com logs no terminal
make dev

# Subir todos os serviços em segundo plano
make dev-up

# Rodar testes
make test

# Rodar lint
make lint

# Executar migrations
make migrate

# Criar nova migration
make migrate-create name="descricao_da_mudanca"

# Parar serviços
make down

# Limpar volumes e dados
make clean
```

Acessar:
- Admin: http://localhost:7201
- Portal público: http://localhost:7200
- API: http://localhost:8001
- API health: http://localhost:8001/api/v1/health
- Signer: http://localhost:8110
- MinIO console: http://localhost:9001

Observação:
- `make dev-up` é o comando mais previsível para subir o ambiente completo em desenvolvimento, porque recompõe as imagens e devolve o terminal imediatamente.

## Variáveis de Ambiente

Copie o arquivo de exemplo e preencha com valores reais:

```bash
cp infra/.env.example infra/.env
```

**Importante:** Substitua todos os `CHANGE_ME` por senhas fortes antes de subir o ambiente.
O arquivo `infra/.env` é ignorado pelo Git — nunca será commitado.

O Docker Compose lê `infra/.env` automaticamente.
