# Changelog — GovTask

Ordem cronológica inversa. Cada entrada registra o que mudou, a migração
correspondente e o que ficou de fora, para que a próxima pessoa não descubra a
pendência em produção.

## 2026-09-17 — Assinador, IA, Kanban, editores, E2E e acessibilidade

Fecha as lacunas restantes do prompt, exceto as integrações GovDoc/GovPro/
GovFrota/Diário/Arena (§79, §134–§137) e WhatsApp/push (§41), deixadas de fora
por decisão. **Sem migração.**

### §78 — Assinador acionado de verdade

- `services/assinador.py`: cliente do `apps/signer` (`/internal/sign-pdf`), com
  chave interna e certificado A1 vindos do ambiente. **Desligado por padrão**;
  sem URL/certificado, a rota responde 503 — nunca uma assinatura simulada.
- `POST /demandas/{id}/documentos/{grupo}/assinatura/assinar`: exige PDF e
  solicitação em aberto, envia ao assinador e grava o PDF assinado como **nova
  versão** do grupo, com referência, hash e provedor no registro.
- Frontend: botão "Assinar digitalmente" no painel de assinatura; a árvore
  recarrega com a versão assinada.
- `test_assinador_integracao.py` (4): 503 sem configuração, só PDF, fluxo com
  dublê do assinador (nova versão + evidência) e exigência de solicitação.

### §92 — IA além da sugestão

- `services/extracao.py`: texto de PDF (pypdf), DOCX (python-docx) e formatos
  textuais; recusa claro quando não há texto (digitalizado).
- Rotas: `.../ia/gerar-oficio`, `.../ia/extrair-documento` e
  `.../ia/semelhantes`. A busca de semelhantes recupera por tokens com OR e
  reordena pela IA quando ligada, caindo na ordem textual quando não —
  `ranqueada_por_ia` diz qual caminho foi usado.
- Frontend: ações no painel de sugestões e botão de extração por documento.
- `test_ia_avancada.py` (5).

### §51 — Kanban com arrastar e soltar

- Colunas passam a ser as **situações**; arrastar grava `POST /demandas/{id}/status`
  e o servidor mantém as regras (coluna final não recebe arraste; 422 do
  backend é mostrado). Um seletor no card é o caminho acessível por teclado.
- `GET /catalogos/demandas` passa a devolver `is_inicial`/`is_final`.

### §206–207 — Form builder e editor visual de workflow

- Campos adicionais: opções para seleção/múltipla escolha e edição do rótulo,
  obrigatoriedade e opções; tipos USUARIO/DEPARTAMENTO/MULTIPLA_ESCOLHA.
- Novo `/admin/workflows`: lista, clona modelos do sistema, abre rascunho,
  edita etapas (ordem, peso, modo, natureza, setor, prazo, regra, final),
  valida a soma dos pesos, publica e mostra a prévia do fluxo. Entra na
  navegação de Coordenação.

### §164 — E2E de navegador

- Playwright (`npm run test:e2e`) com a API interceptada no navegador: 5 testes
  cobrindo o formulário progressivo, a criação rápida e a movimentação no
  Kanban. Browsers já em cache no ambiente.

### §107, §201, §149, §217, §219, §53, consolidação

- ESLint (`next/core-web-vitals` + regras jsx-a11y) sem erros; link "Pular para
  o conteúdo" e foco no `<main>` a cada troca de tela.
- Aba Obras: mapa (OpenStreetMap) a partir das coordenadas/endereço.
- Painel Executivo: widgets de KPI reordenáveis (preferência no navegador).
- Atalho `N` abre a nova demanda quando não se está digitando.
- Lista de demandas: modo **Tabela** com colunas escolhidas pelo usuário.
- `/convenios` ganha aviso apontando para Demandas (transição §98).

### Validado

- API: **229 testes** aprovados em SQLite (1 pulado); `ruff` limpo nos arquivos
  desta entrega.
- `tsc --noEmit`, `npm run build`, `npm test` (20) e `npm run test:e2e` (5)
  aprovados; `npm run lint` sem erros.
- Commitado em `geral` (`bff809c`) e enviado a `govsistem/geral`; a branch de
  revisão `govtask-only` reúne só o módulo. As imagens de produção ainda rodam a
  entrega anterior — o rebuild é um passo à parte, sem migração nova.

### Fora do escopo (por decisão)

- GovDoc/GovPro/GovFrota/Diário/Arena (§79, §134–§137) e WhatsApp/push (§41).
- Há avisos de lint pré-existentes em outros arquivos do módulo, não tocados
  aqui para não misturar refatoração com a entrega.

## 2026-09-17 — Concorrência, autosave e formulário progressivo (§113, §120, §121)

Fecha as lacunas 6–8 levantadas na auditoria do prompt. Sem tocar em produção.

**Migração:** `d5e6f7a8b9c0_versao_concorrencia_demanda` (aditiva). Exige
`alembic upgrade head`.

### Adicionado

- **Concorrência otimista (§120).** `demandas.versao` incrementa a cada
  movimentação, pelo mesmo ponto que já zera o contador de inatividade
  (`services.demandas.marcar_movimentacao`) — assim nenhuma rota de alteração
  deixou o controle para trás. O `PATCH /demandas/{id}` aceita `versao_esperada`:
  se a demanda já tiver mudado, responde **409** com `versao_atual` em vez de
  sobrescrever a edição alheia. A versão aparece na listagem e no detalhe.
  Integrações antigas que não enviam o campo continuam funcionando (o bloqueio
  só vale quando o cliente declara a versão que leu).
