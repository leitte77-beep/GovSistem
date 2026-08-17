# GovPro — Processo Administrativo Eletrônico (SPE)

Módulo do GovSistem que substitui o processo em papel em prefeituras, câmaras e
demais entes: autuação com NUP, produção/assinatura de documentos, tramitação
simultânea, sigilo (LAI), auditoria imutável e ciclo arquivístico.

## Stack

| Serviço | Tecnologia | Porta (dev) |
|---|---|---|
| api | Python FastAPI + SQLAlchemy async | 8203 |
| postgres | PostgreSQL 16 (banco `govpro` do stack infra) | 5432 |
| minio | MinIO (bucket `govpro-files`, prefixo por tenant) | 9000 |

## Estrutura

```
modulo-govpro/
├── api/            # API REST (FastAPI), camadas: api/v1 → services → models
│   ├── alembic/    # migrations versionadas (núcleo em versions/0001_nucleo.py)
│   ├── app/
│   │   ├── core/   # config, auth (SSO), validadores BR, NUP, storage, seeds
│   │   ├── models/ # entidades de domínio (tenant_id em toda tabela de negócio)
│   │   ├── schemas/# DTOs (minimização LGPD: CPF/CNPJ mascarados)
│   │   ├── services# casos de uso (autuação, assinatura, tramitação, auditoria)
│   │   └── api/v1/ # rotas (/api/govpro/v1/*)
│   └── tests/      # unit + integração (24 testes)
└── docker-compose.yml
```

## Autenticação (SSO — igual ao ChatGov)

O login vem da plataforma GovSistem. O GovPro **não tem senha local** para
usuários internos: valida o token JWT contra `[JWT_SECRET, ...JWT_SECRETS]`
(chaves de assinatura do SaaS), aceita `type ∈ {access, module_access}`, resolve
o tenant por `organization_id` e recarrega perfil/situação do banco a cada
request. O SaaS chama `POST /api/govpro/v1/internal/sync-organization` e
`/internal/sync-user` (guard `X-Internal-Key`) para provisionar o espelho.

## Variáveis de ambiente

Copie `.env.example` para `.env` (gitignored). Mínimo:

```bash
POSTGRES_HOST/PORT/DB/USER/PASSWORD   # banco govpro
JWT_SECRET / JWT_SECRETS              # chave local + chaves do SaaS (vírgulas)
INTERNAL_API_KEY                      # tem que bater com o SaaS
SECRET_KEY                            # assinar tokens locais (dev/e2e)
MINIO_*                               # storage
```

## Como rodar

```bash
# Sobe dentro do stack infra (compartilha postgres/minio)
docker compose -p infra -f modulo-govpro/docker-compose.yml up -d --build

# Rodar testes (unit + integração, sem banco externo)
cd modulo-govpro/api && python3 -m pytest tests -q

# Lint
cd modulo-govpro/api && ruff check app tests

# Criar migration
cd modulo-govpro/api && alembic revision --autogenerate -m "descricao"
```

A migração e o bootstrap de perfis rodam automaticamente no `entrypoint.sh`
(`alembic upgrade head` + `python -m scripts.bootstrap`).

## Endpoints principais (OpenAPI em `/docs`)

- `POST /api/govpro/v1/processos` — autuação (gera NUP)
- `GET  /api/govpro/v1/processos` / `/{id}` — listagem/detalhe
- `GET  /api/govpro/v1/processos/{id}/andamentos` — linha do tempo
- `POST /api/govpro/v1/processos/{id}/encerrar` / `/reabrir`
- `POST /api/govpro/v1/processos/{id}/documentos` — produzir documento interno
- `PATCH /api/govpro/v1/documentos/{id}` — editar rascunho (imutável após assinar)
- `POST /api/govpro/v1/documentos/{id}/assinar` — assinatura (nível mínimo por tipo)
- `POST /api/govpro/v1/processos/{id}/tramitacoes` — envio simultâneo a múltiplas unidades
- `POST /api/govpro/v1/tramitacoes/{id}/receber`, `/processos/{id}/devolver`, `/concluir-unidade`
- `GET  /api/govpro/v1/busca?q=` — busca por NUP/especificação
- `GET  /api/govpro/v1/me` — usuário autenticado

**Fase 2 — documentos, sigilo e validação:**
- `POST /api/govpro/v1/processos/{id}/documentos/upload` — captura de arquivo (hash + dedupe + antivírus)
- `GET  /api/govpro/v1/documentos/{id}/download` — download (auditado)
- `POST /api/govpro/v1/documentos/{id}/tarjar` — versão pública (tarja), mantém o original íntegro
- `POST /api/govpro/v1/{processo|documento}/{id}/classificar` / `/desclassificar` — sigilo (LAI)
- `POST /api/govpro/v1/processos/{id}/credenciais` / `DELETE .../{usuario_id}` — credencial nominal
- `POST /api/govpro/v1/blocos-assinatura` + `/documentos` + `/assinar` — assinatura em lote
- `GET  /api/govpro/v1/public/validar?codigo=&crc=` — validador público (sem login)

