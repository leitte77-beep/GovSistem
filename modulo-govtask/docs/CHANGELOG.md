# Changelog — GovTask

Ordem cronológica inversa. Cada entrada registra o que mudou, a migração
correspondente e o que ficou de fora, para que a próxima pessoa não descubra a
pendência em produção.

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

### Corrigido

Dois defeitos **desta própria entrega**, encontrados ao aplicar a migração contra
uma cópia do banco de produção — não teriam aparecido em teste SQLite:

- **`MIN(uuid)` não existe no PostgreSQL.** O backfill que liga obra a demanda
  abortava a migração. Trocado por `(array_agg(DISTINCT demanda_id))[1]`, válido
  porque o filtro adiante exige uma única demanda por convênio.
- **A busca ignorava acento e plural.** Com o dicionário `portuguese` puro, quem
  digitasse "ambulancia" não achava "ambulância" — e no Brasil se digita sem
  acento o tempo todo. Além disso o stemmer snowball não unifica `obra`/`obras`
  nem `aquisição`/`aquisições`. Corrigido com a configuração `portugues_govtask`
  (`unaccent` + stemmer) e um índice trigrama em OR, ambos verificados caso a
  caso contra o PostgreSQL 16.

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
- Telas de administração de visões salvas (`/visoes` tem API, mas a interface
  ainda não expõe salvar/aplicar filtro) e de obra pela demanda (a API já monta
  `/demandas/{id}/obras`, a tela de obra continua entrando pelo convênio).
- Suíte `pytest` contra PostgreSQL: continua rodando em SQLite. A migração e a
  busca full-text, porém, **foram** validadas contra uma cópia do banco de
  produção (ver "Validação executada" na arquitetura).
- **Publicação.** O banco `govtask` em uso está em `f7a1c2d3e4b5`: a cadeia v2
  inteira ainda não foi aplicada em produção, e a imagem do container é anterior
  a esta entrega. Publicar exige build novo e `alembic upgrade head`.

## Entregas anteriores

Registradas em `GOVTASK_V2_ARQUITETURA.md`, seções 5 e "Migrações adicionadas":
núcleo de demandas (`c0d1e2f3a4b5`), tarefas sobre demanda (`d1e2f3a4b5c6`),
motor de workflow (`e2f3a4b5c6d7`), central de documentos (`f3a4b5c6d7e8`),
prazos e alertas (`a4b5c6d7e8f9`), motor de automações (`b5c6d7e8f9a0`),
registros e relatórios (`c6d7e8f9a0b1`) e planejamento (`d7e8f9a0b1c2`).
