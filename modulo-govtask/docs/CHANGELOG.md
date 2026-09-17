# Changelog — GovTask

Ordem cronológica inversa. Cada entrada registra o que mudou, a migração
correspondente e o que ficou de fora, para que a próxima pessoa não descubra a
pendência em produção.

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
