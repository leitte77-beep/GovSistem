# GovPro — Arquitetura e Modelo de Dados (Fases 1 a 5)

> Status: **Fases 1 a 5 implementadas** (backend + testes + seeds + registro no SaaS).
> Falta apenas o frontend (área interna, portal do cidadão, consulta pública,
> validador) e os adaptadores opcionais (Tramita.GOV.BR, Diário Oficial, ICP-Brasil).

## ADRs curtas

- **ADR-GP1 — Monólito modular `modulo-govpro`**: layout espelhado no
  `modulo-govsocial` (camadas `api/v1 → services → models`, isolamento do
  domínio). Mesmo padrão de multi-tenancy (`tenant_id` nas tabelas de negócio,
  `organization_id` em users/organizations).
- **ADR-GP2 — SSO espelho do ChatGov**: sem login/senha local para usuários
  internos; token JWT do SaaS validado contra lista de segredos, recarga de
  perfil a cada request, provisionamento just-in-time. Endpoints
  `/internal/sync-organization` e `/internal/sync-user`.
- **ADR-GP3 — Assinatura como Strategy**: `AssinaturaProvider` (simples/avançada/
  qualificada). Fase 1 = simples (SSO + reautenticação + IP/UA/timestamp).
- **ADR-GP4 — Imutabilidade e prova**: documento assinado congela; trilha
  `audit_trail` append-only com hash chain (`hash_registro = SHA256(hash_anterior
  || canonical)`), protegida por trigger no banco.
- **ADR-GP5 — NUP17**: `formatar_nup` + `calcular_dv` conforme Portaria 11/2019,
  sequencial transacional por unidade protocolizadora + ano (`SELECT FOR UPDATE`).
- **ADR-GP6 — Migração inicial via metadata**: `0001_nucleo` cria o schema a
  partir de `Base.metadata` (sem drift com os models) + trigger da trilha.

## Modelo de dados (Fase 1)

```
organizations (Ente) ── users (Usuário interno, SSO) ── user_roles ── roles (Perfis)
        │                     └── lotacoes_usuario ── unidades (árvore, protocolizadora)
        │                                                 └── sequencias_nup (unidade+ano)
        ├── plano_classificacao (classe hierárquica)
        ├── hipoteses_legais (grau de sigilo, prazo)
        ├── tipos_processo (níveis permitidos, prazo legal, destino padrão)
        ├── tipos_documento (nível mínimo de assinatura, numeração)
        ├── modelos_documento / textos_padrao
        ├── interessados (PF/PJ, cpf_cnpj mascarado em DTO)
        ├── processos (NUP único por tenant) ── processos_unidades (estado por unidade)
        │        ├── documentos (imutável após assinar) ── versoes_documento
        │        │        ├── componentes_digitais (sha256 único) / assinaturas
        │        │        └── versoes_publicas (tarja — LAI)
        │        ├── tramitacoes (múltipla e simultânea)
        │        └── andamentos (linha do tempo)
        ├── classificacoes_sigilo (histórico append-only; expiração automática)
        ├── credenciais_acesso (acesso nominal a processo sigiloso)
        ├── usuarios_externos (cidadão, cadastro próprio + aprovação)
        ├── peticionamentos (novo/intercorrente) ── recibos_protocolo
        ├── intimacoes (ciência + prazo) / acessos_externos / manifestacoes (ouvidoria)
        ├── feriados (nacional/estadual/municipal) / prazos (vencimento + prorrogação)
        ├── sobrestamentos + motivos / acompanhamentos_especiais / bases_conhecimento
        ├── indisponibilidades (certidão + prorrogação automática de prazos)
        ├── tabela_temporalidade (TTD) / processos_arquivisticos (ciclo de vida)
        ├── eliminacoes + listagem/edital/termo / movimentacoes_arquivisticas
        ├── verificacoes_integridade (hash)
        └── trilha: audit_trail (append-only, hash chain) + audit_chain_state
```

Regras materializadas em código:
- `nivel_acesso` do documento nunca menos restritivo que o do processo
  (`core/regras.py`).
- Restrição de acesso exige `hipotese_legal_id`; nível fora do permitido pelo
  tipo é rejeitado.
- CPF/CNPJ com dígito verificador real (CNPJ alfanumérico) em `core/br_validators.py`.
- IDs UUID opacos; nenhum dado pessoal em log/URL/mensagem de erro.

## Perfis (RBAC, escopo por unidade)

`ADMIN`, `SERVIDOR`, `CHEFE_UNIDADE`, `PROTOCOLO`, `AUTORIDADE_SIGNATARIA`,
`GESTOR_SIGILO`, `ARQUIVISTA`, `DPO`, `AUDITOR`. Mapa SaaS→GovPro em
`api/v1/internal.py::_map_role`: `govpro.*` verbatim; `PLATFORM_ADMIN`/`ADMIN` →
`ADMIN`; `ORG_MEMBER` → `SERVIDOR`. Auditor é leitura ampla + trilha, sem edição.

## Checklist de conformidade (parcial — Fases 1 e 2)

- [x] Processo nasce público; restrição com hipótese legal registrada.
- [x] Documento assinado é imutável; não há DELETE de documento no domínio.
- [x] Trilha append-only, encadeada por hash, separada dos logs.
- [x] Nenhum dado pessoal em log/erro/URL; CPF/CNPJ mascarados em DTO.
- [x] CPF/CNPJ validados por DV (CNPJ alfanumérico suportado).
- [x] Nível mínimo de assinatura por tipo de documento aplicado.
- [x] Hash calculado e verificável em todo componente digital; validador público ativo.
- [x] Metadados do Anexo II do Decreto 10.278 exigidos em digitalização.
- [x] Motor de prazos: regra legal + feriados + horário oficial; prorrogação por
  indisponibilidade; sobrestamento com reativação automática.
- [x] Recibo de peticionamento com horário de conclusão do processamento.
- [x] Idempotência/transação na geração de NUP (sequência com lock).
- [x] OpenAPI publicado; erros em Problem Details; versionamento `/api/govpro/v1`.
- [ ] eMAG/WCAG AA (frontend — telas do cidadão, fora do backend).
- [x] Retenção/descarte a partir da TTD (eliminação com rito completo + expurgo lógico).
- [x] Exportação completa do acervo em formato aberto (SIP/AIP) — sem lock-in.
- [x] Verificação periódica de integridade por hash (preservação digital).

## Roadmap (fases seguintes)

- ~~Fase 2 — Documentos e sigilo~~ (concluída).
- ~~Fase 3 — Cidadão~~ (concluída).
- ~~Fase 4 — Prazos e gestão~~ (concluída).
- ~~Fase 5 — Arquivo e interoperabilidade~~ (concluída: TTD/ciclo de vida, eliminação
  com rito completo, transferência/recolhimento, integridade, exportação SIP/AIP,
  dados abertos).

### Pendências (fora do backend)
- **Frontend**: área interna, portal do cidadão, consulta pública e validador —
  seguindo o Design System do gov.br e eMAG/WCAG AA.
- **Adaptadores opcionais** (isolados, prontos a ativar): Tramita.GOV.BR, Diário
  Oficial, assinatura qualificada ICP-Brasil, gov.br (decidido fora do piloto),
  e-mail/SMS para avisos.

> Fora do escopo (decisão do cliente): gov.br, taxas/Pix e migração de sistema
> legado. Tramita.GOV.BR e Diário Oficial ficam como adaptadores futuros.
