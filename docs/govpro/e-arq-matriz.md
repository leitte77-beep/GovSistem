# GovPro — Matriz de Conformidade e-ARQ Brasil (v2)

> Mapeamento de requisitos do e-ARQ Brasil v2 contra a implementação. Legenda:
> **✓ implementado**, **~ parcial**, **— não aplicável ao piloto atual**.
> NÃO afirma conformidade total: cada item exige validação junto ao instrumento
> arquivístico aprovado do ente (Plano de Classificação e TTD locais).

## 1. Gestão Documental (requisitos gerais)

| Requisito e-ARQ | Estado | Evidência / Módulo |
|---|---|---|
| Captura de documentos nato-digitais e digitalizados | ✓ | `services/captura.py`, `FormatoDocumento` (NATO_DIGITAL/DIGITALIZADO/CAPTURADO) |
| Registro de metadados mínimos de digitalização | ✓ | `Documento.metadados_captura` (Anexo II, Decreto 10.278/2020) |
| Imutabilidade do documento após assinatura | ✓ | `SituacaoDocumento.ASSINADO` congela; sem DELETE no domínio |
| Identificação única e persistente | ✓ | UUID + NUP17 com DV (Portaria 11/2019) |
| Controle de versões | ~ | `VersaoDocumento` pré-assinatura; pós-assinatura gera novo documento |

## 2. Classificação (Plano de Classificação)

| Requisito | Estado | Evidência |
|---|---|---|
| Plano de classificação hierárquico por ente | ✓ | `PlanoClassificacao` (classe/subclasse, código, vigência) |
| Associação processo → classe | ✓ | `Processo.classe_id` (herdada do tipo, alterável) |
| Instrumento local (não fixo) | ✓ | seed é exemplo; ente substitui pelo plano aprovado |

## 3. Temporalidade e Destinação (TTD)

| Requisito | Estado | Evidência |
|---|---|---|
| TTD vinculada à classe | ✓ | `TabelaTemporalidade` (prazo corrente/intermediário, destinação) |
| Destinação: eliminação / guarda permanente | ✓ | `DestinacaoFinal` |
| Rito de eliminação (listagem→aprovação→edital→termo→expurgo) | ✓ | `services/eliminacao.py`, `StatusEliminacao` |
| Expurgo lógico preservando metadados | ✓ | `Documento.eliminado_em`, `Processo.eliminado_em` |
| Ciclo de vida (corrente→intermediária→permanente) | ✓ | `FaseCicloVida`, `ProcessoArquivistico`, transferir/recolher |

## 4. Preservação Digital

| Requisito | Estado | Evidência |
|---|---|---|
| Hash/checksum (fixity) | ✓ | SHA-256/512; `services/integridade.py` (verificação periódica) |
| Integridade: bloquear uso em divergência | ✓ | `VerificacaoIntegridade` + alerta |
| Eventos de preservação | ~ | registrados na auditoria; modelo de evento dedicado em roadmap |
| Exportação em formato aberto (sem lock-in) | ✓ | `GET /exportar-acervo` (SIP/AIP) |
| RDC-Arq (recolhimento) | — | preparado via exportação; integração futura |

## 5. Metadados e Interoperabilidade

| Requisito | Estado | Evidência |
|---|---|---|
| Metadados estruturados em todo documento | ✓ | Modelo `Documento`/`ComponenteDigital` |
| OpenAPI documentada / versão `/v1` | ✓ | `/docs`, `/openapi.json` |
| Proveniência (quem/quando/sistema) | ✓ | `created_by`, `criado_por_user_id`, auditoria, snapshot de cargo |

## Lacunas conhecidas (para próximas fases)

1. Modelo formal de **eventos de preservação** (PREservation Metadata) além da trilha.
2. **RDC-Arq** (integração de recolhimento ao arquivo permanente externo).
3. **OCM/METS** completo no pacote SIP/AIP (manifesto já é gerado; enriquecer schema).
4. Validação formal do instrumento do ente (Plano/TTD) — responsabilidade do ente.