**Fase 3 — cidadão (área externa):**
- `POST /api/govpro/v1/public/cidadao/registrar` — cadastro próprio (CPF/CNPJ real, termo versionado)
- `POST /api/govpro/v1/public/cidadao/login` — login do cidadão (JWT próprio)
- `GET  /api/govpro/v1/public/cidadao/me`, `/public/meus-processos`, `/public/minhas-intimacoes`
- `POST /api/govpro/v1/public/peticionamentos` — peticionamento novo (gera NUP + recibo)
- `POST /api/govpro/v1/public/processos/{nup}/peticionar` — peticionamento intercorrente
- `GET  /api/govpro/v1/public/processos/{nup}?org_slug=` — consulta pública (só processos públicos)
- `POST /api/govpro/v1/public/intimacoes/{id}/ciencia` — ciência de intimação
- `POST /api/govpro/v1/public/manifestacoes` — ouvidoria (Lei 13.460/2017)
- `POST /api/govpro/v1/cidadaos/{id}/aprovar` + `GET /cidadaos/pendentes` — aprovação do cadastro
- `POST /api/govpro/v1/processos/{id}/intimacoes` — emitir intimação
- `POST /api/govpro/v1/processos/{id}/acesso-externo` + `DELETE /acessos-externos/{id}`

**Fase 4 — prazos e gestão:**
- `GET/POST /api/govpro/v1/feriados` + `DELETE /feriados/{data}` — calendário (nacional/estadual/municipal)
- `POST /api/govpro/v1/processos/{id}/prazos` + `POST /prazos/{id}/prorrogar` — motor de prazos
- `GET /api/govpro/v1/meus-prazos` + `GET /prazos-unidade` — prazos vencidos / a vencer
- `POST /api/govpro/v1/processos/{id}/sobrestar` + `/reativar` — suspensão/reativação
- `POST/GET/DELETE /api/govpro/v1/acompanhamentos` — acompanhamento especial
- `POST /api/govpro/v1/indisponibilidades` + `/encerrar` + `GET /{id}/certidao` — indisponibilidade + certidão
- `POST/GET /api/govpro/v1/bases-conhecimento` — base de conhecimento por tipo de processo

**Fase 5 — arquivo e interoperabilidade:**
- `POST/GET /api/govpro/v1/ttd` — Tabela de Temporalidade e Destinação
- `POST /api/govpro/v1/processos/{id}/transferir` + `/recolher` + `GET /{id}/ciclo` — ciclo de vida
- `POST /api/govpro/v1/eliminacoes` + `/aprovar` + `/edital` + `/termo` + `/executar` — eliminação com rito completo
- `POST /api/govpro/v1/verificar-integridade` — verificação de hash (preservação)
- `GET /api/govpro/v1/exportar-acervo` — exportação SIP/AIP (formato aberto, sem lock-in)
- `GET /api/govpro/v1/dados-abertos` — estatísticas anonimizadas

Erros em RFC 9457 (Problem Details); datas ISO 8601/UTC.

## Princípios implementados (Fases 1, 2 e 3)

- **Publicidade como regra**: processo nasce `PUBLICO`; restrição exige hipótese legal.
- **Nada se apaga**: documento assinado é imutável (sem DELETE no domínio).
- **Trilha append-only** com encadeamento de hash (`audit_trail` + trigger).
- **NUP17** com DV conforme Portaria Interministerial MJSP/ME nº 11/2019
  (vetores oficiais testados: `35041.000387/2000-19`, `04000.001412/2000-26`).
- **LGPD**: CPF/CNPJ com DV real (CNPJ alfanumérico), máscara por padrão.
- **Captura íntegra**: SHA-256/SHA-512, deduplicação por hash, antivírus obrigatório,
  metadados mínimos do Anexo II do Decreto 10.278/2020 em digitalizações.
- **Sigilo com prazo**: classificação/desclassificação, expiração automática, credencial
  nominal, validador público sem login.
- **Peticionamento externo**: cadastro com aprovação do órgão, recibo com horário de
  conclusão do processamento, roteamento ao setor competente, consulta pública, intimação.
- **Prazos**: regra legal (exclui início, inclui fim, prorroga para dia útil), feriados
  nacionais (fixos + móveis calculados por Páscoa) e municipais, prorrogação por
  indisponibilidade, sobrestamento e reativação automática.
- **Arquivo**: TTD vinculada ao plano de classificação, ciclo de vida
  (corrente → intermediária → permanente), eliminação com rito completo
  (listagem → aprovação → edital → termo → expurgo lógico com metadados
  preservados), verificação de integridade por hash e exportação SIP/AIP.
