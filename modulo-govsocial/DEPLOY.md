# GovSocial — Operação e Deploy (produção)

Notas operacionais do módulo em `govsocial.govsistem.com.br`. Complementa o
`README.md` (arquitetura) com o que é necessário para rodar em produção real.

## Topologia

- **govsocial-api** (`infra/docker-compose.yml`) — FastAPI, porta interna 8000,
  publicada em `8202`. Entrypoint aplica `alembic upgrade head` e
  `scripts.bootstrap_roles` (só papéis; **não** cria tenant fictício).
- **govsocial-web** — SPA estática (nginx), build de produção com mock desligado
  (`.env.production`), publicada em `7501`.
- **govsocial-db-init** — cria o banco `govsocial` no Postgres compartilhado
  (`infra-postgres`).
- **nginx da borda** roteia `govsocial.govsistem.com.br`: `/api/govsocial/` → API,
  demais rotas → web.
- Dados: banco `govsocial` (Postgres compartilhado) + volume `govsocial_uploads`
  (anexos) + bucket MinIO `govsocial-files`.

## Primeiro uso (onboarding do município)

Um tenant novo entra **vazio de dados operacionais** — isso é esperado. O que já
vem pronto e o que o gestor precisa fazer:

1. **Domínios nacionais** (tipos de serviço, formas de acesso, códigos de
   encaminhamento, tipos de benefício): **provisionados automaticamente** no
   primeiro acesso via SSO (`/internal/sync-organization` chama
   `seed_national_domains`, idempotente). Nada a fazer.
2. **Unidades (CRAS/CREAS), territórios, equipe**: o gestor conclui pelo
   **wizard de Administração** (`/administracao` → `POST /onboarding/wizard/{step}`).
   Enquanto `GET /onboarding/status` retornar `ready:false`, a home mostra um
   cartão guiando a configuração.
3. **CadÚnico** (opcional): importação por CSV em Administração.

> Não usar `POST /admin/seed-bulk` (200 famílias fictícias) em produção — é só
> para piloto/demonstração.

## Segredos

### Próprios do módulo (já endurecidos em `infra/.env`)

- `GOVSOCIAL_SECRET_KEY` — assina tokens locais do módulo e é base da cifra de
  PII quando `FIELD_ENCRYPTION_KEY` não é definida.
- `GOVSOCIAL_FIELD_ENCRYPTION_KEY` — chave **Fernet** dedicada à cifra em nível
  de coluna (LGPD art. 11): evolução técnica, pareceres, devolutivas, PIA, etc.

> Rotacionar estas chaves torna **ilegível** qualquer PII já cifrada. Só é seguro
> com a base ainda sem atendimentos/prontuários gravados. Gerar novas:
> `openssl rand -hex 32` (SECRET_KEY) e
> `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
> (FIELD_ENCRYPTION_KEY).

### Compartilhados com a plataforma SaaS (⚠️ pendente)

O SSO depende de dois segredos que **precisam ser idênticos** aos da
`saas-platform` (que assina o token `module_access` e chama os endpoints
`/internal`):

| Módulo (`GOVSOCIAL_*`) | Deve ser igual a (saas-platform) |
|---|---|
| `GOVSOCIAL_SAAS_JWT_SECRET` | `SECRET_KEY` |
| `GOVSOCIAL_INTERNAL_API_KEY` | `INTERNAL_API_KEY` |

**Hoje a `saas-platform` ainda roda com os defaults de desenvolvimento**
(`SECRET_KEY=dev-saas-secret-key-change-in-production`,
`INTERNAL_API_KEY=dev-internal-key-123`). Com eles é possível **forjar tokens de
qualquer usuário/órgão**. Trocar é uma mudança de **plataforma**, não do módulo,
e tem raio de impacto grande.

**Procedimento de rotação (coordenado, com janela de manutenção):**

1. Gerar novo `SECRET_KEY` e `INTERNAL_API_KEY` fortes para a `saas-platform`.
2. Atualizar o `.env` da `saas-platform` e recriar `saas-platform-api`.
3. Atualizar **todos os módulos** que validam o token da plataforma para os
   novos valores: GovSocial (`GOVSOCIAL_SAAS_JWT_SECRET` /
   `GOVSOCIAL_INTERNAL_API_KEY`), e os equivalentes de chatgov, govtask,
   govavalia, diário.
4. Recriar cada módulo.
5. **Efeito colateral:** todas as sessões/tokens de módulo vigentes são
   invalidados — os usuários reautenticam pela plataforma. Fazer fora do horário
   de atendimento.

## Backup

Cobrir os dois destinos:

- Banco `govsocial` no Postgres compartilhado:
  `docker exec infra-postgres-1 pg_dump -U doe_user govsocial > govsocial_YYYYMMDD.sql`
- Volume de anexos `govsocial_uploads` (ou o bucket MinIO `govsocial-files`).

## Build / redeploy

```
docker compose --project-directory infra -f infra/docker-compose.yml \
  --env-file infra/.env build govsocial-api govsocial-web
docker compose --project-directory infra -f infra/docker-compose.yml \
  --env-file infra/.env up -d govsocial-api govsocial-web
```

Healthcheck da API: `GET /api/govsocial/health`.
