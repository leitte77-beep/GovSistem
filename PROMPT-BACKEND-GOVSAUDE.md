# PROMPT — BACKEND DO MÓDULO GOVSAÚDE (Gestão da Saúde Pública Municipal)

> Destinatário: agente de IA de desenvolvimento que trabalha no monorepo `GovSistem`.
> Versão 1.0 — outubro/2026. Idioma de código: identificadores de domínio em português
> (como no GovSocial), termos técnicos em inglês quando forem convenção (`created_at`,
> `tenant_id`). Textos para o usuário: pt-BR.
>
> Leia este documento INTEIRO antes de escrever qualquer linha de código. Depois, trabalhe
> fase por fase (seção 12), sem pular fases e sem antecipar funcionalidades de fases futuras.

---

## 0. Papel, objetivo e regras invioláveis

Você vai construir a **API backend do módulo GovSaúde**, um SaaS multi-tenant para
**secretarias municipais de saúde, UBS/USF, centros de especialidades, policlínicas,
laboratórios municipais, farmácias municipais, vigilância sanitária e consórcios
intermunicipais de saúde**. O módulo entra na plataforma GovSistem ao lado do GovSocial,
GovPro, GovDoc, GovInfra, GovCompras e GovTask, e deve ser indistinguível deles em padrão
de código, autenticação, auditoria e operação.

O escopo funcional é o **Anexo B (Lote 02)**, requisitos **B.1 a B.9 e B.12**. Os requisitos
**B.10 (Aplicativo de Gestão)** e **B.11 (Aplicativo ACS)** serão desenvolvidos depois; neste
momento você só constrói **as APIs de backend que esses aplicativos vão consumir** (fase 15),
nunca o app.

### Regras invioláveis (quebrar qualquer uma = entrega rejeitada)

1. **Rastreabilidade total.** Toda funcionalidade existe porque um requisito `B.x-nnn`
   pede. Cada rota, serviço de regra de negócio e teste cita o(s) ID(s) atendido(s) em
   docstring (`"""B.6-019, B.6-033 — ..."""`) e o arquivo `docs/rastreabilidade.md`
   mantém a matriz `requisito → endpoints → testes → status`. **Não crie funcionalidade
   sem ID** (exceção: infraestrutura transversal da seção 5–9). Proibido: chat,
   gamificação, IA generativa, marketplace, telemedicina por vídeo, cobrança, CRM,
   qualquer coisa fora da lista da seção 13.
2. **Nunca invente layout, campo, código ou regra oficial.** Layouts do e-SUS APS/LEDI,
   SIAPS, RNDS (FHIR), BNAFAR, BPA/APAC/RAAS/AIH, SIGTAP, CNES, SISCAN e PNI são
   **dados versionados** carregados a partir dos **artefatos oficiais** (arquivos `.thrift`/
   XSD da LEDI, StructureDefinitions FHIR publicados pela RNDS, manuais de layout do
   DATASUS, tabelas SIGTAP). Se o artefato oficial não estiver em
   `app/integracoes/especificacoes/`, implemente a **porta (interface) + adaptador com
   status `PENDENTE_ESPECIFICACAO_OFICIAL`**, teste de contrato marcado `xfail`, e
   registre em `docs/pendencias-oficiais.md` o que falta e onde obter. Nunca preencha
   posições de campo, códigos de domínio ou URLs de endpoint "de memória".
3. **Nada de exclusão física de dado clínico, territorial, de estoque ou de faturamento.**
   Baixa lógica com motivo, data, responsável. Retificação gera **nova versão** e preserva
   a anterior com justificativa (B.6-057).
4. **Multi-tenant fail-closed** (seção 6): toda query filtra `tenant_id`; acesso cruzado
   retorna 404.
5. **Dado sensível de saúde** (LGPD art. 11): criptografia de coluna nos campos listados
   na seção 7, mascaramento em listagens, auditoria de leitura sensível, sigilo por nível.
6. **Parametrizar, não codificar.** Indicadores, classificações de risco, protocolos,
   esquemas vacinais, formulários, regras de carência/validade e consistências oficiais
   são **tabelas versionadas por vigência** com seed nacional copiado para o tenant
   (padrão do GovSocial). Código implementa o **motor**; dados definem a **regra**.
7. **Mesma stack, mesmas versões, mesmos padrões do GovSocial** (seção 2). Dependência
   nova só se a seção 2.3 permitir ou se for justificada em `docs/dependencias.md`.
8. **Testes junto com o código**: nenhuma fase termina sem testes positivos e
   **negativos** (isolamento de tenant, RBAC, sigilo, validação BR, regras oficiais).
9. **Decisão clínica é do profissional.** Alertas (alergia, interação, dose, intervalo
   vacinal, exame recente) **alertam**; bloqueios só onde o requisito diz "bloquear" e
   sempre com exceção justificada e auditada quando o requisito admitir (B.7-002, B.4-021).

---

## 1. Contexto de produto e posicionamento

### 1.1 Concorrência (o que o mercado oferece hoje)

