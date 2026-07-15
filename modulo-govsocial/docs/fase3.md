# Fase 3 — Plano de Implementação GovSocial

> **Objetivo:** Implementar todos os requisitos do edital ainda não atendidos ou parcialmente atendidos pelo GovSocial.
>
> **Data de criação:** 14/07/2026
>
> **Status:** Em planejamento

---

## Visão Geral

Este documento consolida a análise de conformidade do GovSocial frente aos requisitos do edital de Assistência Social (itens I a CDXXXVII, exceto aplicativo móvel CCCLXXXIV-CDX) e organiza a implementação dos itens ausentes ou parciais em 21 subfases, agrupadas por domínio funcional e ordenadas por prioridade/dependência.

### Arquitetura de Acesso e Papéis

```
┌─────────────────────────────────────────────────────────┐
│                    SAAS PLATFORM                        │
│  • Autenticação (login/senha, lockout, recuperação)     │
│  • Gestão de papéis (UserModuleGrant)                   │
│  • Provisionamento de módulos (OrganizationModule)      │
│  • Emissão de token module_access (JWT)                 │
│  • Catálogo de papéis: MODULE_ROLE_CATALOG["govsocial"] │
└──────────────────────┬──────────────────────────────────┘
                       │  POST /internal/sync-user
                       │  token JWT via ?token=
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   GOVSOCIAL (MÓDULO)                    │
│  • NÃO tem login próprio (password_hash = NULL)         │
│  • Valida token SaaS via SAAS_JWT_SECRET                │
│  • Papéis sincronizados via /internal/sync-user         │
│  • Matriz de capabilities: matrizPapeis.ts              │
│  • GuardRota + Permitido: controle de acesso            │
└─────────────────────────────────────────────────────────┘
```

> **Regra de ouro:** Tudo que envolve autenticação (login, senha, lockout, recuperação) vai no **SaaS**. O GovSocial implementa apenas funcionalidades de negócio. Novos papéis e capabilities devem ser cadastrados em ambas as camadas.

### Legenda de Status

| Ícone | Significado |
|---|---|
| ✅ | Implementado |
| 🟡 | Parcialmente implementado |
| ❌ | Ausente |
| 🔜 | Planejado nesta fase |

---

## Fase 3.1 — Segurança e Autenticação

> **IMPORTANTE:** Autenticação é responsabilidade do SaaS. Senha, lockout, recuperação e alteração de senha são implementados na plataforma SaaS. O GovSocial apenas recebe os papéis sincronizados.

**Prioridade:** Crítica  
**Dependências:** Nenhuma  
**Estimativa:** 2 dias (1 SaaS + 1 GovSocial) — a maior parte já está implementada

### 3.1.A — SaaS Platform: Política de Senha, Lockout e Recuperação (quase completo)

> **Local:** `/home/ubuntu/sistemaweb/saas-platform/api/app/`

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| XVIII | Senha forte (8+ chars, 1 letra, 1 número, 1 especial) | ✅ | Já implementado em `schemas.py` (UserCreate/UserUpdate) |
| XVIII | Validação de força também no change-password | 🟡 | Adicionar validador completo em `POST /auth/change-password` (hoje só verifica min length) |
| XVIII | Validação de força também no reset-password | 🟡 | Adicionar validador completo em `POST /auth/reset-password` (hoje só verifica min length) |
| XVII | Bloqueio por tentativas de acesso | ✅ | Já implementado: `password_failures` + `locked_until` no modelo, lógica completa no login |
| XXI | Alteração de senha pelo profissional | ✅ | `POST /auth/change-password` já implementado |
| XIX | Email único por profissional | ✅ | Já existe constraint UNIQUE em `User.email` |
| — | Recuperação de senha via email | ✅ | Fluxo completo implementado: forgot-password → email com token → reset-password |

**Entregáveis SaaS (apenas complementos):**

- [ ] Adicionar validação completa de força de senha no `change-password` e `reset-password`
- [ ] Rate limiting no endpoint forgot-password (evitar abuso)

### 3.1.B — GovSocial: Sincronização de Papéis

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| — | Catálogo de papéis centralizado | ✅ | Já existe `MODULE_ROLE_CATALOG["govsocial"]` no SaaS |
| — | Sincronização de papéis SaaS → GovSocial | ✅ | `POST /internal/sync-user` já mapeia papéis |
| — | Matriz de capabilities no GovSocial | ✅ | `matrizPapeis.ts` já implementado |
| — | Novos papéis da Fase 3 | 🔜 | Adicionar `ivs.visualizar`, `ivs.alterar`, `estoque.gerir`, `teleatendimento.realizar`, `exportador.gerir` (já existe), `auditoria.ler` (já existe) |

**Entregáveis:**

- [ ] Atualizar `MODULE_ROLE_CATALOG` no SaaS com novos papéis se necessário
- [ ] Atualizar `RoleName` enum no GovSocial se houver novos papéis
- [ ] Atualizar `matrizPapeis.ts` com novas capabilities por papel

---

## Fase 3.2 — Interface e UX

**Prioridade:** Alta  
**Dependências:** Nenhuma  
**Estimativa:** 4 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| XI | Data/hora do servidor visível e sincronizada | ❌ | Criar endpoint `GET /server-time`, componente `<RelogioServidor />` |
| XXVI | Ordenação de colunas em grades (asc/desc) | ❌ | Adicionar suporte a ordenação no componente `<Tabela />` |
| XXXII | Exportação CSV em todas as pesquisas | 🟡 | Generalizar exportação CSV para qualquer grid de dados |
| XXXVI | Atalhos configuráveis para sites externos | ❌ | Modelo `ExternalShortcut`, CRUD admin, componente no Shell |
| XXXVII | Filtros personalizados salvos (frontend) | 🟡 | Integrar modelo `FiltroSalvo` já existente com UI de salvar/carregar filtros |
| XXXIX | Link de suporte na página inicial | ❌ | Adicionar link no `Cabecalho` configurável por tenant |
| XLV | Total de registros nas pesquisas | ❌ | Exibir `"N de M registros"` no rodapé das tabelas |

### Entregáveis

- [ ] `<RelogioServidor />` com sincronização periódica
- [ ] `<Tabela />` com ordenação por coluna (asc/desc) e indicador visual
- [ ] `<ExportarCSV />` genérico
- [ ] CRUD de atalhos externos + componente de exibição
- [ ] UI de filtros salvos: salvar, carregar, excluir
- [ ] Link de suporte no cabeçalho
- [ ] Contador de registros nas tabelas

---

## Fase 3.3 — Chat Online Interno (XLIV-L)

**Prioridade:** Alta  
**Dependências:** Fase 3.1 (autenticação)  
**Estimativa:** 8 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| XLIV | Chat online dentro da aplicação | ❌ | Implementar com WebSocket (Socket.IO ou FastAPI WebSocket) |
| XLV | Conexão criptografada (HTTPS/WSS) | ❌ | Já garantido pelo Nginx; certificar WSS no proxy |
| XLVI | Comunicação full-duplex via único socket TCP | ❌ | WebSocket provê isso nativamente |
| XLVII | Sem armazenamento de mensagens (sessão apenas) | ❌ | Mensagens em memória (Redis pub/sub), sem persistência |
| XLVIII | Ferramenta ativável/desativável | ❌ | Configuração no `organization.settings` |
| XLIX | Atualização automática de pendências | 🟡 | Integrar com `Notificacao` existente |
| L | (Integração com ChatGov?) | ❌ | Avaliar se reutiliza infra do ChatGov ou implementa isolado |

