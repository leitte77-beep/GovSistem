# Rastreabilidade — GovSaúde

Atualizado em 2026-10-26, após a revisão das Fases 1–8 contra o **catálogo
oficial** (`docs/catalogo-lote02.md`, Anexo B do TR de Farol/PR). Até então os
IDs eram inferidos da descrição das fases; vários estavam trocados e foram
corrigidos aqui, nas docstrings e nos nomes dos testes. O relatório da revisão
está em `docs/revisao-fases-1-8.md`.

Status: `IMPLEMENTADO` (o texto do requisito está atendido), `PARCIAL` (atende
parte; a lacuna está descrita), `PENDENTE` (não feito, com a fase prevista) e
`PENDENTE_ESPECIFICACAO_OFICIAL` (porta pronta, falta artefato oficial).

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
| B.12-054 | Lista branca de extensões/MIME, magic number, limite de tamanho e porta ClamAV; anexos clínicos com perfil e sigilo | `app/core/antivirus.py`, `/anexos` | `test_anexos.py`, `test_lacunas_revisao.py::test_b12_054_b6_029_*` | IMPLEMENTADO |
| B.12-056 | PostgreSQL (ACID, integridade referencial); unicidade parcial por tenant para CPF, CNS, e-mail, nome de acesso e CNES | constraints e índices em `models/nucleo.py` | `test_usuarios_idempotencia.py::test_cpf_duplicado_por_tenant_rejeitado` | IMPLEMENTADO |
| B.12-057 | Endpoint de versão e notas de release | `GET /sistema/versao` | `test_auth_tenant_rbac.py::test_health_e_versao_publicos` | IMPLEMENTADO |
| B.12-059 | API REST documentada em OpenAPI 3.1, contrato versionado | `openapi.json` | `test_openapi_contrato.py` | IMPLEMENTADO (FHIR na Fase 11) |
| B.12-055 | Relatórios em JSON, CSV, XLSX e PDF com orientação de página | `/relatorios/*`, `?formato=&orientacao=` | `test_b6_048_049_b12_055_*` | IMPLEMENTADO |

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

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.12-006 | Estabelecimentos, setores, serviços, horários, equipes e profissionais com baixa lógica, vigência, CNPJ numérico/alfanumérico, IBGE/CEP | `/estabelecimentos`, `.../setores`, `.../servicos`, `.../horarios`, `/equipes`, `/profissionais` | `test_fase1_rede.py` | IMPLEMENTADO (especialidades sem CRUD próprio: só seed/vínculo) |
| B.12-007 | Procedimentos autorizados por estabelecimento, profissional e especialidade, com vigência e SIGTAP conferido na base importada | `/procedimentos-autorizados` | `test_b12_016_procedimento_autor…` | IMPLEMENTADO |
| B.12-012 | Escalas, plantões com detecção de sobreposição, horários e restrições de acesso por profissional/unidade | `/escalas`, `/plantoes`, `/restricoes-horario` | `test_fase1_rede.py` | IMPLEMENTADO |
| B.12-015 | Procedimento municipal vinculado ao SIGTAP | `/procedimentos-autorizados` | idem | PARCIAL (sem tabela de procedimentos municipais própria) |
| B.12-016 | Prioridades legal/clínica configuráveis lidas do banco | `/prioridades` | `test_fase1_rede.py` | IMPLEMENTADO |
| B.1-010 | Equipes e profissionais conforme CNES (áreas/microáreas na Fase 3) | `/equipes`, `/profissionais`, `/importacoes/cnes` | `test_fase1_rede.py` | PARCIAL (INE/CNES validados estruturalmente; base oficial pendente) |
| B.1-011 | Vínculos e lotações com histórico por vigência | `/profissionais/{id}/vinculos`, `/equipes/{id}/profissionais` | `test_b1_011_*` | IMPLEMENTADO (microárea do ACS: Fase 3) |
| B.12-010, B.12-031 | Importação CNES assíncrona por porta oficial, relatório de inconsistências, idempotência | `/importacoes/cnes` | `test_fase1_rede.py` | PENDENTE_ESPECIFICACAO_OFICIAL |
| B.12-050 | Escopo por estabelecimento no RBAC; vínculo encerrado deixa de conceder escopo | `exigir_acesso_estabelecimento` | `test_auth_tenant_rbac.py` | IMPLEMENTADO |

