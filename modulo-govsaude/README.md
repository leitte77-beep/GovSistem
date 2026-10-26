# GovSaúde — backend

Módulo SaaS multi-tenant para secretarias municipais de saúde, UBS/USF, centros
de especialidades, policlínicas, laboratórios, farmácias, vigilância sanitária e
consórcios intermunicipais. Faz parte do monorepo GovSistem.

**Versão:** 0.4.0 — **Fases 0, 1, 2 e 4**. A Fase 1 cobre a rede de atenção e
cadastros-base; a Fase 2 entrega o cadastro único do cidadão; a Fase 4 entrega
agenda, recepção, fila ordenada, classificação de risco, painéis de chamada e
falta automática auditada. A **Fase 3 (território e saúde da família)** ainda
não foi iniciada; as fases 5–16 também não foram antecipadas.

## O que existe nesta fase

- Estrutura `api/app` com core, middleware, models, schemas, services, api/v1,
  integrações, motores, tasks e relatórios.
- FastAPI em `/api/govsaude/v1`; health em `/api/govsaude/health`.
- SSO `module_access` da saas-platform + login local (CPF/e-mail/nome de acesso),
  bcrypt 12, política de senha, bloqueio, MFA TOTP, janela de acesso e inatividade.
- RBAC por permissão + escopo (tenant, estabelecimento, equipe, especialidade) e
  níveis de sigilo com registro velado e quebra justificada/auditada.
- Auditoria append-only, particionada por mês, com trigger no PostgreSQL.
- Criptografia de coluna (Fernet/MultiFernet), HMAC para CPF/CNS, mascaramento.
- Validadores BR (CPF, CNS, CNPJ numérico/alfanumérico, PIS, CEP, CNES, CBO,
  IBGE, SIGTAP, CID-10, CIAP-2, competência) e fonética BuscaBR.
- Problem Details RFC 9457, request-id, security headers, rate limit.
- Outbox `integracao_envios`, jobs, SSE base, MinIO com chave opaca e validação
  de anexo (magic number + ClamAV opcional).
- Schema `referencia` e importadores de tabelas oficiais.
- Migrações `0001` a `0004`, seeds, Docker Compose com PostgreSQL+PostGIS, Redis, MinIO,
  ClamAV, API, worker e beat.
- OpenAPI versionado + teste de contrato.
- Registro do módulo `govsaude` na saas-platform (migração e catálogo de papéis).

## Fase 1 — rede de atenção e cadastros-base

- CRUD com baixa lógica de estabelecimentos (CNES, CNPJ numérico/alfanumérico,
  endereço, contato, IBGE), setores, serviços/classificações, horários e
  equipes (INE, tipo ESF/EAP/ESB/EMulti/outra, vigência).
- Profissionais com CPF/CNS protegidos (hash + ciphertext + máscara), nome
  social, CBO, conselho, contatos e busca por `nome_busca`/`nome_fonetico`.
  A criação exige `estabelecimento_id` e gera o primeiro vínculo na mesma
  transação, para que o gestor com escopo da unidade já enxergue o cadastro.
- Vínculos profissionais/lotações e especialidades com histórico por vigência:
  fechar `vigencia_fim` e abrir novo vínculo, nunca sobrescrever.
- Escalas, plantões e horários com detecção de sobreposição, trava
  transacional no PostgreSQL e exceção justificada/auditada. Restrições de
  horário por usuário/grupo/estabelecimento complementam a janela já existente
  no usuário e são aplicadas tanto no login quanto nas rotas com unidade.
- Procedimentos autorizados por estabelecimento/profissional/especialidade com
  vigência e conferência SIGTAP quando a base oficial estiver importada.
- Prioridades legal/clínica configuráveis por tenant, lidas do banco; o seed
  cria apenas prioridades configuráveis e não legais.
- Consórcio e entes consorciados com município IBGE, CNPJ, situação e vigência.
- Importação CNES assíncrona (`202` + `job_id`), idempotente, com relatório de
  inconsistências (linha, campo, valor mascarado, motivo, ação sugerida) e
  conferência de totais. Sem layout/arquivo oficial: porta/adaptador retorna
  `PENDENTE_ESPECIFICACAO_OFICIAL`; nunca há scraping ou layout inventado.
- Migração `0002`, seeds idempotentes, testes B.1/B.12 e OpenAPI atualizado.
- Escopo por estabelecimento no RBAC (UBS A não acessa UBS B), auditoria de
  escrita e de leitura de profissional, `Idempotency-Key` e `If-Match`.

### Endpoints principais da Fase 1

`/estabelecimentos` (+ setores, serviços, horários, equipes),
`/equipes` (+ profissionais), `/profissionais` (+ vínculos, especialidades),
`/escalas`, `/plantoes`, `/procedimentos-autorizados`, `/prioridades`,
`/consorcios/entes`, `/restricoes-horario`,
`/importacoes/cnes` e `/jobs/{id}`.

## Fase 2 — cadastro único do cidadão

- CRUD com baixa lógica/reativação, nome social com precedência de exibição,
  CPF/CNS protegidos (hash + ciphertext + máscara), data de nascimento, sexo,
  identidade de gênero, orientação, raça/cor, etnia, nacionalidade, CBO,
  escolaridade, situação de rua, mãe e observações.
- Documentos, contatos, endereços, planos de saúde, alergias e condições com
  baixa lógica, mascaramento de dados e auditoria de leitura sensível.
