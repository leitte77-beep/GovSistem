# Plano de Implementação — Fase 2 (GovSocial)

> **Objetivo**: Cobrir todos os gaps identificados na análise comparativa com o edital de requisitos.
> **Status**: Em andamento
> **Última atualização**: 2026-07-14

---

## Legenda

- [ ] Pendente
- [~] Em andamento
- [x] Concluído

---

## 1. INTEGRAÇÃO COM BASES FEDERAIS

### 1.1 SICON (Sistema de Condicionalidades)
- [ ] Criar modelo `SiconData` no banco (`modulo-govsocial/api/app/models/sicon.py`)
  - Campos: nis_familiar, descumprimento_educacao, descumprimento_saude, data_referencia, efeito_beneficio
- [ ] Criar migration Alembic `012_create_sicon.py`
- [ ] Criar `schemas/sicon.py` (Pydantic)
- [ ] Criar `services/sicon_import.py` com parser de CSV do SICON
- [ ] Criar endpoints em `api/v1/sicon.py`:
  - `POST /sicon/import` — upload e processamento
  - `GET /sicon/{family_id}` — consultar condicionalidades da família
  - `GET /sicon/jobs` — listar jobs de importação
  - `GET /sicon/jobs/{id}` — detalhes + logs
- [ ] Integrar exibição na `FichaFamilia` (nova aba "Condicionalidades")
- [ ] Adicionar indicadores de descumprimento no Dashboard

### 1.2 Sibec (Sistema de Benefícios ao Cidadão)
- [ ] Criar modelo `SibecData` no banco (`modulo-govsocial/api/app/models/sibec.py`)
  - Campos: nis, tipo_beneficio, valor, data_concessao, data_bloqueio, motivo_bloqueio, situacao
- [ ] Criar migration Alembic `013_create_sibec.py`
- [ ] Criar `schemas/sibec.py` (Pydantic)
- [ ] Criar `services/sibec_import.py` com parser de CSV do Sibec
- [ ] Criar endpoints em `api/v1/sibec.py`:
  - `POST /sibec/import` — upload e processamento
  - `GET /sibec/{family_id}` — consultar benefícios da família
  - `GET /sibec/jobs` — listar jobs
  - `GET /sibec/jobs/{id}` — detalhes + logs
- [ ] Integrar exibição na `FichaFamilia` (nova aba "Benefícios Federais")
- [ ] Cruzar dados PBF do Sibec com flag `beneficiaria_pbf` da família

---

## 2. DADOS SOCIOECONÔMICOS AVANÇADOS

### 2.1 Infraestrutura do Domicílio
- [ ] Criar modelo `DadosDomicilio` (`modulo-govsocial/api/app/models/domicilio.py`)
  - Campos: family_id, tipo_construcao (Alvenaria/Madeira/Mista/Outro), abastecimento_agua (Rede/ Poço/Cisterna/Outro), iluminacao_eletrica (Sim/Não), destino_lixo (Coleta/Céu aberto/Enterra), escoamento_sanitario, total_comodos, total_dormitorios
- [ ] Criar migration Alembic `014_create_dados_domicilio.py`
- [ ] Criar `schemas/domicilio.py`
- [ ] Criar endpoints `GET/PATCH /families/{id}/domicilio`
- [ ] Adicionar aba "Domicílio" na `FichaFamilia`

### 2.2 Renda Detalhada
- [ ] Criar modelo `RendaMembro` (`modulo-govsocial/api/app/models/renda.py`)
  - Campos: person_id, family_id, tipo (Formal/Informal/Autonomo/Aposentadoria/BPC/PBF/Outro), valor, data_inicio, data_fim, comprovante_path
- [ ] Criar migration Alembic `014b_create_renda_membro.py`
- [ ] Criar `services/calculo_renda.py`:
  - `calcular_renda_familiar()` — soma de todas as rendas ativas
  - `calcular_renda_per_capita()` — renda familiar / total membros
  - `classificar_faixa_renda()` — Extrema Pobreza / Pobreza / Baixa Renda / Acima
  - `atualizar_faixa_automaticamente()` — via configuração do tenant
