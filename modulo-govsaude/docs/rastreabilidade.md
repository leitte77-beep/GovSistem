# Rastreabilidade — GovSaúde

Atualizado em 2026-10-26 (Fases 0, 1, 2 e 4). Toda funcionalidade existe por um requisito
`B.x-nnn`. Este arquivo é a matriz oficial `requisito → endpoints → testes → status`.

## Fase 0 — fundação

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.12-023 | Termo de uso versionado, aceite/recusa com IP e user-agent, recusa bloqueia acesso | `GET /auth/termos`, `POST /auth/termos`, `POST /auth/termos/aceitar` | `test_auth_tenant_rbac.py::test_termo_obrigatorio_aceite_e_recusa`, `::test_recusa_de_termo_bloqueia_usuario` | IMPLEMENTADO |
| B.12-048 | Auditoria append-only com antes/depois, diff mascarado, leitura sensível, quebra de sigilo e filtros | `GET /auditoria`, `GET /auditoria/{id}`; escrita via `services/auditoria.py` | `test_auditoria.py` (4), `test_postgres_auditoria.py` | IMPLEMENTADO |
| B.12-049 | Política de senha configurável, expiração, histórico (campo), bloqueio por tentativas, MFA TOTP, janela de horário e encerramento por inatividade | `POST /auth/login`, `POST /auth/alterar-senha`, `POST /auth/mfa/*` | `test_auth_tenant_rbac.py::test_login_local_e_bloqueio`, `test_criptografia.py::test_bcrypt_custo_12` | IMPLEMENTADO (histórico persistido em `historico_senhas` e aplicado na troca) |
| B.12-050 | Sessão revogável (`token_version`), logout, escopo por estabelecimento/equipe/especialidade | `POST /auth/logout`, `POST /usuarios/{id}/revogar-sessoes`, `GET /auth/me` | `test_auth_tenant_rbac.py` (escopo), `test_usuarios_idempotencia.py` | IMPLEMENTADO |
| B.12-051 | Senha com bcrypt custo 12 | `POST /auth/login`, `POST /auth/alterar-senha` | `test_criptografia.py::test_bcrypt_custo_12` | IMPLEMENTADO |
| B.12-052 | Login local por CPF, e-mail ou nome de acesso, com fallback ao SSO | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` | `test_auth_tenant_rbac.py::test_login_local_e_bloqueio` | IMPLEMENTADO |
| B.12-053 | Biometria nunca como único fator; autenticação por SSO/senha + MFA opcional | `POST /auth/login`, `POST /auth/mfa/confirmar` | `test_auth_tenant_rbac.py` | IMPLEMENTADO (não existe fator biométrico obrigatório) |
| B.12-054 | Lista branca de extensões/MIME, magic number, limite de tamanho e porta ClamAV | `app/core/antivirus.py`; sem rota de upload de negócio na Fase 0 | `test_anexos.py` | IMPLEMENTADO (a rota de upload por domínio entra na fase do domínio) |
| B.12-056 | Unicidade parcial por tenant para CPF, CNS, e-mail, nome de acesso e CNES | constraints e índices em `models/nucleo.py` | `test_usuarios_idempotencia.py::test_cpf_duplicado_por_tenant_rejeitado` | IMPLEMENTADO |
| B.12-057 | Endpoint de versão e notas de release | `GET /sistema/versao` | `test_auth_tenant_rbac.py::test_health_e_versao_publicos` | IMPLEMENTADO |

## Infraestrutura transversal (seções 3–9)

| Item | Evidência | Status |
|---|---|---|
| Multi-tenant fail-closed e cross-tenant 404 | `core/auth.py:get_tenant_id`, filtros em todos os serviços; `test_cross_tenant_retorna_404` | IMPLEMENTADO |
| SSO `module_access` + sync interno | `core/auth.py`, `POST /internal/sync-*`; `test_internal_sync.py`, `test_module_access_sso_e_rejeicao_de_modulo` | IMPLEMENTADO |
| Problem Details RFC 9457 | `core/errors.py`; todos os testes negativos verificam `application/problem+json` | IMPLEMENTADO |
| Criptografia de coluna + pseudonimização | `core/encryption.py`; `test_criptografia.py` | IMPLEMENTADO |
| Validadores BR (CPF, CNS, CNPJ alfanumérico, PIS, CEP, CNES, CBO, IBGE, SIGTAP, CID, CIAP, competência) | `core/br_validators.py`; `test_validadores.py` (98 casos) | IMPLEMENTADO |
| Fonética BuscaBR | `core/fonetica.py`; `test_fonetica.py` | IMPLEMENTADO |
| Outbox `integracao_envios` | `models/integracoes.py`, `tasks/integracoes.py`; worker não envia sem artefato oficial | IMPLEMENTADO (infra) |
| Jobs assíncronos | `models/nucleo.py:Job`, `api/v1/jobs.py` | IMPLEMENTADO |
| SSE base | `api/v1/tempo_real.py` | IMPLEMENTADO |
| Schema `referencia` + importadores | `models/referencia.py`, `scripts/importar_referencias.py`; dados oficiais pendentes | IMPLEMENTADO (estrutura) |
| Auditoria particionada + trigger PG | `alembic/versions/0001...`, teste `postgres` | IMPLEMENTADO |
| OpenAPI 3.1 + contrato | `openapi.json`, `test_openapi_contrato.py` | IMPLEMENTADO |

## Fase 1 — rede de atenção e cadastros-base

IDs confirmados na seção 12 do `PROMPT-BACKEND-GOVSAUDE.md`. O catálogo
original completo dos requisitos não está neste repositório; a atribuição
funcional abaixo é a leitura da descrição de escopo da Fase 1 e precisa de
validação humana no catálogo oficial (ver decisões no README/entrega).

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.12-006 | CRUD de estabelecimentos/setores/serviços/horários/equipes/profissionais, baixa lógica, vigência, CNPJ numérico/alfanumérico, IBGE/CEP, consórcio e entes | `/estabelecimentos`, `/estabelecimentos/{id}`, `.../setores`, `.../servicos`, `.../horarios`, `.../equipes`, `/equipes`, `/profissionais`, `/consorcios/entes` | `test_fase1_rede.py::test_b12_006_*` | IMPLEMENTADO |
| B.12-007 | Escopo por estabelecimento no RBAC: UBS A não acessa UBS B; recepção não altera cadastro clínico; criação de profissional exige unidade e cria o primeiro vínculo; vínculo encerrado deixa de conceder escopo | filtros e `exigir_acesso_estabelecimento` em todos os recursos da rede | `test_fase1_rede.py::test_b12_007_escopo_estabelecimento_rbac`, `test_b12_006_gestor_escopo_cria_e_acessa_profissional`, `test_b12_007_vinculo_encerrado_nao_conta_como_escopo` | IMPLEMENTADO |
| B.12-012 | Escalas e plantões, detecção de sobreposição com trava transacional, exceção auditada, horários de funcionamento e restrições de horário por usuário/grupo/estabelecimento aplicadas de fato | `/escalas`, `/plantoes`, `.../cancelar`, `/restricoes-horario` | `test_b12_012_escala_conflito_bloqueia`, `test_b12_012_plantao_conflito_bloqueia`, `test_b12_012_restricao_horario_por_grupo`, `test_b12_012_restricao_horario_dias_fora_da_janela_bloqueiam`, `test_b12_012_conflito_nao_vaza_turno_de_outra_unidade`, `test_b12_012_justificativa_antiga_nao_sobrevive_sem_conflito` | IMPLEMENTADO |
| B.12-016 | Procedimentos autorizados por estabelecimento/profissional/especialidade com vigência e validação SIGTAP; prioridades legal/clínica configuráveis lidas do banco | `/procedimentos-autorizados`, `/prioridades` | `test_b12_016_procedimento_autorizado_por_escopo`, `test_b12_031_prioridade_configuravel` | IMPLEMENTADO (SIGTAP oficial ausente => aviso, sem invenção) |
| B.1-011 | Vínculos profissionais/lotações e especialidades com histórico por vigência; fechar e abrir novo em vez de sobrescrever | `/profissionais/{id}/vinculos`, `/equipes/{id}/profissionais`, `/profissionais/{id}/especialidades` | `test_b1_011_vinculo_profissional_preserva_vigencia` | IMPLEMENTADO |
| B.1-010 | Importação CNES assíncrona (202 + job), idempotente, com relatório de inconsistências e conferência de totais; porta/adaptador por manifesto oficial | `POST /importacoes/cnes`, `GET /importacoes/cnes`, `GET /importacoes/cnes/{job_id}`, `GET /jobs/{id}` | `test_b1_010_importacao_cnes_relatorio_inconsistencias`, `test_b1_010_importacao_cnes_pendente_sem_layout`, contrato `xfail` | PENDENTE_ESPECIFICACAO_OFICIAL (layout/arquivo oficial CNES ausente; porta/adaptador/relatório implementados) |
| B.12-031 | Importação CNES com relatório por linha/campo/motivo/ação, rejeições sem inventar dados, idempotência por hash do arquivo | mesmos endpoints de B.1-010 | mesmos testes de B.1-010 | PENDENTE_ESPECIFICACAO_OFICIAL (idem motivo acima) |

### Observações de rastreabilidade da Fase 1

- Nenhuma prioridade legal fixa foi codificada: o seed cria apenas
  `ELETIVA`/`PRIORITARIA` marcadas como configuráveis e não legais.
- CBO/CNES/SIGTAP são validados estruturalmente e contra a base oficial
  **quando importada**; sem base, a resposta/relatório registra a pendência.
- Toda escrita gera auditoria com diff mascarado; leitura de profissional
  (CPF/CNS mascarados) gera `READ_SENSIVEL`.
- Baixa é lógica (`baixa_em`, `baixa_motivo`, `baixa_por_id`) e não há DELETE
  físico de recurso da rede.

## Fase 2 — cidadão (cadastro único)

IDs confirmados no `PROMPT-BACKEND-GOVSAUDE.md`. O catálogo original completo
não está no repositório; a atribuição funcional de B.1-004/B.1-006/B.12-008 é
inferida da descrição da fase e precisa de validação humana.

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.1-001 | CRUD do cidadão com baixa lógica/reativação, histórico de baixa, auditoria e isolamento de tenant | `/cidadaos`, `/cidadaos/{id}`, `.../baixar`, `.../reativar` | `test_fase2_cidadao.py::test_b1_001_*` | IMPLEMENTADO |
| B.1-002 | Foto do cidadão com política do tenant, magic number, lista branca, storage privado, principal e auditoria | `/cidadaos/{id}/fotos`, `.../{foto}/principal`, `.../{foto}/baixar`, `.../{foto}/conteudo` | `test_b1_002_e_b12_011_foto_politica_e_magic_number` | IMPLEMENTADO |
| B.1-004 | Documentos, contatos, endereços, planos, alergias e condições com baixa lógica e mascaramento | `/cidadaos/{id}/documentos`, `/contatos`, `/enderecos`, `/planos`, `/alergias`, `/condicoes` | `test_b1_004_documentos_contatos_enderecos_planos_alergias_condicoes` | IMPLEMENTADO |
| B.1-006 | Compatibilização CPF/CNS no mesmo cadastro, unicidade ativa e busca exata | `/cidadaos`, `POST /cidadaos/busca` | `test_b1_006_compatibilizacao_cpf_cns`, `test_b12_005_*` | IMPLEMENTADO |
| B.1-007 | Unificação com histórico, campos escolhidos e reversão | `POST /cidadaos/{id}/unificar`, `GET /cidadaos/{id}/unificacoes`, `POST /cidadaos/unificacoes/{id}/reverter` | `test_b1_007_e_b12_003_unificacao_e_reversao_preservam_historico` | IMPLEMENTADO |
| B.1-008 | Planos de saúde/vínculos assistenciais com carteira protegida, vigência e baixa | `/cidadaos/{id}/planos`, `.../{plano}/baixar` | `test_b1_008_plano_saude_vinculo_basico` | IMPLEMENTADO |
| B.1-009 | Recém-nascido a partir da mãe, com vínculo `mae_id` e nome da mãe | `POST /cidadaos/{id}/recem-nascido` | `test_b1_009_recem_nascido_a_partir_da_mae` | IMPLEMENTADO |
| B.12-001 | Deduplicação com pontuação/pesos configuráveis por tenant | `GET /cidadaos/{id}/duplicidades` | `test_b12_001_deduplicacao_configuravel_e_b12_002_decisao_humana` | IMPLEMENTADO |
| B.12-002 | Decisão humana da duplicidade (MESMO/DIFERENTE) com justificativa e auditoria | `POST /cidadaos/duplicidades/{id}/decidir` | idem | IMPLEMENTADO |
| B.12-003 | Unificação reversível com preservação dos dados anteriores do destino | `/unificar`, `/unificacoes/{id}/reverter` | `test_b1_007_e_b12_003_*` | IMPLEMENTADO |
| B.12-004 | Consulta CADSUS por CPF/CNS via porta/adaptador, sem scraping | `POST /cidadaos/consulta-cadsus` | `test_b12_004_e_b12_010_cadsus_pendente_e_compatibilizacao_local` | PENDENTE_ESPECIFICACAO_OFICIAL (contrato/credencial CADSUS) |
| B.12-005 | Busca fonética BuscaBR e busca exata por CPF/CNS sem identificador na URL | `POST /cidadaos/busca` | `test_b12_005_busca_fonetica_e_compatibilizacao_cpf_cns` | IMPLEMENTADO |
| B.12-008 | Documentos protegidos, mascarados e com RBAC específico | `/cidadaos/{id}/documentos` | `test_b12_008_documentos_protegidos_e_rbac` | IMPLEMENTADO (mapeamento inferido) |
| B.12-009 | Nome social com precedência de exibição e busca | `/cidadaos`, `POST /cidadaos/busca` | `test_b12_009_nome_social_precedencia_e_busca` | IMPLEMENTADO |
| B.12-010 | Compatibilização CADSUS/CPF/CNS com cadastro local | `POST /cidadaos/consulta-cadsus` | `test_b12_004_e_b12_010_*` | PENDENTE_ESPECIFICACAO_OFICIAL (CADSUS oficial) |
| B.12-011 | Foto com validação de magic number, política e auditoria de leitura | `/cidadaos/{id}/fotos` | `test_b1_002_e_b12_011_*` | IMPLEMENTADO |
| CEP | Consulta de CEP na base oficial importada; sem base fica pendente | `POST /cidadaos/consulta-cep` | `test_consulta_cep_pendente_sem_base_oficial` | PENDENTE_ESPECIFICACAO_OFICIAL (base de CEP) |

### Observações de rastreabilidade da Fase 2

- CPF/CNS são armazenados como hash HMAC + ciphertext + final mascarado; nunca
  aparecem em URL, log, cache ou nome de arquivo.
- A busca por nome/CPF/CNS é `POST` para não expor o termo na URL.
- Leitura de cidadão, documentos, contatos, endereços, planos, alergias,
  condições e fotos gera `READ_SENSIVEL`.
- A unificação mantém o registro de origem e os dados do destino anteriores
  para reversão; busca padrão exclui unificados.
- O CADSUS e a base de CEP não foram inventados: a porta/adaptador retorna
  `PENDENTE_ESPECIFICACAO_OFICIAL` quando o artefato/credencial não existe.

## Fase 4 — agenda, recepção, fila e painel

O catálogo completo dos requisitos não está no repositório. Os IDs abaixo foram
confirmados na descrição da Fase 4 do `PROMPT-BACKEND-GOVSAUDE.md`; a
distribuição funcional entre eles é **inferida** da descrição e precisa de
conferência humana no catálogo oficial do Lote 02.

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.6-001 | Agendas por estabelecimento/setor/profissional/especialidade, grade de horários, duração, vagas, vigência, faixa etária, sexos, procedimento SIGTAP, bloqueios e baixa lógica | `/agendas`, `.../{id}`, `.../disponibilidade`, `.../bloqueios`, `.../bloqueios/{id}/cancelar`, `.../baixar` | `test_fase4_agenda_fila.py::test_b6_001_b3_008_agenda_disponibilidade_e_if_match`, `test_b6_001_bloqueio_indisponibilidade_e_baixa_agenda`, `test_b6_001_b6_008_rbac_escopo_e_cross_tenant` | IMPLEMENTADO |
| B.6-002 | Agendamento com idempotência, concorrência otimista, confirmação, cancelamento, reagendamento, comprovante e alerta/bloqueio de incompatibilidade | `/agendamentos`, `.../{id}`, `.../confirmar`, `.../cancelar`, `.../reagendar`, `.../comprovante` | `test_b6_002_agendamento_capacidade_duplicidade_e_idempotencia`, `test_b6_002_incompatibilidade_bloqueia_e_excecao_justificada`, `test_b6_002_confirmar_reagendar_cancelar_e_comprovante` | IMPLEMENTADO (mapeamento inferido) |
| B.6-003 | Bloqueio de recepção de agendamento cancelado/vencido/faltoso/reagendado/atendido e de horário fora do dia; alertas de incompatibilidade | `POST /recepcao/check-in` | `test_b6_003_checkin_bloqueado_cancelado_e_codigo_invalido`, `test_b6_002_incompatibilidade_bloqueia_e_excecao_justificada` | IMPLEMENTADO (mapeamento inferido) |
| B.6-005 | Recepção por agendamento e demanda espontânea; código de barras, QR, cartão, identificação manual e porta de biometria opcional com alternativas obrigatórias | `POST /recepcao/check-in`, `/recepcao/demanda-espontanea`, `/recepcao/cartao` | `test_b6_005_checkin_codigo_demanda_espontanea_e_biometria_pendente` | IMPLEMENTADO; BIOMETRIA `PENDENTE_ESPECIFICACAO_OFICIAL` (sem provedor oficial) |
| B.6-007 | Protocolos de classificação de risco por unidade, níveis versionados, cores, ordem, tempo-alvo e prioridade legal configuráveis | `/protocolos-classificacao-risco`, `.../{id}` | `test_b6_007_b6_008_fila_ordenada_regra_exposta`, `test_b6_007_protocolo_atualizacao_com_if_match` | IMPLEMENTADO |
| B.6-008 | Fila ordenada por classificação, prioridade legal e tempo, com a regra de ordenação exposta na resposta e ranking por item | `GET /filas`, `/filas/{id}` | `test_b6_007_b6_008_fila_ordenada_regra_exposta`, `test_b6_001_b6_008_rbac_escopo_e_cross_tenant` | IMPLEMENTADO |
| B.6-012 | Chamada, rechamada, triagem, atendimento, finalização, evasão, cancelamento, eventos e tempos de recepção/triagem/espera/consulta | `/filas/{id}/chamar`, `/rechamar`, `/iniciar-triagem`, `/finalizar-triagem`, `/iniciar-atendimento`, `/finalizar`, `/evadir`, `/cancelar`, `/eventos` | `test_b6_012_tempos_triagem_consulta_e_transicoes` | IMPLEMENTADO |
| B.6-045 | Painel de chamada com nome abreviado, destino e texto para síntese de voz | `/paineis-chamada`, `/filas/{id}/chamar` | `test_b6_045_b6_047_painel_texto_voz_e_historico` | IMPLEMENTADO |
| B.6-046 | Painel com notícias/mensagens de rodapé e configuração por setor | `/paineis-chamada`, `/paineis-chamada/{id}`, `PATCH` | `test_b6_045_b6_047_painel_texto_voz_e_historico` | IMPLEMENTADO |
| B.6-047 | Histórico de chamadas e entrega de eventos de fila/painel em tempo real | `/paineis-chamada/{id}/estado`, `GET /tempo-real/filas` (SSE) | `test_b6_045_b6_047_painel_texto_voz_e_historico` | IMPLEMENTADO (SSE por Redis pub/sub) |
| B.3-008 | Agenda odontológica por procedimento SIGTAP, usando o mesmo motor de agenda/disponibilidade | `/agendas` (`tipo=ODONTOLOGIA`, `procedimento_sigtap`) | `test_b6_001_b3_008_agenda_disponibilidade_e_if_match` | IMPLEMENTADO (mapeamento inferido) |
| B.12-018 | Falta automática configurável por agenda, com reversão justificada e auditada; sem falta automática o registro vence | `POST /agendamentos/{id}/falta`, `/reverter-falta`; tarefa Celery `govsaude.marcar_faltas_automaticas` | `test_b12_018_falta_automatica_e_reversao_auditada` | IMPLEMENTADO |

### Observações de rastreabilidade da Fase 4

- A fila não fixa cores, níveis, tempos-alvo ou prioridade legal no Python:
  protocolos, níveis e prioridades são dados do tenant. O seed continua criando
  apenas prioridades configuráveis e não legais.
- A ordenação é determinística: `nivel_ordem` → prioridade legal/ordem →
  `entrada_em` → `id`. A resposta traz `regra_ordenacao` e `ordem_ranking`.
- O token de comprovante/cartão (`GS4-AGD-...`/`GS4-CID-...`) carrega apenas um
  UUID assinado por HMAC; não contém CPF, CNS ou nome.
- O `check-in` grava recepção e cria a fila na mesma transação; repetir o código
  devolve a mesma fila ativa.
- A biometria não foi inventada: a porta retorna
  `PENDENTE_ESPECIFICACAO_OFICIAL` e a API sempre devolve as alternativas
  obrigatórias.
- Leitura de agenda/agendamento/fila é auditada como `READ_SENSIVEL` quando
  expõe vínculo com o cidadão; escritas geram diff mascarado.
- A falha de envio SSE (Redis indisponível) não derruba a transação de negócio.

## Fase 3 — território e saúde da família

| Requisito | O que foi entregue | Endpoints | Status |
|---|---|---|---|
| B.1-012…030 | Áreas/microáreas GeoJSON, domicílios, famílias, composição e domicílio com vigência, animais configuráveis, visitas e GPS por política configurável | `/territorios`, `/territorios/domicilios`, `/territorios/familias`, `/territorios/visitas` | IMPLEMENTADO |
| B.1-042 | Cobertura territorial, domicílios sem visita, meta mensal configurável e GeoJSON sem dados pessoais | `/territorios/cobertura`, `/domicilios/nao-visitados`, `/metas`, `/mapa.geojson` | IMPLEMENTADO |
| B.12-024 | Extrato de família com membros e domicílios históricos | `/territorios/familias/{id}/extrato` | IMPLEMENTADO |

As políticas são dados de tenant: `territorio.gps` aceita modo
`OBRIGATORIO`/`RECOMENDADO` e precisão máxima; `territorio.visita_unica_turno`
aceita `ALERTAR`/`BLOQUEAR`; e `territorio.meta_visitas_mensal` é a meta do
dashboard. O GeoJSON é a porta de integração para geoprocessamento municipal e
expõe apenas a geometria e metadados do território, sem pessoa, família,
domicílio ou trajetos.

## Fase 5 — prontuário (PEC) ambulatorial

IDs da seção 12 e do item 5 da seção de modelo de dados do
`PROMPT-BACKEND-GOVSAUDE.md`; a associação por funcionalidade é **inferida**
(validar no catálogo do Lote 02). Regras em `app/services/prontuario.py`,
rotas em `app/api/v1/prontuarios.py`, migração `0009`. Testes em
`tests/test_fase5_prontuario.py` (8).

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.6-004 | Atendimento com etapas configuráveis (`prontuario.etapas`), avanço só para frente; SOAP cifrado em repouso | `POST /prontuarios/atendimentos`, `GET .../{id}`, `.../{id}/etapa`, `.../{id}/soap` (POST/GET) | `test_b6_004_006_etapas_e_campos_obrigatorios_configuraveis`, `test_b6_057_soap_cifrado_assinatura_e_retificacao` | IMPLEMENTADO |
| B.6-006 | Campos obrigatórios por tipo/unidade/sexo/idade (`prontuario.campos_obrigatorios`), checados no encerramento | `.../{id}/pendencias`, `.../{id}/encerrar` | `test_b6_004_006_...` | IMPLEMENTADO |
| B.6-010…012 | Sinais vitais, IMC calculado (peso/altura²) e classificação **só** por tabela versionada do tenant; série histórica com escopo/sigilo | `.../{id}/sinais-vitais`, `/cidadaos/{id}/sinais-vitais` | `test_b6_010_012_imc_classificado_apenas_por_tabela_do_tenant` | IMPLEMENTADO (tabelas oficiais pendentes) |
| B.6-013, B.6-018, B.6-023, B.6-025, B.6-032, B.6-037…039 | Registros assistenciais por tipo configurável (`prontuario.tipos_registro`), validados por formulário dinâmico versionado; herdam sigilo do atendimento | `POST /prontuarios/registros`, `GET /cidadaos/{id}/registros` | `test_b6_025_057_registros_configuraveis_formulario_assinatura_retificacao` | PARCIAL (estrutura; regras de exame, referência/contrarreferência e notificação SINAN pendentes) |
| B.6-015 | Alergias com baixa lógica; alimentam alerta de prescrição por código | `/cidadaos/{id}/alergias`, `/alergias/{id}/encerrar` | `test_b6_015_016_problemas_e_alergias_com_baixa_logica` | IMPLEMENTADO |
| B.6-016 | Problemas CID-10/CIAP-2/CIPE; conferidos na base importada quando existe (`validado_referencia`); duplicado ativo recusado; encerramento com motivo | `/cidadaos/{id}/problemas`, `/problemas/{id}/encerrar` | idem | IMPLEMENTADO |
| B.6-017 | Plano de cuidados | `.../{id}/planos-cuidado` | — (coberto indiretamente) | IMPLEMENTADO |
| B.6-019, B.6-033 | Prescrição estruturada (via, posologia, uso contínuo, receituário), separação de receituários, alertas de alergia e duplicidade (na prescrição e uso contínuo ativo), cópia assistida do mesmo cidadão, assinatura; código conferido em `referencia.medicamentos` se importada | `.../{id}/prescricoes`, `.../prescricoes/copiar`, `/cidadaos/{id}/prescricoes`, `/prescricoes/{id}/assinar` | `test_b6_019_033_prescricao_alertas_receituarios_e_copia` | IMPLEMENTADO; interação, MPP e estoque `NAO_AVALIADO` (sem base / Fase 8) |
| B.6-034 | Assinatura de evolução, prescrição e documento clínico (assinatura eletrônica interna) | `/evolucoes/{id}/assinar`, `/prescricoes/{id}/assinar`, `/registros/{id}/assinar` | `test_b6_057_...`, `test_b6_025_057_...` | PARCIAL (assinatura ICP-Brasil/gov.br e modelos de documento pendentes) |
| B.6-041 | Validade de consulta/reconsulta por tipo (`prontuario.validade_consulta_dias`) | `/cidadaos/{id}/validade-consulta` | `test_b6_056_retroativo_em_contingencia_e_b6_041_validade` | IMPLEMENTADO |
| B.6-048, B.6-049 | Linha do tempo de atendimentos e registros; sigiloso velado | `/cidadaos/{id}/linha-do-tempo` | `test_b12_021_025_sigilo_escopo_e_linha_do_tempo` | IMPLEMENTADO |
| B.6-056 | Digitação retroativa: contingência ligada pelo gestor, permissão de retificar, limite em dias, justificativa, auditoria; data antiga sem flag recusada | `POST /prontuarios/atendimentos` | `test_b6_056_...` | IMPLEMENTADO |
| B.6-057 | Retificação de evolução e registro assinados gera nova versão encadeada; anterior preservada (`RETIFICADO`) | `/evolucoes/{id}/retificar`, `/registros/{id}/retificar` | `test_b6_057_...`, `test_b6_025_057_...` | IMPLEMENTADO |
| B.12-013, B.12-021…025 | Tenant (404), escopo de estabelecimento (404), sigilo por `PRONTUARIO_LER_SIGILOSO`, RBAC (403), leitura auditada `READ_SENSIVEL` | todas as rotas do PEC | `test_b12_021_025_...` e negativos em todos os testes | IMPLEMENTADO |
| B.6-009, B.6-024, B.6-028, B.6-043, B.6-044, B.6-055, B.6-058 | Protocolos estruturados, RAAS, observação/internação, produção programada × realizado, benefícios custeados | — | — | PENDENTE (o registro configurável cobre o dado clínico; regras e exportações entram com as fases de faturamento/regulação) |

## Fase 6 — ações programáticas e linhas de cuidado

O catálogo oficial do Lote 02 não está no repositório; os IDs B.2-001…015 vêm
da seção 12 do `PROMPT-BACKEND-GOVSAUDE.md` e a associação por funcionalidade
abaixo é **inferida** (validar no catálogo). Testes em
`tests/test_fase6_programas.py`.

| Requisito | O que foi entregue | Endpoints | Status |
|---|---|---|---|
| B.2-001…002 | Motor genérico de programas/linhas de cuidado com itens previstos (consulta, exame, fornecimento, vacina, procedimento, orientação), periodicidade, faixa etária/sexo/gestante por item, nova versão por vigência e `If-Match` | `/programas`, `/programas/{id}/itens`, `/programas/{id}/nova-versao`, `/programas/linhas-cuidado` | IMPLEMENTADO (mapeamento inferido) |
| B.2-003…005 | Elegibilidade por sexo/idade/gestante/condição ativa; inscrição com exceção justificada; situação ATIVA/SUSPENSA/ENCERRADA/TRANSFERIDA com motivo; inscrição vigente única | `/programas/{id}/elegibilidade`, `/inscricoes-programa`, `.../encerrar` | IMPLEMENTADO (mapeamento inferido) |
| B.2-004 | Formulário dinâmico versionado por programa e validação de `dados_clinicos` | `/formularios`, `/formularios/{codigo}/respostas` | IMPLEMENTADO |
| B.2-006…008 | Programação previsto × realizado, geração idempotente por horizonte, realização vinculável ao atendimento, remarcação e perda | `/inscricoes-programa/{id}/gerar-programacoes`, `/programas/{id}/gerar-programacoes`, `/programacoes-programa` (+ `realizar`, `remarcar`, `perder`) | IMPLEMENTADO |
| B.2-009 | Busca ativa: pendências por atraso, tentativas com desfecho, lista nominal (CPF/CNS mascarados) | `/buscas-ativas`, `/buscas-ativas/pendencias`, `/programas/{id}/lista-nominal` | IMPLEMENTADO |
| B.2-010 | Estimativa de demanda futura por item, com fórmula exposta | `/programas/{id}/estimativa-demanda` | IMPLEMENTADO (integração com estoque entra na Fase 8) |
| B.2-011…014 | Modelos de saúde da mulher, criança, hipertensão, diabetes e gestante como **seed** `SEED_A_VALIDAR` com formulário próprio | seed em `services/seeds.py:garantir_programas_padrao` | IMPLEMENTADO (estrutura; regras clínicas pendentes, ver pendências) |
| B.2-015 | Resumo do programa: inscritos por situação, previsto × realizado por item | `/programas/{id}/resumo` | IMPLEMENTADO (indicadores oficiais na Fase 12) |

### Observações de rastreabilidade da Fase 6

- Os seeds trazem só a estrutura (nome, itens, formulário). Periodicidade,
  faixa etária e condições CID-10/CIAP-2 ficam vazias e o programa nasce
  **inativo**; o tenant preenche a partir do protocolo oficial e ativa via
  `PATCH /programas/{id}` (`ativo=true`).
- Item sem periodicidade gera uma única programação (ação pontual).
- A elegibilidade alerta; o profissional inscreve fora do critério com
  `justificativa_excecao`, auditada.

## Fase 7 — odontologia

IDs B.3-001…027 da seção 12 do `PROMPT-BACKEND-GOVSAUDE.md`; a associação por
funcionalidade é **inferida** (validar no catálogo do Lote 02). B.3-002 e
B.3-027 (LEDI) são escopo da Fase 11 e aqui só têm a porta. Testes em
`tests/test_fase7_odontologia.py`.

| Requisito | O que foi entregue | Endpoints | Status |
|---|---|---|---|
| B.3-001 | Catálogo de condições/procedimentos do tenant com cor, aplicabilidade (dente, face, sextante, arcada, boca), dentição e SIGTAP conferido na base importada | `/odontologia/condicoes` | IMPLEMENTADO |
| B.3-003/004 | Triagem (JSON) e classificação de risco validada contra `odontologia.classificacoes_risco` do tenant | `POST/PATCH /odontologia/atendimentos` | IMPLEMENTADO (mapeamento inferido) |
| B.3-005 | Anamnese por formulário dinâmico versionado; grava a versão usada | idem | IMPLEMENTADO |
| B.3-006/024 | Odontograma versionado e imutável: notação FDI, faces por anatomia, controle de concorrência por `versao_base`, histórico e planejado | `/odontologia/cidadaos/{id}/odontograma`, `.../versoes` | IMPLEMENTADO |
| B.3-009/010 | Atendimento odontológico aberto → finalizado/cancelado; evolução cifrada; leitura auditada `READ_SENSIVEL`; escopo por estabelecimento | `/odontologia/atendimentos`, `.../finalizar`, `.../cancelar` | IMPLEMENTADO |
| B.3-011/018/022 | Procedimentos programados × realizados por dente/face/região, vinculados ao atendimento, com insumos | `/odontologia/procedimentos`, `.../realizar`, `.../cancelar` | IMPLEMENTADO (baixa de estoque dos insumos na Fase 8) |
| B.3-013 | Digitação retroativa com justificativa e limite configurável (`odontologia.retroativo_dias_maximos`) | `POST /odontologia/atendimentos` | IMPLEMENTADO |
| B.3-014 | Documentos (atestado, declaração, receita, orientação, encaminhamento) com conteúdo cifrado | `/odontologia/atendimentos/{id}/documentos` | IMPLEMENTADO (modelos e assinatura digital pendentes) |
| B.3-019…021 | Relatório de produção por dente, face ou procedimento | `/odontologia/relatorios/procedimentos` | IMPLEMENTADO (mapeamento inferido) |
| B.3-027 | Exportação LEDI do atendimento odontológico | `/odontologia/atendimentos/{id}/exportacao-ledi` | PENDENTE_ESPECIFICACAO_OFICIAL (teste de contrato `xfail`) |
| B.3-008 | Agenda odontológica | entregue na Fase 4 | IMPLEMENTADO |
| Demais IDs B.3 | Não identificados sem o catálogo oficial | — | A CONFERIR |

### Observações de rastreabilidade da Fase 7

- Nenhum catálogo de condição, cor ou código SIGTAP é semeado: o tenant cadastra.
- Atendimento finalizado não é editado; retificação com nova versão fica para
  quando o requisito for confirmado (mesmo padrão pendente da Fase 5).
- Procedimento realizado não é cancelado; atendimento com produção não é cancelado.

## Fases 8–16

As fases 8–16 não foram iniciadas nesta entrega.

## Pendências oficiais

Consulte [pendencias-oficiais.md](pendencias-oficiais.md). Nenhum layout,
código de domínio ou endpoint oficial foi preenchido “de memória”.