## Fase 2 — cidadão (cadastro único)

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.1-001 | Cadastro com baixa lógica/reativação, histórico de baixa, auditoria | `/cidadaos`, `.../baixar`, `.../reativar`, `.../baixas` | `test_fase2_cidadao.py::test_b1_001_*` | IMPLEMENTADO |
| B.1-002, B.12-011 | Foto por arquivo com política do tenant, magic number, storage privado | `/cidadaos/{id}/fotos` | `test_b1_002_e_b12_011_*` | PARCIAL (locais de exibição configuráveis ainda não existem) |
| B.1-004 | CPF, CNS, nome social, nascimento, sexo, raça/cor, etnia, ocupação (CBO), contatos, documentos e endereços | `/cidadaos`, `.../documentos`, `.../contatos`, `.../enderecos` | `test_b1_004_*` | PARCIAL (só nome da mãe — falta filiação completa; domínios oficiais e-SUS pendentes) |
| B.1-006 | Sociodemográfico (escolaridade, identidade de gênero, orientação, situação de rua), condições de saúde, contatos | `/cidadaos`, `.../condicoes` | `test_fase2_cidadao.py` | PARCIAL (falta local de trabalho e campos do modelo oficial) |
| B.1-007, B.12-002, B.12-003 | Unificação com comparação, justificativa, histórico e reversão | `/cidadaos/{id}/unificar`, `.../unificacoes`, `/unificacoes/{id}/reverter` | `test_b1_007_e_b12_003_*` | IMPLEMENTADO (unificação de logradouros/bairros: pendente) |
| B.1-008 | Planos de saúde/vínculos com carteira protegida | `/cidadaos/{id}/planos` | `test_b1_008_*` | IMPLEMENTADO |
| B.1-009 | Recém-nascido a partir da mãe | `POST /cidadaos/{id}/recem-nascido` | `test_b1_009_*` | IMPLEMENTADO |
| B.12-001 | Duplicidade por nome/nascimento/mãe/CPF/CNS com pesos configuráveis e decisão humana | `/cidadaos/{id}/duplicidades`, `/duplicidades/{id}/decidir` | `test_b12_001_*` | IMPLEMENTADO |
| B.12-004 | Compatibilização CPF/CNS no mesmo cadastro | `/cidadaos`, `POST /cidadaos/busca` | `test_b1_006_compatibilizacao_cpf_cns` | IMPLEMENTADO |
| B.12-005 | Busca fonética BuscaBR com critérios expostos | `POST /cidadaos/busca` | `test_b12_005_*` | IMPLEMENTADO |
| B.12-009 | Nome social com precedência | `/cidadaos`, busca | `test_b12_009_*` | IMPLEMENTADO |
| B.12-010 | CADSUS só por interface oficial | `POST /cidadaos/consulta-cadsus` | `test_b12_004_e_b12_010_*` | PENDENTE_ESPECIFICACAO_OFICIAL |
| B.1-003, B.12-008 | CEP/municípios por base oficial | `POST /cidadaos/consulta-cep`, `/referencia/municipios` | `test_consulta_cep_pendente_sem_base_oficial` | PENDENTE_ESPECIFICACAO_OFICIAL (cadastro de logradouros/bairros/distritos: pendente) |
| B.6-015, B.6-016 | Alergias (com código do agente) e condições CID-10/CIAP-2/CIPE — lista única usada pelo PEC | `/cidadaos/{id}/alergias`, `.../condicoes` | `test_fase5_prontuario.py::test_b6_015_016_*` | IMPLEMENTADO |

Correção desta revisão: B.1-006 e B.12-008 estavam associados a
compatibilização CPF/CNS e a documentos protegidos; pelo catálogo, isso é
B.12-004 e B.1-004.

