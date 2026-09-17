# GovTask v2 — Núcleo de Demandas

Documento vivo. Registra o que existe hoje do redesenho do módulo e o que
falta. Complementa (não substitui) a documentação das entidades anteriores.

> **Atualização de implementação — 17/09/2026.** As seções abaixo descrevem
> funcionalidades já codificadas no repositório. A cadeia v2 (`e8f9a0b1c2d3`) e a
> entrega v3 (`f9a0b1c2d3e4`, gestão avançada) estão aplicadas no banco em uso. O
> histórico por entrega fica no [CHANGELOG](CHANGELOG.md); a operação do
> módulo, em [OPERACAO.md](OPERACAO.md).

## Status de entrega

O núcleo v2 foi implementado com a **Demanda** como entidade raiz e recebeu as
camadas operacionais, gerenciais e de administração descritas a seguir.

| Área | Entrega concluída |
|---|---|
| Núcleo | Demanda numerada por organização/exercício, catálogo, responsáveis, sigilo, tags, participantes, timeline e ciclo de vida independente das tarefas. |
| Trabalho | Tarefas diretamente vinculadas à Demanda, subtarefas, movimentações, dependências e estados de espera/bloqueio. |
| Fluxo | Workflows versionados, etapas paralelas, tarefas-modelo e avanço por peso. |
| Operação | Mesa operacional com Kanban, lista, agenda e navegação de dependências. |
| Perfis | Dashboards para Prefeito, Assessor, Secretário e Departamento, respeitando a visualização por papel. |
| Gestão | Contatos, reuniões e follow-ups registrados de forma auditável; automações, alertas, calendário e documentos. |
| Planejamento | Modelos de Demanda, recorrências, duplicação segura e substituição temporária por ausência. |
| Relatórios | KPIs de Demanda, backlog/gargalos por setor, heatmap de prazo, resumo executivo, CSV e relatório completo em PDF. |
| Relacionamento | Protocolos externos com acompanhamento, conversa interna com @menção e histórico de edição, cadastro de autoridades com consolidação por autoridade. |
| Controle | Checklists configuráveis que travam a conclusão, financeiro gerencial com totais derivados dos lançamentos, obra como faceta da Demanda. |
| Navegação | Busca global full-text sobre demandas, tarefas, protocolos, autoridades e comentários; filtros salvos como visões pessoais ou compartilhadas; command palette com sugestão vinda do servidor. |

## Planejamento e continuidade da Demanda (§71–84, §100–101)

### Modelo administrativo

`modelos_demanda` armazena uma configuração reutilizável de abertura. O campo
`configuracao` é uma lista permitida de atributos de uma Demanda, validada
antes da persistência. Isso impede que um modelo carregue identificadores,
histórico, tarefas, anexos, eventos, status encerrado ou dados de auditoria.

- Administração: `POST /modelos-demanda` (`admin.config`).
- Consulta: `GET /modelos-demanda` (`resource.view`).
- Instanciação: `POST /modelos-demanda/{id}/instanciar` (`resource.create`).
- O modelo inativo não pode ser instanciado.

### Recorrência

`recorrencias_demanda` aponta para um modelo e guarda periodicidade
`MENSAL`, `TRIMESTRAL` ou `ANUAL`, próxima execução, última Demanda gerada e
estado ativo. O processador cria somente demandas novas e avança a próxima
data, preservando o dia do mês quando possível (por exemplo, dia 31 passa para
o último dia de fevereiro).

- `GET/POST /recorrencias-demanda`
- `POST /recorrencias-demanda/processar`

O processamento é administrativo e deve ser chamado pelo agendador da
aplicação. A operação é intencionalmente explícita até que o job periódico do
ambiente esteja configurado.

### Duplicação segura

`POST /demandas/{id}/duplicar` cria uma nova Demanda com numeração própria e
guarda `duplicada_de_id` como rastreabilidade. Copia somente atributos
descritivos e de classificação permitidos. Não copia prazos operacionais,
anexos, documentos, registros de contato, tarefas, dependências, participantes
nem eventos de timeline. A nova timeline registra `DEMANDA_DUPLICADA`.

A ação está disponível no cabeçalho do detalhe da Demanda no frontend.

### Ausências e substituições

`ausencias_substituicoes` contém titular, substituto, motivo (`FERIAS`,
`LICENCA`, `AFASTAMENTO`) e intervalo. Ambos os usuários são validados como
ativos no mesmo tenant.

Ao criar uma **nova** tarefa da Demanda, `services.tarefas.criar_tarefa` busca
uma ausência ativa: a tarefa é entregue ao substituto, sem mudar tarefas já
existentes. O titular originalmente indicado fica nos metadados do evento de
criação, mantendo a rastreabilidade da distribuição.

- `GET/POST /ausencias-substituicoes` (`admin.config`).

### Registros de relacionamento

`demanda_registros` registra telefone, e-mail, WhatsApp, visita e reunião,
com participantes, decisões, próxima ação e follow-up. Ao informar follow-up,
ele atualiza a agenda da Demanda (`proximo_followup`).