- **Autosave na demanda (§121, §203).** Componente `EdicaoDemanda` na visão
  geral permite editar título, objeto, descrição e resumo executivo; salva só o
  que mudou após uma pausa de digitação, mostra "Salvando…"/"Salvo às HH:MM" e
  envia `versao_esperada`. Em conflito, avisa e recarrega os dados atuais sem
  perder o que o outro registrou. Ao desmontar, o texto pendente é enviado.
- **Formulário progressivo em 5 passos (§113).** `NovaDemandaWizard` substitui o
  modal de campo único por uma sequência (o que fazer → pessoas → prazos →
  documentos → workflow), com **criação rápida** (§114) disponível já no passo 1.
  O workflow escolhido é aplicado após a criação (`POST /demandas/{id}/aplicar-fluxo`).
- **Erro de API estruturado.** `ApiError` preserva status e corpo; a UI distingue
  o 409 de edição de uma falha qualquer e nunca mostra "[object Object]".

### Testes

- `test_concorrencia_demanda.py`: nasce na versão 1, PATCH avança a versão,
  edição concorrente responde 409 sem alterar o registro, PATCH sem
  `versao_esperada` continua, e arquivamento também avança a versão.
- `demandaForm.test.ts`: normalização do payload (remove vazio, preserva `false`
  e `0`) e conversão de data-only para fim do dia.
- Suíte completa verde em SQLite e em PostgreSQL 16 (schema montado pelas
  migrations, incluindo `test_schema_consistency`).
- `tsc --noEmit`, `npm run build` e `ruff check` aprovados.

### Publicado

Aplicado no ambiente em 17/09/2026, somente o GovTask — os outros módulos não
foram tocados.

- **Backup pré-deploy** em `backups/govtask-pre-v4-20260917_162129/` (dump
  custom, SQL, tar do volume `govtask_uploads` e a revisão anterior anotada).
- **Ensaio em cópia do banco de produção** (`govtask_ensaio`): as seis migrações
  (`f9a0b1c2d3e4` → `d5e6f7a8b9c0`) aplicadas do zero, dados preservados
  (16 demandas, 11 tarefas, 16 convênios, 14 documentos), `downgrade -1` e novo
  `upgrade` da migração nova. A cópia foi descartada.
- **Migração em produção**: mesma cadeia, do `f9a0b1c2d3e4` ao `d5e6f7a8b9c0`,
  com as contagens confirmadas depois.
- **Imagens** de `govtask-api` e `govtask-web` reconstruídas e containers
  recriados por `docker-compose.prod.yml` com `--no-deps`; nginx recarregado.
- **Verificado**: health `ok`; `/eventos/stream`, `/notificacoes/preferencias`,
  `/demandas/{id}/medicoes` e `/demandas/{id}/ia/resumo` presentes no OpenAPI;
  `versao_esperada` no `DemandaUpdate` do container; sem erro nos logs.

### Git

O trabalho está na branch `geral` e foi enviado a `govsistem/geral`. Como um
merge de `geral` em `master` arrastaria ~2.000 arquivos de outros módulos, foi
criada a branch **`govtask-only`** (off `master`, commit `44479ca`) contendo
**apenas** `modulo-govtask`, enviada ao remoto para revisão/PR sem levar os
demais módulos. O `master` não foi alterado.

### Não feito nesta entrega

- E2E de navegador (Playwright) sobre os fluxos continua ausente; o runner de
  componente cobre a lógica pura.

## 2026-09-17 — Suíte contra PostgreSQL e tarefa sem prazo

A suíte completa passou a rodar contra PostgreSQL, exercitando o schema de
produção (inclusive a busca full-text). O primeiro passo revelou um defeito real.

**Migração:** `d4e5f6a7b8c9_tarefa_prazo_opcional`. Exige `alembic upgrade head`.

### Corrigido

- **Tarefa sem prazo era recusada pelo banco.** A migração do núcleo v2 tornou
  `tarefas.convenio_id` e `tarefas.etapa_id` nulos (fluxo livre), mas esqueceu
  `tarefas.prazo`, que continuava `NOT NULL` desde a v1. O modelo e os testes
  tratavam o prazo como opcional — criar tarefa sem prazo estourava
  `NotNullViolationError` em produção. A suíte em SQLite não via porque lá o
  schema é montado pelos metadados. Agora a coluna aceita nulo, alinhada ao
  modelo.

### Adicionado

- **Harness de teste para PostgreSQL.** `TEST_DATABASE_URL` aponta para um banco
  descartável e a suíte monta o schema **pelas migrations** (uma vez por sessão)
  e trunca entre os testes. Dois ajustes foram necessários, ambos do harness e
  não do produto: `NullPool` (cada teste roda em um event loop e o asyncpg não
  reaproveita conexão de outro loop) e montar pelas migrations em vez de
  `create_all` — as colunas geradas `busca_tsv`/`busca_texto` só existem na
  migration, então o caminho full-text só é exercitado de verdade assim.

### Validado

