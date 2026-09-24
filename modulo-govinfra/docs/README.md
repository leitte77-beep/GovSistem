# GovInfra — Secretaria Municipal de Infraestrutura

Módulo de gestão dos serviços, equipamentos e atendimentos da Secretaria
Municipal de Infraestrutura:

- **Gestão de Caçambas Municipais** — cadastro, solicitações, agenda com
  motor de recomendação de datas, entrega, retirada, mapa e alertas;
- **Gestão de Máquinas Pesadas, Caminhões e Programa Porteira Adentro** —
  produtores e propriedades, banco de horas auditável, vistorias, aprovações,
  ordens de serviço com QR Code, execução pelo celular, viagens, combustível
  e manutenções.

Stack: **FastAPI + SQLAlchemy (async) + PostgreSQL/SQLite** no backend e
**React + TypeScript + Vite + Leaflet** no frontend — as mesmas tecnologias
dos demais módulos do sistema (govdoc, govsocial, chatgov).

---

## Requisitos

- Node.js ≥ 18
- Python ≥ 3.10
- Docker (recomendado para PostgreSQL/Redis/MinIO; o modo sem Docker também funciona)

## Configuração inicial

```bash
npm run setup
```

O `setup`:

1. Confere Node/Python/Docker;
2. Cria o `.env.local` a partir do `.env.example` com segredos gerados;
3. Resolve portas livres na faixa reservada do módulo (44000–44699) e grava
   `.runtime/ports.json` e `.env.ports`;
4. Cria o venv da API e instala as dependências;
5. Instala as dependências do frontend;
6. Sobe PostgreSQL, Redis e MinIO (Docker) e aplica as migrations;
7. Executa a carga de demonstração (idempotente);
8. Mostra as URLs escolhidas.

## Execução

```bash
npm run dev            # API + frontend em modo desenvolvimento
npm run dev:api        # somente a API
npm run dev:web        # somente o frontend
npm run docker:up      # pilha completa no Docker (com build)
npm run docker:down    # derruba apenas os serviços do GovInfra
npm run seed           # (re)executa a carga de demonstração
npm run test           # suíte de testes da API
npm run lint           # ruff (API) + typecheck (frontend)
npm run ports          # mostra as portas resolvidas
```

## Portas

As portas são configuradas no `.env.local` (preferência) e **nunca fixadas em
código**. O `scripts/resolve-ports.mjs` verifica se estão livres e, no modo
automático, escolhe a próxima porta livre da faixa do módulo. Nenhum processo
de terceiros é encerrado e nenhuma porta de outro módulo é alterada.

| Serviço | Faixa reservada |
|---|---|
| Frontend | 44000–44099 |
| API | 44100–44199 |
| Console do armazenamento | 44200–44299 |
| API do armazenamento (S3/MinIO) | 44300–44399 |
| Servidor de mapas (opcional) | 44400–44499 |
| Banco de dados (host) | 44500–44599 |
| Redis (host) | 44600–44699 |

## Estrutura

```text
modulo-govinfra/
├── api/                    # Backend FastAPI
│   ├── alembic/            # Migrations (inicial + correção de FKs)
│   ├── app/
│   │   ├── api/v1/         # Rotas REST (20 módulos de rotas)
│   │   ├── core/           # Config, auth, permissões, erros, storage, geo
│   │   ├── models/         # Modelos SQLAlchemy (50 tabelas govinfra_*)
│   │   ├── schemas/        # Pydantic (entrada/saída)
│   │   └── services/       # Regras de negócio (agenda, banco de horas,
│   │                       #   recomendação, elegibilidade, combustível…)
│   ├── scripts/seed.py     # Carga de demonstração (idempotente)
│   ├── tests/              # Suíte de testes (54 testes)
│   └── Dockerfile
├── web/                    # Frontend React + Vite + TypeScript
│   └── src/
│       ├── api/            # Cliente HTTP (token, upload, download)
│       ├── componentes/    # Layout, Comuns, cards, modais
│       ├── contexto/       # Sessão (SSO GovSistem) e avisos
│       ├── estilos/        # CSS global (design system do módulo)
│       └── paginas/        # 25 páginas do GovInfra
├── scripts/                # Portas, setup, dev, docker, seed, test, lint
├── docker-compose.yml
└── .env.example
```

## Autenticação