## Fase 3 — território e saúde da família

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.1-010 | Áreas e microáreas com GeoJSON | `/territorios` | `test_fase3_territorio.py` | IMPLEMENTADO |
| B.1-005 | Cidadão ↔ família ↔ domicílio com vigência | `/territorios/familias/{id}/membros` | idem | PARCIAL (equipe/profissional de referência por microárea não vinculados) |
| B.1-013 | Domicílios e famílias | `/territorios/domicilios`, `/territorios/familias` | idem | PARCIAL (modelo oficial e-SUS de domicílio pendente) |
| B.1-014 | Saída de integrante com vigência | `.../membros/{id}/encerrar` | idem | PARCIAL (baixa de imóvel/família e troca de responsável: pendente) |
| B.1-015 | Animais do imóvel configuráveis | `/territorios/domicilios/{id}/animais` | idem | IMPLEMENTADO |
| B.1-016 | Pesquisa de domicílio por termo | `GET /territorios/domicilios?termo=` | idem | PARCIAL (por responsável/integrante/histórico: pendente) |
| B.1-018, B.1-024 | Domicílios não visitados e cobertura por competência | `/territorios/domicilios/nao-visitados`, `/territorios/cobertura` | idem | PARCIAL (por profissional/território e relatórios exportáveis: pendente) |
| B.1-019 | Visita com motivos, busca ativa, acompanhamento, controle ambiental, antropometria (IMC), sinais vitais, glicemia e desfecho; domínios configuráveis | `/territorios/visitas` | `test_b1_019_visita_estruturada_*` | PARCIAL (códigos oficiais da ficha e-SUS a carregar nos domínios) |
| B.1-020 | Visita única por turno: ALERTAR/BLOQUEAR configurável | idem | idem | IMPLEMENTADO |
| B.1-022, B.1-023 | Política de GPS configurável; assinatura do cidadão na visita | idem | idem | IMPLEMENTADO |
| B.1-026 | Meta mensal de visitas | `/territorios/metas` | idem | PARCIAL (metas por ACS/equipe e por grupo prioritário: pendente) |
| B.1-028, B.1-042 | GeoJSON de áreas sem dado pessoal | `/territorios/mapa.geojson` | idem | PARCIAL (pontos de visita e cobertura no mapa: pendente) |
| B.12-024 | Extrato da família com membros e domicílios históricos | `/territorios/familias/{id}/extrato` | idem | PARCIAL (extrato consolidado do cidadão/unidade: pendente) |
| B.1-012, B.1-017, B.1-021, B.1-025, B.1-027, B.1-029, B.1-030 | Transferências territoriais, extrato territorial, estratificação de risco, metas × produção, trajetos, dashboards | — | — | PENDENTE |
| B.1-031, B.1-032 | Sincronização offline com fila de conflitos | — | — | PENDENTE (Fase 15, B.11) |
| B.1-033…041 | Exportação e-SUS/SISAB e indicadores APS | — | — | PENDENTE (Fases 11 e 12) |

## Fase 4 — agenda, recepção, fila e painel

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.6-001 | Recepção agendada e por demanda espontânea; agendas com grade, vagas, vigência, faixa etária, sexo e SIGTAP; agendamento idempotente com confirmação/cancelamento/reagendamento/comprovante | `/agendas…`, `/agendamentos…`, `/recepcao/check-in`, `/recepcao/demanda-espontanea` | `test_fase4_agenda_fila.py` | IMPLEMENTADO |
| B.6-002 | Visão do cidadão na recepção conforme permissão | `/recepcao/*`, `/cidadaos/{id}` | idem | PARCIAL (sem visão resumida única com território/família/atendimentos anteriores) |
| B.6-003, B.3-008 | Código de barras/QR/cartão, identificação manual; biometria opcional pela porta | `/recepcao/check-in`, `/recepcao/cartao` | `test_b6_005_checkin_codigo_…` | IMPLEMENTADO; biometria `PENDENTE_ESPECIFICACAO_OFICIAL` |
| B.6-005 | Bloqueio/alerta de agendamento cancelado, vencido, faltoso ou incompatível | `/recepcao/check-in`, `/agendamentos` | `test_b6_003_checkin_bloqueado_…`, `test_b6_002_incompatibilidade_…` | IMPLEMENTADO |
| B.6-007, B.3-003 | Protocolos de classificação de risco por unidade, níveis, cores e tempos | `/protocolos-classificacao-risco` | `test_b6_007_*` | IMPLEMENTADO (sintomas por nível: via dados do protocolo) |
| B.6-008 | Fila por classificação, prioridade legal e tempo, regra exposta | `/filas` | `test_b6_007_b6_008_*` | IMPLEMENTADO |
| B.6-012 | Acolhimento: chamada, triagem, classificação, evasão, desfecho; sinais vitais no PEC | `/filas/{id}/…`, `/prontuarios/atendimentos/{id}/sinais-vitais` | `test_b6_012_*`, `test_b6_004_012_atendimento_continua_a_fila_da_recepcao` | IMPLEMENTADO |
| B.6-045, B.6-046 | Painéis por setor, notícias, texto para voz, histórico, nome abreviado | `/paineis-chamada…`, `/tempo-real/filas` | `test_b6_045_b6_047_*` | IMPLEMENTADO |
| B.6-047 | Tempos médios de espera, triagem, consulta e permanência por unidade, setor ou mês | `/relatorios/filas/tempos`, `/filas/{id}/eventos` | `test_b6_047_relatorio_de_tempos_da_fila` | PARCIAL (por profissional/especialidade: a fila não registra o profissional) |
| B.12-018 | Falta automática configurável com reversão auditada | `/agendamentos/{id}/falta`, `.../reverter-falta` | `test_b12_018_*` | IMPLEMENTADO |
| B.6-050, B.12-019, B.12-020 | Listas de espera | — | — | PENDENTE (Fase 9, regulação) |