- [ ] Criar endpoints:
  - `GET /families/{id}/renda` — demonstrativo completo
  - `POST /persons/{id}/renda` — adicionar renda
  - `PATCH /persons/{id}/renda/{renda_id}`
  - `DELETE /persons/{id}/renda/{renda_id}`
- [ ] Adicionar aba "Renda" na `FichaFamilia` com:
  - Tabela de rendas por membro
  - Cards de renda total e per capita (com e sem programas)
  - Tabela de despesas declaradas
- [ ] Adicionar endpoint `GET /dashboard/renda` — distribuição de renda no município

### 2.3 Despesas Familiares
- [ ] Criar modelo `DespesaFamiliar` — family_id, tipo (Aluguel/Água/Luz/Alimentação/Transporte/Saúde/Educação/Outro), valor, observacoes
- [ ] Adicionar ao demonstrativo de renda (total despesas, per capita, saldo)

### 2.4 Situação de Rua (Formulário Suplementar CadÚnico)
- [ ] Criar modelo `DadosRua` (`modulo-govsocial/api/app/models/situacao_rua.py`)
  - Campos: family_id, pessoa_referencia_id, tempo_em_situacao_rua, motivo (Desemprego/Alcoolismo/Drogas/Rompimento_Familiar/Outro), local_pernoite, possui_acompanhamento_institucional, instituicao_acompanhamento, tempo_permanencia_municipio, origem_municipio, origem_uf, referencias_familiares
- [ ] Criar migration Alembic `015_create_situacao_rua.py`
- [ ] Criar endpoint `GET/PATCH /families/{id}/situacao-rua`
- [ ] Adicionar flag `situacao_rua` no cadastro de família
- [ ] Adicionar aba "Situação de Rua" na `FichaFamilia` (visível quando flag ativa)

### 2.5 Condições de Saúde (Prontuário SUAS)
- [ ] Criar modelo `CondicoesSaude` — family_id, data_coleta, profissional_id
  - Presença de gestantes (quantas)
  - Presença de nutrizes (quantas)
  - Pessoas com deficiência que recebem cuidado de terceiros
  - Pessoas com doenças crônicas
  - Pessoas com transtornos mentais
  - Uso de substâncias (álcool/drogas) — quem, qual substância
  - Acesso a serviços de saúde
  - Uso de medicamentos controlados
- [ ] Criar migration `016_create_condicoes_saude.py`
- [ ] Criar endpoint `GET/POST /families/{id}/condicoes-saude` com versionamento por data
- [ ] Adicionar aba "Saúde" na `FichaFamilia`

### 2.6 Condições Educacionais (Prontuário SUAS)
- [ ] Criar modelo `CondicoesEducacionais` — family_id, data_coleta, profissional_id
  - Alfabetizacao_familiar (Todos_alfabetizados/Parcialmente/Nenhum)
  - Membros com distorção idade-série
  - Membros fora da escola (quem, motivo)
  - Membros em creche/pré-escola
  - Acesso a educação infantil
- [ ] Criar migration `017_create_condicoes_educacionais.py`
- [ ] Criar endpoint `GET/POST /families/{id}/condicoes-educacionais`
- [ ] Calcular indicador de vulnerabilidade educacional automaticamente
- [ ] Adicionar aba "Educação" na `FichaFamilia`

### 2.7 Convivência Familiar e Comunitária (Prontuário SUAS)
- [ ] Criar modelo `ConvivenciaFamiliar` — family_id, data_coleta, profissional_id
  - Relacionamento entre membros (Harmonioso/Conflituoso/Rompido)
  - Presença de violência doméstica
  - Crianças/adolescentes em trabalho infantil
  - Medidas protetivas aplicadas
  - Participação em organizações comunitárias
  - Vínculos comunitários (Fortalecidos/Frágeis/Inexistentes)