Os fornecedores mais presentes em editais municipais são IDS (com PEP que já usa IA para
resumo de anamnese), Betha (Fly Saúde, nuvem, foco em regulação, agendamento e consórcios),
Celk, MV e A4PM (citadas em estudos técnicos preliminares de prefeituras), além de Oxy e
outros regionais. Em comum: cobrem os módulos clássicos (PEC, farmácia, vacinas, regulação,
faturamento), mas costumam ter UX legada, integrações oficiais opacas ("enviou ou não
enviou?"), indicadores entregues como relatório estático e baixa rastreabilidade de quem
viu dado sensível.

### 1.2 Como o GovSaúde fica à frente — sem sair do escopo

Os diferenciais vêm de fazer **os mesmos requisitos melhor**, não de inventar módulos:

| Diferencial | Requisitos que o materializam |
|---|---|
| **Central de Integrações transparente**: cada registro tem estado (`PENDENTE → VALIDADO → ENVIADO → ACEITO/REJEITADO`), protocolo, mensagem oficial traduzida, botão "corrigir e reenviar", alerta de prazo de competência | B.1-033/034/035, B.4-030/032, B.7-017…023, B.12-041/042/060/061 |
| **Indicadores acionáveis**: além de numerador/denominador, a **lista nominal** de quem falta para cumprir cada indicador, com memória de cálculo e simulação da competência aberta | B.1-036…040, B.12-017 |
| **Validação antes do envio** com as regras oficiais (sexo×procedimento, idade, CBO, CNES), apontando o campo exato e quem corrige | B.1-035, B.6-053, B.12-040…042 |
| **Sigilo visível e auditável**: níveis de sigilo, "quebra de sigilo" justificada, relatório "quem viu meu prontuário" para o encarregado (DPO) | B.6-006/035/056, B.8-025/032, B.12-048 |
| **Cadastro único confiável**: deduplicação fonética (BuscaBR), CPF como identificador principal (CNS como alternativo), unificação reversível | B.12-001…005, B.1-007 |
| **Tempo real** nas filas e painéis (SSE), medindo tempos de espera reais | B.6-008/045/047 |
| **Portabilidade total** e APIs abertas OpenAPI + FHIR | B.12-059/064/065 |

### 1.3 Contexto normativo que o sistema É OBRIGADO a suportar

Trate esta tabela como requisito. Onde houver "verificar vigência", a IA deve criar o
mecanismo configurável e registrar a pendência, nunca congelar a regra no código.

| Norma / sistema | O que impõe |
|---|---|
| Portaria GM/MS 3.493/2024 (cofinanciamento da APS) | Componentes **fixo, vínculo e acompanhamento territorial, qualidade**; indicadores de qualidade monitorados **mensalmente** (eSF/eAP: Mais acesso, desenvolvimento infantil, gestante e puérpera, diabetes, hipertensão, pessoa idosa, prevenção do câncer na mulher; eSB: 6 indicadores de saúde bucal; eMulti: 2). Fichas metodológicas mudam → motor de indicadores versionado |
| **SIAPS** (Portaria GM/MS 7.639/2025) | Substitui progressivamente o SISAB para financiamento; envio mensal até o 10º dia útil do mês seguinte; listas nominais por indicador |
| e-SUS APS / **LEDI APS** | Integração de sistemas próprios via LEDI (Thrift/XML). Desde 01/2026, dados enviados com versão de layout lançada há mais de 12 meses são invalidados → **layout versionado e atualizável sem deploy de regra** |
| Decreto 12.560/2025 | RNDS como plataforma de interoperabilidade do SUS; estabelecimentos enviam dados nos modelos publicados por portaria; acesso a dados restrito ao contexto assistencial |
| RNDS — modelos (HL7 FHIR) | **RIA** (imunobiológico administrado), **RAC** (atendimento clínico, Portaria SAES 234/2022), **REL** (resultado de exame laboratorial), **RIRA** (regulação), **REDFM** (dispensação/fornecimento de medicamentos), **REPM** (prescrição com assinatura qualificada, em piloto em 2026) |
| Portaria GM/MS 5.663/2024 | Integração de sistemas próprios de vacinação à RNDS |
| Portaria GM/MS 5.713/2024 (BNAFAR) | **REPE** (posição de estoque) e **RESMPE** (saídas por movimentação/perda) enviados **diariamente**, sem reenviar o já enviado; correções até o último dia do mês seguinte |
| CADSUS | **CPF passa a ser o identificador principal** do cidadão no SUS; CNS permanece para quem não tem CPF (estrangeiros, indígenas etc.); adequação dos sistemas até dez/2026 |
| Portaria SVS/MS 344/1998 e RDC de antimicrobianos | Receituários especiais, livros de registro, BMPO, balanços |
| SIGTAP / SIA / SIH / CNES | Procedimentos, compatibilidades (sexo, idade, CBO, CID, serviço/classificação), BPA-C, BPA-I, APAC, RAAS, AIH |
| SISCAN | Requisições e resultados de citopatológico/histopatológico de colo e mama e mamografia |
| LGPD (Lei 13.709/2018), Lei 14.129/2021, LAI | Base legal: execução de política pública e tutela da saúde (art. 7º III/VIII e art. 11 II "a"/"f"); minimização; relatório de impacto; dados abertos anonimizados |
| IN RFB 2.229/2024 | CNPJ alfanumérico (vigilância sanitária, prestadores, fornecedores) |

---

## 2. Stack obrigatória (idêntica ao GovSocial)

### 2.1 Backend
| Camada | Tecnologia |
|---|---|
| Linguagem | Python **3.12** |
| API | **FastAPI** ≥0.115 · Uvicorn |
| ORM | **SQLAlchemy 2 async** (asyncpg) · `Mapped[...]`/`mapped_column` |
| Migrações | **Alembic** (migrações numeradas `001_...`, idempotentes) |
| Validação | **Pydantic v2** + pydantic-settings (`SecretStr` para segredos) |
| Banco | **PostgreSQL 16** + extensões `pg_trgm`, `unaccent`, **`postgis`** (imagem `postgis/postgis:16-3.4`) |
| Cache / fila | **Redis 7** · **Celery** (workers para integrações, relatórios, importações) |
| Arquivos | **MinIO** (S3) — bucket `govsaude-files`, objetos privados, URLs pré-assinadas curtas |
| Auth | **PyJWT** (HS256, mesmo `SAAS_JWT_SECRET` da plataforma) · **bcrypt** |
| PDF | **WeasyPrint** + Jinja2 (mesmo `report_engine` do GovSocial) |
| Planilhas | openpyxl |
| HTTP externo | httpx (timeouts explícitos, retry com backoff, circuit breaker) |
| Testes | pytest · pytest-asyncio (loop de sessão) · aiosqlite para unitários · **PostgreSQL real (testcontainers ou serviço do compose) para testes de PostGIS, triggers e full-text** |
| Qualidade | ruff (E,F,I,N,W, line-length 100, py312) · coverage ≥ 80% em `services/` |

### 2.2 Onde o módulo vive
```
modulo-govsaude/
├── api/
│   ├── app/
│   │   ├── core/            # copiado/adaptado do GovSocial (config, database, auth, security,
│   │   │                    # problem_details, encryption, br_validators, storage, redis, seeds)
│   │   ├── middleware/      # RequestContext, SecurityHeaders, RateLimit (iguais ao GovSocial)
│   │   ├── models/<dominio>/        # um subpacote por domínio (ver seção 10)
│   │   ├── schemas/<dominio>/
│   │   ├── services/<dominio>/      # regra de negócio; rotas são finas
│   │   ├── api/v1/<dominio>/        # routers; router.py agrega
│   │   ├── integracoes/             # portas + adaptadores oficiais (seção 9)
│   │   │   └── especificacoes/      # artefatos oficiais versionados (thrift, xsd, fhir json, layouts)
│   │   ├── motores/                 # motor de indicadores, regras, formulários dinâmicos, aprazamento
│   │   ├── tasks/                   # tarefas Celery
│   │   ├── relatorios/templates/    # Jinja2 → PDF
│   │   └── main.py
│   ├── alembic/ · alembic.ini · entrypoint.sh · Dockerfile
│   ├── scripts/ (seed.py, importar_sigtap.py, importar_cnes.py, migracao_legado/)
│   ├── tests/<dominio>/
│   ├── pyproject.toml · requirements.txt · requirements-dev.txt · openapi.json
├── docs/ (rastreabilidade.md, pendencias-oficiais.md, dependencias.md, lgpd-ripd.md,
│          dicionario-dados.md, arquitetura.md, integracoes.md, runbook.md)
├── .env.example
└── README.md (por fase, como o GovSocial)
infra/docker-compose.govsaude.yml   # mesmo padrão de infra/docker-compose.govsocial.yml
```
- Prefixo da API: **`/api/govsaude/v1`**; health em **`/api/govsaude/health`**.
- Portas (livres no monorepo): API host **8210→8000**, web host **7601→80**. Confirme com
  `grep` nos compose antes de usar.
- Slug do módulo na plataforma SaaS: **`govsaude`** (cadastrar em `saas-platform` →
  tabela `modules`, e incluir `govsaude` em `normalize_grant_role`).

### 2.3 Dependências adicionais permitidas (somente estas, com justificativa no docs)
`geoalchemy2` (PostGIS), `fhir.resources` (modelos FHIR R4 para montar/validar bundles),
`thriftpy2` (serialização LEDI), `segno` (QR Code), `python-barcode` (etiquetas Code128),
`clamd` (antivírus via ClamAV, B.12-054), `lxml` (XML/XSD), `python-dateutil`,
`testcontainers[postgres]` (dev). Qualquer outra: pare e registre a necessidade.

---

## 3. Fundação reaproveitada da plataforma (não reinventar)

Copie e adapte do `modulo-govsocial/api/app/core` — mantenha nomes e comportamento:

1. **Autenticação SSO da plataforma**: `get_current_user` aceita token próprio e token
   `module_access` emitido por `saas-platform` (`POST /auth/module-access`), validando
   `module == "govsaude"`. Rotas internas `/internal/sync-organization` e
   `/internal/sync-user` protegidas por `X-Internal-Key` (`hmac.compare_digest`).
2. **Login local** (fallback): CPF, e-mail ou nome de acesso (B.12-052) + senha **bcrypt**
   custo ≥ 12 (B.12-051); política configurável por tenant: tamanho mínimo, complexidade,
   expiração, histórico, bloqueio após N tentativas, **MFA TOTP** (pyotp já usado na
   saas-platform — permitido), restrição de horário de acesso por usuário/grupo,
   encerramento por inatividade (B.12-049). Biometria **nunca** como único fator (B.12-053).
3. **Problem Details RFC 9457** em todos os erros (`application/problem+json`) com
   `type`, `title`, `status`, `detail`, `instance`, `request_id` e, para validação,
   `errors[]` com `campo`, `mensagem`, `codigo_regra`.
4. **Auditoria append-only** (`audit_trail` com trigger que bloqueia UPDATE/DELETE),
   particionada por mês (seção 8).
5. **Criptografia de coluna** (`app/core/encryption.py`, Fernet com chave
   `FIELD_ENCRYPTION_KEY`, suporte a rotação por `key_id`).
6. **Validadores BR com dígito verificador** (`br_validators.py`): CPF, **CNS**
   (15 dígitos; inicia em 1, 2, 7, 8 ou 9; soma dos dígitos × pesos 15..1 ≡ 0 mod 11),
   **CNPJ numérico e alfanumérico** (12 posições `[0-9A-Z]` + 2 DV numéricos; valor do
   caractere = ASCII−48; pesos 5,4,3,2,9,8,7,6,5,4,3,2 e 6,5,4,3,2,9,8,7,6,5,4,3,2),
   PIS/NIS, CEP (8 dígitos + consulta base), **CNES** (7 dígitos, sem DV — validar contra
   base CNES importada), **CBO** (6 dígitos, contra tabela), **código IBGE** de município
   (7 dígitos com DV), **código SIGTAP** (10 dígitos), **CID-10**, **CIAP-2**, competência
   `AAAAMM`. Testes com casos válidos, inválidos e sequências repetidas.
7. **Middlewares** RequestContext (X-Request-ID), SecurityHeaders, RateLimit.
8. **Storage MinIO** com chave de objeto opaca (`tenant/<uuid>/<ano>/<uuid>`), nunca nome
   original ou CPF no caminho.
9. **Assinatura**: reaproveitar o serviço `signer` da plataforma (ICP-Brasil A1/A3) via
   `services/assinatura.py` do GovSocial; suportar também assinatura eletrônica avançada
   (usuário autenticado + hash + carimbo de tempo) conforme política municipal
   (B.3-014, B.5-016, B.6-034, B.8-023, B.9-017).

---

## 4. Princípios de arquitetura

- **Monólito modular**: um processo de API, domínios separados por subpacote; um domínio
  só acessa outro pela **camada de serviço** (nunca importa modelo alheio para escrever).
- **Rotas finas, serviços gordos.** Toda regra fica em `services/` ou `motores/`, testável
  sem HTTP.
- **Outbox transacional** para integrações: a mesma transação que grava o registro
  clínico grava `integracao_envios` (estado `PENDENTE`). Workers Celery consomem.
  Nunca chamar sistema externo dentro da transação do usuário (B.12-061).
- **Idempotência**: `POST` de criação aceita header `Idempotency-Key` (UUID) e campo
  `id_cliente` (UUID v7 gerado no cliente, obrigatório nos endpoints de sincronização
  móvel e digitação em contingência). Repetição devolve o mesmo recurso (200).
- **Concorrência otimista**: coluna `versao` (int) em registros editáveis; `PATCH` exige
  `If-Match`; conflito → 409 Problem Details com a versão atual.
- **Datas**: armazenar `timestamptz` UTC; cada tenant tem `fuso_horario` (IANA, ex.
  `America/Sao_Paulo`, `America/Cuiaba`) usado para competência, turnos e relatórios.
  Competência = `AAAAMM` no fuso do tenant.
- **Dinheiro**: `NUMERIC(14,2)`, `Decimal` no Python; quantidades de estoque
  `NUMERIC(14,3)`.
- **IDs**: UUID internos; identificadores de negócio legíveis (`protocolo`,
  `numero_requisicao`) gerados por sequência por tenant/ano.
- **Paginação por cursor** em listas grandes; `limit` máx. 100; filtros explícitos
  documentados no OpenAPI.
- **Eventos de tempo real** (filas, painel de chamada, status de exames) via
  **Server-Sent Events** com Redis pub/sub, canal por `tenant:estabelecimento:setor`.
- **Tarefas longas** (relatórios grandes, exportações, importações SIGTAP/CNES, migração)
  são assíncronas: `POST` retorna `202` + `job_id`; `GET /jobs/{id}` dá progresso;
  resultado no MinIO com URL pré-assinada de 15 min.

---

## 5. Identidade, perfis e autorização (B.12-048…053, B.6-006, B.6-035)

### 5.1 Modelo
- `usuarios` (ligado ao usuário SaaS), `grupos` (perfis), `permissoes` (código
  `recurso:acao`, ex. `prontuario:ler`, `prontuario:ler_sigiloso`, `dispensacao:criar`,
  `estoque:ajustar`, `faturamento:exportar`), `grupo_permissoes`, `usuario_grupos` com
  **escopo**: `estabelecimento_id` (ou todos), `equipe_id`, `especialidade_id`, vigência.
- `menus` derivados de permissões (o frontend recebe a lista em `GET /auth/me`).
- Seed nacional de grupos: `ADMIN`, `gestor_municipal`, `coordenador_unidade`, `recepcao`,
  `medico`, `enfermeiro`, `tecnico_enfermagem`, `cirurgiao_dentista`, `asb_tsb`,
  `farmaceutico`, `auxiliar_farmacia`, `almoxarife`, `acs`, `ace`, `vacinador`,
  `laboratorio_tecnico`, `laboratorio_responsavel`, `regulador`, `faturista`,
  `multiprofissional` (psicologia, fisioterapia, nutrição, serviço social, fonoaudiologia),
  `fiscal_vigilancia_sanitaria`, `coordenador_vigilancia`, `encarregado_dados` (DPO,
  só auditoria), `consulta_gestao` (agregados), `suporte_plataforma` (só com consentimento
  do tenant, como no GovSocial).
- Grupos vindos do SaaS (`UserModuleGrant`) são normalizados para esses grupos.

### 5.2 Motor de autorização (`app/core/autorizacao.py`)
Decisão = permissão do grupo **∧** escopo (tenant, estabelecimento, equipe, especialidade)
**∧** nível de sigilo do registro. Implementar como dependência
`exigir(permissao, recurso_loader)` reutilizável e **testável**.

### 5.3 Sigilo clínico
Níveis por registro: `NORMAL` · `RESTRITO_ESPECIALIDADE` (só especialidades/unidades
autorizadas — B.6-035) · `SIGILOSO` (ex.: HIV/IST, saúde mental, violência, gestação em
adolescente, exames definidos pelo tenant — B.8-025) · `SIGILO_DENUNCIA` (vigilância
sanitária, B.9-009/027).
- Listagens retornam o registro **velado** (metadados mínimos: data, unidade, tipo) sem
  conteúdo.
- **Quebra de sigilo** ("acesso de emergência"): exige permissão `*:quebra_sigilo`,
  justificativa textual (mín. 20 caracteres), gera evento `QUEBRA_SIGILO` na auditoria e
  notificação ao gestor e ao encarregado.
- Recepção nunca lê conteúdo clínico; gestor vê agregados, não texto clínico, salvo
  permissão explícita.

### 5.4 Termo de uso (B.12-023)
`termos_uso` versionados; no primeiro acesso após nova versão, o usuário aceita ou recusa
(recusa bloqueia acesso). Guardar versão, data/hora, IP, user-agent.

---

## 6. Multi-tenancy, municípios e consórcios

- `tenant_id = organization_id` (padrão da plataforma), `NOT NULL` em toda tabela de
  negócio, índice composto iniciando por `tenant_id`, dependência `get_tenant_id`
  fail-closed, cross-tenant = 404. Tabelas nacionais (SIGTAP, CID, CIAP, CBO, CNAE,
  municípios IBGE, imunobiológicos PNI, medicamentos OBM/Rename) ficam em **schema
  `referencia`** sem `tenant_id`, somente leitura para o tenant, com tabelas de
  **customização por tenant** quando o requisito pedir (ex.: Remume, B.4-003).
- `organizacoes.tipo`: `MUNICIPIO` | `CONSORCIO` | `ESTADO_REGIONAL` | `ENTIDADE`.
- **Consórcio**: tabela `entes_consorciados` (município IBGE, CNPJ, situação, vigência).
  Cidadão tem `municipio_residencia_ibge`. Cotas, PPI, contratos e faturamento são
  apurados **por ente consorciado** (B.12-043/044). Profissional de consórcio só vê
  pacientes atendidos/encaminhados ao consórcio.
- **Compartilhamento entre tenants** (município ↔ consórcio) apenas por **acordo
  explícito** (`acordos_compartilhamento`: escopo de dados, finalidade, vigência,
  aprovado pelos dois gestores), implementado como API de regulação (fase 13), nunca
  por leitura direta do banco do outro tenant.
- `estabelecimentos` (CNES, tipo, setores, serviços/classificações, horários), um tenant
  tem N estabelecimentos; usuários têm lotação por estabelecimento.
- Configurações por tenant em `configuracoes_tenant` (JSON validado por schema
  Pydantic versionado): fuso, política de senha, uso de foto, GPS em visitas, campos
  obrigatórios, numeração de documentos, modelos de impressão, brasão.
- Deixe o modelo pronto para RLS (Row Level Security) futura: não use `tenant_id`
  derivado de join.

---

## 7. LGPD e segurança (transversal a TODAS as fases)

- **Classificação de dados** no dicionário (`docs/dicionario-dados.md`): cada coluna tem
  `classe` = `PUBLICO`, `PESSOAL`, `SENSIVEL_SAUDE`, `SIGILOSO`.
- **Criptografia de coluna** obrigatória: texto livre clínico (anamnese, evolução,
  observações, plano terapêutico), diagnósticos sigilosos, resultados sigilosos, denúncias
  e identidade do denunciante, notas profissionais sigilosas, foto do cidadão (no MinIO
  com SSE + objeto privado). CPF/CNS: guardar valor normalizado **e** `hash_hmac` para
  busca exata; mascarar em listagens (`***.***.***-12`).
- **Nunca** CPF, CNS, nome ou diagnóstico em URL, log de aplicação, mensagem de erro,
  nome de arquivo ou chave de cache.
- DTOs específicos por tela; proibido serializar o modelo ORM inteiro.
- **Auditoria** grava: todas as escritas (antes/depois — B.12-048), leitura de registro
  sensível (prontuário, resultado, prescrição de controlado), impressão, exportação,
  download, assinatura, quebra de sigilo, login/logout/falhas, mudança de permissão.
  Campos: tenant, usuário, grupo ativo, estabelecimento, IP, user-agent, request_id,
  ação, recurso, id do recurso, finalidade, diff (sensíveis no diff ficam como
  `"[ALTERADO]"`), timestamp.
- **Relatório de acesso do titular**: `GET /lgpd/titulares/{cidadao_id}/acessos` para o
  encarregado (quem acessou, quando, finalidade).
- **Atendimento a direitos do titular** (acesso, correção) com protocolo; "eliminação"
  de dado clínico não é aplicável por obrigação legal de guarda (prontuário: guarda de
  no mínimo 20 anos — tornar o prazo configurável e documentar a base legal).
- Retenção configurável por categoria (ex.: trajetos de GPS de visitas com retenção
  curta — B.1-029), com tarefa Celery de expurgo/anonimização auditada.
- Anexos: tipos permitidos por lista branca (JPEG, PNG, PDF + outros configurados),
  tamanho máximo por tenant, **varredura ClamAV** antes de disponibilizar (B.12-054),
  checagem de magic number (não confiar na extensão).
- Ambiente de homologação com **dados sintéticos** (gerador `scripts/dados_sinteticos.py`
  com CPF/CNS válidos fictícios) e rotina de **anonimização** de base (B.12-062).
- Segredos só por variável de ambiente; certificados da RNDS/ICP-Brasil em volume
  montado, nunca no repositório; senha do PFX em `SecretStr`.
- Gerar `docs/lgpd-ripd.md` (insumos para o Relatório de Impacto, que o município
  completa com seu encarregado).

---

## 8. Banco de dados

- Convenções: tabelas no plural em snake_case português; `TimestampMixin` (id UUID,
  created_at, updated_at), `SoftDeleteMixin` substituído por **baixa lógica de negócio**
  (`situacao`, `baixa_motivo`, `baixa_em`, `baixa_por`) onde o requisito fala em baixa;
  `criado_por`, `atualizado_por` em tudo.
- **Histórico** (B.1-005, B.1-011, B.1-012): tabelas de vínculo com vigência
  (`vigencia_inicio`, `vigencia_fim`), nunca sobrescrever — fechar e abrir novo vínculo.
- **Versionamento de registros clínicos**: `atendimentos` + `atendimento_versoes`
  (conteúdo anterior criptografado, justificativa, autor).
- Particionamento mensal: `audit_trail`, `integracao_envios`, `movimentacoes_estoque`,
  `eventos_fila`, `sinais_vitais`.
- Índices: `tenant_id` primeiro; GIN `pg_trgm` em `nome_busca` (nome sem acento,
  minúsculo); coluna `nome_fonetico` (algoritmo **BuscaBR** implementado em
  `app/core/fonetica.py`, com testes de variações: Luiz/Luis, Thais/Taís, Sousa/Souza,
  Ellen/Helen) — B.12-005.
- PostGIS: `geometry(MultiPolygon, 4326)` para áreas/microáreas, `geometry(Point, 4326)`
  para domicílios e pontos de visita (B.1-028).
- Transações ACID, FKs reais, `CHECK` para domínios fechados, `UNIQUE` parcial por tenant
  (ex.: CPF ativo único por tenant) — B.12-056.
- Toda migração com `downgrade` e testada em PostgreSQL real no CI.

---

## 9. Integrações oficiais (camada `app/integracoes/`)

### 9.1 Padrão obrigatório (B.12-059/060/061)
Para cada sistema: `porta.py` (Protocol com métodos de domínio), `adaptador_<versao>.py`,
`mapeador.py` (domínio → payload oficial), `validador.py` (regras pré-envio),
`especificacoes/<sistema>/<versao>/` (artefatos oficiais), registro em
`integracao_sistemas` com versão ativa por tenant e data de vigência.

Tabela `integracao_envios`: `tenant_id`, `sistema`, `tipo_registro`, `registro_id`,
`versao_registro`, `operacao` (`INCLUSAO|ALTERACAO|EXCLUSAO`), `estado`
(`PENDENTE|INVALIDO|VALIDADO|ENVIANDO|ENVIADO|ACEITO|REJEITADO|ERRO_TRANSITORIO|CANCELADO`),
`tentativas`, `proxima_tentativa_em`, `protocolo`, `lote_id`, `payload_hash`,
`payload_ref` (MinIO, criptografado), `mensagens[]` (código oficial, texto oficial,
**texto amigável**, campo, sugestão de correção), `competencia`, timestamps.

Regras:
- Alteração de registro já enviado gera novo envio `ALTERACAO` e preserva o anterior
  (B.7-018, B.1-034).
- Retry exponencial só para erro transitório (timeout, 5xx); rejeição de negócio vai para
  fila de correção, nunca retry cego.
- **Monitoramento**: métricas por sistema (pendentes, rejeitados, idade do mais antigo),
  alerta quando prazo de competência se aproxima com pendências (B.7-023, B.12-061) —
  publicar em `notificacoes` e endpoint `/integracoes/painel`.
- Transmissão automática por agendamento configurável por tenant (Celery beat), além de
  envio manual (B.7-022).
- Exportação/impressão de inconsistências por cidadão, unidade, profissional, motivo
  (B.7-021, B.12-041).

### 9.2 Sistemas
| Sistema | Uso | Observação para a IA |
|---|---|---|
| **LEDI APS → e-SUS APS/SIAPS** | Fichas CDS (cadastro individual, domiciliar/territorial, atendimento individual, odontológico, procedimentos, vacinação, visita domiciliar, atividade coletiva, marcadores de consumo alimentar, atendimento domiciliar, avaliação de elegibilidade), envio por lote para o PEC/centralizador do município | Serialização Thrift com `.thrift` oficial da versão vigente; validar com as regras da LEDI; registrar versão do layout por envio; suportar **múltiplas versões em paralelo** durante transição (B.1-033…035, B.3-002/027, B.5-015) |
| **RNDS (FHIR R4)** | RIA (vacinas), RAC (atendimento), REL (exames), RIRA (regulação), REDFM (dispensação), REPM (prescrição — piloto) | Autenticação por **certificado digital ICP-Brasil do estabelecimento/ente** (mTLS) + token de acesso; montar `Bundle` com perfis publicados pela RNDS; validar contra StructureDefinitions locais antes de enviar; ambiente de **homologação** obrigatório antes de produção (B.7-014…020, B.4-034, B.8-031, B.12-060) |
| **BNAFAR** | REPE (posição de estoque, diário), RESMPE (saídas/perdas, diário), REDFM via RNDS, demais modelos quando publicados | Envio diário incremental (não reenviar o já enviado); correções até o fim do mês seguinte; não depender de web service legado se houver sucessor (B.4-030…033, B.12-030) |
| **CADSUS** | Consulta/validação de cidadão por **CPF (principal) ou CNS** | Somente via interface oficial com credencial do tenant; nunca scraping (B.12-004/010) |
| **CNES** | Estabelecimentos, profissionais, equipes, INE, vínculos, CBO | Importação de arquivo oficial e/ou serviço oficial; relatório de inconsistências (B.12-031, B.1-010) |
| **SIGTAP** | Procedimentos, compatibilidades, valores, competência | Importação automática da competência publicada + upload manual controlado; manter histórico por competência (B.12-028) |
| **SIA/SIH/RAAS** | BPA-C, BPA-I, APAC, RAAS, AIH | Geração de arquivo no layout oficial vigente para importação nos sistemas do DATASUS; validação de consistência antes (B.6-052…054, B.12-026/029) |
| **SISCAN** | Requisições/resultados colo e mama | Modelos de formulário versionados; exportação conforme meio oficial vigente (B.5-018) |
| **Banco de Preços em Saúde** | Dados de compras | Geração no layout vigente (B.4-041) |
| **SIOPS** | Apoio operacional apenas | Gerar dados de apoio; obrigação fiscal fica no sistema contábil do Lote 01 (B.12-032) |
| **Lote 01 (contábil/tributário/compras/protocolo)** | Empenhos, contratos, notas, taxas, arrecadação, protocolo digital | Integrar por API com o GovCompras/GovPro/contábil da plataforma, **sem trafegar dado clínico** (B.4-010/029, B.9-024/025) |
| **Equipamentos de laboratório** | Interfaceamento | Porta genérica com adaptadores por protocolo (ASTM/HL7 v2 quando o equipamento usar), log de mensagens, reprocessamento (B.8-008/009) |
| **Geoprocessamento municipal** | Cadastro territorial | API documentada de importação/consulta (B.1-042) |

---

## 10. Domínios e modelo de dados (visão)

Abaixo, entidades mínimas por domínio. Campos detalhados devem seguir os modelos de
informação oficiais vigentes (fichas e-SUS APS, RNDS) — quando um campo existir na ficha
oficial, use o mesmo significado e domínio de valores (tabela de referência), nunca um
texto livre.

1. **nucleo**: organizacoes, entes_consorciados, estabelecimentos, setores, servicos_
   classificacoes, equipes (INE, tipo eSF/eAP/eSB/eMulti/outras), profissionais, vinculos
   (CBO, carga horária, vigência), lotacoes_equipe, horarios/escalas/plantoes (B.12-012),
   usuarios, grupos, permissoes, termos_uso, configuracoes_tenant, formularios_dinamicos
   (definição JSON Schema versionada + respostas — B.12-013, B.2-004, B.3-005, B.6-025),
   anexos, notificacoes (internas, com leitura/validade — base para B.10-022/023),
   mensagens_internas (B.12-058), notas_profissionais (B.12-021/022), ocorrencias_unidade
   (B.6-042), audit_trail, jobs.
2. **cidadao**: cidadaos (CPF, CNS, nome civil, **nome social com precedência de exibição**
   — B.12-009, filiação, nascimento, sexo, identidade de gênero/orientação quando ficha
   oficial prever, raça/cor, etnia, nacionalidade, ocupação CBO, escolaridade, situação de
   rua, contatos, documentos, endereço), cidadao_fotos (B.1-002, B.12-011),
   planos_saude_vinculos (B.1-008), alergias (B.6-015), condicoes/problemas (B.6-016),
   unificacoes (origem, destino, campos escolhidos, justificativa, reversível —
   B.1-007, B.12-001…003), recem_nascido a partir da mãe (B.1-009), baixas (B.1-001).
3. **territorio**: logradouros, bairros, distritos, referencias (B.1-003), areas,
   microareas (geometria), domicilios/imoveis (ficha domiciliar oficial, animais
   configuráveis — B.1-013/015), familias (responsável, renda, membros com vigência —
   B.1-014), vinculos_territoriais (cidadão × família × domicílio × microárea × equipe ×
   profissional de referência — B.1-005), transferencias (B.1-012), visitas (ficha oficial,
   turno, GPS opcional com precisão e justificativa, assinatura — B.1-019…023),
   metas_acs (B.1-026), estratificacoes_risco (instrumentos configuráveis, ex.
   Coelho-Savassi — B.1-025).
4. **agenda_recepcao**: agendas (profissional, estabelecimento, especialidade, tipo,
   vagas, bloqueios), agendamentos (situação, falta automática configurável com reversão
   auditada — B.12-018), fila_atendimento (entrada, prioridade legal, classificação de
   risco, setor, chamada, evasão), protocolos_classificacao_risco (níveis, cores, tempos —
   B.6-007, B.3-003), paineis_chamada (setores, mensagens/notícias, histórico, nome
   abreviado — B.6-045/046).
5. **clinico (PEC)**: atendimentos (tipo, etapas configuráveis — B.6-004: recepção,
   acolhimento, triagem, enfermagem, consulta…; SOAP: subjetivo/anamnese, objetivo/exame
   físico, avaliação/problemas CID-10/CIAP-2/CIPE, plano/conduta), sinais_vitais
   (B.6-011/012), antropometria com IMC e classificação por ciclo de vida (B.6-010),
   prescricoes (itens, via, posologia, uso contínuo, tipo de receituário
   comum/antimicrobiano/controlado — B.6-019/033), solicitacoes_exame (B.6-018),
   encaminhamentos (interno sem voltar à recepção — B.6-013; externo com referência/
   contrarreferência), documentos_clinicos (receita, atestado, declaração, orientação,
   requisição — modelos por profissional/unidade — B.6-032/034), planos_cuidado (B.6-017),
   protocolos_estruturados (ex. dor torácica — B.6-009), notificacoes_compulsorias
   (B.6-023), atencao_domiciliar (B.6-037), atividades_coletivas (B.6-038),
   atencao_psicossocial/RAAS (B.6-024/039), observacao/internacao_municipal (B.6-028),
   validade_consulta/reconsulta (B.6-041), producao_programada (B.6-043),
   beneficios_custeados (B.6-044).
6. **programas**: programas/linhas_cuidado (protocolos, periodicidades, itens previstos),
   inscricoes (situação, motivo de saída, responsável), programacoes (consultas, exames,
   fornecimentos previstos × realizados), modelos específicos: saúde da mulher (colo/mama,
   planejamento reprodutivo, climatério), saúde da criança (crescimento, desenvolvimento,
   alimentação, situação vacinal) — B.2-001…015.
7. **odontologia**: dentes (decídua/permanente, FDI), faces, condicoes/procedimentos
   odontológicos com cor e aplicabilidade (B.3-001), odontograma por versão (estado
   atual + histórico + planejado — B.3-006/024), triagem e risco (B.3-003/004), atendimento
   odontológico (B.3-009/010), procedimentos programados (B.3-011/022).
8. **imunizacao**: imunobiologicos, esquemas/doses/regras (faixa etária, sexo,
   intervalos, estratégias — tabela PNI versionada — B.7-001/011), lotes, frascos (abertura,
   validade após abertura, doses, descarte, perdas — B.7-003…005), agendamentos vacinais
   (B.7-006/007), aplicacoes (nominal, campos oficiais, origem `LOCAL|EXTERNA` —
   B.7-008/009), aprazamentos.
9. **farmacia_estoque**: produtos (medicamento/vacina/insumo/material, princípio ativo,
   apresentação, CATMAT, OBM, Rename/Remume — B.4-003), locais_estoque, lotes,
   saldos por local×lote, parametros_estoque (mín/máx/ideal/ponto de pedido/consumo
   médio — B.4-004), movimentacoes (entrada, saída, transferência, ajuste, perda,
   devolução, doação, consumo interno — **ledger imutável**; saldo = soma do ledger com
   snapshot diário), documentos (NF, pedido, empenho, contrato), requisicoes entre locais
   (atendimento parcial, aceite/recusa — B.4-014/015), inventarios (B.4-017), competencias
   (abertura/encerramento — B.4-018), kits (B.4-008), dispensacoes (total/parcial, lote,
   documento — B.4-020), livros e balanços Portaria 344 (B.4-024/025), registros de
   temperatura (B.4-037), custos (médio/última aquisição — B.4-006), centros de custo.
10. **laboratorio**: exames (método, material, bancada, campos de resultado estruturados,
    referências por sexo/idade, valores críticos, layout de laudo, versão — B.8-001/003),
    requisicoes (origem prontuário/agenda, urgência, gestação — B.8-010/011), amostras
    (etiqueta Code128, coleta, problemas — B.8-002/012/013), mapas_trabalho (B.8-015),
    resultados (estruturado, texto, imagem, anexo — B.8-017/018), laudos (liberação por
    profissional habilitado, assinatura, entrega e quem recebeu — B.8-007/022/023),
    etapas com timeline (B.8-016/029).
11. **siscan**: requisicoes (cito colo, histo colo, mamografia, cito mama, histo mama),
    resultados correspondentes com classificações vigentes, situação e seguimento
    (B.5-001…013).
12. **regulacao**: listas_espera (consulta/exame, prioridade, classificação, posição,
    contatos, auditoria — B.6-050, B.12-019/020), prestadores, contratos/aditivos
    (vigência, valores, quantidades, cotas, fontes, impostos — B.12-033/034), cotas/PPI
    (B.12-043), autorizacoes (carência, validade, alto custo, limites adicionais com
    justificativa — B.8-005, B.12-014/047), tabelas de valores por convênio/prestador
    (B.12-045/046).
13. **faturamento**: competencias, producao (vinculada aos atos clínicos — sem
    redigitação), consistencias (regras SIGTAP versionadas — B.6-053, B.12-040),
    lotes de exportação BPA/APAC/RAAS/AIH (B.12-026/029), retornos/importação de produção
    de prestadores (B.12-027), faturas e pagamentos parciais (B.12-038), distribuição de
    custos por unidade de origem (B.12-044), planejamento de exercícios futuros sem gerar
    obrigação orçamentária (B.12-036).
14. **vigilancia_sanitaria**: estabelecimentos regulados (CNPJ alfanumérico, CNAE,
    responsável técnico, contador, situação — B.9-001…003), licencas (tipos, modelos,
    validade — B.9-004/012), veiculos (B.9-011), habite_se (B.9-010), inspecoes/autos/
    notificacoes/multas/interdicoes (B.9-005), programacao_fiscal (B.9-006/008),
    denuncias (identidade protegida — B.9-009/027), analises_agua e analises_alimentos
    (B.9-013…018), abates (B.9-019), acidentes_animais (B.9-020), tarefas ambientais/
    vetoriais (B.9-021).
15. **indicadores**: definicoes_indicador (código, nome, equipe-alvo, ficha metodológica
    de referência, versão, vigência), regras_calculo (numerador/denominador/parâmetro/meta
    expressos em **DSL declarativa validada** ou SQL parametrizado aprovado — nunca código
    Python arbitrário salvo pelo usuário), apuracoes (competência, escopo, valores,
    **memória de cálculo**, versão da regra usada, `preliminar=true|false`), listas_nominais
    (B.1-036…040, B.12-017).
16. **relatorios**: catálogo de relatórios com parâmetros, permissões e formatos (PDF,
    CSV, XLSX, XML, ODS opcional — B.12-055, B.1-041); dashboards agregados.

---

## 11. Padrões de API

- REST, recursos no plural em português (`/cidadaos`, `/domicilios`, `/atendimentos`).
- OpenAPI 3.1 gerado e versionado (`openapi.json`), com exemplos e descrição de cada
  campo; **teste de contrato** que falha se o OpenAPI mudar sem atualizar o arquivo
  (como `test_openapi_contrato.py` do GovSocial).
- Ações de negócio como sub-recursos com verbo explícito:
  `POST /atendimentos/{id}/finalizar`, `POST /dispensacoes/{id}/estornar`,
  `POST /laudos/{id}/liberar`, `POST /frascos/{id}/abrir`.
- Endpoints de busca: `GET /cidadaos/busca?q=` (nome fonético + trigram, CPF/CNS exatos
  via hash), retorno com score e motivo do match.
- Respostas de lista: `{ itens: [], proximo_cursor, total_estimado }`.
- Exportações e relatórios: `POST /relatorios/{codigo}/execucoes` → 202 + job.
- SSE: `GET /tempo-real/filas?estabelecimento_id=&setor_id=`.
- **FHIR**: além do envio à RNDS, expor `GET /fhir/R4/Patient/{id}` e
  `.../Immunization`, `.../Observation` somente para integrações autorizadas (escopo de
  cliente OAuth client-credentials por tenant) — B.12-059.
- Versão do sistema: `GET /sistema/versao` (versão, data, notas de release em markdown —
  B.12-057).

---

## 12. Plano de desenvolvimento por fases

Cada fase termina com: migração, seeds, endpoints, testes (positivos + negativos de
tenant/RBAC/sigilo), OpenAPI atualizado, README da fase, matriz de rastreabilidade
atualizada, `ruff` e `pytest` verdes. **Não comece a fase N+1 com a fase N vermelha.**

### Fase 0 — Esqueleto e fundação (sem regra de negócio)
- Criar `modulo-govsaude/api` copiando o núcleo do GovSocial (seção 3) e
  `infra/docker-compose.govsaude.yml` (api, worker Celery, beat, PostgreSQL+PostGIS
  se o compose do módulo tiver banco próprio, clamav).
- Registrar módulo `govsaude` na saas-platform; rotas internas de sync.
- Auth, RBAC com escopo (seção 5), auditoria particionada, Problem Details, criptografia,
  validadores BR (com CNS, CNES, IBGE, SIGTAP, CNPJ alfanumérico), fonética BuscaBR,
  `jobs`, outbox `integracao_envios`, SSE base, `/sistema/versao`.
- Schema `referencia` e scripts de importação: municípios IBGE, CBO, CID-10, CIAP-2,
  CNAE, SIGTAP (competência mais recente disponível), tabela de imunobiológicos — **a
  partir de arquivos oficiais colocados em `scripts/dados_oficiais/`**; se ausentes,
  seeds mínimos de teste claramente marcados `FICTICIO` e pendência registrada.
- Testes: isolamento tenant, RBAC com escopo de estabelecimento, sigilo velado,
  auditoria append-only, validadores (≥ 60 casos), idempotência, If-Match.
- Requisitos: B.12-048…053, B.12-056/057, B.12-023, B.12-054 (infra).

### Fase 1 — Rede de atenção e cadastros-base
- Estabelecimentos, setores, serviços, equipes, profissionais, vínculos, CBO, horários,
  escalas, plantões, restrições de acesso por horário; importação CNES com relatório de
  inconsistências; procedimentos autorizados por estabelecimento/profissional/especialidade;
  prioridades legal e clínica configuráveis; consórcio e entes consorciados.
- Requisitos: B.1-010, B.1-011, B.12-006, B.12-007, B.12-012, B.12-016, B.12-031.

### Fase 2 — Cidadão (cadastro único)
- CRUD com baixa lógica, foto (política do tenant), documentos, contatos, nome social,
  planos/vínculos assistenciais, alergias, condições; recém-nascido a partir da mãe;
  busca fonética; detecção de duplicidade (pontuação configurável por nome, nascimento,
  mãe, CPF, CNS) com **decisão humana**; unificação com preservação de histórico e
  reversão; consulta CADSUS (porta + adaptador); compatibilização CPF/CNS; atualização
  de CEP/municípios/países por base oficial.
- Requisitos: B.1-001, B.1-002, B.1-004, B.1-006, B.1-007, B.1-008, B.1-009, B.12-001…005,
  B.12-008, B.12-009, B.12-010, B.12-011.

### Fase 3 — Território e Saúde da Família
- Logradouros/bairros/distritos/CEP/IBGE; áreas e microáreas com geometria; domicílios,
  famílias e vínculos com histórico; transferências; animais configuráveis; visitas
  (regras "uma visita por cidadão/turno/competência" **configuráveis** com alerta);
  GPS configurável (obrigatório/recomendado, precisão mínima, justificativa); assinatura;
  pesquisa de domicílio por endereço/responsável/integrante/família histórica;
  extrato territorial; domicílios não visitados e cobertura; metas de ACS/equipe × produção;
  estratificação de risco familiar/individual configurável; mapas (GeoJSON minimizado,
  sem dados pessoais nos pontos para perfis sem permissão); trajetos só para autorizados,
  com período e justificativa e retenção limitada; dashboards territoriais; API de
  integração com geoprocessamento municipal.
- Requisitos: B.1-003, B.1-005, B.1-012…030, B.1-042, B.12-024 (extrato família).

### Fase 4 — Agenda, recepção, fila e painel
- Agendas, agendamentos (alerta/bloqueio de cancelado/vencido/incompatível), falta
  automática com reversão auditada, recepção por agendamento, demanda espontânea,
  leitura de código de barras/QR do cartão/comprovante, biometria opcional com
  alternativa obrigatória; fila ordenada por classificação, prioridade legal e tempo,
  **com a regra de ordenação exposta na resposta** (B.6-008); protocolos de classificação
  de risco por unidade; painéis eletrônicos (SSE), chamada com texto para síntese de voz,
  nome abreviado; tempos de recepção/triagem/consulta/espera.
- Requisitos: B.6-001…003, B.6-005, B.6-007, B.6-008, B.6-012, B.6-045…047, B.3-008,
  B.12-018.

### Fase 5 — Prontuário eletrônico (PEC) ambulatorial
- Etapas configuráveis; acolhimento e triagem; SOAP; sinais vitais com série histórica;
  IMC e classificação nutricional por ciclo de vida (tabelas de referência versionadas);
  campos obrigatórios configuráveis por unidade/idade/sexo/especialidade/tipo;
  problemas CID/CIAP/CIPE; alergias com alerta; plano de cuidados; prescrição com
  disponibilidade em estoque, separação de receituários, alertas (alergia, duplicidade,
  interação e medicamento potencialmente perigoso **somente se houver base validada
  importada** — sem base, o alerta não é exibido e isso fica documentado), cópia
  assistida de prescrição; solicitação de exames com regras de autorização/carência/
  contrato/validade; encaminhamento interno e referência/contrarreferência; documentos
  clínicos com modelos e assinatura; anexos; linha do tempo; sigilo; retificação com
  versão; digitação retroativa em contingência (flag, autorização, período, auditoria);
  observação/internação municipal; notificação compulsória; marcadores de consumo
  alimentar e demais fichas e-SUS; atenção domiciliar; atividades coletivas; práticas
  integrativas; atenção psicossocial; escalas multiprofissionais por formulário dinâmico;
  comorbidades e linhas de cuidado; validade de consulta/reconsulta; ocorrências diárias;
  programação de produção × realizado; benefícios/procedimentos custeados.
- Requisitos: B.6-004, B.6-006, B.6-009…044, B.6-048, B.6-049, B.6-055…058, B.12-013,
  B.12-021, B.12-022, B.12-024, B.12-025.

### Fase 6 — Ações programáticas e linhas de cuidado
- Requisitos: B.2-001…015 (motor genérico de programas parametrizáveis; modelos
  pré-configurados de saúde da mulher, criança, hipertensão, diabetes, gestante como
  **seed**, não código; busca ativa; estimativa de demanda futura).

### Fase 7 — Odontologia
- Requisitos: B.3-001…027 (odontograma versionado; anamnese configurável; documentos;
  digitação retroativa; relatórios por dente/face; integração com estoque/farmácia;
  exportação LEDI de atendimento odontológico).

### Fase 8 — Estoque, almoxarifado e assistência farmacêutica
- Ledger imutável, saldo em qualquer data, custo médio, lotes, bloqueios, requisições,
  transferências com aceite/recusa, inventário, competências, kits, etiquetas,
  sugestão de compra com memória de cálculo, alertas (mínimo, vencimento, frascos
  abertos, lote bloqueado, consumo anormal por desvio estatístico), dispensação
  total/parcial com alerta de duplicidade em qualquer unidade, controlados e
  antimicrobianos (dados obrigatórios, livros, BMPO, balanços), temperatura, curva ABC,
  giro, cobertura, conciliação físico × sistema × contabilidade, integração com
  compras/empenhos/contabilidade sem dado clínico, APIs para leitores/equipamentos,
  contingência com reconciliação.
- Requisitos: B.4-001…029, B.4-035…040, B.4-043, B.6-019 (disponibilidade), B.2-010.

### Fase 9 — Imunização
- Requisitos: B.7-001…013, B.7-024…029 (regras PNI versionadas; frascos; aprazamento;
  carteira e certificado de vacinação em PDF com QR de verificação; baixa automática de
  estoque; busca ativa).

### Fase 10 — Laboratório e SISCAN
- Requisitos: B.8-001…030, B.8-032…034, B.5-001…014, B.5-016, B.5-017, B.5-018.

### Fase 11 — Central de Integrações (LEDI/SIAPS, RNDS, BNAFAR)
- Implementar adaptadores reais para os artefatos oficiais disponíveis; painel; fila de
  correção; transmissão automática; homologação RNDS; envio diário BNAFAR; múltiplas
  exportações por competência; protocolos e retornos.
- Requisitos: B.1-033…035, B.3-002, B.3-027, B.4-030…034, B.5-015, B.7-013…023, B.8-031,
  B.12-030, B.12-059…061.

### Fase 12 — Indicadores da APS e cofinanciamento
- Motor de indicadores versionado; seed das fichas de qualidade vigentes (eSF/eAP, eSB,
  eMulti) **com regras marcadas `A_VALIDAR` até conferência com a ficha oficial**;
  apuração mensal e simulação da competência aberta (`preliminar`); memória de cálculo;
  listas nominais acionáveis; componente vínculo e acompanhamento territorial; histórico
  de versões de regra por apuração; relatórios em formato aberto.
- Requisitos: B.1-036…041, B.12-017, B.2-013.

### Fase 13 — Regulação, contratos e faturamento
- Listas de espera (inclusão automática por regra com revisão), regulação com
  prestadores, cotas, PPI (por ente consorciado), autorizações, contratos/aditivos,
  saldos anuais/mensais, alertas de vencimento/saldo/inadimplência, apuração por
  prestador/unidade/profissional/especialidade/convênio/procedimento, faturas e
  pagamentos parciais, consistências SIGTAP, correção antes de exportar, reprocessamento,
  exportação BPA-C/BPA-I (seleção de unidades/registros), APAC, RAAS, AIH, importação de
  retornos de prestadores, SIGTAP automático/manual, distribuição de custos,
  planejamento de exercícios futuros, apoio SIOPS e Banco de Preços.
- Requisitos: B.6-050…054, B.12-014, B.12-015, B.12-019, B.12-020, B.12-026…029,
  B.12-032…047, B.4-041, B.5-014, B.8-027.

### Fase 14 — Vigilância sanitária e ambiental
- Requisitos: B.9-001…028 (a aplicação móvel de vistoria B.9-026 fica para a fase de apps;
  aqui só a API offline-ready descrita na fase 15).

### Fase 15 — APIs para os aplicativos (sem construir app)
- `POST /sync/pull` (pacote minimizado por microárea autorizada do ACS, com versão e
  validade — B.11-003/007), `POST /sync/push` (lote idempotente por `id_cliente`, retorna
  aceitos/rejeitados/conflitos — B.11-012, B.1-031/032), fila de revisão de conflitos no
  web, registro e revogação de dispositivos (bloqueio remoto, invalidação de credenciais —
  B.11-020, B.10-029), endpoints agregados para o app de gestão (somente agregados,
  B.10-008…021), push notification via provedor configurável (B.10-022). Nenhuma tela de
  app.

### Fase 16 — Migração, portabilidade e endurecimento
- Ferramenta de migração do sistema anterior: estágio (`staging_legado`), mapeamento
  configurável, validação, relatório de rejeições, carga idempotente, conferência de
  totais (B.4-042, B.6-059, B.8-033, B.12-063).
- Exportação total do tenant em formato aberto e estruturado (JSON Lines + CSV +
  dicionário + anexos — B.12-065); documentação final: dicionário de dados, OpenAPI,
  arquitetura, inventário de integrações e credenciais sob controle municipal (B.12-064);
  ambiente de homologação com dados sintéticos/anonimizados (B.12-062).
- Testes de carga (Locust ou k6 fora do repositório de produção): recepção e fila com
  200 usuários simultâneos por tenant, p95 < 300 ms nas leituras e < 800 ms nas
  gravações clínicas; RLS opcional; revisão de segurança (OWASP ASVS nível 2).

---

## 13. Fora de escopo (não implemente)

Aplicativos móveis (B.10/B.11 — só as APIs da fase 15); app de vistoria (B.9-026 — só API);
portal do cidadão completo (apenas consulta de laudo autorizada do B.8-024, com código de
acesso + data de nascimento + limite de tentativas, na fase 10); telemedicina por vídeo;
chat/WhatsApp; IA generativa ou "assistente"; contabilidade, tributos, compras e protocolo
(pertencem ao Lote 01 — só integração); prontuário hospitalar completo (só o que B.6-028
pede); gestão de RH/folha; cobrança/billing (é da saas-platform).

---

## 14. Testes obrigatórios (padrão mínimo por fase)

- **Isolamento de tenant**: listar, ler, alterar, exportar cross-tenant → 404.
- **RBAC com escopo**: usuário lotado na UBS A não lê fila da UBS B; recepção não lê SOAP;
  ACS só vê suas microáreas; faturista não lê texto clínico.
- **Sigilo**: registro sigiloso aparece velado; quebra de sigilo exige justificativa e gera
  auditoria + notificação.
- **Auditoria**: escrita gera evento com diff; leitura sensível gera `READ_SENSIVEL`;
  impressão/exportação geram evento; trigger impede UPDATE/DELETE.
- **Regras oficiais**: consistências SIGTAP (sexo, idade, CBO), regras vacinais (faixa,
  intervalo, dose), duplicidade de dispensação, uma visita por turno.
- **Integrações**: mapeador gera payload igual ao fixture oficial; rejeição vai para fila
  de correção; reenvio idempotente; alteração gera `ALTERACAO`.
- **Estoque**: saldo nunca negativo sem permissão; ledger fecha com saldo; saldo em data
  passada correto; custo médio correto (casos com Decimal).
- **Indicadores**: apuração reproduz numerador/denominador de um cenário-fixture e grava
  versão da regra.
- Nome dos testes inclui o requisito: `test_b6_019_prescricao_separa_controlados`.

---

## 15. Entregáveis por fase e checklist final

- [ ] Código + migração + seeds + testes verdes + ruff limpo
- [ ] `openapi.json` atualizado e teste de contrato verde
- [ ] `docs/rastreabilidade.md` com todos os IDs da fase em `IMPLEMENTADO` ou
      `PENDENTE_ESPECIFICACAO_OFICIAL` (com motivo)
- [ ] `docs/pendencias-oficiais.md` atualizado
- [ ] README da fase (o que entrega, como rodar, decisões)
- [ ] Nenhuma funcionalidade sem ID; nenhuma regra oficial "de memória"

Ao terminar cada fase, responda com: (1) requisitos atendidos, (2) pendências oficiais,
(3) decisões que precisam de validação humana, (4) próximos passos — e PARE para revisão.