- `GET/POST /demandas/{id}/registros`

## Relacionamento, controle e navegação (§32–34, §42–50, §54, §59–61, §67, §90)

### Protocolos externos (§33, §34)

O protocolo é o ponto em que a demanda sai do controle do Município. As rotas
são aninhadas na demanda de propósito: a autorização da demanda (tenant +
sigilo) resolve antes de tocar no protocolo, então não existe caminho por ID que
alcance o protocolo de outro município.

| Método | Rota | Para quê |
|---|---|---|
| GET/POST | `/demandas/{id}/protocolos` | Lista e cadastra (sistema, órgão, número, prazo de resposta) |
| GET/PATCH | `/demandas/{id}/protocolos/{pid}` | Detalhe e correção de cadastro |
| POST | `/demandas/{id}/protocolos/{pid}/atualizacoes` | Cada movimentação no órgão (§34) |
| DELETE | `/demandas/{id}/protocolos/{pid}` | Exclusão lógica com motivo |
| GET | `/protocolos/acompanhamento` | Agenda de cobrança: cobrar hoje, prazo vencido, sem acompanhamento |

- **O cadastro já é a primeira movimentação.** Sem isso o histórico do protocolo
  começaria no meio, com a demanda já "em análise" e ninguém sabendo quando foi
  protocolada.
- **Protocolar transfere a espera.** O cadastro preenche `aguardando_terceiro` e
  `proximo_followup`; o desfecho (`APROVADO`/`REJEITADO`/`ARQUIVADO`) devolve a
  bola ao Município e limpa os dois campos.
- **Protocolo encerrado não recebe movimentação nova.** Reabrir tramitação é
  cadastrar outro protocolo, não reescrever o histórico do anterior.
- **Número único por sistema, dentro da demanda.** O mesmo número em dois
  sistemas é legítimo; repetido no mesmo sistema é erro de digitação.

### Conversa interna (§42, §43)

| Método | Rota | Para quê |
|---|---|---|
| GET/POST | `/demandas/{id}/comentarios` | Conversa da demanda; `tarefa_id` limita ao tópico da tarefa |
| PATCH/DELETE | `/demandas/{id}/comentarios/{cid}` | Editar ou remover o próprio comentário |
| GET | `/demandas/{id}/comentarios/{cid}/revisoes` | Texto anterior de cada edição |
| POST | `/demandas/{id}/comentarios/{cid}/fixar` | Fixa no topo da conversa |
| GET | `/minhas-mencoes` | Onde fui citado, com filtro de não lidas |

Comunicação e auditoria são coisas distintas (§43). O comentário pode ser
editado por quem o escreveu; para que a edição não apague o que foi dito, o
texto anterior vai para `comentario_revisoes`. O evento de timeline registra o
fato ("Maria comentou"), nunca o texto editável.

**Comentar exige apenas `resource.view`**: participar da conversa não é editar a
demanda, e obrigar o servidor de departamento a ter permissão de edição para
responder uma dúvida esvaziaria a separação de papéis.

A @menção é gravada em `comentario_mencoes`, não recalculada por regex a cada
leitura — é isso que torna "onde fui citado?" uma consulta com índice. Um token
que não casa com usuário ativo do tenant é ignorado: escrever "@prazo" em uma
frase não é menção, e o autor nunca é notificado de si mesmo.

### Autoridades (§7, §148)

`/autoridades` é o cadastro administrativo (CRUD + contatos), e
`/autoridades/{id}/historico` consolida demandas e valores: indicado, aprovado,
contratado, executado e pago.

O histórico aplica **o mesmo escopo de visibilidade das demandas**. Uma demanda
sigilosa que o usuário não pode abrir também não entra na soma — do contrário o
total revelaria por aritmética o que a rota de detalhe recusa mostrar.

Não há ranking, nota nem comparação entre autoridades: é cadastro de contato e
acompanhamento administrativo, não material de propaganda.

### Checklists (§32, §67, §145)

| Método | Rota | Para quê |
|---|---|---|
| GET/POST | `/demandas/{id}/checklists` | Lista e cria (com itens, obrigatoriedade e exigência de documento) |
| POST | `.../checklists/{cid}/itens` | Adiciona item |
| POST | `.../itens/{iid}/concluir` · `/reabrir` | Fecha (com documento, se exigido) ou reabre com motivo |
| DELETE | `.../itens/{iid}` · `.../checklists/{cid}` | Remoção lógica |

- **Checklist obrigatório com item pendente é impedimento**, não alerta: não se
  contorna com `forcar`. Checklist não obrigatório entra como alerta, que o
  usuário confirma.
- **Item que exige documento não fecha sem documento desta demanda.** Aceitar
  qualquer id de anexo permitiria "comprovar" com arquivo de outra demanda.
- **Reabrir exige motivo.** Desmarcar item é retirar uma afirmação do registro.