- [ ] Criar migration `018_create_convivencia_familiar.py`
- [ ] Criar endpoint `GET/POST /families/{id}/convivencia`
- [ ] Adicionar aba "Convivência" na `FichaFamilia`

### 2.8 Situações de Vulnerabilidade
- [ ] Criar modelo `VulnerabilidadeFamiliar` — family_id, tipo (enum), data_inicio, data_saida, profissional_id, observacoes
  - Tipos: Pobreza, Extrema_Pobreza, Inseguranca_Alimentar, Trabalho_Infantil, Violencia_Domestica, Abuso_Sexual, Negligencia, Abandono, Rua, Migracao_Forcada, Catastrofe, Desemprego, Outro
- [ ] Criar migration `019_create_vulnerabilidades.py`
- [ ] Criar endpoint `GET/POST /families/{id}/vulnerabilidades`
  - `POST` — adicionar (data_inicio automática)
  - `PATCH /{vuln_id}` — encerrar (data_saida)
- [ ] Integrar com controle automático de pobreza por renda per capita (configurável por tenant)
- [ ] Adicionar seção de vulnerabilidades na `FichaFamilia`
- [ ] Dashboard: gráfico de vulnerabilidades por tipo e bairro

### 2.9 Classificação de Grupos Familiares
- [ ] Adicionar campo `tipo_familia` ao modelo `Family`
  - Nuclear_Conjugal, Ampliada_Extensa, Monoparental_Feminina, Monoparental_Masculina, Unipessoal, Reconstituida, Fraterna, Institucional
- [ ] Criar migration `020_add_tipo_familia.py`
- [ ] Adicionar endpoint de movimentações familiares:
  - `POST /families/{id}/movimentacao` — registrar divórcio, casamento, falecimento
- [ ] Exibir badge com tipo de família no cabeçalho da `FichaFamilia`
- [ ] Dashboard: distribuição de famílias por tipo

### 2.10 Potencialidades da Família
- [ ] Criar modelo `PotencialidadeFamiliar` — family_id, descricao, data_identificacao, profissional_id
- [ ] Adicionar endpoint `GET/POST /families/{id}/potencialidades`
- [ ] Exibir na `FichaFamilia`

---

## 3. CADASTRO E GESTÃO DE PESSOAS

### 3.1 Fotos dos Integrantes Familiares
- [ ] Adicionar campo `foto_url` ao modelo `Person`
- [ ] Criar migration `021_add_foto_person.py`
- [ ] Criar endpoint `POST /persons/{id}/foto` — upload com resize server-side
- [ ] Exibir foto no cabeçalho da família, nas listas de membros, no seletor de membros e no prontuário
- [ ] Integrar exibição nos cartões de frequência e timeline

### 3.2 Cadastro Rápido de Famílias
- [ ] Criar endpoint `POST /families/quick`:
  - Recebe responsável + lista de membros (nome, parentesco)
  - Cria persons automaticamente antes de criar família
- [ ] Criar frontend `FamiliaFormularioRapido.tsx` com rota `/familias/nova/rapida`
- [ ] Adicionar botão "Cadastro Rápido" na busca de famílias

### 3.3 Itinerantes (Pessoas sem Vínculo Familiar)
- [ ] Adicionar lógica para permitir `Person` sem `Family` obrigatória
- [ ] Criar flag `is_itinerante` no modelo `Person`
- [ ] Criar migration `022_add_itinerante.py`
- [ ] Adaptar fluxo de atendimento para aceitar pessoa sem família (via `person_id` direto)
- [ ] Criar endpoint `GET /persons/itinerantes` — listar pessoas sem vínculo ativo
- [ ] Adicionar aba "Itinerantes" no módulo de busca

### 3.4 Reativação de Pessoas Excluídas
- [ ] Criar endpoint `POST /persons/{id}/reativar`
- [ ] Restaurar soft delete, reativar vínculos familiares se aplicável
- [ ] Adicionar ação "Reativar" na interface de pessoa

### 3.5 Histórico Familiar Unificado
- [ ] Criar endpoint `GET /families/{id}/historico-vinculos`
  - Retorna família atual + famílias anteriores do responsável e membros
  - Data e motivo de desligamento de cada vínculo anterior