Não existe login próprio: o usuário chega pela **plataforma GovSistem**
(login único) com um token `module_access` (`?token=` na URL). A organização e
o usuário são provisionados no primeiro acesso. Em desenvolvimento, a ponte
`/auth/dev/session` permite autenticar com a conta do GovSistem quando
`VITE_ENABLE_SAAS_LOGIN=true`.

## Permissões

Perfis: `administrador`, `gestor`, `atendente`, `tecnico`, `operador`,
`motorista`, `combustivel`, `manutencao`, `consulta`.

Permissões granulares (`govinfra.<area>.<acao>`, ex.: `govinfra.cacambas.criar`,
`govinfra.porteira.aprovar`) — sempre validadas no backend, mesmo que a
interface já tenha escondido o botão. O catálogo completo fica em
`GET /api/govinfra/v1/auth/permissoes/catalogo`.

## Principais regras de negócio

- **Elegibilidade** (`services/elegibilidade.py`): bloqueios ativos,
  duplicidades, limites diário/mensal, intervalo mínimo, uma solicitação ativa
  por CPF/endereço, materiais proibidos, datas bloqueadas e dias de
  atendimento — tudo configurável.
- **Banco de horas** (`services/banco_horas.py`): o saldo nunca muda sem
  movimentação (append-only com saldo anterior/posterior), com trava de linha,
  saldo não negativo e idempotência por chave.
- **Recomendação de datas** (`services/recomendacao.py`): motor determinístico
  e explicável com pesos configuráveis; quando a data escolhida tem pontuação
  baixa, o sistema exige justificativa.
- **Agenda** (`services/agenda.py`): impede duplo agendamento de máquina,
  caminhão, operador e motorista; valida conflitos inclusive em arrastar e
  soltar.
- **Combustível** (`services/combustivel.py`): o abastecimento baixa o
  estoque na mesma transação; detecta 11 tipos de alertas; horímetro e
  quilometragem só podem regredir com correção autorizada e auditada.
- **Auditoria** (`services/auditoria.py`): trilha append-only de toda ação
  crítica, com CPF/RENAVAM/CNH mascarados nos logs.
- **Arquivos** (`services/arquivos.py`): extensão + MIME por assinatura real
  do conteúdo, nome aleatório no armazenamento, download sempre autenticado,
  exclusão lógica.

## API

- Swagger: `http://127.0.0.1:44101/docs`
- Prefixo: `/api/govinfra/v1` (saúde em `/api/govinfra/health`)
- 100+ endpoints agrupados por área: dashboard, pessoas, imóveis, caçambas,
  solicitações, agenda, porteira, ordens, frota, combustível, manutenções,
  bloqueios, mapa, relatórios, arquivos, notificações, auditoria,
  configurações, busca e consulta pública de QR Code.

## Testes

```bash
npm run test    # roda pytest com SQLite em arquivo temporário
npm run lint    # ruff na API + tsc --noEmit no frontend
```

A suíte cobre: cadastro de pessoas com duplicidade e mascaramento de CPF,
fluxo completo de caçamba (solicitar → aprovar → agendar → entregar →
retirar), regras de elegibilidade e bloqueios, recomendação de datas,
Porteira Adentro (programa → beneficiário → saldo → vistoria → aprovação →
ordem → execução → horas adicionais), combustível (estoque, idempotência,
alertas), manutenções, upload/download de arquivos com validação de
conteúdo, relatórios e exportações, auditoria, notificações, configurações e
permissões.

## Backup

- O banco PostgreSQL roda em volume Docker (`govinfra_pgdata`); para backup
  consistente use `pg_dump`:

  ```bash
  docker exec govinfra-postgres-1 pg_dump -U govinfra_user govinfra > govinfra-$(date +%F).sql
  ```

- Arquivos locais ficam em `api/storage/` (ou no bucket MinIO em produção).
- Redis é apenas cache/auxiliar e pode ser recriado sem perda.

## Atualização

```bash
git pull
npm run setup -- --sem-seed   # mantém o banco atual e aplica novas migrations
npm run dev
```

## Dados de demonstração

O seed cria (apenas em desenvolvimento, nunca automaticamente em produção):
organização + usuários por perfil, 5 regiões, 12 caçambas, 15 pessoas,
8 imóveis, 4 máquinas, 4 veículos, 5 habilitações, 16 tipos de serviço,
1 programa Porteira Adentro com 5 beneficiários e saldos de 24h,
8 solicitações de caçamba, 9 solicitações de serviço, 2 ordens de serviço,
tanque com abastecimento e manutenção preventiva. Tudo fictício.