### Financeiro gerencial (§59, §60, §61)

| Método | Rota | Para quê |
|---|---|---|
| GET | `/demandas/{id}/financeiro` | Totais, quebra por tipo e lançamentos (`financial.view`) |
| POST | `/demandas/{id}/financeiro` | Lança empenho, liquidação, pagamento, nota… (`financial.manage`) |
| DELETE | `/demandas/{id}/financeiro/{rid}` | Estorno lógico com motivo; recalcula |

- **Os totais da demanda são derivados, não digitados.** `valor_empenhado`,
  `valor_pago` e companhia saem da soma dos lançamentos vivos. É o que evita o
  card mostrar R$ 300.000 pagos enquanto a aba soma R$ 180.000.
- **Recalcula tudo, não o delta.** Só assim o total continua correto depois de um
  estorno ou de uma correção de valor.
- **Sem lançamento, o campo volta a `null`, não a zero.** "Nada empenhado" e "não
  sabemos" são informações diferentes para quem decide.
- **Permissão própria.** Ler valores exige `financial.view`; lançar,
  `financial.manage`. O servidor que executa tarefas não vê o dinheiro.

Isto **não substitui o sistema contábil**: o valor aqui é gerencial, e cada
lançamento aponta o comprovante na central de documentos em vez de reproduzir a
escrituração.

### Obra como faceta da Demanda (§54–§58)

As rotas de obra passaram a ser montadas **duas vezes**:
`/convenios/{id}/obras/...` (entidades anteriores à v2) e
`/demandas/{id}/obras/...` (§54). O pai vem de uma dependência que resolve e
autoriza o contexto, não de um parâmetro fixo — é o que faz cronograma, diário,
fotos e vistorias funcionarem igual nos dois caminhos, em vez de existirem só
para o convênio.

`obras.convenio_id` passou a aceitar nulo e `obras.demanda_id` foi adicionado,
com a restrição `ck_obras_tem_pai` garantindo que toda obra tenha um dos dois.

### Busca global e visões salvas (§48–§50, §115, §131)

| Método | Rota | Para quê |
|---|---|---|
| GET | `/busca?q=` | Demandas, tarefas, protocolos, autoridades e comentários |
| GET | `/busca/sugestoes?q=` | Autocomplete do command palette (§115) |
| GET/POST | `/visoes` | Visões pessoais e compartilhadas |
| PATCH/DELETE | `/visoes/{id}` | Só o dono altera a própria visão |

No PostgreSQL a busca de demandas combina **duas** colunas geradas e indexadas,
porque uma só não resolve:

| Estrutura | Cobre | Não cobre |
|---|---|---|
| `busca_tsv` (GIN, config `portugues_govtask` = `unaccent` + stemmer português) | Acento ("ambulancia" acha "ambulância"), flexão verbal ("protocolar" acha "protocolado"), plural regular ("veiculo" acha "veículos"), relevância por campo, sintaxe de buscador | Palavra curta ("obra" ≠ "obras") e `-ção`/`-ções` ("aquisição" ≠ "aquisições") |
| `busca_texto` (GIN trigrama, `pg_trgm`) | Exatamente o que o stemmer deixa passar, mais pedaço de palavra — **de forma indexada** | Relevância e sintaxe de buscador |

As duas entram em OR. Isso foi **verificado executando contra o PostgreSQL 16**,
não deduzido: sem `unaccent`, quem digitasse "ambulancia" não encontrava nada, e
o stemmer snowball realmente não unifica `aquisição`/`aquisições` nem
`obra`/`obras`. O `%` e o `_` do termo são escapados, para que um termo com `%`
não vire curinga.

`websearch_to_tsquery` aceita a sintaxe que o usuário já conhece de buscadores
sem estourar erro em entrada livre — `((( & !` só gera um aviso.

Fora do PostgreSQL — a suíte roda em SQLite — o mesmo conjunto de campos é
atendido por `ILIKE`: o resultado é equivalente, o custo não, e em teste o volume
é irrelevante.

Toda seção da busca passa pelo escopo das demandas: tarefa, protocolo e
comentário só aparecem se a demanda dona deles for visível a quem pesquisa.

A visão guarda **filtros, nunca resultados**, e as chaves aceitas são uma lista
branca. Assim uma visão criada por quem depois perde acesso a demandas sigilosas
continua válida e apenas devolve menos linhas, e uma visão compartilhada não
serve de veículo para injetar campo arbitrário na consulta.

### Relatório completo e resumo executivo (§90, §91, §141)

| Método | Rota | Para quê |
|---|---|---|
| GET | `/demandas/{id}/relatorio` | Mesmo conteúdo em JSON, para a tela de impressão |
| GET | `/demandas/{id}/relatorio.pdf` | PDF com capa, dados, participantes, financeiro, tarefas, checklists, documentos, protocolos, timeline e termo de conclusão (`export`) |
| POST | `/demandas/{id}/resumo-executivo` | Regera o resumo a partir do andamento |