- [ ] Adicionar aba "Histórico" na `FichaFamilia`

---

## 4. ATENDIMENTOS E SERVIÇOS

### 4.1 Inclusão Automática em Acompanhamento
- [ ] Adicionar configuração no modelo `ServiceType`:
  - `auto_incluir_acompanhamento` (bool)
  - `tipo_acompanhamento` (PAIF/PAEFI)
- [ ] Implementar trigger no backend: ao registrar atendimento com serviço configurado, criar `Acompanhamento` automaticamente
- [ ] Adicionar configuração similar para `AcaoColetiva`: ao inscrever pessoa em grupo, incluir automaticamente em acompanhamento
- [ ] Frontend: checkbox "Incluir em acompanhamento" no `RegistrarAtendimento`, pré-marcado conforme config

### 4.2 Atendimentos sem Pessoas Pré-Cadastradas
- [ ] Adaptar `Attendance` para aceitar `nome_nao_cadastrado` quando pessoa não existe
- [ ] Permitir criar pessoa a partir do atendimento (fluxo reverso)
- [ ] Criar endpoint `POST /attendances/walk-in`

### 4.3 Configuração de Privacidade por Tenant
- [ ] Expandir `Organization.settings` com:
  - `sigilo_padrao` (PADRAO/REFORCADO)
  - `gestor_le_evolucao` (já existe)
  - `visibilidade_encaminhamento` (restrita_origem_destino/todas_unidades)
- [ ] Implementar regras de escopo no `scoping.py`

---

## 5. INSTRUMENTOS TÉCNICO-OPERATIVOS

### 5.1 Construtor de Questionários
- [ ] Criar modelo `Questionario` — tenant_id, nome, descricao, service_type_code, ativo
- [ ] Criar modelo `Questao` — questionario_id, ordem, enunciado, tipo (TEXTO/NUMERO/DATA/SELECAO_UNICA/SELECAO_MULTIPLA/MARCACAO/ANEXO), obrigatorio, opcoes (JSON para seleção)
- [ ] Criar modelo `RespostaQuestionario` — questionario_id, family_id, person_id (opcional), attendance_id (opcional), data_preenchimento, profissional_id
- [ ] Criar modelo `RespostaQuestao` — resposta_id, questao_id, valor (TEXT)
- [ ] Criar migrations `023-026_create_questionarios.py`
- [ ] Criar endpoints:
  - `GET/POST /questionarios` — CRUD de questionários
  - `GET/POST /questionarios/{id}/questoes` — CRUD de questões
  - `POST /questionarios/{id}/responder` — preenchimento
  - `GET /families/{id}/questionarios` — histórico de respostas
  - `GET /questionarios/{id}/respostas/{resp_id}` — visualizar resposta
- [ ] Criar frontend:
  - `Administracao/Questionarios` — CRUD de questionários e questões (arrastar para ordenar)
  - `FichaFamilia/Questionarios` — aba com lista de questionários aplicados
  - `PreenchimentoQuestionario` — formulário dinâmico renderizado a partir da definição

---

## 6. NOTIFICAÇÕES

### 6.1 Infraestrutura de Notificações
- [ ] Implementar `MessagingProvider` com:
  - `EmailProvider` — via SMTP (config já existe)
  - `SmsProvider` — via Twilio ou gateway SMS brasileiro
  - `SystemNotificationProvider` — notificações internas
- [ ] Criar modelo `Notificacao` — tenant_id, user_id, titulo, mensagem, tipo (ENCAMINHAMENTO/AGENDA/BENEFICIO/PRAZO), lida (bool), link, created_at

### 6.2 Notificações de Encaminhamentos
- [ ] Ao criar encaminhamento interno, notificar profissional destino (sistema + e-mail)
- [ ] Ao receber contrarreferência, notificar profissional origem
- [ ] Criar endpoint `GET /notifications` para o frontend
- [ ] Criar `POST /notifications/{id}/read`
- [ ] Adicionar ícone de sino com contador no Shell