- **Migrações contra PostgreSQL 16**: cadeia completa do zero ao head, mais
  `downgrade` e novo `upgrade` das quatro revisões desta rodada. Todas as
  tabelas e colunas conferidas no banco; o banco descartável foi removido.
- **Suíte completa em PostgreSQL: 215 testes aprovados** (e 215 em SQLite).
- **Teste de consistência do schema** (`test_schema_consistency.py`): compara a
  nulabilidade de cada coluna do modelo com o schema vindo das migrations e
  falha em divergência. É a rede que impede o defeito de `tarefas.prazo` de
  voltar; só roda no PostgreSQL, onde o schema é real.

## 2026-09-17 — Outbox de e-mail

Endurece a entrega da notificação por e-mail (§41, §126): o envio sai do fluxo
da operação e passa a ter retentativa.

**Migração:** `c3d4e5f6a7b8_outbox_email` (aditiva). Exige `alembic upgrade head`.

### Adicionado

- **`notificacao_envios` (outbox).** A notificação grava a linha e segue; um
  processador entrega com espera crescente (60s, 120s, 240s… até 1h) e desiste
  depois de `EMAIL_MAX_TENTATIVAS`, marcando `DESCARTADO` — o histórico fica.
- **Idempotência.** Chave única `(notificacao_id, canal)`: reprocessar a mesma
  notificação não cria um segundo e-mail.
- **Scheduler.** Loop próprio (`EMAIL_OUTBOX_INTERVAL_MINUTES`, padrão 5) separado
  da varredura de prazos, para o e-mail não esperar o ciclo de uma hora.
- **Diagnóstico (admin).** `GET /notificacoes/envios` (o que saiu, o que falhou)
  e `POST /notificacoes/envios/processar` para uma passagem sob demanda.
- **Configuração.** `EMAIL_OUTBOX_ENABLED`, `EMAIL_OUTBOX_INTERVAL_MINUTES`,
  `EMAIL_MAX_TENTATIVAS`, documentados em `.env.example` e no compose.

### Testes

- `test_email_outbox.py`: despachar só enfileira (não envia na hora); entrega
  marca `ENVIADO`; falha reagenda e depois descarta no limite; enfileirar duas
  vezes gera uma linha; o diagnóstico exige administração.

## 2026-09-17 — Testes de frontend

Fecha a parte de testes de interação do §164: o `web-admin` ganhou runner e os
primeiros testes.

**Sem migração.**

### Adicionado

- **Vitest + Testing Library + jsdom** no `web-admin` (`npm test`). Config em
  `vitest.config.ts`, setup em `vitest.setup.ts`.
- **Testes de lógica pura.** `utils.test.ts` (formatação de data/moeda/tamanho,
  percentual com limite, tempo relativo, `cn`) e `perfil.test.ts` (classificação
  por permissão, home por perfil, navegação por permissão, abas por permissão).
- **Teste de componente.** `PreferenciasNotificacao.test.tsx` cobre o canal de
  e-mail, a exigência dos tipos obrigatórios e o payload de salvamento, com a
  API mockada.

### Não feito nesta entrega

- E2E de navegador (Playwright) sobre os fluxos completos. O runner de
  componente cobre a lógica e os primeiros componentes; o E2E entra quando
  houver um ambiente estável para rodá-lo em CI.

## 2026-09-17 — Camada de IA

Fecha §92. A camada é **desligada por padrão** e nunca grava: as rotas devolvem
sugestão, e aplicá-la é uma edição normal da demanda, com confirmação humana.

**Sem migração.**

### Adicionado

- **`services/ia.py`.** Prompt factual montado a partir do que está registrado
  na demanda; provedor trocável (hoje Gemini) isolado em uma função. Sem chave,
  o recurso está indisponível e nada é enviado.
- **Rotas de sugestão.** `GET /demandas/{id}/ia/status`,
  `POST .../ia/resumo`, `.../ia/proxima-acao` e `.../ia/documentos-faltantes`.
  Todas exigem apenas `resource.view` e **não persistem nada**. Com a camada
  desligada, respondem 503; provedor fora do ar, 502.
- **Frontend.** Painel "Sugestões de IA" na visão geral da demanda, visível só
  quando a camada está disponível, com "Aplicar sugestão" (PATCH normal) e
  "Descartar".
