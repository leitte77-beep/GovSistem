# GovSocial — Módulo de Assistência Social (SUAS)

SaaS multi-tenant para prefeituras, sobre a plataforma GovSocial. Este README
documenta a **FASE 1 — Fundação técnica multi-tenant**.

Referência de escopo e normas: `../../plano.md`.

## Stack

Mesmo padrão dos demais módulos GovSocial:

| Camada | Tecnologia |
|---|---|
| API | Python 3.12 · FastAPI · SQLAlchemy async |
| Migrações | Alembic |
| Banco | PostgreSQL 16 |
| Cache/fila | Redis · Celery (fases futuras) |
| Objetos | MinIO (S3) |
| Testes | pytest · pytest-asyncio (SQLite in-memory) |

## Decisões de arquitetura da FASE 1

1. **Multi-tenancy pelo padrão atual da plataforma**: isolamento na **camada de
   aplicação**. `tenant_id = organization_id`. Toda tabela de negócio carrega
   `tenant_id NOT NULL` + índice composto iniciando por `tenant_id`, e **toda
   query filtra pelo tenant** via a dependency `get_tenant_id` (fail-closed:
   usuário sem tenant é rejeitado). Cross-tenant retorna **404** (não 403) para
   não vazar existência.
2. **Domínios configuráveis por tenant com seed nacional**: `service_types`,
   `access_forms`, `referral_codes`, `benefit_types` — versionados por vigência
   (`vigencia_inicio/fim`), com `code` nacional estável e `source`
   (`NACIONAL`/`LOCAL`). O seed nacional é **copiado para cada tenant** no
   onboarding (`POST /admin/seed-national`).
3. **Auditoria append-only** (`audit_trail`): grava **todas as escritas** e a
   **leitura de registro sensível** (abrir profissional). Protegida por
   **trigger** que bloqueia `UPDATE`/`DELETE` em PostgreSQL (defesa em
   profundidade) — não há rota PATCH/DELETE em `/audit`.
4. **LGPD desde já**: CPF é atributo **único por tenant**, nunca chave em URL;
   **mascarado** em listagens (`***.***.***-12`); DTOs específicos por tela
   (nunca serializa a entidade inteira); utilitário de **criptografia de coluna**
   (`app/core/encryption.py`) pronto para os campos sensíveis das próximas fases.
5. **API** `/api/govsocial/v1/...`, OpenAPI 3.1 gerado (`openapi.json`), erros no
   formato **RFC 9457 Problem Details** (`application/problem+json`).
6. **Validações BR reais** (dígito verificador): CPF, NIS/PIS, CEP —
   `app/core/br_validators.py` (algoritmo, não regex).

## Modelo de dados (FASE 1)

- `organizations` (tenant/município; guarda `settings`, `brasao_url`,
  `suporte_consentido`)
- `roles`, `users` (CPF único por tenant), `user_roles`, `refresh_tokens`
- `units` (CRAS, CREAS, CENTRO_POP, CENTRO_DIA, ACOLHIMENTO, SEDE, ENTIDADE_REDE)
- `professionals` (função NOB-RH, conselho de classe) + `professional_assignments`
  (lotações com histórico)
- Domínios: `service_types`, `access_forms`, `referral_codes`, `benefit_types`
- `audit_trail` (append-only)

## Perfis (RBAC)

`ADMIN`, `recepcao`, `tecnico_medio`, `tecnico_superior`,
`coordenador_unidade`, `gestor_municipal`, `vigilancia`, `conselho`,
`suporte_govassist`. Implementado como policies testáveis via `require_roles`.

## Endpoints da fase

- `POST /auth/login` (CPF **ou** e-mail + senha), `POST /auth/refresh`, `GET /auth/me`
- `GET /health`
- `units`: `GET`(todos) · `POST/PATCH`(gestor, coordenador, admin) · `DELETE`(gestor, admin)
- `professionals`: `GET/POST/PATCH`(coordenador, gestor, [vigilância só leitura], admin) ·
  `DELETE`(gestor, admin) · `GET /{id}` (leitura sensível → auditada) ·
  `assignments` (lotações)
- Domínios: `GET` (todos autenticados) · `POST/DELETE /{domain}` (gestor, vigilância, admin)
- `GET /audit` (gestor, vigilância, coordenador, admin)
- `POST /admin/seed-national` (admin, suporte com consentimento)

## Variáveis de ambiente

Ver `.env.example`. Substitua todos os `CHANGE_ME`. Em produção, `SECRET_KEY`,
`POSTGRES_PASSWORD` e `FIELD_ENCRYPTION_KEY` são obrigatórios.