### 6.3 Lembretes de Agenda
- [ ] Implementar envio de e-mail automático (via Celery beat) para agendamentos do dia seguinte com `opt_in_lembrete=true`
- [ ] Implementar envio de SMS com antecedência configurável
- [ ] Adicionar campo `antecedencia_sms_minutos` no `Appointment`
- [ ] Criar endpoint `POST /appointments/{id}/comprovante` — gerar PDF do comprovante
- [ ] Frontend: página de impressão `ComprovanteAgendamento.tsx`

### 6.4 Alertas do Sistema
- [ ] Expandir endpoint `GET /alerts` existente com:
  - Acompanhamentos sem evolução > 30 dias (já existe)
  - Avaliações de plano vencidas (já existe)
  - MSE próximas do vencimento (já existe)
  - Relatórios judiciais vencidos (já existe)
  - **Novos**: Benefícios em análise > 7 dias, Encaminhamentos pendentes > 15 dias, Metas de plano vencidas, Agendamentos não comparecidos sem reagendamento

---

## 7. FILTROS E OPERAÇÕES AVANÇADAS

### 7.1 Filtros Personalizados Salvos
- [ ] Criar modelo `FiltroSalvo` — tenant_id, user_id, entidade (families/persons/attendances/benefits/groups), nome, configuracao (JSON com campos e valores), compartilhado (bool para compartilhar com a unidade)
- [ ] Criar migration `027_create_filtros_salvos.py`
- [ ] Criar endpoints:
  - `GET/POST /saved-filters/{entity}` — CRUD de filtros
  - `DELETE /saved-filters/{id}`
- [ ] Frontend: dropdown "Meus Filtros" nas páginas de listagem, com opção de salvar filtro atual
- [ ] Aplicar filtro salvo na chamada de API

### 7.2 Operações em Lote
- [ ] Criar endpoint `POST /families/batch` — ações em lote (exportar selecionados, excluir selecionados)
- [ ] Criar endpoint `POST /attendances/batch`
- [ ] Criar endpoint `POST /benefits/batch`
- [ ] Frontend: checkboxes de seleção múltipla nas listagens, barra de ações em lote

### 7.3 Destaques Visuais em Listagens
- [ ] Adicionar cores/ícones diferenciados por tipo de registro em todas as listagens
  - Atendimento individual vs familiar vs visita (cores diferentes)
  - Encaminhamento urgente vs normal
  - Benefício solicitado vs aprovado vs entregue
  - Denúncia vs atendimento normal
- [ ] Criar componente `BadgePrioridade` reutilizável

---

## 8. RELATÓRIOS

### 8.1 Boletim de Indicadores
- [ ] Criar template Jinja2 `boletim_mensal.html`
- [ ] Criar endpoint `GET /reports/boletim?periodo_inicio&periodo_fim&unit_id`
- [ ] Dados: pessoas/famílias atendidas (cor, sexo, faixa etária), formas de ingresso, encaminhamentos, serviços, benefícios

### 8.2 Relatórios de Benefícios Eventuais
- [ ] `GET /reports/beneficios/concedidos-por-tipo` — PDF
- [ ] `GET /reports/beneficios/concedidos-por-unidade` — PDF
- [ ] `GET /reports/beneficios/autorizacao-retirada/{concessao_id}` — PDF com dados e assinatura
- [ ] `GET /reports/beneficios/requerimento/{concessao_id}` — PDF
- [ ] `GET /reports/beneficios/parecer/{concessao_id}` — PDF com justificativa do técnico
- [ ] `GET /reports/beneficios/relacao-familias` — PDF com lista nominal
- [ ] `GET /reports/beneficios/consolidado-por-familia` — PDF com valores totais
- [ ] `GET /reports/beneficios/grafico-concessoes` — dados para gráfico (já parcialmente no dashboard)