O PDF é montado no servidor (`reportlab`), não é captura da interface: imprimir
a tela traria menu e sino, e um layout de documento é outra coisa (§141).

**O financeiro só entra para quem tem `financial.view`.** O PDF é um arquivo que
circula; um relatório que sempre carregasse valores contornaria a permissão no
momento em que fosse encaminhado. A emissão entra na timeline — é conteúdo
consolidado, às vezes sigiloso, saindo do sistema.

O resumo executivo é **determinístico**: monta frases a partir dos fatos
registrados. Nenhuma sentença é inventada. Quando a camada de IA existir (§92),
ela entra aqui como sugestão, sempre com confirmação humana antes de substituir
o texto oficial.

### Frontend desta entrega

| Tela | O que faz |
|---|---|
| `/demandas/{id}` | Ganhou as abas **Checklists**, **Protocolos**, **Financeiro** e **Comentários**, além do botão de relatório em PDF e do "regerar" do resumo executivo |
| `/busca` | Passou a usar `/busca` do servidor. Antes baixava 200 tarefas e os relatórios inteiros para filtrar no navegador — não achava o que estava além do limite e não respeitava sigilo |
| `/autoridades` · `/autoridades/{id}` | Cadastro e histórico consolidado por autoridade |
| `/protocolos` | Agenda de cobrança: cobrar hoje, prazo vencido e — à parte — os protocolos **sem acompanhamento agendado**, que são os que costumam dormir no órgão |
| `/mencoes` | Onde fui citado, com marca de leitura |
| Ctrl+K | Sugere demandas por `/busca/sugestoes`, com atraso curto de digitação, em vez de filtrar uma lista pré-carregada de 50 convênios |