### Entregáveis

- [ ] Modelo de mensagens em memória (Redis pub/sub)
- [ ] Endpoint WebSocket `/ws/chat/{tenant_id}`
- [ ] Componente `<ChatDrawer />` (painel lateral)
- [ ] Lista de usuários online por unidade
- [ ] Indicador de "digitando..."
- [ ] Toggle ativar/desativar no admin
- [ ] Notificações de nova mensagem (badge no ícone)

---

## Fase 3.4 — Cadastros Gerais (LXXXVI-CXXIX)

**Prioridade:** Alta  
**Dependências:** Nenhuma  
**Estimativa:** 12 dias

### Estratégia

Criar todas as tabelas de domínio ausentes como cadastros CRUD padronizados, seguindo o padrão já existente nos seeds (`core/seeds.py`). Os 14 itens parciais (que existem como enums ou campos de texto) serão promovidos a tabelas de domínio completas com migração de dados.

### Novos cadastros (30 itens ❌ → 🔜)

| ID | Cadastro | Modelo | API | Frontend |
|---|---|---|---|---|
| LXXXVI | Tipos de atividades coletivas | `TipoAtividadeColetiva` | CRUD `/admin/tipos-atividade` | Tela admin |
| LXXXVII | Vulnerabilidades (cadastro) | `Vulnerabilidade` | CRUD `/admin/vulnerabilidades` | Tela admin |
| LXXXVIII | Grau de instrução | `GrauInstrucao` | CRUD `/admin/graus-instrucao` | Tela admin |
| LXXXIX | Pontos de embarque | `PontoEmbarque` | CRUD `/admin/pontos-embarque` | Tela admin |
| XC | Cartórios | `Cartorio` | CRUD `/admin/cartorios` | Tela admin |
| XCI | Orientações sexuais | `OrientacaoSexual` | CRUD `/admin/orientacoes-sexuais` | Tela admin |
| XCII | Motivos de reinserção | `MotivoReinsercao` | CRUD `/admin/motivos-reinsercao` | Tela admin |
| XCIII | Motivos de cancelamentos | `MotivoCancelamento` | CRUD `/admin/motivos-cancelamento` | Tela admin |
| XCIV | Programas sociais (controle) | `ProgramaSocial` | CRUD `/admin/programas-sociais` | Tela admin |
| XCV | Equipes de atendimento | `EquipeAtendimento` | CRUD `/admin/equipes` | Tela admin |
| XCVI | Objetivos de encaminhamentos | `ObjetivoEncaminhamento` | CRUD `/admin/objetivos-encaminhamento` | Tela admin |
| XCVII | Procedimentos realizados | `ProcedimentoRealizado` | CRUD `/admin/procedimentos` | Tela admin |
| XCIX | Atos infracionais | `AtoInfracional` | CRUD `/admin/atos-infracionais` | Tela admin |
| C | Potencialidades | `Potencialidade` | CRUD `/admin/potencialidades` | Tela admin |
| CI | Necessidades especiais | `NecessidadeEspecial` | CRUD `/admin/necessidades-especiais` | Tela admin |
| CII | Cargos | `Cargo` | CRUD `/admin/cargos` | Tela admin |
| CVI | Parcerias | `Parceria` | CRUD `/admin/parcerias` | Tela admin |
| CVII | Países (lista padrão) | — | Seed fixo + endpoint `GET /admin/paises` | — |
| CIX | Instituições | `Instituicao` | CRUD `/admin/instituicoes` | Tela admin |
| CX | Motivos de inativação de programas | `MotivoInativacaoPrograma` | CRUD `/admin/motivos-inativacao-programa` | Tela admin |
| CXIV | Motivos de encerramento do acolhimento | `MotivoEncerramentoAcolhimento` | CRUD `/admin/motivos-encerramento-acolhimento` | Tela admin |
| CXV | Distritos | — | Seed fixo por município + endpoint | — |
| CXVI | Operações de estoque | `OperacaoEstoque` | CRUD `/admin/operacoes-estoque` | Tela admin |
| CXVII | Origens dos encaminhamentos | `OrigemEncaminhamento` | CRUD `/admin/origens-encaminhamento` | Tela admin |
| CXVIII | Estratégias de atendimento | `EstrategiaAtendimento` | CRUD `/admin/estrategias-atendimento` | Tela admin |
| CXIX | Grupos de insumos | `GrupoInsumo` | CRUD `/admin/grupos-insumos` | Tela admin |
| CXXIII | Especialidades | `Especialidade` | CRUD `/admin/especialidades` | Tela admin |
| CXXIV | Pessoa jurídica | `PessoaJuridica` | CRUD `/admin/pessoas-juridicas` | Tela admin |
| CXXV | Regimes de contratações | `RegimeContratacao` | CRUD `/admin/regimes-contratacao` | Tela admin |
| CXXVI | CBO (lista padrão) | — | Seed fixo + endpoint `GET /admin/cbos` | — |
| CXXVII | Motivo de acolhimento | `MotivoAcolhimento` | CRUD `/admin/motivos-acolhimento` | Tela admin |
| CXXIX | Religião | `Religiao` | CRUD `/admin/religioes` | Tela admin |

### Upgrade de parciais para tabelas (14 itens 🟡 → ✅)

| ID | Cadastro | Ação |
|---|---|---|
| LXXXVI | Tipos de atividades | Promover enum `AcaoColetivaTipo` → tabela |
| XCVIII | Motivos de atendimento por unidade | Criar tabela associativa `unidade_motivo_atendimento` |
| CIII | Bairros | Promover campo texto → tabela `Bairro` |
| CIV | Feriados | Criar tabela `Feriado` |
| CV | Escolaridade | Promover enum → tabela `Escolaridade` |
| CVIII | Logradouros | Promover campo texto → tabela `Logradouro` |
| CXI | Unidade federativa | Promover hardcoded → tabela `UF` |
| CXII | Estado civil | Criar tabela `EstadoCivil` |
| CXIII | Órgão emissor | Criar tabela `OrgaoEmissor` |
| CXX | Motivos de inativação de pessoas/famílias | Promover enum → tabela |
| CXXI | Motivos de inativação (padrão) | Seed automático |
| CXXII | Relações de parentesco | Promover enum → tabela `Parentesco` |
| CXXVIII | Unidades de medidas | Promover campo → tabela `UnidadeMedida` |
| — | (Revisar seeds nacionais) | Copiar seeds default por tenant |

### Estratégia de implementação

Usar um padrão uniforme para todos os cadastros:

```
Modelo: CadastroPadrao (id, tenant_id, descricao, ativo, created_at, updated_at)
API:    GET /admin/{entidade} (list), POST (create), PUT /{id} (update), DELETE /{id} (soft-delete)
Seed:   Dados nacionais copiados por tenant no onboarding
UI:     Componente <TabelaCrud /> genérico com formulário modal
```

### Entregáveis

- [ ] 30 novas tabelas de domínio com migrations
- [ ] Seeds nacionais para tabelas com dados padronizados (CBO, países, UFs, distritos)
- [ ] APIs CRUD padronizadas
- [ ] 14 migrações de enum/campo → tabela com preservação de dados
- [ ] Frontend: `<TabelaCrud />` + `<ModalFormulario />` genéricos
- [ ] Frontend: 44 telas de cadastro no menu Administração

---

## Fase 3.5 — Agenda e Agendamento (CCCXXIX-CCCXLV)

