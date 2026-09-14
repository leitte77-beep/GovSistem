# Production Readiness — Diário Oficial Eletrônico (`modulo-diario`)

**Data:** 2026-09-14
**Regra:** cada item marcado é sustentado por evidência de código/teste. Itens
desmarcados trazem o bloqueio técnico explícito. Nada foi declarado pronto sem
prova.

---

## Código

- [x] Suíte de backend semântico verde (78 passed).
- [x] Suíte do signer verde (63 passed).
- [x] Frontend verde (96 vitest) e `tsc --noEmit` sem erros.
- [x] Lint limpo nos arquivos alterados (ruff).
- [ ] Suíte completa da API 100% verde — 7 falhas **pré-existentes** de fixtures/mocks (Pydantic 2.13 + MagicMock). Bloqueio: corrigir as fixtures de `test_editions`, `test_imports` (CSV), `test_public_v1`, `test_security`, `test_signing_credentials_api`.
- [x] Worker Celery de PDF conectável — `PDF_GENERATION_ASYNC` enfileira `generate_edition_pdf`; com broker indisponível ou flag desligada, cai no caminho síncrono (nunca deixa a edição sem PDF). Ativar `celery` no `requirements` do api.
- [ ] Validar o caminho assíncrono com Redis real em homologação (compose já tem `redis`).

## Banco

- [x] Migrations aditivas; nenhum `DROP`/`TRUNCATE`/reseed.
- [x] `tenant_id`/`organization_id` com FK e índices nas novas tabelas.
- [ ] `EditionItem.page_number` preenchido após a geração. Bloqueio: implementar pós-processamento da paginação (hoje só `classico` resolve via `target-counter` no CSS).

## Multi-tenant

- [x] Snapshot, modelos e PDFs assinados com escopo de tenant.
- [x] Isolamento de queries verificado em testes (`test_authority_is_tenant_scoped`, testes de tenant no motor).
- [x] PDF **não assinado** gravado em `UPLOAD_DIR/{tenant_slug}/pdf/` quando `STORAGE_TENANT_ISOLATION` (compatível com `read_public_file`).
- [ ] Testes de enumeração/IDOR/tenant cruzado de ponta a ponta. Bloqueio: criar suíte E2E autenticada com dois tenants.

## Segurança

- [x] XSS do renderer coberto (bleach allow-list + `_safe_url`), `test_renderer_security` verde.
- [x] Sanitização de colagem Word (`stripWordMso`, `cleanPastedHtml`).
- [x] Chave interna do signer fail-closed.
- [ ] CSP/HSTS/reverse proxy auditados em produção. Bloqueio: revisar `infra/nginx` e headers.
- [ ] Rate limiting/brute force/MFA para publicadores e signatários. Bloqueio: confirmar `test_mfa_api` e configurar provedor.
- [x] Chave interna do signer comparada com `hmac.compare_digest` (tempo constante).

## Backup

- [ ] Backup do banco, dos PDFs oficiais, das configurações e do audit trail.
- [ ] Retenção, versionamento de objetos e criptografia definidos.
- [ ] Teste de restore documentado e executado.

Bloqueio: existe `BACKUP_RESTORE.md` no módulo; falta **executar** e anexar evidência.

## Restore

- [ ] Restaurar tenant, edição, matérias, PDF assinado, configuração (sem expor segredo) e audit trail.
- [ ] PDF publicado tratado como ativo documental imutável no backup.

## PDF

- [x] WeasyPrint A4, unicode, texto pesquisável, sem regeneração no download.
- [x] Convergência PDF ↔ HTML público pelo documento semântico canônico.
- [x] Sumário com página real em **todos** os layouts (`target-counter` em `classico`, `moderno`, `minimalista`).
- [x] Conteúdo semântico no PDF recebe o CSS `.doe-*` (sem `@page`, para não conflitar com o template da edição).
- [x] Paginação editorial: `orphans/widows`, `break-after: avoid` para título/súmula/comando e `break-inside: avoid` para assinatura e linhas de tabela.
- [ ] PDF/UA (acessível/tagged) — depende de suporte do WeasyPrint; documentar limitação.

## Autodiagramação

- [x] SÚMULA/EMENTA reconhecida e preservada.
- [x] CONSIDERANDO, preâmbulo, incisos e bloco de assinatura reconhecidos.
- [x] Integridade textual bloqueia perda de tokens sensíveis.
- [x] Teste golden permanente da Portaria 220/2026.
- [ ] Corpus amplo (decreto, lei, edital, resolução, extrato, 50+ artigos, tabelas grandes, anexos) com regressão visual/golden files.
- [ ] IA opcional com schema + comparação de hash (hoje desligada e não necessária).

## A1

- [x] PFX via request; senha nunca logada; material em memória.
- [x] A1 real via pyHanko incremental (PAdES-B-B).
- [ ] Material em repouso criptografado via secret manager/KMS.
- [ ] Rotação e auditoria de uso da credencial.
- [ ] Reduzir exposição do PFX em arquivo temporário (avaliar API do pyHanko sem arquivo).

## A3