### 8.3 Relatórios de Atividades em Grupo
- [ ] `GET /reports/grupos/ficha-inscricao/{inscricao_id}` — PDF
- [ ] `GET /reports/grupos/publico-prioritario/{acao_id}` — PDF conforme SISC
- [ ] `GET /reports/grupos/lista-presenca/{encontro_id}` — PDF com linhas para assinatura
- [ ] `GET /reports/grupos/diario-frequencia/{acao_id}` — PDF preenchido ou para preenchimento manual
- [ ] `GET /reports/grupos/relatorio-faltas/{acao_id}` — PDF com justificativas
- [ ] `GET /reports/grupos/comprovante-comparecimento/{inscricao_id}` — PDF individual
- [ ] `GET /reports/grupos/aniversariantes/{acao_id}` — PDF simples
- [ ] `GET /reports/grupos/autorizacao-scfv/{inscricao_id}` — PDF com autorizados a buscar

### 8.4 Relatórios de Atendimentos
- [ ] `GET /reports/atendimentos/sumario` — PDF com tabela cronológica
- [ ] `GET /reports/atendimentos/por-familia/{family_id}` — relação de atendimentos
- [ ] `GET /reports/atendimentos/familias-por-unidade` — PDF com totais
- [ ] `GET /reports/atendimentos/solicitacao-comparecimento/{person_id}` — PDF
- [ ] `GET /reports/atendimentos/solicitacao-contato` — PDF

### 8.5 Relatórios de Acompanhamento
- [ ] `GET /reports/acompanhamento/familias-no-servico` — PDF (PAIF/PAEFI)
- [ ] `GET /reports/acompanhamento/usuarios-por-situacao` — PDF (ativos/encerrados/desligados)
- [ ] `GET /reports/acompanhamento/grafico-situacao` — dados para gráfico percentual
- [ ] `GET /reports/producao/producao-tecnico` — PDF com volume de ações por técnico no período
- [ ] `GET /reports/producao/desligamento-programa/{acompanhamento_id}` — PDF individual

### 8.6 Relatórios Cadastrais
- [ ] `GET /reports/familias/ficha-cadastral/{family_id}` — PDF completo (já parcialmente como ProntuarioImpressao)
- [ ] `GET /reports/familias/ficha-socioeconomica/{family_id}` — PDF
- [ ] `GET /reports/familias/por-bairro` — PDF ou gráfico
- [ ] `GET /reports/familias/atestado-pobreza/{family_id}` — PDF para 2ª via de documentos

### 8.7 Dashboard de Relatórios
- [ ] Criar página centralizada `/relatorios` com menu de todos os relatórios disponíveis
- [ ] Cada relatório com parâmetros de filtro (período, unidade, tipo)
- [ ] Gerar PDF server-side via WeasyPrint + Jinja2

---

## 9. PAINEL DE INDICADORES (MELHORIAS)

### 9.1 RMA na Tela Inicial
- [ ] Adicionar widget de indicadores RMA na `InicioPorPerfil` para unidades CRAS/CREAS
- [ ] Cards com: famílias em acompanhamento PAIF, atendimentos do mês, grupos ativos

### 9.2 Gráfico de Vulnerabilidades por Bairro
- [ ] Adicionar endpoint `GET /dashboard/vulnerabilidades-por-bairro`
- [ ] Criar componente `GraficoVulnerabilidadesBairro` — heatmap ou barras empilhadas

### 9.3 Distribuição de Famílias por Tipo
- [ ] Adicionar ao dashboard: donut de tipos de família (Nuclear, Ampliada, Monoparental, etc.)
- [ ] Adicionar ao dashboard: distribuição de renda per capita

---

## 10. MÓDULO HABITACIONAL

