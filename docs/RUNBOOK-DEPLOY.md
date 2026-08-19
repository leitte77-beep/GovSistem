# RUNBOOK — Deploy e operação (produção)

Guia para **não perder arquivos de configuração** e **não derrubar módulos em
produção**. Leia antes de rodar qualquer deploy ou mexer no Docker do servidor.

## Como os módulos estão organizados

Cada módulo roda como um **projeto Compose separado** (nomes de container
`<projeto>-<serviço>-N`):

| Projeto Compose      | Arquivo                                   | Domínio / porta host        |
|----------------------|-------------------------------------------|-----------------------------|
| `infra`              | `infra/docker-compose.prod.yml`           | núcleo (api, nginx, diário, govtask, landing, worker…) |
| `infra` (govsocial)  | `infra/docker-compose.govsocial.yml`      | govsocial.govsistem.com.br (7501 / 8202) |
| `saas-platform`      | `saas-platform/docker-compose.yml`        | admin.govsistem.com.br (9002) |
| `modulo-chatgov`     | `modulo-chatgov/docker-compose.yml`       | chatgov.govsistem.com.br (3050 / 3051) |
| `preco`              | `/home/ubuntu/preco/docker-compose.yml`   | (repo separado)             |
| `sistemaweb-staging` | `infra/docker-compose.staging.yml`        | staging (8080 / 8081)       |

Os `.env` de cada módulo (`saas-platform/.env`, `modulo-chatgov/.env`,
`modulo-govsocial/.env`) contêm **segredos** e são **gitignored** — nunca
versionar. Faça backup deles fora do git.

## Regra de ouro contra PERDA de arquivos

O deploy roda `git reset --hard origin/<branch>`. **Tudo que não estiver
commitado no branch de deploy é descartado.** Já perdemos assim os composes do
ChatGov e do saas-platform e vários Dockerfiles.

- Todo `docker-compose*.yml` e `Dockerfile*` de produção **PRECISA estar
  commitado em `master`** (branch de produção). Se só estiver em `develop`, o
  deploy de produção o apaga.
- Nunca dependa de um arquivo de infra que esteja apenas no disco (untracked).

## Regra de ouro contra DERRUBAR módulos

- **NUNCA** use `--remove-orphans` num `docker compose up`. Os módulos vivem em
  arquivos/projetos diferentes; `--remove-orphans` remove tudo que não está no
  arquivo daquele comando. (Já removido dos scripts de deploy.)
- **NUNCA** use `docker compose down` em produção para "atualizar" — isso para e
  remove os containers. Use `up -d --build <serviço>`.
- Ao mexer num módulo, atualize **apenas aquele serviço**:
  `docker compose up -d --build --no-deps <serviço>`.
- **NUNCA** `docker system prune -a` nem `--volumes`. Só `docker system prune -f`
  (dangling apenas). `-a` apagaria imagens de módulos sem Dockerfile no disco
  (ex.: `saas-platform-api`, `infra-govsocial-api`, `modulo-chatgov-*`) — que
  **não poderiam ser reconstruídas**.
- **NUNCA** apague volumes nem dados de nenhum módulo em produção. Em especial o
  **chatgov está em uso real por uma prefeitura** (banco, conversas, mensagens e
  mídia). Regra absoluta: **não apagar nada do chatgov em hipótese alguma** —
  nem volume (`modulo-chatgov_chatgov_pgdata`, `modulo-chatgov_chatgov_uploads`,
  `infra_chatgov_uploads`), nem tabela, nem mensagem, nem container. Qualquer
  limpeza de disco se limita a **build cache** (`docker builder prune -f`) e
  **imagens dangling** (`docker system prune -f`), que nunca tocam volumes.
- Após recriar um container servido pela borda, recarregue o nginx de borda:
  `docker exec infra-nginx-1 nginx -s reload` (senão dá 502).

## Comandos por módulo (atualização segura)

```bash
# Núcleo (infra) — deploy padrão de produção
bash scripts/deploy-production.sh          # já sem --remove-orphans

# Admin SaaS
cd saas-platform && docker compose up -d --build --no-deps web-admin

# ChatGov (bot WhatsApp)
cd modulo-chatgov && docker compose up -d --no-deps backend   # ou frontend

# GovSocial (roda dentro do projeto infra, arquivo próprio)
docker compose -p infra -f infra/docker-compose.govsocial.yml up -d
```

## Armadilhas conhecidas do stack `infra`

- Os containers `infra-postgres-1`, `infra-redis-1` e `infra-govsocial-api-1`
  foram subidos de arquivos diferentes dentro do **mesmo** projeto `infra`. Por
  isso `--remove-orphans` no `prod.yml` removeria o `govsocial`. Mantido fora do
  deploy automático via `docker-compose.govsocial.yml`.
- Imagens sem Dockerfile no disco (perdidos): `saas-platform-api`,
  `infra-govsocial-api`, `modulo-chatgov-backend`, `modulo-chatgov-frontend`.
  Enquanto a imagem existir no host o serviço sobe; recuperar os Dockerfiles é
  uma pendência. **Não faça prune agressivo** enquanto isso.

## Verificação rápida pós-deploy

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | sort
curl -s -o /dev/null -w "%{http_code}\n" https://admin.govsistem.com.br/
curl -s -o /dev/null -w "%{http_code}\n" https://chatgov.govsistem.com.br/
curl -s -o /dev/null -w "%{http_code}\n" https://govsocial.govsistem.com.br/
```