- Foto do cidadão com política por tenant (`cidadao.uso_foto`), magic number,
  lista branca de imagem, storage privado, ClamAV opcional e URL temporária
  quando S3/MinIO.
- Busca fonética (BuscaBR) por nome/nome social e busca exata por CPF/CNS via
  `POST /cidadaos/busca`, sem colocar o identificador na URL.
- Deduplicação com pontuação configurável por tenant
  (`cidadao.duplicidade_pesos`/`cidadao.duplicidade_limiar`), decisão humana e
  unificação reversível com histórico dos valores anteriores do destino.
- Recém-nascido criado a partir da mãe (`POST /cidadaos/{id}/recem-nascido`).
- Consulta CADSUS por porta/adaptador; sem contrato/credencial oficial fica
  `PENDENTE_ESPECIFICACAO_OFICIAL`, com compatibilização local CPF/CNS.
- Consulta de CEP na base `referencia.ceps`; sem base oficial importada fica
  pendente, sem endereço inventado.
- Migração `0003`, seeds de política/pesos, testes B.1/B.12 e OpenAPI.

### Endpoints principais da Fase 2

`/cidadaos` (+ busca, CADSUS, CEP, baixa/reativação, recém-nascido),
`/cidadaos/{id}/documentos`, `/contatos`, `/enderecos`, `/planos`,
`/alergias`, `/condicoes`, `/fotos`, `/duplicidades`, `/unificar`,
`/unificacoes/{id}/reverter`.

## Fase 4 — agenda, recepção, fila e painel

- Agendas por profissional/unidade/especialidade/tipo, com grade de horários,
  duração, vagas por horário, vigência, faixa de idade, sexos permitidos,
  procedimento SIGTAP, encaixe justificado e falta automática configurável.
- Disponibilidade calculada por data, com vagas, bloqueios e horários passados
  marcados como indisponíveis; bloqueios com cancelamento auditado.
- Agendamentos com `Idempotency-Key`, `If-Match`, confirmação, cancelamento,
  reagendamento (preservando o anterior como `REAGENDADO`), comprovante com
  token opaco `GS4-AGD-...` e alerta/bloqueio de incompatibilidade.
- Falta automática por agenda, reversão com justificativa de 20+ caracteres e
  auditoria; agenda sem falta automática marca `VENCIDO`. Tarefa Celery
  `govsaude.marcar_faltas_automaticas` roda a cada 15 minutos.
- Recepção por código de barras/QR do comprovante/cartão, por identificação
  manual ou demanda espontânea. O código não contém CPF, CNS ou nome.
- Biometria é **opcional** e fica atrás de porta/adaptador; sem provedor
  oficial configurado retorna `PENDENTE_ESPECIFICACAO_OFICIAL` e sempre informa
  as alternativas obrigatórias (código de barras, QR e manual).
- Protocolos de classificação de risco por unidade, com níveis, cores, ordem,
  tempo-alvo e prioridade legal definidos pelo tenant (nada fixo no código).
- Fila ordenada por classificação de risco, prioridade legal e ordem de
  entrada. A resposta expõe `regra_ordenacao` e o `ordem_ranking` de cada item.
- Transições de fila: chamada/rechamada, triagem, atendimento, finalização,
  evasão e cancelamento, com `eventos_fila` append-only e tempos de espera,
  triagem, atendimento e total.
- Painéis eletrônicos com nome abreviado, texto para síntese de voz, notícias,
  histórico das últimas chamadas e eventos SSE no canal
  `govsaude:<tenant>:<estabelecimento>:<setor>`.
- Migração `0004`, testes de isolamento, RBAC de unidade, sigilo de leitura,
  incompatibilidade, idempotência, concorrência, fila, painel e falta/reversão.
- Nota de escopo: a Fase 3 (território/domicílios/visitas) continua pendente e
  não foi implementada por esta entrega.

### Endpoints principais da Fase 4

`/agendas` (+ disponibilidade, bloqueios), `/protocolos-classificacao-risco`,
`/agendamentos` (+ confirmar, cancelar, reagendar, falta, reverter-falta,
comprovante), `/recepcao/check-in`, `/recepcao/demanda-espontanea`,
`/recepcao/cartao`, `/filas` (+ classificação, chamar/rechamar, triagem,
atendimento, finalizar, evadir, cancelar, eventos) e `/paineis-chamada`
(+ estado).

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Rastreabilidade](docs/rastreabilidade.md)
- [Pendências oficiais](docs/pendencias-oficiais.md)
- [Dependências](docs/dependencias.md)
- [LGPD/RIPD](docs/lgpd-ripd.md)
- [Dicionário de dados](docs/dicionario-dados.md)
- [Integrações](docs/integracoes.md)
- [Runbook](docs/runbook.md)

## Como rodar

```bash
cd modulo-govsaude/api
cp ../.env.example .env
pip install -r requirements-dev.txt
alembic upgrade head
python scripts/seed.py
uvicorn app.main:app --reload --port 8210
```

Testes:

```bash
pytest -q
ruff check app tests scripts
python scripts/gerar_openapi.py   # atualiza openapi.json
```

## Fronteiras invioláveis

- Toda funcionalidade cita requisito `B.x-nnn`.
- Nenhum layout/código oficial “de memória”; ausente = porta pendente.
- Sem DELETE físico de dado clínico/territorial/estoque/faturamento.
- Multi-tenant fail-closed; cross-tenant = 404.
- Dado sensível criptografado, mascarado e auditado.
- Nada de app móvel, IA generativa, telemedicina, billing ou CRM.