Correção desta revisão: B.6-001/002/003/005/012/047 estavam deslocados
(agenda, agendamento, bloqueio de recepção e tempos). A tabela acima segue o
texto oficial.

## Fase 5 — prontuário (PEC) ambulatorial

Regras em `app/services/prontuario.py`, rotas em `app/api/v1/prontuarios.py`,
migrações `0006` e `0009`. Testes em `tests/test_fase5_prontuario.py` (10).

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.6-004 | Atendimento com etapas configuráveis (`prontuario.etapas`), aberto a partir da fila da recepção/triagem | `/prontuarios/atendimentos`, `.../{id}/etapa` | `test_b6_004_014_*`, `test_b6_004_012_atendimento_continua_a_fila_da_recepcao` | IMPLEMENTADO |
| B.6-006 | Visualização restrita por unidade, especialidade, sigilo; cross-tenant/escopo → 404 | todas as rotas do PEC | `test_b6_006_026_035_*`, `test_b6_035_*` | IMPLEMENTADO (por profissional: pendente) |
| B.6-010 | IMC calculado; classificação só por tabela versionada do tenant | `.../{id}/sinais-vitais` | `test_b6_010_011_*` | PARCIAL (tabelas oficiais por ciclo de vida pendentes) |
| B.6-011 | Série histórica de peso, IMC, pressão e demais medidas | `/prontuarios/cidadaos/{id}/sinais-vitais` | idem | IMPLEMENTADO |
| B.6-012 | Acolhimento com sinais vitais, risco e evasão (com a fila da Fase 4) | idem + `/filas` | `test_b6_004_012_*` | IMPLEMENTADO |
| B.6-013, B.6-018, B.6-022, B.6-023, B.6-025, B.6-030, B.6-031, B.6-037…039 | Registros por tipo configurável (`prontuario.tipos_registro`) validados por formulário dinâmico versionado | `POST /prontuarios/registros`, `/cidadaos/{id}/registros` | `test_b6_025_057_*` | PARCIAL (captura estruturada; faltam regras de exame — autorização/carência/contrato/validade —, abertura de investigação, encaminhamento interno no fluxo e modelos oficiais e-SUS) |
| B.6-014 | Campos obrigatórios por unidade, idade, sexo e tipo, checados no encerramento | `.../{id}/pendencias`, `.../{id}/encerrar` | `test_b6_004_014_*` | PARCIAL (por especialidade: pendente) |
| B.6-015 | Alergias do cadastro único alertadas no atendimento e na prescrição | `GET /prontuarios/atendimentos/{id}`, prescrição | `test_b6_015_016_*`, `test_b6_019_021_033_*` | IMPLEMENTADO |
| B.6-016 | Problemas/condições CID-10, CIAP-2, CIPE (lista do cadastro único) | `/cidadaos/{id}/condicoes` | `test_b6_015_016_*` | IMPLEMENTADO |
| B.6-017 | Plano de cuidados com vigência, acesso pelo atendimento | `.../{id}/planos-cuidado` | — | PARCIAL (sem listagem/encerramento nem teste próprio) |
| B.6-019 | Prescrição estruturada (via, uso contínuo, receituário), disponibilidade em estoque | `.../{id}/prescricoes`, `/cidadaos/{id}/prescricoes` | `test_b6_019_021_033_*`, `test_b4_005_016_019_026_037_*` | IMPLEMENTADO |
| B.6-020 | Alertas de alergia e duplicidade; interação e MPP só com base validada | idem | idem | PARCIAL (sem base validada: `NAO_AVALIADO`) |
| B.6-021 | Cópia assistida com seleção de itens e alertas reavaliados | `.../prescricoes/copiar` | idem | IMPLEMENTADO |
| B.6-026 | Ficha contínua e linha do tempo (atendimentos e registros), sigilo velado | `/cidadaos/{id}/linha-do-tempo`, `.../soap` | `test_b6_006_026_035_*` | IMPLEMENTADO |
| B.6-027 | SOAP: anamnese/queixa, exame, avaliação, conduta; cifrado em repouso | `.../{id}/soap` | `test_b6_027_057_*` | IMPLEMENTADO |
| B.6-032 | Documentos clínicos como registros assinados | `/prontuarios/registros`, `.../assinar` | `test_b6_025_057_*` | PARCIAL (modelos e emissão/impressão: pendentes) |
| B.6-033 | Separação de receituários comum/antimicrobiano/controlado | prescrição | `test_b6_019_021_033_*` | IMPLEMENTADO |
| B.6-034 | Assinatura eletrônica interna de evolução/prescrição/registro | `.../assinar` | `test_b6_027_057_*` | PARCIAL (modelos por profissional/unidade e assinatura digital ICP/gov.br pendentes) |
| B.6-035 | Sigilo por nível: SIGILOSO (permissão própria) ou RESTRITO_ESPECIALIDADE (só a especialidade autorizada) | `POST /prontuarios/atendimentos` (`nivel_sigilo`, `especialidade_id`) | `test_b6_035_sigilo_por_especialidade_autorizada` | IMPLEMENTADO (restrição por unidade autorizada além do escopo: pendente) |
| B.6-036 | Digitação retroativa em contingência: flag do gestor, permissão, período, justificativa, auditoria | `POST /prontuarios/atendimentos` | `test_b6_036_*` | IMPLEMENTADO |
| B.6-041 | Validade de consulta/reconsulta por tipo | `/cidadaos/{id}/validade-consulta` | idem | PARCIAL (só informa; alerta/bloqueio no agendamento: pendente) |
| B.6-056 | Auditoria de consulta (`READ_SENSIVEL`), alteração e assinatura | todas as rotas | `test_b6_027_057_*` | PARCIAL (impressão/exportação do prontuário ainda não existem) |
| B.6-057 | Retificação preserva o anterior com justificativa (evolução e registro) | `/evolucoes/{id}/retificar`, `/registros/{id}/retificar` | `test_b6_027_057_*`, `test_b6_025_057_*` | IMPLEMENTADO |
| B.6-029 | Anexos (imagem/PDF) com classificação, autoria, data, sigilo herdado e download auditado | `/anexos`, `/anexos/cidadaos/{id}`, `/anexos/{id}/conteudo` | `test_b12_054_b6_029_*` | IMPLEMENTADO |
| B.6-048, B.6-049 | Relatório de atendimentos, diagnósticos, prescrições e registros por mês/unidade/tipo, com comparativo do período anterior | `/relatorios/prontuario/atendimentos` | `test_b6_048_049_b12_055_*` | IMPLEMENTADO |
| B.6-009, B.6-024, B.6-028, B.6-040, B.6-042…044, B.6-055, B.6-058 | Protocolos estruturados (dor torácica), RAAS, observação/internação, comorbidades × linhas de cuidado, ocorrências diárias, produção programada, benefícios custeados, contingência com reconciliação, busca no prontuário | — | — | PENDENTE |
| B.6-051…054 | Regulação e faturamento | — | — | PENDENTE (Fases 9 e 13) |