## Como rodar

### Migrações
```bash
cd modulo-govsocial/api
alembic upgrade head        # cria tabelas + trigger append-only da audit_trail
```

### Seeds (tenant fictício "Nova Esperança")
```bash
python -m scripts.seed
```
Cria: tenant `nova-esperanca` (2 CRAS + 1 CREAS + SEDE), 1 usuário por perfil
(senha `govsocial123`), 1 profissional lotado no CRAS Centro e o seed nacional
dos 4 domínios. Usuários de exemplo: `gestor@nova-esperanca.gov.br`,
`coordenador@...`, `tecnico@...`, `recepcao@...`, etc.

### API
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
# docs: http://localhost:8000/docs   health: http://localhost:8000/api/govsocial/health
```

## Testes

```bash
cd modulo-govsocial/api
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"   # ou: pip install fastapi 'sqlalchemy[asyncio]' ... pytest pytest-asyncio aiosqlite asyncpg
pytest -q
ruff check .
```

Cobertura da fase (34 testes):
- **Validações BR**: DV real de CPF/NIS/CEP, mascaramento.
- **Isolamento de tenant** (vazamento deve falhar): listagem, GET direto,
  PATCH/DELETE cross-tenant → 404; domínios com seed por tenant disjuntos;
  usuário sem tenant rejeitado (fail-closed).
- **RBAC** (positivo e negativo): recepção não lê profissionais nem cria
  unidade; coordenador cria unidade; técnico médio não escreve domínio; gestor
  lê auditoria e recepção não; conselho sem acesso operacional.
- **Auditoria/LGPD**: evento em escrita; evento `READ_SENSIVEL` ao abrir
  profissional; `/audit` sem rotas de mutação (append-only); CPF mascarado em
  listagem; Problem Details em 404 e 422.

## Definition of Done (FASE 1) — status

- [x] Migração idempotente + trigger append-only na `audit_trail`
- [x] Isolamento de tenant por tenant_id em todas as rotas + testes (positivo/negativo)
- [x] Policies RBAC por papel + testes negativos
- [x] Auditoria de escrita e de leitura sensível + testes
- [x] OpenAPI 3.1 gerado (`openapi.json`); erros RFC 9457
- [x] Seeds (Nova Esperança + domínio nacional); textos pt-BR
- [x] README da fase

> Observação sobre RLS: o `plano.md` cita RLS como opção; nesta fase, por decisão
> do time, mantivemos o padrão de isolamento por aplicação já usado nos demais
> módulos GovSocial. A introdução de RLS no PostgreSQL pode ser adicionada numa
> fase de endurecimento (Fase 12) sem alterar o modelo de dados (tenant_id já está
> em todas as tabelas).

---

# FASE 2 — Famílias e pessoas

Cadastro-base unificado do município: famílias (unidade de trabalho) e pessoas
(membros), com busca unificada, deduplicação assistida e histórico de vínculos.

## Modelo de dados (FASE 2)

- `families`: `codigo` **sequencial por tenant**, `responsavel_id` (→ person),
  `nis_responsavel`, endereço estruturado + `latitude/longitude` +
  `geocode_status` (geocodificação assíncrona), `territorio` calculado,
  `faixa_renda`, flags `no_cadunico`, `cadunico_atualizado_em`,
  `beneficiaria_pbf`, `possui_bpc`, `inseguranca_alimentar`.
- `persons`: `nome_civil` + **`nome_social`** (precedência de exibição via
  `nome_exibicao`), `cpf`/`nis` **únicos por tenant**, `data_nascimento`, `sexo`,
  `escolaridade`, `ocupacao`, `tipo_deficiencia` + **`deficiencia_detalhe_enc`**
  (dado de saúde sensível **criptografado em repouso**), `documentos` (JSON),
  coluna `busca` desnormalizada (sem acento) para busca tolerante.
- `person_family_memberships`: vínculo pessoa↔família com **histórico**
  (`status` ATIVO/TRANSFERIDO/DESLIGADO, `data_entrada/saida`, `motivo_saida`) —
  a pessoa pode mudar de família mantendo o histórico.

## Funcionalidades

- **Busca unificada** (`GET /search?q=`): nome / nome social / CPF / NIS,
  tolerante a acento e caixa; retorna as famílias ativas de cada pessoa.
- **Detector de duplicata** na criação de pessoa: CPF/NIS iguais (bloqueio 409)
  ou nome+nascimento iguais (retorna candidatos e exige `confirmar_duplicata`).
- **Mesclagem assistida** (`POST /persons/merge`): move vínculos e
  responsabilidade da pessoa `drop` para a `keep`, completa campos faltantes e
  soft-deleta a `drop` — com **justificativa obrigatória e auditada** (MERGE).
- **Gestão de membros**: adicionar, **transferir entre famílias** mantendo
  histórico (`/members/{person_id}/move`), definir responsável, desligar.
- **Geocodificação assíncrona**: cadastro/edição de endereço marca
  `geocode_status=PENDENTE` e enfileira (stub `services/geocode.py`, isolado
  atrás de interface para o worker Celery das próximas fases).
- **LGPD**: CPF e NIS mascarados em listagens (`***.***.***-12`, `********123`);
  detalhe de deficiência criptografado; DTOs por tela; leitura de ficha
  (pessoa/família) gera evento `READ_SENSIVEL`.

## Endpoints da fase

- `search`: `GET /search?q=` (todos os perfis operacionais + vigilância)
- `persons`: `GET`(operacionais+vigilância) · `POST/PATCH`(recepção, técnico
  superior, coordenador, gestor, admin) · `GET /{id}` (leitura sensível auditada)
  · `DELETE` e `POST /merge` (coordenador, gestor, admin)
- `families`: `GET`(operacionais+vigilância) · `POST/PATCH`(recepção, técnico
  superior, coordenador, gestor, admin) · `DELETE`(coordenador, gestor, admin) ·
  `GET/POST /{id}/members`, `POST /{id}/members/{pid}/move`,
  `DELETE /{id}/members/{pid}`

> Recepção **cadastra** pessoas/famílias (dados cadastrais), conforme a matriz do
> plano. A leitura de evoluções/prontuário (restrita) entra na FASE 3.

## Migração e seeds

```bash
alembic upgrade head        # aplica 001 + 002
python -m scripts.seed      # + 2 famílias de exemplo (RF, membros, nome social)
```

## Definition of Done (FASE 2) — status

- [x] Migração 002 (`families`, `persons`, `person_family_memberships`) com
  índices compostos iniciando por `tenant_id`
- [x] Isolamento de tenant em todas as rotas novas + testes (lista, GET direto,
  busca por CPF de outro tenant) → 404/vazio
- [x] Policies RBAC por papel + testes negativos (recepção, técnico médio,
  conselho, vigilância)
- [x] Busca unificada tolerante a acento + testes (nome e CPF)
- [x] Deduplicação assistida + mesclagem auditada + testes
- [x] CPF/NIS mascarados; deficiência criptografada em repouso (teste verifica
  que o texto não está em claro no banco)
- [x] Auditoria de escrita e de leitura sensível (pessoa/família) + testes
- [x] OpenAPI 3.1 atualizado (27 rotas); erros RFC 9457
- [x] Seeds de famílias/pessoas realistas em Nova Esperança
- [x] 54 testes verdes; `ruff` limpo

### Notas técnicas
- `next_family_codigo` usa `MAX(codigo)+1` por tenant (inclui soft-deletadas para
  não reutilizar código). Em produção com alta concorrência, considerar sequência
  por tenant ou lock — anotado para a fase de endurecimento.
- A geocodificação é apenas enfileirada nesta fase (worker real na Fase 11).

---

# FASE 3 — Prontuário, atendimentos e acolhida

Prontuário eletrônico familiar **por unidade** (PAIF e PAEFI são prontuários
distintos), com acolhida, atendimentos, evolução técnica sigilosa, anexos,
linha do tempo, visão de rede e PDF no padrão do Prontuário SUAS físico.

## Modelo de dados (FASE 3)

- `case_files`: prontuário de uma família **por unidade e serviço**
  (`UNIQUE(tenant, family, unit, service_type_code)`), com acolhida (data, forma
  de acesso, motivo, profissional) e status.
- `attendances`: data/hora, unidade, serviço, `tipo`
  (INDIVIDUAL/FAMILIAR/GRUPO/VISITA_DOMICILIAR/ACAO_COLETIVA),
  **`evolution_text_enc`** (evolução técnica **criptografada em repouso**),
  `sigiloso_reforcado`, e quem registrou (profissional + user).
- `attendance_members` / `attendance_professionals`: N:N de membros atendidos e
  profissionais que realizaram o atendimento.
- `reception_log`: fila/triagem da recepção — **NÃO é atendimento** (regra do
  RMA), modelada em tabela separada; nunca alimenta contagens de atendimento.
- `case_file_attachments`: anexos com verificação de tipo/MIME/tamanho e
  versionamento por tipo de documento.

## Sigilo da evolução (LGPD / prontuário)

Regras implementadas em `app/services/scoping.py`:
- **Recepção** e **técnico de nível médio**: nunca leem evolução.
- **Técnicos superiores**: leem prontuários das **unidades onde estão lotados**
  (via `professionals.user_id` + `professional_assignments` ativas).
- **Sigilo reforçado**: restringe, dentro da unidade, a **quem registrou** + o
  **coordenador da unidade**.
- **Gestor/Vigilância**: veem o **texto** da evolução apenas se o tenant
  habilitar `settings.gestor_le_evolucao` (default `false`) — sempre auditado.
- **Visão de rede**: outras unidades veem QUE houve atendimento (unidade, data,
  serviço) **sem o conteúdo** da evolução.

Listagens e timeline **nunca** retornam o texto da evolução; ele só aparece no
`GET` de um atendimento e apenas quando a política concede (`evolution_restrita`
sinaliza quando o conteúdo foi omitido). Cada leitura concedida é auditada como
`READ_SENSIVEL`.

## Endpoints da fase

- `case-files`: `GET/POST`, `GET/PATCH /{id}`, `GET /family/{family_id}/network`
  (visão de rede), `GET /{id}/pdf` (Prontuário SUAS em PDF).
- `case-files/{id}/attendances`: `GET/POST`, `GET/PATCH/DELETE /{att_id}`,
  `GET /timeline`.
- `case-files/{id}/attachments`: `GET/POST`, `GET /{aid}/download`, `DELETE`.
- `reception`: `GET` (fila do dia por unidade), `POST`, `PATCH /{id}`.

Leitura de prontuário/atendimento exige **técnico superior, coordenador,
gestor, vigilância ou admin** (recepção não lê). Escrita de prontuário/
atendimento: técnico superior (lotado), coordenador ou admin. Recepção pode
operar a fila da recepção.

## Geração de PDF do prontuário

`app/services/prontuario_pdf.py` + template Jinja2
`app/templates/pdf/case_file.html`, renderizado com **weasyprint** (mesmo padrão
do `modulo-diario`). O import do weasyprint é tardio: em ambientes sem a lib de
sistema, o endpoint responde `503` amigável (o restante do módulo funciona). O
PDF respeita o sigilo — evoluções restritas não são impressas.

## Anexos e storage

`app/core/storage.py` (abstração local/MinIO, com `get()` para download) +
`app/services/attachments.py`, que **valida extensão, MIME e tamanho**
(config `ALLOWED_EXTENSIONS`, `ALLOWED_MIME_TYPES`, `MAX_UPLOAD_SIZE_BYTES`) e
versiona por tipo de documento.

## Migração e seeds

```bash
alembic upgrade head        # aplica 001 + 002 + 003
python -m scripts.seed      # + prontuário PAIF com 1 atendimento na 1ª família
```

## Definition of Done (FASE 3) — status

- [x] Migração 003 (`case_files`, `attendances`, `attendance_members`,
  `attendance_professionals`, `reception_log`, `case_file_attachments`) com
  índices compostos iniciando por `tenant_id`
- [x] PAIF/PAEFI distintos por unidade (unicidade família/unidade/serviço)
- [x] Evolução técnica criptografada em repouso (teste confirma não estar em
  claro no banco) e nunca em listagem/timeline
- [x] Sigilo por lotação + `sigiloso_reforcado` + `gestor_le_evolucao` por tenant
  — todos com testes positivos e negativos
- [x] Recepção separada do atendimento (teste garante que triagem não cria
  atendimento)
- [x] Visão de rede sem conteúdo + teste
- [x] Upload com validação de tipo/MIME/tamanho + download + teste (rejeita .exe)
- [x] Auditoria de escrita e de leitura sensível (prontuário, atendimento,
  anexo, PDF) + testes
- [x] PDF do prontuário (weasyprint + Jinja2) com degradação graciosa (503)
- [x] OpenAPI 3.1 atualizado (39 rotas); erros RFC 9457
- [x] Seeds de acolhida/atendimento em Nova Esperança
- [x] 72 testes verdes; `ruff` limpo

### Notas técnicas
- A suíte de testes roda em SQLite e não instala weasyprint; o endpoint de PDF é
  coberto pela lógica de contexto/sigilo, e a renderização final depende de libs
  de sistema (cairo/pango) no ambiente de produção/Docker.
- `evolution_text_enc` usa a mesma criptografia Fernet de coluna da FASE 2
  (`app/core/encryption.py`).