### 10.1 Programas Habitacionais
- [ ] Criar modelo `ProgramaHabitacional` — tenant_id, nome, esfera (Municipal/Estadual/Federal), descricao, criterios (JSON: faixas_renda, prioridades), condicoes_financiamento (JSON), ativo
- [ ] Criar modelo `DemandaHabitacional` — family_id, programa_id, tipo_demanda, data_cadastro, status, pontuacao, observacoes
- [ ] Criar modelo `DocumentoHabitacional` — demanda_id, nome, tipo, storage_path
- [ ] Criar modelo `AtividadeHabitacional` — programa_id, nome, tipo, data_inicio, data_fim, status (similar a AcaoColetiva)
- [ ] Criar migrations
- [ ] Criar endpoints CRUD para programas, demandas e atividades
- [ ] Criar frontend:
  - `Habitacao/Programas` — CRUD de programas
  - `Habitacao/Demandas` — registro e consulta
  - `Habitacao/Classificacao` — ranqueamento automático por critérios
  - `FichaFamilia/Habitacao` — aba com demandas da família
- [ ] Georreferenciamento: integrar demandas habitacionais ao `MapaTerritorial`
- [ ] Relatórios de classificação de demanda por critérios

### 10.2 Documentos da Demanda Habitacional
- [ ] Upload de múltiplos documentos no cadastro da demanda
- [ ] Exibição de dados completos do titular (foto, membros, documentos) na análise

---

## 11. AUTENTICADOR DE DOCUMENTOS

### 11.1 QR Code para Validação
- [ ] Criar modelo `DocumentoAutenticavel` — tenant_id, tipo (DECLARACAO/COMPROVANTE/ATESTADO/TERMO), entidade_origem, entidade_id, dados_snapshot (JSON — dados congelados no momento da emissão), qrcode_uuid, data_emissao, emitido_por_id
- [ ] Criar migration
- [ ] Criar endpoint `POST /documentos/emitir` — gera documento com QR Code
- [ ] Criar endpoint público `GET /publico/validar/{qrcode_uuid}` — retorna dados snapshot + status de autenticidade
- [ ] Integrar à geração de PDF: QR Code no rodapé de cada documento
- [ ] Criar página pública de validação (rota sem autenticação)

### 11.2 Assinatura Digital e Eletrônica
- [ ] Integrar com serviço de assinatura existente (`modulo-diario/signer/`)
- [ ] Ou implementar via PyPDF2 com certificado digital ICP-Brasil
- [ ] Implementar assinatura eletrônica (captura de assinatura + hash) para documentos sem necessidade de certificado
- [ ] Documentos a implementar:
  - [ ] Anexo II — Termo de Declaração (com QR Code + assinatura)
  - [ ] Declaração de Comparecimento em Reunião ou Atividade
  - [ ] Declaração de Insuficiência de Renda
  - [ ] Declaração de Responsabilidade para Inclusão em Programas Sociais
  - [ ] Declaração da Previdência Social/INSS para fins de Benefícios
  - [ ] Desligamento Voluntário de Programa Social
  - [ ] Solicitação de 2ª Via de Documentos

---

## 12. EXPORTADOR DE DADOS

### 12.1 Exportador com SQL Parametrizada
- [ ] Criar modelo `ExportadorDado` — tenant_id, nome, descricao, query_sql, parametros (JSON: definição de filtros), ativo, global (visível para todos os tenants)
- [ ] Criar migration
- [ ] Criar endpoints (restrito a ADMIN):
  - `GET/POST /data-exports` — CRUD de exportadores
  - `PATCH /data-exports/{id}`
  - `DELETE /data-exports/{id}`
- [ ] Criar endpoint `POST /data-exports/{id}/execute` — executa query com parâmetros e retorna CSV
  - Validação: apenas SELECT, proibir DROP/DELETE/UPDATE/INSERT/ALTER
  - Parâmetros seguros com bind variables
  - Timeout configurável
- [ ] Criar frontend:
  - `Administracao/Exportadores` — CRUD de exportadores (sintaxe SQL destacada)
  - `Exportador/Executar` — tela de seleção de exportador + filtros + botão executar
  - Download do CSV gerado
  - Histórico de execuções com status (sucesso/erro) e log de erros

---

## 13. UNIFICAÇÃO DE DADOS