**Prioridade:** Alta  
**Dependências:** Fase 3.4 (feriados, equipes, especialidades)  
**Estimativa:** 6 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCCXXIX | Exclusão de datas/horários específicos | ❌ | Criar modelo `AgendaBloqueio` (profissional, data, horário, motivo) |
| CCCXXX | Horários por equipe/especialidade/profissional | ❌ | Criar modelo `AgendaHorario` com vínculo a equipe/especialidade/profissional |
| CCCXXXI | Remoção de datas (fechamento de agenda) | ❌ | Integrar com `AgendaBloqueio` |
| CCCXXXII | Data início obrigatória, data fim opcional | ❌ | Validação no modelo `AgendaHorario` |
| CCCXXXIII | Agenda do profissional (dia da semana, horário, pessoa) | 🟡 | Expandir modelo `Appointment` existente |
| CCCXXXIV | Definição de horários por dia da semana, replicação | ❌ | UI para configurar horários semanais com opção de replicar |
| CCCXXXV | Feriados bloqueando agendamento | ❌ | Integrar tabela `Feriado` com validação no agendamento |
| CCCXXXVI | Visualização da agenda de toda unidade com filtros | 🟡 | Expandir `AgendaFila` para visão unidade + filtros |
| CCCXXXVII | Agendamento em horários pré-definidos | 🟡 | Integrar com `AgendaHorario` |
| CCCXXXVIII | Visualização por mês/semana/dia | 🟡 | Adicionar seletor de visualização |
| CCCXXXIX | Legenda por cores (pendente/atendido/cancelado) | ❌ | Componente `<LegendaAgenda />` |
| CCCXL | Agendamento para equipe com notificação | ❌ | Expandir `Appointment` para suportar equipe, criar notificações |
| CCCXLI | Cancelamento com motivo | ❌ | Campo `motivo_cancelamento` + endpoint |

### Entregáveis

- [ ] Modelos: `AgendaHorario`, `AgendaBloqueio`
- [ ] Expansão de `Appointment`: `team_id`, `motivo_cancelamento`
- [ ] UI: configurador de horários semanais com replicação
- [ ] UI: visão mês/semana/dia com navegação
- [ ] UI: `<LegendaAgenda />` com cores por status
- [ ] Integração com feriados para bloqueio

---

## Fase 3.6 — Índice de Vulnerabilidade Social (CXXX-CXXXVIII)

**Prioridade:** Média  
**Dependências:** Fase 3.4 (vulnerabilidades, programas sociais)  
**Estimativa:** 6 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CXXX | Estimar IVS com tecnologia inteligente | ❌ | Engine de cálculo baseado em regras configuráveis + pesos |
| CXXXI | Pontuação mín/máx, níveis (Não vulnerável → Muito alta) | ❌ | 6 níveis com faixas de pontuação configuráveis |
| CXXXII | Critérios configuráveis (renda, programas, benefícios, violências) | ❌ | Tabela `IvsCriterio` com peso e fórmula |
| CXXXIII | Atualização automática | ❌ | Trigger no banco ou task Celery on-change |
| CXXXIV | Registro de alterações manuais | ❌ | Auditoria no campo `ivs_manual` |
| CXXXV | Visualização nas telas principais (família, atendimento, histórico) | ❌ | Badge/indicador de IVS |
| CXXXVI | Consulta e modificação na tela da família | ❌ | Botão "Revisar IVS" com justificativa |
| CXXXVII | Parametrização de quem pode alterar | ❌ | Nova capability `ivs.alterar` |
| CXXXVIII | Parametrização de quem pode visualizar | ❌ | Nova capability `ivs.visualizar` |

### Entregáveis

- [ ] Modelo `IvsCriterio` (tenant_id, nome, peso, formula, ativo)
- [ ] Modelo `IvsCalculo` (family_id, pontuacao, nivel, data_calculo, automatico)
- [ ] Engine `services/ivs_engine.py`: coleta dados → aplica critérios → normaliza → classifica
- [ ] Configuração de faixas de pontuação por tenant
- [ ] Celery task para recálculo programado (diário) + on-change
- [ ] Endpoints: `GET /families/{id}/ivs`, `POST /families/{id}/ivs/recalcular`
- [ ] Frontend: componente `<IndicadorIVS />` (badge colorido)
- [ ] Frontend: modal de revisão manual com justificativa
- [ ] Novas capabilities: `ivs.visualizar`, `ivs.alterar`

---

## Fase 3.7 — Mapas Temáticos (CXXXIX-CLI)

**Prioridade:** Média  
**Dependências:** Fase 3.6 (IVS para coloração)  
**Estimativa:** 10 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CXXXIX | Delimitação de área de abrangência | ❌ | Polígonos no mapa por unidade |
| CXL | Georreferenciamento de equipamentos | ❌ | Pins com coordenadas lat/lng nas unidades |
| CXLI | Mapa de calor (heatmap) | ❌ | Integrar Leaflet.heat ou similar |
| CXLII | Visualização por satélite | ❌ | Camada de satélite (ESRI/Google) |
| CXLIII | Georreferenciamento de famílias com zoom | ❌ | Coordenadas no endereço + clusterização |
| CXLIV | Distribuição geográfica de usuários e unidades | ❌ | Camada de pontos + camada de heatmap |
| CXLV | Alternar entre pessoas e famílias | ❌ | Toggle no mapa |
| CXLVI | Dados de áreas com maior incidência | ❌ | Agregação por região/heatmap |
| CXLVII | Plotagem em tela cheia | ❌ | Botão full-screen |
| CXLVIII | Vulnerabilidades no mapa de calor | ❌ | Coloração por nível de IVS |
| CXLIX | Vista panorâmica 360° (street view) | ❌ | Integrar Google Street View ou Mapillary |
| CL | Filtros no mapa de calor (sexo, idade, etc.) | ❌ | Filtros laterais que atualizam heatmap |
| CLI | Alternar mapa de calor entre pessoas e famílias | ❌ | Integrado com toggle CXLV |

### Stack proposta

- **Leaflet** (open source, sem custo de API key) + **react-leaflet**
- **Leaflet.heat** para heatmap
- **Leaflet.markercluster** para clusterização
- OpenStreetMap (padrão) + ESRI Satellite (camada satélite)
- **Mapillary** para street view (gratuito para uso não-comercial)

### Entregáveis

- [ ] Novo componente `<MapaTerritorialLeaflet />` (substitui SVG atual)
- [ ] Camadas: OpenStreetMap, Satélite, Heatmap, Pontos
- [ ] Geocodificação de endereços (Nominatim ou BrasilAPI)
- [ ] CRUD de áreas de abrangência (polígonos GeoJSON)
- [ ] Filtros demográficos (sexo, idade, deficiência, programas, benefícios)
- [ ] Toggle: pessoas | famílias
- [ ] Toggle: heatmap | pontos | vulnerabilidade
- [ ] Full-screen com controle de mapa
- [ ] Integração com capacidades `vigilancia.ver` e `vigilancia.pinos`

---

## Fase 3.8 — Atendimento (Complementos CXCII-CCXCVI)