A navegação por perfil ganhou "Cobranças de protocolo" e "Autoridades" para
Coordenação, "Autoridades" para o Executivo, e "Onde fui citado" para todos —
ser citado acontece em qualquer perfil. A **API continua sendo a fonte de
autorização**: a tela do financeiro trata o 403 como informação ("você não tem
permissão para ver os valores"), não como erro de operação.

## Relatórios e painéis (§85–91, §140–141)

### API gerencial

`GET /relatorios/demandas/resumo` fornece:

- quantidade ativa, entradas, movimentações e conclusões da semana;
- demandas atrasadas e sem movimentação há sete dias;
- valor em andamento e idade média do backlog;
- backlog por setor (gargalos) e heatmap de demandas com prazo nos próximos
  sete dias.

`GET /relatorios/demandas/exportar.csv` gera a exportação completa com número,
título, status, setor, prazo, progresso e indicador de atraso. As duas rotas
requerem `export`.

### Frontend

- `/relatorios-demandas`: central de relatórios com cards de indicadores,
  gargalos por setor, heatmap, resumo executivo, atualização e download CSV.
- `/operacao`: Kanban, lista, agenda e navegação de dependências.
- `/configuracoes-demandas`: criação de modelos, programação de recorrências e
  cadastro de ausências/substituições.

A navegação dos perfis de Coordenação e Executivo inclui a central de
relatórios; a configuração aparece para Coordenação. A API continua sendo a
fonte de autorização — a navegação apenas facilita o acesso.

## Migrações adicionadas

| Revisão | Conteúdo |
|---|---|
| `c6d7e8f9a0b1` | Registros de contato, reunião e follow-up; base dos relatórios de Demanda. |
| `d7e8f9a0b1c2` | Modelos de Demanda, recorrências e ausências/substituições. |
| `e8f9a0b1c2d3` | Comentários com menção e revisões, checklists, financeiro gerencial, visões salvas, obra na Demanda (com backfill pela timeline convertida) e as duas colunas de busca (`busca_tsv` com config `portugues_govtask`, `busca_texto` com trigrama). Exige as extensões `unaccent` e `pg_trgm`. |

## Validação executada

- Suíte `pytest` completa da API: aprovada (SQLite assíncrono em memória).
  Inclui os E2E do §166 (veículo por indicação parlamentar, ponta a ponta) e do
  §167 (obra pela Demanda), além dos testes de isolamento do §165.
- `ruff check` nos módulos novos e alterados: aprovado.
- `npx tsc --noEmit` no `web-admin`: aprovado.
- **Migração validada contra uma cópia do banco de produção** (PostgreSQL 16),
  com a cadeia v2 inteira aplicada de `f7a1c2d3e4b5` até `e8f9a0b1c2d3`,
  `downgrade -1` e novo `upgrade`. Resultado na cópia: 16 convênios → 16
  demandas, 89 etapas, 11 tarefas e 96 eventos religados, 14 anexos com grupo de
  versão, 37 tipos e 17 status semeados, 9 feriados, 4 workflows padrão, e a
  única obra existente vinculada à demanda correspondente, nenhuma órfã. A cópia
  foi descartada em seguida; o banco de produção não foi alterado.
- **A busca full-text foi exercitada de fato** nessa cópia, caso a caso (sem
  acento, plural, flexão verbal, `OR`, exclusão com `-`, entrada suja e termo
  com `%`). Foi o que revelou dois defeitos reais, agora corrigidos.
- **Não executado:** a suíte `pytest` contra PostgreSQL (`TEST_DATABASE_URL`).
  Ela continua rodando em SQLite, onde a busca cai no `ILIKE` equivalente.

> **Estado da produção.** O banco `govtask` em uso está em `f9a0b1c2d3e4`
> (head), com as imagens de API e `web-admin` reconstruídas. Webhooks seguem
> desligados (`WEBHOOKS_ENABLED=false`) até que um endpoint seja configurado.

## 1. O que mudou

A v1 do módulo era centrada em **Convênio**: tudo pendurava em `convenios`, e
qualquer demanda que não fosse um convênio não tinha onde morar. A v2 promove
a **Demanda** a entidade raiz. Convênio, licitação, contrato, obra, medição e
prestação de contas passam a ser *facetas* de uma demanda, ativadas conforme o
tipo.

Nada foi apagado: cada convênio existente virou uma demanda equivalente, e
etapas, tarefas, anexos e eventos foram religados. As rotas antigas continuam
no ar durante a transição.

## 2. Modelo de domínio

```
Organização (tenant)
 └── Demanda            demandas               ← raiz, numerada por exercício
      ├── Etapa         etapas                 ← fase (peso p/ progresso)
      ├── Tarefa        tarefas                ← atribuída a alguém; etapa é
      │    │                                     opcional (fluxo livre)
      │    ├── Subtarefa (tarefa_pai_id)
      │    └── Movimentação  tarefa_movimentacoes  ← cada passagem de mãos
      ├── Documento     anexos                 ← grupo de versões + hash + pasta,
      │                                          organizado em pastas
      ├── Protocolo     protocolos_externos    ← + protocolo_atualizacoes
      ├── Participante  demanda_participantes  ← papéis (RACI)
      ├── Seguidor      demanda_seguidores     ← acompanhar / favoritar
      ├── Tag           demanda_tag_vinculos → demanda_tags
      ├── Alerta        alertas                ← sinal aberto até ser tratado
      └── Timeline      eventos_timeline       ← append-only, imutável

Calendário e avisos: `feriados` (nacionais do sistema + os do município) e
`alerta_config` (marcos de prazo, inatividade e cadeia de escalonamento).
```

Desenho do fluxo (separado da instância):

```
Workflow            workflows              ← um fluxo (ex.: "Emenda parlamentar")
 └── Versão         workflow_versoes       ← rascunho → publicada → arquivada
      └── Etapa     workflow_etapas        ← receita: ordem, peso, prazo, condição
           └── Tarefa-modelo  workflow_etapa_tarefas
```

Catálogos configuráveis por tenant (`organization_id NULL` = padrão do
sistema): `demanda_tipos`, `demanda_categorias`, `demanda_status`.
Autoridades e instituições externas: `autoridades` + `autoridade_contatos`.

### Decisões que valem lembrar

- **Status da demanda ≠ status da tarefa.** São tabelas e ciclos distintos.
  Tarefa concluída não conclui demanda.
- **Responsável geral ≠ responsável atual.** Encaminhar a demanda a outro setor
  não transfere a titularidade; colaboração entra como participante.
- **Numeração transacional.** `sequencias_numeracao` guarda o contador por
  tenant/exercício e é travado com `SELECT ... FOR UPDATE` dentro da transação
  de criação. A restrição única `(organization_id, exercicio, sequencial)` é a
  segunda barreira.
- **Timeline é append-only.** Correções geram novo evento. `tipo_evento` é
  texto (não enum de banco) para admitir novos eventos sem migração de tipo.
- **Tarefa sem etapa nem convênio.** Em fluxo livre a tarefa pende direto da
  demanda; `etapa_id` e `convenio_id` viraram opcionais.
- **Encaminhar ≠ transferir a demanda.** Quem encaminha segue responsável; com
  `exige_retorno`, a tarefa volta a ele ao ser concluída. Pedido de informação
  (§23) é subtarefa de tipo `INFORMACAO`, e o solicitante não larga a demanda.
- **Estados de espera explícitos.** `AGUARDANDO_INFORMACAO/OUTRO_SETOR/
  TERCEIRO/DOCUMENTO` com motivo obrigatório, para o painel dizer *por que* a
  tarefa parou em vez de deixá-la eternamente "em andamento".
- **Fluxo versionado.** Publicar nova versão não mexe em demanda em andamento:
  cada etapa instanciada guarda a versão que a gerou. É o que mantém o
  histórico explicável ("por que esta demanda pulou a análise?" — a versão da
  época não a tinha).
- **Etapas de mesma ordem são paralelas.** O motor abre todas juntas e só
  avança quando a última fecha — Engenharia, Contabilidade e Jurídico
  trabalhando ao mesmo tempo (§25).
- **Progresso por peso, não por contagem de tarefas.** Dez tarefinhas de
  protocolo não podem pesar mais que a execução de uma obra. Etapa em
  andamento conta proporcionalmente às tarefas concluídas nela.
- **Documento nunca é substituído.** Reenviar cria a versão seguinte do mesmo
  grupo (`documento_grupo_id`); a anterior segue consultável com autor, data e
  hash SHA-256. Remover a v2 devolve a v1 à condição de vigente.
- **Tipo do arquivo conferido pelos bytes.** Extensão e `Content-Type` vêm do
  cliente; a assinatura do arquivo, não. O nome gravado no disco é gerado por
  nós (UUID + extensão), o que desarma path traversal e colisão de homônimos.
- **Sem URL pública previsível.** O conteúdo só sai pela rota de download, que
  revalida tenant, sigilo da demanda e classificação do documento, e registra
  quem baixou o quê.
- **Alerta ≠ notificação.** A notificação é a mensagem entregue a uma pessoa; o
  alerta é o sinal de que algo precisa de atenção e **continua aberto até ser
  tratado**. Separá-los evita o "cinco pessoas receberam e ninguém resolveu".
- **Varredura idempotente.** Cada situação vira um alerta de chave
  determinística (`tarefa:<id>:atrasada`), com restrição única por tenant.
  Repetir a passagem não duplica nada, e o motor fecha sozinho o alerta cuja
  situação desapareceu. É o que permite rodar de hora em hora sem fila.
- **Dia útil consulta o município.** Feriados nacionais fixos vêm semeados; os
  móveis (Carnaval, Sexta-feira Santa, Corpus Christi) saem do cálculo da
  Páscoa; estaduais e municipais são de cada tenant. Ponto facultativo conta
  como feriado por padrão, e a organização decide o contrário.
- **Escalonamento é uma cadeia**, não três degraus fixos: `RESPONSAVEL →
  CHEFE_SETOR → RESPONSAVEL_GERAL → GABINETE`, com os dias de cada degrau
  definidos pelo município. Por isso o setor ganhou chefe e setor-pai.
- **Escopo de visibilidade.** `services/demandas.aplicar_escopo` aplica tenant
  sempre, e sigilo (RESTRITA/CONFIDENCIAL) para quem não é envolvido. Acesso
  indevido responde **404**, nunca 403 — 403 confirmaria a existência.

## 3. Autorização

Reutiliza o RBAC granular que já existia (`app/core/permissions.py`), sem
autenticação própria: os tokens vêm do SaaS (SSO). Mapeamento em uso no núcleo:

| Ação                     | Permissão                          |
|--------------------------|------------------------------------|
| Listar / abrir / timeline| `resource.view`                    |
| Criar demanda            | `resource.create`                   |
| Editar, status, bloqueio | `resource.edit`                     |
| Cancelar                 | `resource.delete`                   |
| Reabrir                  | `admin.config` ou `resource.delete` |

## 4. API (`/api/govtask/demandas`)

| Método | Rota | Para quê |
|---|---|---|
| GET | `` | Lista paginada, busca e ~20 filtros combináveis |
| POST | `` | Cria (ou salva rascunho) |
| GET | `/{id}` | Detalhe |
| PATCH | `/{id}` | Edição parcial (bloqueada se concluída) |
| POST | `/{id}/publicar` | Publica rascunho |
| POST | `/{id}/status` | Troca a situação (status final é vedado aqui) |
| POST | `/{id}/bloquear` · `/desbloquear` | Bloqueio com motivo |
| POST | `/{id}/proxima-acao` | Define o que falta para andar |
| GET | `/{id}/checagem-conclusao` | Pendências antes de concluir |
| POST | `/{id}/concluir` | Conclui (exige resultado; `forcar` p/ alertas) |
| POST | `/{id}/cancelar` · `/reabrir` · `/arquivar` | Encerramento |
| POST/DELETE | `/{id}/seguir` | Acompanhar / favoritar |
| GET | `/{id}/timeline` | Histórico paginado |

### Tarefas da demanda

Aninhadas de propósito: a autorização da demanda (tenant + sigilo) resolve
antes de tocar na tarefa, então não há caminho por ID que alcance tarefa de
outro município.

| Método | Rota | Para quê |
|---|---|---|
| GET/POST | `/demandas/{id}/tarefas` | Lista e cria (com exigências e aceite) |
| GET/PATCH | `/demandas/{id}/tarefas/{tid}` | Detalhe e edição (prazo deixa rastro) |
| POST | `.../receber` · `/iniciar` | Aceite (§21) e início (checa dependências) |
| POST | `.../aguardar` | Põe em espera com motivo |
| POST | `.../entregar` · `/devolver` · `/concluir` | Entrega, devolução (motivo obrigatório) e conclusão |
| POST | `.../encaminhar` | Passa a outro setor/pessoa (§20) |
| POST | `.../solicitar-informacao` | Subtarefa sem perder responsabilidade (§23) |
| GET | `/minhas-tarefas` | Hoje, atrasadas, próximas, aguardando, devolvidas… |

### Workflows

Desenhar fluxo exige `admin.config`; aplicá-lo a uma demanda, só `resource.edit`.
Modelos do sistema são visíveis a todos e editáveis por ninguém: quem quer
mudar um deles o clona (`copiar_de_id`).

| Método | Rota | Para quê |
|---|---|---|
| GET/POST | `/workflows` | Lista (do tenant + do sistema) e cria |
| GET/PATCH | `/workflows/{id}` | Detalhe com versões e edição |
| POST | `/workflows/{id}/versoes` | Abre rascunho herdando a versão publicada |
| PUT | `/workflows/{id}/rascunho/etapas` | Salva o desenho (pesos devem somar 100) |
| POST | `/workflows/{id}/rascunho/publicar` | Publica e arquiva a anterior |
| POST | `/demandas/{id}/aplicar-fluxo` | Instancia e abre a primeira etapa |
| GET/POST | `/demandas/{id}/etapas` | Lista etapas; cria etapa avulsa (fluxo livre) |
| POST | `/demandas/{id}/etapas/{eid}/concluir` | Fecha etapa (checa documentos exigidos) |

### Documentos

| Método | Rota | Para quê |
|---|---|---|
| GET | `/demandas/{id}/documentos` | Árvore por pasta (§30); `incluir_versoes` mostra o histórico |
| POST | `/demandas/{id}/documentos` | Envia documento ou nova versão (`substituir_grupo_id`) |
| GET | `/demandas/{id}/documentos/{grupo}/versoes` | v1, v2, v3… com autor, hash e motivo |
| PATCH | `/demandas/{id}/documentos/{doc}` | Metadados (o arquivo nunca muda) |
| GET | `/demandas/{id}/documentos/{doc}/download` | Entrega o arquivo e audita o acesso |
| DELETE | `/demandas/{id}/documentos/{doc}` | Exclusão lógica com motivo obrigatório |

Extensões aceitas e a assinatura esperada de cada uma estão em
`app/core/file_validation.py`. Um `.pdf` que não comece com `%PDF-` é
recusado, mesmo que o navegador jure o contrário — um `.pdf` que comece com
`MZ` é um executável renomeado.

### Alertas e prazos

| Método | Rota | Para quê |
|---|---|---|
| GET | `/alertas/painel` | Central com resumo por severidade e não lidos |
| POST | `/alertas/{id}/lido` | Baixa o contador do sino (não resolve) |
| POST | `/alertas/{id}/dispensar` | Fecha com motivo; reabre se a causa persistir |
| POST | `/alertas/verificar` | Dispara a varredura sob demanda |
| GET/PATCH | `/alertas/config` | Marcos, escalonamento e inatividade |
| GET/POST/DELETE | `/feriados` | Calendário do município |
| POST | `/feriados/simular-prazo` | Em que dia um prazo cai, de fato |

O painel fica em `/alertas/painel`, e não em `/alertas`: o endpoint antigo
(alertas de convênio) ainda atende a interface em produção, e dois handlers no
mesmo caminho fariam um sombrear o outro em silêncio.

O **escalonamento** (§38) sobe degrau a degrau conforme o atraso: `RESPONSAVEL`
→ `CHEFE_SETOR` → `RESPONSAVEL_GERAL` → `GABINETE`. Cada degrau dispara uma vez
só, porque a chave do alerta inclui o nível e o destinatário.

A varredura roda de hora em hora pelo `scheduler`, uma organização por vez.

**Condições de etapa** usam uma DSL mínima em JSON, restrita a uma lista branca
de campos da demanda — liberar a entidade inteira deixaria o administrador ler
qualquer coluna por configuração:

```json
{"todas": [
  {"campo": "valor_aprovado", "operador": "maior_que", "valor": 0},
  {"campo": "esfera", "operador": "igual", "valor": "FEDERAL"}
]}
```

## 5. Migration

`c0d1e2f3a4b5_nucleo_demandas` — cria as tabelas do núcleo, semeia o catálogo
padrão (37 tipos, 17 status) e converte os convênios existentes em demandas.
Validada contra uma cópia do banco de produção: 16 convênios → 16 demandas, com
89 etapas, 11 tarefas e 96 eventos religados e contadores alinhados.

`d1e2f3a4b5c6_tarefas_sobre_demanda` — tipos, exigências e espera na tarefa,
tabela de movimentações (com a movimentação de origem gerada para as tarefas
que já existiam) e `demanda_id` nas notificações. Validada na mesma cópia de
produção, inclusive no downgrade.

`e2f3a4b5c6d7_motor_workflow` — desenho versionado do fluxo e os quatro modelos
padrão do §18 (Pedido simples, Emenda parlamentar, Aquisição e Obra), já
publicados na versão 1, com os pesos somando 100 em cada um. Validada na mesma
cópia de produção, com downgrade e upgrade.

`f3a4b5c6d7e8_central_documentos` — tipo real do arquivo e backfill que
transforma cada anexo anterior em documento de versão única (14 anexos na
cópia de produção, todos com grupo e vigência). Validada com downgrade.

`a4b5c6d7e8f9_prazos_e_alertas` — calendário (9 feriados nacionais semeados),
central de alertas, configuração por organização e chefia/hierarquia no setor.
Converte a configuração antiga de escalonamento (três níveis fixos) na escada
nova. Validada na cópia de produção, com downgrade e upgrade.

`b5c6d7e8f9a0_motor_automacoes` — regras isoladas por organização no formato
**gatilho → condição → ações**, com execução idempotente por evento e trilha
de auditoria. Gatilhos de timeline e de prazo acionam notificações, criação da
próxima tarefa, atualização de etapa ou resumo gerencial. As condições só
podem ler campos explicitamente permitidos de demanda ou tarefa.

## 6. Pendente

Dashboards v2 por perfil disponíveis em `/dashboards/{prefeito|assessor|secretario|departamento}`
e nas rotas web equivalentes. Cada painel lê exclusivamente as demandas do
tenant e privilegia filas de atenção, não tabelas administrativas.

Pendências remanescentes: WhatsApp/push como canais reais (§41 — o despachante
é o ponto de extensão, sem canal simulado), acionamento do assinador (§78 — o
boundary com evidência existe; falta o contrato/certificado do ambiente),
integrações GovDoc/GovPro/GovFrota/Arena (§134–§137, fora de escopo por decisão),
extração de dados de documentos e geração de ofícios por IA (§92 — o boundary
existe) e E2E de navegador no frontend (o runner de componente já existe).

A outbox de e-mail com retentativa deixou de ser pendência — ver "Outbox de
e-mail" no CHANGELOG.

O tempo real (§127, SSE com broker em processo e fan-out opcional por Redis) e o
canal de e-mail (§41) deixaram de ser pendência: ver as entradas "Tempo real e
notificações por e-mail" no CHANGELOG. A operação das variáveis e o ajuste do
nginx estão em [OPERACAO.md](OPERACAO.md).

As medições sob a demanda (§58) e a aba de documentos (§29–§31) também foram
fechadas — ver "Medições sob demanda e central de documentos". A central de
documentos já era usada pelas fotos de obra e agora tem interface própria, com
versionamento.

A interface das visões salvas (§49, §50), da página de Acompanhamentos (§45,
§46) e da obra pela demanda (§54–§58) deixou de ser pendência: ver a entrada
"Acompanhamentos, visões salvas e obra pela demanda" no CHANGELOG. Continuam
fora do alcance da tela a medição sob a demanda e uma aba própria de documentos
(A API de documentos já existe e é usada pelas fotos de obra).

## 7. Gestão avançada (v3)

Revisão `f9a0b1c2d3e4`. Acrescenta, sem alterar as entidades anteriores:

| Estrutura | Para quê | Seção |
|---|---|---|
| `demandas.demanda_pai_id` | Hierarquia de desdobramento e progresso agregado | §220–§222 |
| `demanda_relacionamentos` | Vínculos laterais (relacionada, dependente, duplicada) | §220 |
| `demanda_marcos` | Pontos de controle com data prevista e conclusão | §213 |
| `demanda_riscos` | Probabilidade × impacto → score/nível, mitigação e responsável | §211 |
| `campos_customizados` | Definição dos campos adicionais por tipo | §205–§206 |
| `sla_config` | Meta interna por tipo/setor/prioridade | §152–§154 |
| `webhook_endpoints` · `webhook_entregas` | Assinatura HMAC e fila de entregas | §196 |

### Decisões que valem lembrar

- **Valor do campo adicional não ganha tabela própria.** Continua em
  `demandas.campos_extras`; a definição é que valida. Uma linha por campo
  multiplicaria as consultas de detalhe sem ganho.
- **Chave desconhecida é recusada** quando há definição para o tipo. Sem isso,
  o formulário configurável viraria porta de mass assignment. Quando a
  organização ainda não configurou nada, os valores passam como estão — a
  validação não pode invalidar demandas antigas.
- **Ciclo de pai é barrado subindo a cadeia**, não por trigger: a mensagem fica
  compreensível e o teste cobre o caso.
- **Lote não é atalho de autorização.** Cada item passa por `get_demanda_ou_404`;
  o que está fora do escopo entra em `ignoradas`, nunca em `atualizadas`.
- **Webhook separa enfileirar de entregar.** O evento grava a entrega na
  transação da timeline sem tocar na rede; a entrega é um passo explícito,
  assinado e com retentativa limitada. Ligado por `WEBHOOKS_ENABLED`.
- **QR carrega só a URL.** A autorização continua na rota de destino: fotografar
  o código não concede acesso.
- **SLA interno é outro campo.** Nunca sobrescreve `prazo_legal`; a contagem em
  dias úteis usa o calendário do município.