### 13.1 Unificação de Bairros e Logradouros
- [ ] Criar endpoint `POST /admin/unificar-bairros`
  - Recebe bairro_origem + bairro_destino
  - Atualiza todos os registros (families, units) do bairro origem para o destino
  - Registra em audit trail
- [ ] Criar endpoint `POST /admin/unificar-logradouros`
  - Similar para logradouros
- [ ] Criar endpoint `GET /admin/duplicados/bairros` — detectar possíveis duplicados por similaridade
- [ ] Criar endpoint `GET /admin/duplicados/logradouros` — detectar possíveis duplicados
- [ ] Frontend: página `Administracao/Unificar` com:
  - Lista de bairros suspeitos de duplicação
  - Seleção de origem/destino
  - Preview de registros afetados
  - Botão confirmar unificação

---

## 14. PARAMETRIZAÇÃO DO SISTEMA

### 14.1 Campos Obrigatórios Configuráveis
- [ ] Expandir `Organization.settings` com:
  - `campos_obrigatorios_pessoa` — lista de campos (nome, sexo, data_nascimento, estado_civil, nis)
  - `campos_obrigatorios_familia` — lista de campos
- [ ] Criar endpoint `PATCH /admin/settings` para atualizar
- [ ] Frontend: página `Administracao/Configuracoes` com toggles de obrigatoriedade

### 14.2 Personalização de Brasões
- [ ] Expandir upload de logo existente para permitir:
  - Logo do órgão (já existe)
  - Brasão para relatórios (já existe)
  - Logotipo secundário (para documentos específicos)
- [ ] Criar endpoint `POST /admin/logo` — upload com preview

---

## 15. MELHORIAS DE USABILIDADE

### 15.1 Profissional — Unidade Padrão
- [ ] Adicionar campo `is_default` em `ProfessionalAssignment`
- [ ] Endpoint `PATCH /professionals/{id}/assignments/{assignment_id}` aceitar is_default
- [ ] No login, carregar automaticamente a unidade padrão

### 15.2 Interface Mobile Otimizada
- [ ] Revisar todas as páginas para responsividade
- [ ] Menu hamburguer com navegação adaptada
- [ ] Tabelas com scroll horizontal em telas pequenas
- [ ] Formulários empilhados verticalmente em mobile

### 15.3 Tutorial / Onboarding de Usuário
- [ ] Criar componente de tour guiado para novos usuários
- [ ] Destacar funcionalidades principais por perfil

---

## 16. BACKEND INFRAESTRUTURA

### 16.1 Tarefas Assíncronas (Celery)
- [ ] Criar tasks: `enviar_email_notificacao`, `enviar_sms_lembrete`, `processar_importacao`, `gerar_pdf_relatorio`
- [ ] Configurar Celery Beat para:
  - Lembretes de agendamento (diário)
  - Cálculo automático de faixa de renda (se configurado)
  - Expurgo/anonimização LGPD (já previsto)
  - Verificação de metas/avaliações vencidas

### 16.2 Cache e Performance
- [ ] Implementar cache Redis para:
  - Dashboard (TTL 5min)
  - RMA calculado (TTL até reabertura)
  - Domínios nacionais (TTL 24h)

### 16.3 Testes
- [ ] Testes para todos os novos modelos
- [ ] Testes para todos os novos endpoints
- [ ] Testes de integração para fluxos completos
- [ ] Testes E2E com Playwright para novas páginas

---

## Ordem de Implementação (Prioridade)

1. **Integração SICON e Sibec** (item 1) — obrigatório edital
2. **Dados socioeconômicos** (item 2) — base para todo o resto
3. **Filtros e operações** (item 7) — usabilidade imediata
4. **Notificações** (item 6) — funcionalidade crítica
5. **Instrumentos técnico-operativos** (item 5) — diferencial
6. **Relatórios** (item 8) — gestão
7. **QR Code e assinatura** (item 11) — conformidade
8. **Exportador de dados** (item 12) — autonomia
9. **Módulo habitacional** (item 10) — completo
10. **Unificação de dados** (item 13) — qualidade
11. **Melhorias de usabilidade** (item 15) — polimento