**Prioridade:** Alta  
**Dependências:** Fase 3.4 (cadastros gerais), Fase 3.6 (IVS)  
**Estimativa:** 10 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CXCII | Múltiplos encaminhamentos no mesmo atendimento | ❌ | Tabela associativa `atendimento_encaminhamento` |
| CXCIII | Agendamento do próximo na recepção | 🟡 | Modal inline na tela de recepção |
| CXCIV | Recepção: unidade, data, horário, motivos, detalhes | ✅ | Já implementado |
| CXCV | Liberação de benefícios na recepção | 🟡 | Modal inline |
| CXCVI | Abordagem de rua com profissionais e anônimo | ❌ | Modelo `AbordagemRua` + tela específica |
| CXCVII | Encaminhar abordagens para unidades/profissionais | ❌ | Integrar com `Encaminhamento` |
| CXCVIII | Benefícios: quantidade requisitada, autorizada, valor | 🟡 | Campos adicionais no modelo |
| CXCIX | Reincidência de medida com motivo | ❌ | Campo `motivo_reincidencia` |
| CC | Tela de atendimento unificada (benefícios, violências, MSE, etc.) | ✅ | Já implementado |
| CCI | Privacidade pública/privada por usuário/grupo | 🟡 | Expandir `sigiloso_reforcado` |
| CCII | Marcação de violências reincidentes | ❌ | Detecção automática + flag manual |
| CCIII | Alerta de curso já matriculado | ❌ | Validação na matrícula |
| CCIV | Vínculo a grupos de atividades coletivas | ❌ | Campo no atendimento |
| CCV | Inscrição em cursos com disciplina/turma | ❌ | Ver Fase 3.4 (cursos) |
| CCVI | Múltiplas parcerias | ❌ | Tabela associativa |
| CCVII | Encaminhamento rede interna/externa na mesma tela | ✅ | Já implementado |
| CCVIII | Procedimentos realizados na mesma tela | ❌ | Campo multiselect |
| CCIX | Local de armazenamento obrigatório com estoque | ❌ | Validação condicional |
| CCX | Indicação SCFV com controle de vagas | ❌ | Validação de `vagas_disponiveis` |
| CCXI | Identificar integrantes da família no atendimento | ❌ | Campo multiselect de membros |
| CCXII | Anexos no atendimento sem trocar de tela | ❌ | Upload inline |
| CCXIII | Motivo da reincidência de violência | ❌ | Campo `motivo_reincidencia_violencia` |
| CCXIV | Atendimento sem identificação da pessoa | ❌ | Flag `anonimo` no modelo |
| CCXV | Uso de substâncias psicoativas na MSE | ✅ | Já existe em `CondicoesSaude` |
| CCXVI | Encaminhar para equipe notificando todos | ❌ | Expansão do Encaminhamento |
| CCXVII | Atendimento sigiloso por especialidade/unidade | 🟡 | Expandir `sigiloso_reforcado` |
| CCXVIII | Atos infracionais na MSE | ❌ | Usar tabela `AtoInfracional` da Fase 3.4 |
| CCXIX | Registro de atendimentos completo | ✅ | Já implementado |
| CCXX | Origem/destino para benefícios de transporte | ❌ | Campos no `ConcessaoBeneficio` |
| CCXXI | Recusa do atendimento | ❌ | Campo `recusado` + `motivo_recusa` |
| CCXXII | Horas MSE: totais, mensais, cumpridas, restantes | ❌ | Campos no modelo PIA/MSE |
| CCXXIII | Indicador de MSE anterior (reincidência) | ❌ | Detecção automática + flag manual |
| CCXXIV | Registro de violência/violação completo | ✅ | Já implementado |
| CCXXV | Encaminhamento entre unidades/profissionais | ✅ | Já implementado |
| CCXXVI | Cadastro de pessoa desconhecida/sem documento | ❌ | Flag no modelo Person |
| CCXXVII | Controle MSE com PSC e LA | ✅ | Já implementado no PIA |
| CCXXVIII | Atalho para benefícios na tela inicial | 🟡 | Botão de acesso rápido |
| CCXXIX | Controle de entrega não automática | ❌ | Configuração no `BenefitType` |
| CCXXX | Programação personalizada de entregas recorrentes | ❌ | Ver Fase 3.9 |

### Entregáveis

- [ ] Modelo `AtendimentoEncaminhamento` (M:N)
- [ ] Modelo `AbordagemRua`
- [ ] Campos adicionais em `Attendance` (anonimo, recusado, motivo_recusa, membros_atendidos)
- [ ] Expansão de `ConcessaoBeneficio` (quantidade_requisitada, quantidade_autorizada, origem, destino)
- [ ] Expansão de `PIA` (horas_totais, horas_mensais, horas_cumpridas, horas_restantes)
- [ ] Detecção automática de reincidência (MSE, violência, acolhimento)
- [ ] Modal inline para agendamento e benefícios na recepção
- [ ] Upload inline de anexos no atendimento
- [ ] Tela de abordagem de rua
- [ ] Validação de vagas SCFV na indicação
- [ ] Frontend: multiselect de membros da família no atendimento

---

## Fase 3.9 — Benefícios (Complementos)

**Prioridade:** Média  
**Dependências:** Fase 3.4 (programas sociais), Fase 3.8 (atendimento)  
**Estimativa:** 6 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCXXX | Programação personalizada de entregas recorrentes | ❌ | Calendário de entregas por família |
| CCXXXI | Vinculação de participantes via grupos pré-definidos | ❌ | Associar grupo SCFV a benefício |
| CCXXXII | Configurar se benefício é auto-autorizado | ❌ | Campo `auto_autorizar` em `BenefitType` |
| CCXXXIII | Programação automática de recorrências | ❌ | Engine de geração de entregas futuras |
| CCXXXIV | Movimentação individual de cada entrega programada | ❌ | Cada entrega como registro independente |
| CCXXXV | Benefícios coletivos com cidadãos e profissionais | ❌ | Modelo `BeneficioColetivo` |
| CCXXXVI | Alerta de entrega periódica (pendência individual) | ❌ | Notificação no dashboard |
| CCXXXVII | Cadastro completo de benefícios (descrição, tipo, inativar) | 🟡 | Expandir `BenefitType` |
| CCXXXVIII | Atalho para aceitação de indicação SCFV | ❌ | Botão na tela inicial |
| CCXXXIX | Histórico de movimentações de benefícios | ✅ | Já implementado |
| CCXL | Cadastro para benefícios periódicos/recorrentes | ❌ | Flag `recorrente` + config de periodicidade |
| CCXLI | Configuração de recorrência (periodicidade, início, fim) | ❌ | Campos no modelo |

### Entregáveis

- [ ] Expansão de `BenefitType`: `auto_autorizar`, `recorrente`, `periodicidade`, `entrega_automatica`
- [ ] Modelo `BeneficioRecorrente` (benefit_type_id, family_id, data_inicio, data_fim, periodicidade, quantidade)
- [ ] Modelo `EntregaProgramada` (beneficio_recorrente_id, data_prevista, data_entrega, status, profissional_id)
- [ ] Modelo `BeneficioColetivo` (benefit_type_id, data, participantes[], profissionais[])
- [ ] Engine de programação automática (Celery beat diário)
- [ ] UI: calendário de entregas programadas
- [ ] UI: tela de benefício coletivo
- [ ] Notificações de entrega pendente

---

## Fase 3.10 — Acolhimento (CCXLIII-CCLIII)