- **Configuração.** `AI_ENABLED`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`,
  `AI_TIMEOUT_SEGUNDOS`, documentados em `.env.example` e no compose.

### Testes

- `test_ia.py`: camada desligada responde 503; sugestão é devolvida **sem
  alterar** o resumo da demanda; a lista de documentos faltantes é interpretada
  mesmo com numeração do modelo; isolamento entre municípios.

### Não feito nesta entrega

- Extração de dados de documentos, geração de ofícios e busca semântica de
  processos semelhantes seguem fora do escopo. A camada está preparada para
  recebê-las como novos prompts, sem mudar o boundary.

## 2026-09-17 — Assinatura de documento

Fecha §78. O ciclo de vida é explícito e a transição para **Assinado** não é
oferecida a usuários comuns: ela depende da rota interna que recebe referência e
hash do módulo de assinatura. Sem evidência, o documento permanece "Aguardando
assinatura" — não há assinatura simulada.

**Migração:** `b2c3d4e5f6a7_assinatura_documento` (aditiva). Exige
`alembic upgrade head` antes da publicação.

### Adicionado

- **Modelo `documento_assinaturas`.** Uma linha por grupo de documentos (§31),
  com estados Rascunho, Em revisão, Aguardando assinatura, Assinado e
  Cancelado; autoria da solicitação, da revisão e da assinatura.
- **Rotas de usuário.** `GET .../assinatura`, `POST .../assinatura/solicitar`
  (`resource.edit`), `.../revisar` e `.../cancelar` (motivo obrigatório). O
  grupo é autorizado pela demanda e pela classificação do documento; outro
  município recebe 404.
- **Boundary do assinador.** `POST /internal/assinaturas/registrar`, protegido
  por `INTERNAL_API_KEY`, exige `referencia` e `hash_assinado`; é o único
  caminho para `ASSINADO`. Reenviar evidência para o mesmo grupo é 409.
- **Auditoria e timeline.** Solicitar, revisar, registrar e cancelar geram
  evento na timeline e registro de auditoria com o `demanda_id`.
- **Frontend.** Na aba Documentos, selo de estado por documento, painel de
  assinatura com solicitar/voltar para revisão/cancelar, e — depois de
  registrada — autor, data, referência, provedor e hash.

### Testes

- `test_assinaturas.py`: fluxo até a evidência do assinador, exigência da chave
  interna (sem chave não passa), conflito ao reenviar evidência e isolamento
  entre municípios.

### Não feito nesta entrega

- **O GovTask não chama o assinador.** O boundary está pronto (rota interna com
  evidência); acionar o serviço de assinatura é a próxima integração, e ela
  exige o contrato e o certificado do ambiente.

## 2026-09-17 — Medições sob demanda e central de documentos

Fecha as duas pendências registradas na entrega de UI: medições sob a demanda
(§58) e a aba de documentos no detalhe (§29–§31).

**Migração:** `f1a2b3c4d5e6_medicoes_e_auditoria_por_demanda` (aditiva). Exige
`alembic upgrade head` antes da publicação.

### Adicionado

- **Medições sob a demanda (§58).** `medicoes.convenio_id` passa a aceitar nulo
  e `demanda_id` é adicionado, com a restrição `ck_medicoes_tem_pai`. As rotas
  são montadas duas vezes — `/convenios/{id}/medicoes` e
  `/demandas/{id}/medicoes` — com o pai resolvido e autorizado por dependência,
  o mesmo desenho de `obras`. Nenhum id de medição alcança outro município por
  um caminho que não valide o dono.
- **Auditoria vinculada à demanda (§104).** `auditoria.demanda_id` permite que
  o registro técnico aponte a demanda, não apenas o convênio;
  `GET /auditoria?demanda_id=` filtra por ela.
- **Frontend — aba Documentos (§29–§31).** Árvore por pasta, upload com pasta,
  categoria e classificação, download auditado, remoção com motivo, **nova
  versão** do mesmo grupo (a anterior permanece com autor, data e hash) e
  histórico de versões expansível. Documento continua nunca sendo substituído.
- **Frontend — medições na aba Obras.** Registro, aprovação e remoção de
  medições vinculadas à demanda, inclusive quando ainda não há obra cadastrada
  (a medição pende da demanda, não da obra).

### Testes

- `test_medicoes_demanda.py`: medição nasce sob a demanda e entra na timeline,
  isolamento entre municípios (404 nas duas portas) e auditoria com
  `demanda_id`.

### Não feito nesta entrega

- A obra pela demanda não ganhou aba de medições própria; as medições ficam na
  aba Obras e valem para a demanda como um todo.

## 2026-09-17 — Tempo real e notificações por e-mail

Fecha §41 (notificações multicanal) e §127 (tempo real) sobre a base de
notificações in-app.

**Migração:** `f0a1b2c3d4e5_notificacoes_multicanal` (aditiva). Exige
`alembic upgrade head` antes da publicação.

### Adicionado

- **Tempo real (§127).** `GET /eventos/stream` (SSE) autenticado por token de
  query — o `EventSource` do navegador não envia cabeçalho `Authorization`. O
  payload é um **sinal**, não a verdade: avisa que algo mudou e o cliente
  recarrega pela API autorizada, então um evento publicado antes de um rollback
  não vaza dado. `services/realtime.py` traz um broker em processo (worker
  único, o deploy atual) e fan-out opcional por Redis
  (`REALTIME_BACKEND=redis`) para quando houver mais de um worker.
- **Publicação a partir das notificações.** `criar_notificacao` publica o sinal
  e dispara os canais externos. Como toda notificação do sistema passa por esse
  ponto, não há caminho que crie aviso sem atualizar o sino em tempo real.
- **E-mail (§41).** `services/email.py` envia por SMTP, fora do event loop e de
  forma best-effort; desligado por padrão (`EMAIL_ENABLED=false`).
  `services/notificacoes_canais.py` decide quem recebe: o in-app é sempre
  gravado, o e-mail depende da preferência do usuário e alguns tipos
  (atraso escalado, devolução, prazo vencido) são **obrigatórios** e furam a
  lista de opção.
- **Preferências de notificação.** `notificacao_preferencias` guarda, por
  usuário, se o e-mail está ativo e para quais tipos. API em
  `GET/PUT /notificacoes/preferencias` e `GET /notificacoes/resumo` (contagem
  exata do sino, sem o limite da listagem).
- **Frontend.** `useRealtime()` abre um único `EventSource` por aba e dispara
  `govtask:notificacao`; o sino usa a contagem exata e reage ao evento, mantendo
  o polling de 60s como rede de segurança. A tela de notificações ganhou o
  painel de canais (e-mail + tipos). A navegação de notificações passou a
  preferir `demanda_id` antes de `tarefa_id`/`convenio_id`.
- **Nginx.** `location = /api/govtask/eventos/stream` com buffering desligado e
  `proxy_read_timeout 3600s` — sem isso o proxy segura o evento e o tempo real
  não chega.

### Testes

- `test_notificacoes_canais.py`: regra de e-mail (desligado, lista vazia =
  todos, lista restringe, obrigatórios furam), round-trip das preferências e
  validação de tipo desconhecido, entrega do broker em tempo real, publicação a
  partir de `criar_notificacao` e envio de e-mail com dublê de SMTP.

### Não feito nesta entrega

- **WhatsApp e push** seguem sem provedor. O despachante é o ponto de extensão,
  mas nenhum canal é simulado: um canal que não existe não é chamado.
- **Outbox de e-mail.** O envio é best-effort no fluxo da notificação; uma fila
  persistente com retentativa entra quando houver volume que justifique.
- Testes de interação no frontend continuam ausentes.

## 2026-09-17 — Acompanhamentos, visões salvas e obra pela demanda

Fecha as lacunas de interface deixadas pela v2/v3: §29–§31, §45–§46, §49–§50 e
§54–§58. **Sem migração** — as mudanças de API são aditivas.

### Adicionado

- **`seguindo` e `favorito` no detalhe da demanda.** O botão "Acompanhar" lê o
  estado real do vínculo em vez de adivinhar pelo primeiro clique. O vínculo
  continua em `demanda_seguidores`; o detalhe apenas o expõe.
- **A listagem de demandas passa a honrar os filtros que o whitelist das visões
  já anunciava** (esfera, fonte, órgão, programa, valores, datas, criticidade,
  impacto, confidencialidade, origem, setor solicitante, gestor, solicitante,
  subcategoria, arquivadas). Antes, uma visão como "Emendas federais em
  andamento" era aceita com `201` e ignorada ao ser aplicada: existia só no
  nome. `busca` vira alias de `q`, e `bloqueada`/`aguardando_terceiro` passam a
  ser aceitos como os plurais originais.
- **`minhas` entra no whitelist de filtros** das visões, para o preset "sob
  minha gestão" poder ser salvo.
- **Frontend — visões salvas (§49, §50).** Barra na listagem com salvar o
  recorte atual, aplicar, compartilhar com a equipe, definir como padrão e
  excluir. Filtros adicionais de prioridade, tipo e exercício, e "limpar
  filtros".
- **Frontend — Acompanhamentos (§45, §46).** Tela com as filas "que eu
  acompanho" (seguindo) e "sob minha gestão" (minhas), separando interesse de
  responsabilidade. Botão Acompanhar/Acompanhando no detalhe, presente na
  navegação de todos os perfis.
- **Frontend — aba Obras no detalhe da demanda (§54–§58).** Cadastro de obra,
  execução física e financeira, cronograma, diário, fotos e vistorias pelo
  caminho `/demandas/{id}/obras`, que já era montado e autorizado no servidor.
  As fotos usam a central de documentos da demanda (`POST
  /demandas/{id}/documentos`) e são vinculadas ao registro fotográfico.

### Testes

- `test_filtros_da_visao_sao_honrados_pela_listagem`: uma visão com filtros é
  salva e, aplicada, filtra de verdade.
- `test_seguir_reflete_no_detalhe_e_na_listagem`: o estado do botão Acompanhar
  acompanha o vínculo e o filtro `seguindo`.

### Não feito nesta entrega

- **Medições continuam só sob o convênio.** A API não monta
  `/demandas/{id}/medicoes`; levá-las para a demanda é trabalho de backend e
  ficou de fora para não duplicar o acompanhamento.
- **Central de documentos ainda não tem aba própria** no detalhe da demanda. O
  upload existe e já é usado pelas fotos de obra; uma aba completa (§29–§31)
  fica para a próxima entrega.
- Testes de interação no frontend continuam ausentes (as telas passam `tsc` e
  `build`).

## 2026-09-17 — Relacionamento, controle e navegação

Fecha as lacunas de §32–34, §42–50, §54, §59–61, §67, §90–91, §93, §131, §158,
§165–167 sobre o núcleo v2.

**Migração:** `e8f9a0b1c2d3_relacionamento_busca_e_financeiro`.
Exige `alembic upgrade head` antes da publicação.

### Adicionado

- **Protocolos externos (§33, §34).** CRUD aninhado na demanda, histórico
  append-only de movimentações no órgão, agenda de cobrança
  (`/protocolos/acompanhamento`). Protocolar preenche `aguardando_terceiro` e o
  desfecho devolve a bola ao Município.
- **Conversa interna (§42, §43).** `comentarios_demanda` com respostas,
  fixação, @menção persistida (`comentario_mencoes`) e histórico de edição
  (`comentario_revisoes`). Rota `/minhas-mencoes`. Comentar exige apenas
  `resource.view`.
- **Autoridades (§7, §148).** CRUD, contatos e `/autoridades/{id}/historico`
  com valores consolidados, aplicando o escopo de sigilo das demandas.
- **Checklists (§32, §67, §145).** `checklists` + `checklist_itens`, com item
  que exige documento e checklist obrigatório que **impede** a conclusão da
  demanda (entra em `impedimentos`, não em `alertas`).
- **Financeiro gerencial (§59–61).** `demanda_registros_financeiros` e cinco
  colunas novas em `demandas` (contrapartida, licitado, empenhado, liquidado,
  pago). Os totais são derivados dos lançamentos e recalculados a cada
  gravação/estorno. Leitura exige `financial.view`; lançamento,
  `financial.manage`.
- **Obra como faceta da Demanda (§54–58).** As rotas de obra passaram a ser
  montadas sob `/convenios/{id}/obras` **e** `/demandas/{id}/obras`, com o pai
  resolvido e autorizado por dependência. `obras.demanda_id` adicionado,
  `obras.convenio_id` agora nulo, restrição `ck_obras_tem_pai`.
- **Busca global (§48, §131).** Duas colunas geradas indexadas em `demandas`:
  `busca_tsv` (GIN, configuração `portugues_govtask` = `unaccent` + stemmer
  português, com peso maior para número e título) e `busca_texto` (GIN trigrama
  via `pg_trgm`), combinadas em OR. `/busca` e `/busca/sugestoes` cobrem
  demandas, tarefas, protocolos, autoridades e comentários. Fora do PostgreSQL,
  `ILIKE` equivalente.
- **Visões salvas (§49, §50).** `visoes_salvas`, pessoais ou compartilhadas,
  guardando filtros de uma lista branca — nunca resultados.
- **Relatório completo em PDF (§90, §141).** `/demandas/{id}/relatorio` (JSON) e
  `/relatorio.pdf` (reportlab), com capa, dados, participantes, financeiro,
  tarefas, checklists, documentos, protocolos, timeline e termo de conclusão. A
  emissão entra na timeline.
- **Resumo executivo (§91).** `/demandas/{id}/resumo-executivo` monta o texto a
  partir dos fatos registrados, de forma determinística.
- **Perfis do §93.** Permissões padrão para PREFEITO, VICE_PREFEITO,
  CHEFE_GABINETE, SECRETARIO, DIRETOR, CHEFE_DEPARTAMENTO, SERVIDOR, CONSULTA e
  AUDITOR — antes só existiam 5 das 13 roles previstas, e quem caísse fora do
  mapa ficava sem acesso nenhum.
- **Frontend.** Abas de Checklists, Protocolos, Financeiro e Comentários no
  detalhe da demanda; botão de relatório em PDF e de regerar resumo executivo;
  telas `/autoridades`, `/autoridades/{id}`, `/protocolos` (agenda de cobrança) e
  `/mencoes`; `/busca` reescrita para usar a busca do servidor; Ctrl+K com
  sugestão de demanda vinda da API.
- **Testes.** `test_protocolos`, `test_comentarios`, `test_checklists`,
  `test_demanda_financeiro`, `test_busca_visoes_autoridades`,
  `test_relatorio_demanda`, `test_e2e_veiculo` (§166, o fluxo completo do
  prompt) e `test_e2e_obra` (§167), incluindo o teste de isolamento do §165 com
  13 portas diferentes.

### Publicado

Aplicado em produção em 17/09/2026: imagens reconstruídas, `alembic upgrade head`
de `f7a1c2d3e4b5` a `e8f9a0b1c2d3`, containers recriados e nginx recarregado.
Conversão conferida no banco real — 16 convênios → 16 demandas, 89 etapas, 11
tarefas e 96 eventos religados, 14 anexos com grupo de versão, 1 obra vinculada e
nenhuma órfã, 37 tipos, 17 status, 9 feriados e 4 workflows semeados.

Verificado depois da subida: as 14 rotas novas respondem 200, o PDF sai com 3
páginas, a busca acha "Pavimentação" a partir de "pavimentacao" usando o índice
GIN (confirmado por `EXPLAIN`), e uma demanda de outro município responde 404 em
todas as dez portas. Backup pré-deploy em
`backups/govtask-pre-v2-20260917_032944/`.

### Corrigido

Quatro defeitos **desta própria entrega**. Dois apareceram ao aplicar a migração
contra uma cópia do banco de produção e dois só na primeira chamada real da API —
nenhum deles daria as caras em teste SQLite:

- **`MIN(uuid)` não existe no PostgreSQL.** O backfill que liga obra a demanda
  abortava a migração. Trocado por `(array_agg(DISTINCT demanda_id))[1]`, válido
  porque o filtro adiante exige uma única demanda por convênio.
- **A busca ignorava acento e plural.** Com o dicionário `portuguese` puro, quem
  digitasse "ambulancia" não achava "ambulância" — e no Brasil se digita sem
  acento o tempo todo. Além disso o stemmer snowball não unifica `obra`/`obras`
  nem `aquisição`/`aquisições`. Corrigido com a configuração `portugues_govtask`
  (`unaccent` + stemmer) e um índice trigrama em OR, ambos verificados caso a
  caso contra o PostgreSQL 16.
- **`/busca` respondia 500 na primeira chamada real.** A expressão
  `websearch_to_tsquery` era montada em Python e entregue a `bindparams`, o que
  a enviava como *argumento de consulta*; o driver recusou com "expected str,
  got websearch_to_tsquery". A função passou para dentro do SQL, com o termo
  como parâmetro. Como o ramo PostgreSQL de `aplicar_busca` nunca roda em
  SQLite, nenhum teste de rota alcançava essa linha — agora
  `tests/test_busca_sql_postgres.py` compila a consulta contra o dialeto do
  PostgreSQL e exige que todo parâmetro ligado seja valor primitivo.
- **`CAST` em vez de `::regconfig`.** O `text()` do SQLAlchemy lê `:__cfg::` como
  nome de parâmetro e não encontra o bind. Pego pelo teste novo, antes de
  produção.
- **Build da imagem do frontend falhava.** O Dockerfile faz `COPY /app/public`,
  mas o diretório estava vazio e o git não versiona diretório vazio — some em
  qualquer checkout limpo. Resolvido com `public/.gitkeep`.

Bugs que já existiam antes destas mudanças e apareceram ao exercitar os fluxos:

- **Tarefa não podia ser concluída.** `EM_ANDAMENTO → CONCLUIDA` não constava
  nas transições válidas, mas é exatamente o que a rota `/concluir` faz. Todo
  "Iniciar → Concluir" do servidor de departamento (§158) respondia 409. Entrega
  e revisão continuam existindo para tarefas que exigem retorno ou aprovação.
- **Automação com condição nunca disparava.** A comparação usava
  `str(valor_do_enum)`, que em Python 3.10 produz `"PrioridadeDemanda.ALTA"` e
  não `"ALTA"`. Qualquer regra com condição ficava silenciosamente inerte.
- **Notificação de demanda quebrava a listagem.** `NotificacaoOut` exigia
  `convenio_id`, nulo em toda notificação do núcleo v2: `GET /notificacoes`
  respondia 500 depois da primeira notificação de demanda.
- **Item de cronograma não aparecia após inserção.** Com
  `expire_on_commit=False`, a coleção lida antes do commit continuava devolvendo
  a lista antiga; a resposta vinha sempre com um item a menos.
- **Servidor não conseguia anexar na própria tarefa.** O upload exigia
  `resource.edit`/`resource.create`; §158 prevê que o servidor anexe. Agora quem
  tem só `resource.view` anexa **na tarefa em que atua**, e fora dela continua
  recebendo 403.
- **Relatório estourava MissingGreenlet.** `solicitante` e o setor de cada
  participante não eram carregados com eager load; a montagem tentava lazy load
  fora do contexto async.
- **Documentação com seções duplicadas.** `GOVTASK_V2_ARQUITETURA.md` tinha
  "Documentos" e "Alertas e prazos" repetidos, cinco decisões duplicadas e uma
  linha repetida no diagrama de domínio. Também dizia que um `.pdf` começando
  com `MZ` é recusado; o critério real é não começar com `%PDF-`.

### Não feito nesta entrega

- Notificação em tempo real (§127, WebSocket/SSE) e PWA (§109).
- Camada de IA (§92) — apenas a fronteira está preparada: o resumo executivo é
  determinístico e substituível por sugestão com confirmação humana.
- Assinatura digital (§78) e integrações GovDoc/GovPro/GovFrota/Arena (§134–137).
- Testes de frontend: as telas novas passaram por `tsc` e build, não por teste
  automatizado de interação.
- ~~Telas de administração de visões salvas e de obra pela demanda.~~ Resolvido
  na entrega seguinte ("Acompanhamentos, visões salvas e obra pela demanda").
- Suíte `pytest` contra PostgreSQL: continua rodando em SQLite. A migração e a
  busca full-text, porém, **foram** validadas contra uma cópia do banco de
  produção (ver "Validação executada" na arquitetura).

## 2026-09-17 — Gestão avançada (v3)

Fecha as lacunas de §139, §152–§154, §188–§189, §196, §205–§206, §211, §213,
§220–§222 e §109 sobre o núcleo v2.

**Migração:** `f9a0b1c2d3e4_gestao_avancada`.
Exige `alembic upgrade head` antes da publicação.

### Adicionado

- **Hierarquia pai/filha e progresso agregado (§220–§222).** `demandas.demanda_pai_id`
  (auto-referência) e `demanda_relacionamentos` para os vínculos laterais
  (`RELACIONADA`, `DEPENDENTE`, `DUPLICADA`). O vínculo de pai recusa self e
  ciclo, subindo a cadeia antes de gravar. `/demandas/{id}/hierarquia` devolve
  pai, filhas, relacionamentos e o progresso agregado.
- **Marcos (§213).** `demanda_marcos`: pontos de controle com data prevista,
  conclusão e responsável. Concluir registra `data_realizada` e evento.
- **Riscos (§211).** `demanda_riscos`: probabilidade (1–5) e impacto (1–5) viram
  score e nível (`BAIXO`–`CRITICO`) calculados de forma transparente; mitigação,
  responsável e previsão. Encerrar preenche `resolvido_em`.
- **Campos customizados (§205, §206).** `campos_customizados` define campos por
  tipo de demanda (texto, número, moeda, data, seleção, múltipla, booleano,
  usuário, departamento, URL), com obrigatoriedade, opções e regras
  (`min`, `max`, `max_len`, `regex`). O valor continua em `demandas.campos_extras`
  e passa a ser **validado** na criação/edição: chave fora da definição, tipo
  errado, opção inexistente ou obrigatório ausente devolvem 422. `GET
  /demandas/{id}/campos-customizados` monta o formulário.
- **SLA interno (§152–§154).** `sla_config` por organização/tipo/setor/prioridade,
  com contagem em horas, dias corridos ou dias úteis (calendário do município).
  `GET /demandas/{id}/sla` e `GET /sla/painel` (dentro/próximo/vencido por setor).
  Não se confunde com `prazo_legal`.
- **Ações em lote (§188, §189).** `POST /demandas/lote/{prioridade,atribuir,tags}`,
  cada item passando pela mesma autorização da operação individual (o que não
  se pode abrir é ignorado, nunca alterado). Motivo obrigatório e evento por
  demanda.
- **Webhooks de saída (§196).** `webhook_endpoints` + `webhook_entregas`.
  O evento **enfileira** a entrega na transação da timeline (`WEBHOOKS_ENABLED`,
  desligado por padrão); `POST /webhooks/processar` entrega com assinatura
  HMAC-SHA256 e registra status/resposta. Retentativa idempotente com limite.
- **QR code (§139, §162).** `GET /demandas/{id}/qrcode` devolve SVG do link
  permanente. O ciclo completo de autorização continua na rota de destino.
- **Catálogos para a interface.** `GET /catalogos/demandas` devolve tipos,
  categorias e status (do tenant + do sistema).
- **Frontend.** Aba **Gestão** no detalhe da demanda (marcos, riscos,
  relacionamentos e campos adicionais, com edição conforme permissão);
  `/admin/parametros` para campos, SLA e webhooks; ações em lote com seleção na
  listagem de demandas; leitura/edição dos campos adicionais por demanda.
- **PWA (§109).** `manifest.json`, ícone, service worker conservador (nunca
  cacheia a API) e registro automático.
- **Testes.** `test_gestao_avancada.py` cobre hierarquia/ciclo, isolamento de
  tenant nos vínculos e no lote, marcos, riscos, campos (obrigatório, tipo,
  chave desconhecida), SLA, webhooks (enfileiramento e entrega com dublê de
  HTTP) e QR code.

### Corrigido

- **Documentação de publicação desatualizada.** O CHANGELOG e a arquitetura
  afirmavam que a cadeia v2 não estava aplicada e que a imagem era anterior;
  o ambiente real está em `e8f9a0b1c2d3` (head anterior) com containers
  saudáveis. Nota corrigida.
- **Varredura de prazos rodava duas vezes por organização.** `scheduler.py`
  importava `varrer_organizacao` em duplicidade e chamava a mesma passagem
  outra vez rotulando-a de "motor de alertas"; o segundo bloco ainda logava
  `resultado` no lugar de `alertas`. Agora há uma única chamada, que já cobre
  tarefas, demandas, etapas, protocolos e escalonamento.

### Validado e publicado

- `pytest`: **189 testes** aprovados.
- `ruff check` nos arquivos novos e alterados: aprovado.
- `npx tsc --noEmit` e `npm run build` no `web-admin`: aprovados.
- **Migração v3 validada contra PostgreSQL 16**: `upgrade` de
  `e8f9a0b1c2d3` a `f9a0b1c2d3e4`, `downgrade -1` e novo `upgrade`, com as sete
  tabelas e a coluna `demandas.demanda_pai_id` conferidas no banco.
- **Publicado no ambiente em 17/09/2026**: backup lógico do banco em
  `backups/govtask-pre-v3-20260917_042239/`, imagens de API e `web-admin`
  reconstruídas, containers recriados e `alembic upgrade head` aplicado
  (`f9a0b1c2d3e4`). Conferido depois da subida: health ok, rota nova responde
  401 sem token (existe e exige autorização), `qrcode` disponível na imagem e
  as sete tabelas presentes no banco `govtask`.

### Não feito nesta entrega

- Notificação em tempo real (§127, WebSocket/SSE).
- Assinatura digital (§78) e integrações GovDoc/GovPro/GovFrota/Arena (§134–§137).
- Camada de IA (§92) — segue apenas a fronteira preparada.
- Testes automatizados de interação no frontend (as telas passam `tsc` e build).
- Webhooks em produção seguem desligados por padrão (`WEBHOOKS_ENABLED=false`);
  exigem configuração de endpoint pelo administrador para gerar entregas.

## Entregas anteriores

Registradas em `GOVTASK_V2_ARQUITETURA.md`, seções 5 e "Migrações adicionadas":
núcleo de demandas (`c0d1e2f3a4b5`), tarefas sobre demanda (`d1e2f3a4b5c6`),
motor de workflow (`e2f3a4b5c6d7`), central de documentos (`f3a4b5c6d7e8`),
prazos e alertas (`a4b5c6d7e8f9`), motor de automações (`b5c6d7e8f9a0`),
registros e relatórios (`c6d7e8f9a0b1`) e planejamento (`d7e8f9a0b1c2`).