Correções desta revisão: retroativo era citado como B.6-056 (é B.6-036);
campos obrigatórios como B.6-006 (é B.6-014); série histórica como B.6-012 (é
B.6-011); cópia assistida e alertas como B.6-019 (são B.6-021 e B.6-020); linha
do tempo como B.6-048/049 (é B.6-026). O PEC deixou de manter alergias e
problemas próprios — passou a usar a lista do cadastro único (Fase 2).

## Fase 6 — ações programáticas e linhas de cuidado

Testes em `tests/test_fase6_programas.py`.

| Requisito | O que foi entregue | Endpoints | Status |
|---|---|---|---|
| B.2-001, B.2-015 | Motor de programas/linhas de cuidado com itens (consulta, exame, fornecimento, vacina, procedimento, orientação), periodicidade, faixa etária/sexo, versão por vigência | `/programas`, `.../itens`, `.../nova-versao`, `/programas/linhas-cuidado` | IMPLEMENTADO |
| B.2-002 | Programação por cidadão com geração idempotente, atraso, remarcação, perda, suspensão e encerramento | `/inscricoes-programa/{id}/gerar-programacoes`, `/programacoes-programa…` | IMPLEMENTADO |
| B.2-003 | Inscrição com situação, motivo de saída, responsável e histórico; elegibilidade com exceção justificada | `/inscricoes-programa`, `.../encerrar`, `/programas/{id}/elegibilidade` | IMPLEMENTADO |
| B.2-004 | Formulário dinâmico versionado por programa | `/formularios`, `/formularios/{codigo}/respostas` | IMPLEMENTADO |
| B.2-005 | Fluxo recepção → enfermagem → atendimento | PEC (Fase 5, etapas) | PARCIAL (programação não vincula ao atendimento do PEC automaticamente) |
| B.2-006, B.2-009 | Modelos de saúde da mulher (colo/mama) e da criança como seed `SEED_A_VALIDAR` inativo | seed `garantir_programas_padrao` | PARCIAL (estrutura; regras clínicas e SISCAN pendentes) |
| B.2-007, B.2-008 | Planejamento reprodutivo; climatério e menopausa | — | PENDENTE (o motor comporta; faltam seeds) |
| B.2-010 | Itens de fornecimento e estimativa | `/programas/{id}/estimativa-demanda` | PARCIAL (fornecimento não gera nem confere dispensação da Fase 8) |
| B.2-011 | Busca ativa por atraso com tentativas e lista nominal mascarada | `/buscas-ativas`, `.../pendencias`, `/programas/{id}/lista-nominal` | IMPLEMENTADO |
| B.2-012 | Resumo por situação e previsto × realizado | `/programas/{id}/resumo` | PARCIAL (cortes por sexo, faixa etária, território, unidade, profissional: pendentes) |
| B.2-013 | Apoio a programas federais/estaduais | — | PENDENTE (Fase 12) |
| B.2-014 | Estimativa de demanda futura com fórmula exposta | `/programas/{id}/estimativa-demanda` | IMPLEMENTADO |