**Prioridade:** Média  
**Dependências:** Fase 3.4 (instituições, motivos)  
**Estimativa:** 5 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCXLIII | Encerramento com motivo, situação, data, detalhamento | ❌ | Modelo `Acolhimento` com campos de encerramento |
| CCXLIV | Acolhimento institucional (crianças, adultos, idosos, mulheres) | ❌ | Tipo `INSTITUCIONAL` com público |
| CCXLV | Reincidência automática e manual | ❌ | Detecção de acolhimentos anteriores |
| CCXLVI | Acolhimento mulheres vítimas de violência | ❌ | Subtipo com dados do agressor |
| CCXLVII | Acolhimento pernoite | ❌ | Tipo `PERNOITE` |
| CCXLVIII | Acolhimento república (idosos, adultos, jovens) | ❌ | Tipo `REPUBLICA` |
| CCXLIX | Vinculação de participantes por grupos | ❌ | Associar grupo SCFV |
| CCL | Controle de vagas por tipo com notificação | ❌ | Tabela de vagas por unidade/tipo |
| CCLI | Acolhimento família acolhedora | ❌ | Tipo `FAMILIA_ACOLHEDORA` |
| CCLII | Motivo da reincidência | ❌ | Campo `motivo_reincidencia` |
| CCLIII | Acolhimento em calamidades públicas | ❌ | Tipo `CALAMIDADE` |

### Entregáveis

- [ ] Modelo `Acolhimento` unificado com discriminador `tipo` (INSTITUCIONAL, PERNOITE, REPUBLICA, FAMILIA_ACOLHEDORA, CALAMIDADE)
- [ ] Subtipos por público (criança/adolescente, adulto/família, idoso, mulher_vítima, jovem_deficiente)
- [ ] Campos específicos por tipo (dados_agressor para mulher_vítima, etc.)
- [ ] Modelo `VagaAcolhimento` (unidade_id, tipo, total, ocupadas)
- [ ] Detecção de reincidência
- [ ] Endpoints CRUD + encerramento
- [ ] Frontend: tela de acolhimentos com filtros por tipo/situação
- [ ] Frontend: formulário de acolhimento contextual por tipo

---

## Fase 3.11 — Estoque Completo (CLII-CLXXXIV)

**Prioridade:** Média  
**Dependências:** Fase 3.4 (operações de estoque, grupos de insumos, unidades de medida)  
**Estimativa:** 12 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CLII | Controle por privilégio de acesso | ❌ | Nova capability `estoque.gerir` |
| CLIII | Transferências automáticas ou com confirmação | ❌ | Configuração por tenant |
| CLIV | Unidades de medida fracionadas ou não | ❌ | Campo `permite_fracionado` na tabela de unidade |
| CLV | Saldo dos insumos por local | 🟡 | Expandir `EstoqueUnidade` |
| CLVI | Visualizar local que fez requisição | ❌ | Campo `unidade_solicitante` |
| CLVII | Entrada por compras, doações, transferências | 🟡 | Expandir tipos de movimentação |
| CLVIII | Controle por insumo (medida, grupo, fabricante) | ❌ | Modelo `Insumo` |
| CLIX | Parametrizar se local aceita requisição | ❌ | Campo no modelo de local de estoque |
| CLX | Devolução de insumos não aceitos | ❌ | Tipo de movimentação `DEVOLUCAO` |
| CLXI | Lote e data de vencimento na entrada | ❌ | Campos `lote`, `data_validade` |
| CLXII | Visualização de solicitações pendentes | ❌ | Tela de pendências |
| CLXIII | Consistência de saldo para saída/transferência | ✅ | Já implementado |
| CLXIV | Controle de movimentação por privilégio | ❌ | Integrar com capability |
| CLXV | Múltiplos locais de estoque por unidade | ❌ | Modelo `LocalEstoque` |
| CLXVI | Soma total dos itens de entrada | ❌ | Totais na tela |
| CLXVII | Parametrizar visibilidade de saldos nas requisições | ❌ | Configuração |
| CLXVIII | Movimentação unificada em tela única | ❌ | Tela única com abas por tipo |
| CLXIX | Parametrização de controle por lote/validade | ❌ | Campo no `Insumo` |
| CLXX | Transferência com local de destino | ❌ | Campo `local_destino_id` |
| CLXXI | Observações na movimentação | ❌ | Campo `observacao` |
| CLXXII | Fornecedor na entrada | ❌ | FK para `PessoaJuridica` |
| CLXXIII | Múltiplos insumos na mesma movimentação | ❌ | Modelo `MovimentacaoItem` |
| CLXXIV | Filtro por tipo de movimentação | ❌ | Filtros na tela |
| CLXXV | Cadastro de operações de estoque | ❌ | Usar tabela da Fase 3.4 |
| CLXXVI | Vínculo insumos com benefícios sociais | ❌ | FK no `BenefitType` |
| CLXXVII | Saída automática ao conceder benefício | ❌ | Hook no fluxo de concessão |
| CLXXVIII | Controle de quantidades por benefício | ❌ | Relatório de saldo por benefício |
| CLXXIX | Devolução de insumos de transferência | ❌ | Tipo `DEVOLUCAO_TRANSFERENCIA` |
| CLXXX | Relatório de devoluções | ❌ | PDF/CSV |
| CLXXXI | Relatório de requisições | ❌ | PDF/CSV |
| CLXXXII | Relatório de transferências | ❌ | PDF/CSV |
| CLXXXIII | Relatório de entradas (insumos, valores, quantidades) | ❌ | PDF/CSV |
| CLXXXIV | Relatório de saídas (insumos, valores, quantidades) | ❌ | PDF/CSV |

### Entregáveis

- [ ] Modelo `Insumo` (descricao, grupo_insumo_id, unidade_medida_id, fabricante, controla_lote, controla_validade, ativo)
- [ ] Modelo `LocalEstoque` (unidade_id, descricao, aceita_requisicao, ativo)
- [ ] Modelo `MovimentacaoEstoque` (tipo, local_origem_id, local_destino_id, fornecedor_id, data, observacao, status)
- [ ] Modelo `MovimentacaoItem` (movimentacao_id, insumo_id, lote, data_validade, quantidade, valor_unitario)
- [ ] Expansão de `EstoqueUnidade`: FK para `Insumo`, `LocalEstoque`
- [ ] APIs CRUD completas + relatórios
- [ ] Frontend: tela única de movimentação com abas (Entrada/Saída/Transferência/Requisição)
- [ ] Frontend: tela de saldos por local
- [ ] Frontend: tela de pendências (requisições aguardando)
- [ ] Relatórios PDF

---

## Fase 3.12 — RMA (Complementos CCXCVII-CCCVII)

**Prioridade:** Baixa  
**Dependências:** Nenhuma  
**Estimativa:** 3 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCXCVII | Ajuda por campo no formulário CRAS | ❌ | Tooltip com descrição da origem do dado |
| CCXCVIII | Exportação XML CREAS | ❌ | Formatar RMA em XML conforme padrão MDS |
| CCXCIX | Geração automática CREAS | ✅ | Já implementado |
| CCC | Filtro por unidade, mês, ano | ✅ | Já implementado |
| CCCI | Ajuda por campo no formulário Centro POP | ❌ | Idem CCXCVII |
| CCCII | Emissão XML CRAS | ❌ | Idem CCXCVIII |
| CCCIII | Geração automática CRAS | ✅ | Já implementado |
| CCCIV | Filtro unidade, mês, ano CRAS | ✅ | Já implementado |
| CCCV | Ajuda por campo no formulário CREAS | ❌ | Idem CCXCVII |
| CCCVI | Geração automática Centro POP | ✅ | Já implementado |
| CCCVII | Configuração de ajustes manuais | ✅ | Já implementado (RmaAjuste) |

### Entregáveis