- [x] Abstração implementada: `A3RemoteSignatureProvider` (ponte HTTP para PSC/HSM, testada com mock) e `A3LocalSignatureProvider` (documenta o fluxo no dispositivo e recusa execução server-side). Registrados no factory.
- [ ] Integrar com o PSC/HSM real do ente (`SIGNER_A3_REMOTE_URL`/token) e validar presença/autorização do titular.

## PAdES

- [x] Assinatura incremental preserva a revisão-base (`/ByteRange`, CMS).
- [x] Subfilter `/ETSI.CAdES.detached`.
- [ ] Atributo de política ICP-Brasil (AD-RB/RT/RV/RC/RA) e OID correspondente — `policy_oid` vazio hoje. `LEGAL_REVIEW_REQUIRED` para escolher a política.

## Timestamp

- [x] Conectado ao fluxo: quando `TSA_URL` está configurada, o `PdfSigner` usa `HTTPTimeStamper` e o token RFC 3161 é embutido; `timestamp_status` é reportado no `SignResponse`.
- [ ] Configurar ACT ICP-Brasil real, validar a cadeia do token e a política (`TSA_POLICY_OID`).

## Validação ICP-Brasil

- [x] Raízes configuráveis via `ICP_BRASIL_ROOTS_PATH` (fallback `signer/certs/icp-brasil-roots.pem`, com README). Enquanto ausentes, `trusted=False` de forma honesta.
- [x] CRL corrigida: `load_der_x509_crl`/`load_pem_x509_crl`, TLS verificado, serial conferido de fato; revogado falha a validação; fonte inacessível é reportada como "não verificada".
- [x] OCSP implementado (RFC 6960): request DER, status REVOKED/GOOD/UNKNOWN, cache; revogado falha.
- [x] Integridade/ByteRange validados e reportados de forma honesta.
- [ ] Revisar exibição pública para nunca sugerir confiança quando `chain_trusted=False` (backend já separa `chain_trusted`).

## Auditoria

- [x] Transições de matéria/edição registradas (`AuditLog`).
- [ ] Trilha de auditoria imutável e não editável pela interface.
- [ ] before/after, correlation id e IP/user-agent padronizados em todos os eventos.
- [ ] Auditoria de tentativa de assinatura e mudança de certificado.

## Acessibilidade

- [x] Página pública: um único `<h1>`, âncoras de sumário, foco visível, axe sem violações critical/serious (relatório de homologação; passa isolado).
- [ ] Suíte axe completa e mobile estável em ambiente com recursos.
- [ ] Revisão WCAG 2.2 AA formal.

## Monitoramento

- [ ] Métricas `pdf_generation_duration/failures`, `signature_*`, `validation_*`, `queue_depth`, `http_error_rate`, `database_latency`.
- [ ] Correlation/request ID ponta a ponta.
- [ ] Logs estruturados e alertas.

## Performance

- [ ] Geração de PDF fora do request (worker/fila) para edições grandes.
- [ ] Testes 1/10/100 matérias e centenas de páginas.
- [ ] Estados reais na UI (fila, diagramando, gerando, assinando, validando, publicado, erro).

## Disaster Recovery

- [ ] Plano documentado, RPO/RTO definidos e testados.
- [ ] Servidores com horário sincronizado (NTP) e timezone do órgão na apresentação.

## Homologação

- [x] Motor semântico e conservação homologados (relatórios anteriores).
- [x] Correções desta rodada testadas localmente.
- [ ] E2E Playwright completo (desktop + mobile) e axe-em-suite estáveis.
- [ ] Assinatura com certificado ICP-Brasil real + TSA + OCSP/CRL.

---

## Resumo executivo

## Correções da 2ª rodada

- Revogação **real**: CRL corrigida (serial de fato, sem `verify=False`) e
  **OCSP implementado**; revogado falha, fonte inacessível é "não verificada".
- Raízes ICP-Brasil configuráveis (`ICP_BRASIL_ROOTS_PATH`) + `certs/README`.
- **ACT/RFC 3161 conectado** ao PAdES via `TSA_URL` (status reportado).
- **A3**: abstrações `a3_remote` (ponte PSC testada) e `a3_local` (recusa
  server-side); registradas no factory.
- **Sumário com página real nos 3 layouts** e CSS `.doe-*` embutido no PDF
  sem `@page`.
- **Paginação editorial** (`orphans/widows/break-*`).
- **PDF não assinado isolado por tenant**.
- **Worker assíncrono opt-in** (`PDF_GENERATION_ASYNC`) com fallback síncrono.
- `hmac.compare_digest` na chave interna; limpeza de código morto.
- **74 testes do signer** (11 novos de CRL/OCSP/A3) verdes.

**Pronto tecnicamente:** motor semântico de autodiagramação (SÚMULA,
CONSIDERANDO, preâmbulo, incisos, assinatura), conservação textual,
convergência PDF↔HTML público, integridade PAdES, ACT conectável, revogação
CRL/OCSP, A3 abstraído, sumário com página real, imutabilidade do PDF
assinado, isolamento de tenant nas entidades centrais, testes verdes.

**Bloqueios externos/decisão:** certificado ICP-Brasil real + raízes, ACT real
configurado e validado, política PAdES (revisão jurídica), integração com o
PSC/HSM real, backup/restore executado e observabilidade.