Correção desta revisão: os IDs B.2-006…015 estavam deslocados (programação,
busca ativa, estimativa e seeds apontavam para números errados).

## Fase 7 — odontologia

Testes em `tests/test_fase7_odontologia.py`.

| Requisito | O que foi entregue | Endpoints | Status |
|---|---|---|---|
| B.3-001 | Catálogo de condições/procedimentos com cor, aplicabilidade, dentição, SIGTAP e inativação | `/odontologia/condicoes` | IMPLEMENTADO |
| B.3-003 | Classificações de risco odontológico do tenant | configuração `odontologia.classificacoes_risco` | PARCIAL (cores/tempos por unidade: usar o protocolo da Fase 4) |
| B.3-004 | Triagem (JSON) com risco | `POST/PATCH /odontologia/atendimentos` | PARCIAL (sinais vitais e encaminhamento não estruturados) |
| B.3-005 | Anamnese por formulário dinâmico versionado | idem | IMPLEMENTADO (filtro por idade/sexo/condição: pendente) |
| B.3-006, B.3-024 | Odontograma versionado e imutável, FDI/faces, planejados, histórico auditado | `/odontologia/cidadaos/{id}/odontograma`, `.../versoes` | IMPLEMENTADO |
| B.3-008 | Recepção por agendamento/código (motor da Fase 4) | `/recepcao/check-in` | IMPLEMENTADO |
| B.3-009 | Atendimento com diagnóstico por dente/face, procedimentos, desfecho | `/odontologia/atendimentos`, `/odontologia/procedimentos/{id}/realizar` | IMPLEMENTADO (auxiliares: pendente) |
| B.3-010 | Tipo de consulta | idem | PARCIAL (vigilância em saúde bucal e fornecimento conforme ficha oficial: pendentes) |
| B.3-011, B.3-022 | Procedimentos programados, retornos e lista de atrasados | `/odontologia/procedimentos?atrasados=true` | IMPLEMENTADO |
| B.3-013 | Atestado, declaração, receita, orientação, referência (conteúdo cifrado) | `/odontologia/atendimentos/{id}/documentos` | IMPLEMENTADO |
| B.3-016 | Digitação retroativa com justificativa e limite configurável | `POST /odontologia/atendimentos` | IMPLEMENTADO |
| B.3-018 | Histórico odontológico por paciente | `GET /odontologia/atendimentos?cidadao_id=`, odontograma, documentos | PARCIAL (consolidação única: pendente) |
| B.3-020 | Relatório por dente, face, procedimento e período | `/odontologia/relatorios/procedimentos` | IMPLEMENTADO |
| B.3-026 | Escopo por estabelecimento e leitura auditada | todas as rotas | PARCIAL (nível de sigilo como no PEC: pendente) |
| B.3-002, B.3-027 | Exportação LEDI | `/odontologia/atendimentos/{id}/exportacao-ledi` | PENDENTE_ESPECIFICACAO_OFICIAL (contrato `xfail`) |
| B.3-012 | Anexos do atendimento odontológico conforme permissão | `/anexos` (`contexto=ODONTOLOGIA`) | IMPLEMENTADO |
| B.3-017 | Ficha completa (odontograma, procedimentos, receitas, exames, encaminhamentos) em JSON/PDF, impressão auditada | `/odontologia/atendimentos/{id}/ficha` | IMPLEMENTADO |
| B.3-019, B.3-021 | Atendimentos e procedimentos por profissional, unidade, tipo, faixa etária e mês, com comparativo | `/relatorios/odontologia/atendimentos` | PARCIAL (recorte por território: pendente) |
| B.3-007, B.3-014, B.3-015, B.3-023, B.3-025 | Histórico multiprofissional no atendimento, assinatura, estratificação de risco, integração com estoque, modelos de documento | — | PENDENTE |