- [ ] XML export para CRAS, CREAS, Centro POP (schema MDS)
- [ ] Tooltips de ajuda contextual por campo do RMA
- [ ] Documentação dos campos no `rmaModelo.ts`

---

## Fase 3.13 — Certificação Digital (CCCVIII-CCCXVII)

**Prioridade:** Alta  
**Dependências:** Módulo Signer do DOE (reutilizar)  
**Estimativa:** 10 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCCVIII | Somente certificados dentro da validade | ❌ | Validação de `not_before`/`not_after` |
| CCCIX | Confirmação com informações do certificado | ❌ | Modal com dados do certificado |
| CCCX | Configuração de documentos assináveis | ❌ | Tabela de configuração |
| CCCXI | Assinatura ICP-Brasil (token, smart card, A1/A3) | ❌ | Integrar com Signer (PKCS#11) |
| CCCXII | Alerta de documentos não assinados | ❌ | Notificação/contador no dashboard |
| CCCXIII | Visualização do documento antes da assinatura | ❌ | Preview PDF |
| CCCXIV | Assinatura no atendimento ou posterior | ❌ | Tela de pendentes |
| CCCXV | Formatos p7s ou PDF (PAdES) | ❌ | Suporte a ambos |
| CCCXVI | Consulta de documentos pendentes/assinados | ❌ | Tela com filtros por período |
| CCCXVII | Banco de dados separado para assinaturas | ❌ | Database/schema `govsocial_signer` |

### Estratégia

Reutilizar o serviço **Signer** do módulo DOE (`/apps/signer/`) que já implementa:
- Strategy Pattern para A1 (arquivo), A3 (token PKCS#11), HSM, Cloud
- Assinatura PAdES (PDF)
- Verificação de integridade

Adaptar para o GovSocial adicionando:
- Endpoints específicos no Signer para documentos de atendimento
- Modelo `DocumentoAssinatura` no GovSocial
- UI de gerenciamento de assinaturas

### Entregáveis

- [ ] Expansão do Signer com endpoints para GovSocial
- [ ] Modelo `DocumentoAssinatura` (atendimento_id, tipo_documento, hash, status, certificado_info)
- [ ] Tabela `documentos_assinaveis` (configuração de tipos)
- [ ] Modal de confirmação de assinatura (dados do certificado)
- [ ] Preview de documento antes de assinar
- [ ] Tela "Certificados Pendentes"
- [ ] Filtro por período na consulta
- [ ] Database `govsocial_signer` separado
- [ ] Alerta de documentos não assinados no dashboard

---

## Fase 3.14 — Teleatendimento (CCCXVIII-CCCXXVIII)

**Prioridade:** Média  
**Dependências:** Fase 3.1 (autenticação), Fase 3.8 (atendimento)  
**Estimativa:** 12 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCCXVIII | Áudio e vídeo dentro do sistema | ❌ | WebRTC via servidor STUN/TURN |
| CCCXIX | Visualização rápida de dados de contato | ❌ | Sidebar com dados da pessoa |
| CCCXX | Configuração de dispositivos de áudio/vídeo | ❌ | Tela de preflight |
| CCCXXI | Link único com código de acesso por atendimento | ❌ | Sala WebRTC com token JWT |
| CCCXXII | Registro simultâneo sem trocar de aba | ❌ | Layout split-screen (vídeo + formulário) |
| CCCXXIII | Configuração prévia para profissional e pessoa | ❌ | Preflight para ambos |
| CCCXXIV | Link individualizado após cada chamada | ❌ | Rotação de token |
| CCCXXV | Interface responsiva para a pessoa atendida | ❌ | Página pública mobile-first |
| CCCXXVI | Configuração de permissão para teleatendimento | ❌ | Nova capability `teleatendimento.realizar` |
| CCCXXVII | Termo de aceitação para a pessoa | ❌ | Modal de consentimento |
| CCCXXVIII | Comunicação bidirecional profissional-pessoa | ❌ | WebRTC peer-to-peer |

### Entregáveis

- [ ] Servidor STUN/TURN (coturn) no docker-compose
- [ ] Serviço de sinalização WebRTC (WebSocket no FastAPI)
- [ ] Modelo `Teleatendimento` (sala_id, link, codigo_acesso, status, profissional_id, person_id)
- [ ] Geração de link único por sessão
- [ ] Tela de preflight (seleção de câmera/microfone)
- [ ] Layout split-screen: vídeo + formulário de atendimento
- [ ] Página pública para a pessoa atendida (responsiva)
- [ ] Termo de aceitação (LGPD)
- [ ] Nova capability `teleatendimento.realizar`

---

## Fase 3.15 — Unificações (Complementos CCCXLVI-CCCLI)

**Prioridade:** Baixa  
**Dependências:** Nenhuma  
**Estimativa:** 3 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCCXLVI | Unificação com comparação visual | 🟡 | Expandir UI existente |
| CCCXLVII | Histórico de unificações com filtros | ❌ | Modelo `UnificacaoLog` |
| CCCXLVIII | Unificar: parentesco, estado civil, orientação sexual, etc. | ❌ | Telas de unificação por entidade |
| CCCXLIX | Unificação de pessoas com transferência de relações | ✅ | Já implementado (`merge_persons`) |
| CCCL | Unificação de famílias | ❌ | Função `merge_families()` |
| CCCLI | Pesquisa de duplicados por critérios | ❌ | Algoritmo de similaridade (Levenshtein, CPF, NIS) |

### Entregáveis

- [ ] Modelo `UnificacaoLog` (tabela, registro_mantido, registros_excluidos, profissional_id, data)
- [ ] `merge_families()` — transferir membros, atendimentos, benefícios, etc.
- [ ] Unificação para entidades de domínio (parentesco, estado civil, etc.)
- [ ] Detector de duplicados por similaridade de nome + CPF/NIS
- [ ] Tela de histórico de unificações com filtros

---

## Fase 3.16 — Importações (Complementos CCCLII-CCCLXX)

**Prioridade:** Baixa  
**Dependências:** Nenhuma  
**Estimativa:** 3 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCCLII | Importação CADÚNICO | ✅ | Já implementado |
| CCCLIII | Verificação de resultado com filtros | 🟡 | Melhorar UI de resultado |
| CCCLIV | Separação importados/não importados | 🟡 | Expandir tela de resultado |
| CCCLV | Detalhamento do motivo de falha com link | ❌ | Coluna "Motivo" + link para cadastro |
| CCCLVI | Importação SICON | ✅ | Já implementado |
| CCCLVII | Verificação folha de pagamento Auxílio Brasil | 🟡 | Expandir resultado |
| CCCLVIII | Visualização do motivo de falha | ❌ | Detalhar erros de parsing |
| CCCLIX | Consulta de descumprimento SICON | ✅ | Já implementado |
| CCCLX | Importação folha de pagamento Bolsa Família | 🟡 | Expandir parser |
| CCCLXI | Motivo de não importação individual | ❌ | Log detalhado por registro |
| CCCLXII | Detalhes do recebimento (critério, valor, membro) | ❌ | Expandir `SibecData` |
| CCCLXIII | Importação SIBEC | ✅ | Já implementado |
| CCCLXIV | Verificação resultado BPC | 🟡 | Expandir resultado |
| CCCLXV | Detalhamento do benefício (número, tipo, situação) | ❌ | Expandir `BpcData` |
| CCCLXVI | Importação CECAD periódica | ✅ | Já implementado |
| CCCLXVII | Progresso da importação CECAD | ❌ | Barra de progresso / job status |
| CCCLXVIII | Separação importados/não importados CECAD | 🟡 | Expandir resultado |
| CCCLXIX | Filtros na verificação CECAD | 🟡 | Expandir filtros |
| CCCLXX | Detalhamento com vínculo ao cadastro | 🟡 | Link para família |

### Entregáveis

- [ ] Expansão da tela `ImportarDados` com abas detalhadas de resultado
- [ ] Coluna "Motivo da falha" em cada grid de resultado
- [ ] Barra de progresso para importações longas (SSE)
- [ ] Detalhamento expandido para SIBEC, BPC, folha de pagamento
- [ ] Log de erros por registro com link para correção

---

## Fase 3.17 — Relatórios Customizáveis (CCCLXXI-CCCLXXXIII)

**Prioridade:** Alta  
**Dependências:** Fase 3.4 (cadastros gerais como fontes de dados)  
**Estimativa:** 12 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CCCLXXI | Cálculos configuráveis (contagem, soma, expressões) | ❌ | Engine de expressões |
| CCCLXXII | Rótulos para facilitar localização | ❌ | Campo `tags` no relatório |
| CCCLXXIII | Ordenação multidirecional por várias colunas | ❌ | Config de ordenação |
| CCCLXXIV | Permissões de acesso por usuário/grupo | ❌ | FK para perfis |
| CCCLXXV | Configuração de relatórios sem atualização do sistema | ❌ | Construtor visual |
| CCCLXXVI | Salvar configurações como preferências | ❌ | Persistir estado do construtor |
| CCCLXXVII | Configurar campos exibidos das tabelas | ❌ | Seletor de colunas |
| CCCLXXVIII | Configurar impressão (orientação, tamanho, margens, zebrado) | ❌ | Opções de layout |
| CCCLXXIX | Configurar filtros dos registros | ❌ | Construtor de filtros |
| CCCLXXX | Personalizar filtros (descrição, obrigatório, tipo, fixo) | ❌ | Config detalhada de cada filtro |
| CCCLXXXI | Cópia de configurações de relatório | ❌ | Botão "Duplicar" |
| CCCLXXXII | Agrupamentos com porcentagem e totais | ❌ | Config de agrupamento |
| CCCLXXXIII | Agrupamentos com base nos campos das tabelas | ❌ | Integrado ao CCCLXXXII |

### Estratégia

Criar um construtor visual de relatórios que funciona como um "BI embutido":

1. **Fonte de dados**: selecionar tabelas e joins do dicionário de dados
2. **Colunas**: selecionar quais campos exibir
3. **Filtros**: definir filtros com tipo (texto, data, select), obrigatoriedade, valor padrão
4. **Agrupamentos**: definir níveis de agrupamento com subtotais e porcentagens
5. **Ordenação**: múltiplas colunas asc/desc
6. **Layout**: orientação, tamanho de papel, margens, zebrado
7. **Permissões**: quem pode visualizar/editar

### Entregáveis

- [ ] Modelo `RelatorioConfig` (tenant_id, nome, descricao, tags[], configuracao JSONB, permissoes)
- [ ] Modelo `RelatorioFiltro` incorporado no JSONB de configuração
- [ ] Dicionário de dados (mapeamento tabela → campos → labels)
- [ ] Engine de renderização: SQL → dados → agrupamento → PDF/HTML/CSV
- [ ] Frontend: construtor visual com drag-and-drop de campos
- [ ] Frontend: visualizador de relatório com filtros dinâmicos
- [ ] Exportação PDF, HTML, CSV, Excel
- [ ] Cópia de configuração
- [ ] Preferências salvas por usuário

---

## Fase 3.18 — Gerador de Relatórios/Documentos (Complementos CDXI-CDXXIII)

**Prioridade:** Média  
**Dependências:** Fase 3.17 (grande parte compartilha infra)  
**Estimativa:** 5 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CDXI | Criação de fontes de dados via SQL ou assistente | ✅ | Já implementado (`ExportadorDado`) |
| CDXII | Organização em grupos com ícones | 🟡 | Expandir modelo com grupo + ícone |
| CDXIII | SQL digitado com permissões | ✅ | Já implementado |
| CDXIV | Inativar, validar SQL, prévia, cópia | 🟡 | Expandir funcionalidades |
| CDXV | Selecionar campos disponíveis para filtro | ❌ | Parse do SQL para extrair colunas |
| CDXVI | Assistente de criação por tela | ❌ | Construtor visual de fonte de dados |
| CDXVII | Carregar tabelas/campos do dicionário | ❌ | Integrar com dicionário da Fase 3.17 |
| CDXVIII | Campos para filtro, agrupamento, detalhe, ordenação | ❌ | Assistente passo-a-passo |
| CDXIX | Configuração de layout do documento | ❌ | Template HTML/WYSIWYG |
| CDXX | Grupo de relatórios compartilhados | ❌ | Aba "Compartilhados" |
| CDXXI | Exclusão, consulta de data de criação/alteração | 🟡 | Expandir metadados |
| CDXXII | Formatos: PDF, HTML, Imagem, CSV, Texto, Word, Excel | 🟡 | Expandir renderers |
| CDXXIII | Impressão zebrada, retrato/paisagem | ❌ | Opções de layout |

### Entregáveis

- [ ] Expansão do `ExportadorDado`: grupos, ícones, validação SQL, prévia
- [ ] Assistente visual de criação de fonte de dados
- [ ] Dicionário de dados integrado
- [ ] Template de layout configurável (HTML/CSS)
- [ ] Renderers: PDF (WeasyPrint), Excel (openpyxl), Word (python-docx), Imagem (html2image)
- [ ] Configurações de impressão (zebrado, orientação)
- [ ] Compartilhamento de relatórios entre usuários

---

## Fase 3.19 — Notificações Intersetoriais (CDXXIV-CDXXVIII)

**Prioridade:** Média  
**Dependências:** Fase 3.4 (especialidades, unidades)  
**Estimativa:** 3 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CDXXIV | Cadastro de notificação intersetorial | ❌ | Modelo `NotificacaoIntersetorial` |
| CDXXV | API de consulta para integração externa | ❌ | Endpoint público com autenticação |
| CDXXVI | Histórico de notificações por atendimento | ❌ | Aba no histórico da pessoa |
| CDXXVII | Configurar como dado sensível por especialidade/unidade | ❌ | Integrar com sigilo |
| CDXXVIII | Múltiplas notificações por atendimento | ❌ | 1:N atendimento → notificações |

### Entregáveis

- [ ] Modelo `NotificacaoIntersetorial` (atendimento_id, descricao, acoes_realizadas, area_origem, area_destino, sensivel, especialidades_permitidas[], unidades_permitidas[])
- [ ] Endpoints CRUD
- [ ] `GET /api/publico/notificacoes-intersetoriais` (API externa com API key)
- [ ] Aba no histórico da pessoa
- [ ] Integração com `CartaoSigiloso`

---

## Fase 3.20 — Revelação Espontânea (CDXXIX-CDXXXIII)

**Prioridade:** Média  
**Dependências:** Fase 3.4 (especialidades, unidades)  
**Estimativa:** 3 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CDXXIX | Registro conforme Lei 13.431/2017 | ❌ | Modelo `RevelacaoEspontanea` |
| CDXXX | Encaminhamentos realizados e áreas | ❌ | Campos no modelo |
| CDXXXI | Configuração de visualização por profissional | ❌ | Permissões granulares |
| CDXXXII | Modelo de documento para encaminhamento | ❌ | Template de impressão |
| CDXXXIII | API de consulta para integração | ❌ | Endpoint público |

### Entregáveis

- [ ] Modelo `RevelacaoEspontanea` (profissional_id, unidade_id, data_hora, vitima_id, matriculada_ensino, suposto_indicador_violencia, vinculo_suposto_autor, encaminhamentos[], observacoes)
- [ ] Modelo de documento (template WeasyPrint)
- [ ] Configuração de permissão de visualização
- [ ] `GET /api/publico/revelacoes-espontaneas` (API externa)
- [ ] Aba no histórico da pessoa

---

## Fase 3.21 — Acompanhamento pela Rede de Proteção (CDXXXIV-CDXXXVII)

**Prioridade:** Média  
**Dependências:** Fase 3.19, Fase 3.20  
**Estimativa:** 2 dias

### Itens a implementar

| ID | Requisito | Status Atual | Ação |
|---|---|---|---|
| CDXXXIV | Inclusão e inativação no acompanhamento | ❌ | Modelo `AcompanhamentoRedeProtecao` |
| CDXXXV | Visível durante atendimentos/recepções | ❌ | Banner/indicador |
| CDXXXVI | Histórico do acompanhamento | ❌ | Aba no histórico |
| CDXXXVII | API de consulta e envio | ❌ | Endpoints públicos |

### Entregáveis

- [ ] Modelo `AcompanhamentoRedeProtecao` (person_id/family_id, data_inicio, data_fim, motivo, observacoes, ativo)
- [ ] Banner de alerta no atendimento: "Pessoa em acompanhamento pela Rede de Proteção"
- [ ] Aba no histórico da pessoa
- [ ] `GET/POST /api/publico/acompanhamentos-rede-protecao` (API externa)

---

## Cronograma Estimado

| Fase | Descrição | Dias | Dependências |
|---|---|---|---|
| 3.1 | Segurança e Autenticação | 5 | — |
| 3.2 | Interface e UX | 4 | — |
| 3.3 | Chat Online | 8 | 3.1 |
| 3.4 | Cadastros Gerais (44 tabelas) | 12 | — |
| 3.5 | Agenda e Agendamento | 6 | 3.4 |
| 3.6 | IVS | 6 | 3.4 |
| 3.7 | Mapas Temáticos | 10 | 3.6 |
| 3.8 | Atendimento (complementos) | 10 | 3.4, 3.6 |
| 3.9 | Benefícios (complementos) | 6 | 3.4, 3.8 |
| 3.10 | Acolhimento | 5 | 3.4 |
| 3.11 | Estoque Completo | 12 | 3.4 |
| 3.12 | RMA (complementos) | 3 | — |
| 3.13 | Certificação Digital | 10 | Signer DOE |
| 3.14 | Teleatendimento | 12 | 3.1, 3.8 |
| 3.15 | Unificações (complementos) | 3 | — |
| 3.16 | Importações (complementos) | 3 | — |
| 3.17 | Relatórios Customizáveis | 12 | 3.4 |
| 3.18 | Gerador Relatórios (complementos) | 5 | 3.17 |
| 3.19 | Notificações Intersetoriais | 3 | 3.4 |
| 3.20 | Revelação Espontânea | 3 | 3.4 |
| 3.21 | Rede de Proteção | 2 | 3.19, 3.20 |

**Total estimado:** ~140 dias úteis (considerando paralelismo possível: ~90-100 dias com 2 devs)

---

## Ordem Sugerida de Execução

```
3.1 (Segurança)  ─────────────────────┐
3.2 (UX)         ─────────────────────┤
3.4 (Cadastros)  ─────────────────────┤ (executar em paralelo)
                                       │
    └── 3.5 (Agenda) ─────────────────┤
    └── 3.6 (IVS) ────────────────────┤
    ├── 3.3 (Chat) ───────────────────┤
    ├── 3.10 (Acolhimento) ───────────┤
    ├── 3.11 (Estoque) ───────────────┤
    ├── 3.12 (RMA) ───────────────────┤
    ├── 3.15 (Unificações) ───────────┤
    ├── 3.16 (Importações) ───────────┤
    ├── 3.19 (Notif. Intersetoriais) ─┤
    ├── 3.20 (Revelação Espontânea) ──┤
    ├── 3.21 (Rede de Proteção) ──────┤
    │                                  │
    ├── 3.8 (Atendimento) ─────────────┤
    │   └── 3.9 (Benefícios) ──────────┤
    │   └── 3.14 (Teleatendimento) ────┤
    │                                  │
    ├── 3.7 (Mapas) ───────────────────┤
    ├── 3.13 (Certificação Digital) ───┤
    ├── 3.17 (Relatórios) ─────────────┤
    └── 3.18 (Gerador Relatórios) ─────┘
```

---

## Observações

### Arquitetura SaaS + Módulo

1. **Autenticação é sempre no SaaS:** O GovSocial NÃO tem login próprio. Todo acesso vem via SSO (`?token=`). Senha, lockout, recuperação e alteração de senha são implementados exclusivamente no SaaS (`/saas-platform/`).
2. **Papéis são gerenciados no SaaS:** `UserModuleGrant` define quais papéis SUAS cada usuário tem. O GovSocial apenas recebe via `/internal/sync-user` e armazena localmente como cache. Novos papéis devem ser adicionados em:
   - SaaS: `saas-platform/api/app/core/roles.py` → `MODULE_ROLE_CATALOG["govsocial"]`
   - GovSocial: `enums.py` → `RoleName`, `matrizPapeis.ts` → mapeamento papel → capabilities
3. **Configurações do tenant no SaaS:** Configurações globais ficam em `Organization.settings` (JSONB) no SaaS. O GovSocial lê essas configurações ao sincronizar.

### Padrões de Código

4. **Todos os modelos devem seguir o padrão multi-tenant:** `tenant_id` em todas as tabelas, índices compostos iniciando com `tenant_id`, filtro automático via `saas_platform_db` session.
5. **Auditoria:** todas as operações CRUD devem gerar registros em `audit_trail`.
6. **RBAC local:** novas capabilities devem ser mapeadas na matriz de papéis (`matrizPapeis.ts`) e cada papel deve receber as capabilities apropriadas.
7. **Seeds:** dados nacionais (CBO, países, UFs, etc.) devem ser carregados como seeds e copiados por tenant no onboarding.
8. **Testes:** cada fase deve incluir testes unitários (pytest/vitest) e E2E (Playwright) para os fluxos críticos.
9. **Migrações:** usar Alembic para todas as alterações de schema no Python; migrations SQL puras se necessário.
10. **API externa:** endpoints públicos devem ter autenticação via API key (padrão `X-Api-Key` header).

### Fluxo de Desenvolvimento

11. **Para features que exigem novos papéis/capabilities:**
    - Primeiro adicionar no SaaS (`MODULE_ROLE_CATALOG`)
    - Depois adicionar no GovSocial (`RoleName` enum + `matrizPapeis.ts`)
    - Por último implementar a feature usando `<Permitido capability="...">` no frontend e `check_permission()` no backend
12. **Para features que precisam de configuração do tenant:**
    - Se for configuração global do módulo → `Organization.settings` no SaaS
    - Se for configuração interna do SUAS → tabela própria no GovSocial
13. **Notificações:** notificações in-app usam o modelo `Notificacao` já existente no GovSocial.