Correção desta revisão: retroativo era B.3-013 (é B.3-016); documentos eram
B.3-014 (são B.3-013; B.3-014 é assinatura); relatório por dente/face era
B.3-019…021 (é B.3-020).

## Fase 8 — estoque, almoxarifado e assistência farmacêutica

Regras em `app/services/estoque.py`, rotas em `app/api/v1/estoque.py`,
migração `0010` (com trigger PostgreSQL que impede UPDATE/DELETE no ledger).
Testes em `tests/test_fase8_estoque.py` (7).

| Requisito | O que foi entregue | Endpoints | Testes | Status |
|---|---|---|---|---|
| B.4-001 | Produtos por estabelecimento/local/lote/fabricante/validade/quantidade/situação | `/estoque/locais`, `/estoque/produtos/{id}/lotes`, `.../saldos` | `test_b4_001_003_*` | IMPLEMENTADO |
| B.4-002 | Bloqueio/desbloqueio de lote com motivo e auditoria (vale para todos os locais) | `/estoque/lotes/{id}/bloqueio` | `test_b4_002_012_016_*` | IMPLEMENTADO (bloqueio de item inteiro: pendente) |
| B.4-003 | Produtos com princípio ativo, apresentação, unidade, CATMAT, OBM, Remume | `/estoque/produtos` | `test_b4_001_003_*` | PARCIAL (grupos e importação de tabelas oficiais: pendentes) |
| B.4-004 | Mínimo, máximo, ideal, ponto de pedido; consumo médio calculado | `PUT .../parametros`, `.../sugestao-compra` | `test_b4_002_012_016_*` | IMPLEMENTADO |
| B.4-005 | Sugestão de compra com memória de cálculo; redistribuição por requisição | `.../sugestao-compra`, `/estoque/requisicoes` | `test_b4_005_016_019_026_037_*` | PARCIAL (ajuste autorizado da sugestão: pendente) |
| B.4-006 | Custo médio ponderado e última aquisição | `.../saldos` | `test_b4_006_009_012_027_*` | IMPLEMENTADO |
| B.4-007 | Centro de custo na movimentação; rastreio por lote | `POST /estoque/movimentacoes` | idem | PARCIAL (cadastro de centros de custo: pendente) |
| B.4-009 | Entrada com documento (NF/pedido/empenho/contrato), lote, validade, quantidade, custo | idem | idem | PARCIAL (documento é JSON livre; fornecedor sem cadastro) |
| B.4-012 | Saídas: consumo interno, perda, quebra, vencimento, devolução, doação; FEFO | idem | `test_b4_002_012_016_*` | IMPLEMENTADO |
| B.4-014 | Requisição com atendimento parcial, numeração e observação | `/estoque/requisicoes…` | `test_b4_014_015_*` | PARCIAL (previsão de entrega: pendente) |
| B.4-015 | Aceite/recusa com reintegração na origem | `.../receber`, `.../recusar` | idem | IMPLEMENTADO |
| B.4-016 | Alertas: mínimo, ponto de pedido, a vencer/vencido, lote bloqueado, consumo anormal | `.../alertas` | `test_b4_002_012_016_*`, `test_b4_005_016_*` | PARCIAL (frascos abertos: Fase 10) |
| B.4-017 | Inventário por lote com bloqueio do local e ajuste referenciado | `/estoque/inventarios…` | `test_b4_017_018_*` | IMPLEMENTADO |
| B.4-018 | Competências encerráveis e reabertura justificada | `/estoque/competencias/{AAAAMM}/…` | idem | IMPLEMENTADO |
| B.4-019 | Disponibilidade na prescrição; farmácia vê as prescrições do cidadão (só itens, sem dado clínico) com saldo no local e o já dispensado | prescrição do PEC, `/estoque/cidadaos/{id}/prescricoes` | `test_b4_005_016_019_*`, `test_b4_019_028_036_*` | IMPLEMENTADO |
| B.4-020 | Dispensação total/parcial com profissional, cidadão, prescrição, lote, data e documento; estorno | `/estoque/dispensacoes…` | `test_b4_020_023_035_*` | IMPLEMENTADO |
| B.4-021 | Duplicidade em qualquer unidade na janela configurada, com exceção justificada | idem | idem | IMPLEMENTADO |
| B.4-022 | Documento obrigatório para controlado/antimicrobiano com campos configuráveis | idem | idem | PARCIAL (campos legais a configurar) |
| B.4-023 | Comprovante de dispensação | `/estoque/dispensacoes/{id}/comprovante` | idem | PARCIAL (declaração de comparecimento e assinatura do cidadão: pendentes) |
| B.4-026 | Curva ABC, consumo mensal, giro e cobertura | `.../curva-abc`, `.../sugestao-compra` | `test_b4_005_016_*` | PARCIAL (consumo diário/anual e perdas em relatório: pendentes) |
| B.4-027 | Saldo em qualquer data por lote/custo/validade/local e pedidos pendentes | `.../saldos` | `test_b4_006_009_012_027_*`, `test_b4_014_015_*` | IMPLEMENTADO |
| B.4-035 | Controlado só movimenta/dispensa/estorna com `estoque:controlados` | movimentações e dispensação | `test_b4_020_023_035_*` | IMPLEMENTADO |
| B.4-028 | Comparativo de entradas, saídas, dispensações, transferências, perdas e ajustes (quantidade e valor) | `/relatorios/estoque/locais/{id}/movimentacoes` | `test_b4_019_028_036_*` | IMPLEMENTADO |
| B.4-036 | Rastreabilidade do lote da aquisição (documento) à dispensação/perda; cidadão só com `dispensacao:ler` | `/estoque/lotes/{id}/rastreabilidade` | `test_b4_019_028_036_*` | IMPLEMENTADO |
| B.4-037 | Temperatura com faixa do local, alerta e histórico | `.../temperaturas` | `test_b4_005_016_019_026_037_*` | IMPLEMENTADO |
| B.4-008, B.4-010, B.4-011, B.4-013, B.4-024, B.4-025, B.4-029, B.4-038…040, B.4-043 | Kits/etiquetas, importação de compras, guias impressas, código de barras/QR, livros e balanços 344/BMPO, integração contábil, importação de tabelas, APIs de equipamentos, contingência, conciliação | — | — | PENDENTE |
| B.4-030…034, B.4-041, B.4-042 | BNAFAR/RNDS, Banco de Preços, migração | — | — | PENDENTE (Fases 11, 13 e 16) |

Correção desta revisão: vários IDs estavam trocados (ex.: bloqueio era B.4-012
→ B.4-002; alertas B.4-035/036 → B.4-016; curva ABC B.4-039 → B.4-026;
sugestão B.4-007 → B.4-005; controlados B.4-024 → B.4-022). B.4-035 (acesso
reforçado a controlados) não estava atendido e foi implementado.

## Fases 9–16

Não iniciadas.

## Pendências oficiais

Consulte [pendencias-oficiais.md](pendencias-oficiais.md). Nenhum layout,
código de domínio ou endpoint oficial foi preenchido “de memória”.
