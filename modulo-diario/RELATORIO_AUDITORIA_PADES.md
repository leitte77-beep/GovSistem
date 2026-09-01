# Relatório de Auditoria, Correção e Validação — Fluxo de Formatação, Geração e Assinatura PAdES do Diário Oficial

**Data:** 2026-09-01
**Escopo:** módulo `modulo-diario` (FastAPI/WeasyPrint + signer pyHanko + Next.js/TipTap)
**Backup versionado:** `.backup_audit_pades_20260901_181304/` (todos os arquivos alterados)

---

## 1. Causa raiz comprovada da perda de formatação

A formatação era perdida na **geração do PDF (WeasyPrint)**, e não na assinatura, por duas razões somadas:

1. **CSS dos layouts impunha estilos com `!important` e regras globais** sobre o conteúdo do editor:
   - `templates/pdf/layouts/{classico,moderno,minimalista}/edition.css`
     - `.matter-content p { text-align: justify !important; text-indent: 36pt/28pt; }` — forçava **justificação e recuo** em todos os parágrafos, ignorando alinhamentos do editor.
     - `.matter-content table { table-layout: fixed; }` + `tr > th:first-child { width: 8% }` / `:nth-child(2) { width: 42% }` — **destruía larguras/colspan/rowspan** das tabelas.
     - `th { text-align: center }`, `font-size: 8.5pt/8pt` — sobrescrevia tamanhos e alinhamentos.
   - Havia ainda um **`}` órfão** após o bloco `@page` no `classico/edition.css` (linha 11), um erro de sintaxe CSS.

2. **Sanitizador removia propriedades CSS de apresentação** produzidas pelo TipTap:
   - `api/app/core/html_sanitizer.py` → `ALLOWED_STYLES` **não incluía** `font-size`, `font-family`, `line-height`, `text-indent`, `letter-spacing`, `text-transform`, `white-space`, `page-break-*`, etc. O `bleach` as removia dos `style` inline antes de chegarem ao WeasyPrint.

**A assinatura (signer) não era a causa da perda de formatação** — mas tinha um defeito grave separado: reconstruía o PDF (selo FPDF em todas as páginas + nova página de manifesto + `PdfWriter.append/write` = **rewrite completo, não incremental**) e não produzia assinatura PAdES real (`/Sig`, `/ByteRange`, CMS ausentes — apenas selo visual). Como o `signed_pdf_hash` era gravado no banco mas o PDF assinado não tinha assinatura real, e ainda o template imprimia "SHA-256 DO PDF" **dentro** do PDF (o que altera o próprio hash), havia divergência de hash observada (`4a3dcc…` armazenado vs `9516be…` real).

## 2. Etapa exata onde a formatação se perdia

| Etapa | Ocorre? |
|-------|---------|
| Editor TipTap → HTML | ✅ correto |
| Sanitização backend (`html_sanitizer.py`) | ❌ **removia `font-size/font-family/line-height`** |
| Template Jinja2 + CSS | ❌ **sobrescrevia alinhamento/recuo/largura de tabela** |
| WeasyPrint (geração) | ✅ após correções, respeita o HTML/CSS autoral |
| Assinatura (signer) | ✅ agora **incremental**, preserva bytes da revisão-base |

## 3. Arquivos alterados

**Backend (API):**
- `api/app/core/html_sanitizer.py` — ampliou `ALLOWED_STYLES` (preserva todas as propriedades de apresentação do editor).
- `api/app/models/edition.py` — novos campos: `source_pdf_hash`, `signed_pdf_hash`, `content_manifest_hash`, `signature_validation_status`, `signature_validation_details`, `renderer_version`, `layout_version`.
- `api/app/api/v1/editions.py` — fluxo de assinatura: não re-gera PDF, calcula `source_pdf_hash`, cruza hashes com o signer, só muda para `SIGNED` após validação, metadados completos (sem truncar `signature_data`), calcula `content_manifest_hash`.
- `api/app/templates/pdf/edition.html` e `layouts/{classico,moderno,minimalista}/edition.{html,css}` — removido o hash circular "SHA-256 DO PDF"; CSS preserva a formatação autoral (sem `!important`, sem `table-layout: fixed`, sem larguras forçadas); removido `}` órfão.
- `api/requirements.txt` — adicionado `pyhanko==0.37.0`, `pyhanko-certvalidator==0.32.0`.

**Serviço de assinatura (signer):**
- `signer/app/providers/a1.py` — reescrito `sign()` para **PAdES incremental real com pyHanko** (`IncrementalPdfFileWriter` + `PdfSigner`); removida reconstrução de páginas com FPDF; `verify()`/`verify_detailed()` agora **validam criptograficamente** o CMS/`/ByteRange`.
- `signer/app/api/internal.py` — `X-Internal-Key` **fail-closed** (503 se não configurada); execução de `sign()`/`verify()` em thread (compatível com `asyncio.run()` do pyHanko).
- `signer/requirements.txt` — adicionado `pyhanko==0.37.0`, `pyhanko-certvalidator==0.32.0`.

**Novos arquivos:**
- `api/alembic/versions/9a8b7c6d5e4f_add_pades_hashes_to_editions.py` — migração aditiva.
- `api/app/commands/audit_editions.py` — auditoria somente-leitura.
- `api/tests/test_sanitizer.py` — testes do sanitizador.
- `signer/tests/test_pades_signing.py` — testes de assinatura PAdES.

## 4. Migration criada

`9a8b7c6d5e4f_add_pades_hashes_to_editions.py` (aditiva): adiciona à tabela `editions` as colunas `source_pdf_hash`, `signed_pdf_hash`, `content_manifest_hash`, `signature_validation_status`, `signature_validation_details` (JSON), `renderer_version`, `layout_version`. As colunas foram aplicadas diretamente (schema gerenciado manualmente, sem `alembic_version`):

```sql
ALTER TABLE editions ADD COLUMN IF NOT EXISTS source_pdf_hash VARCHAR(64);
ALTER TABLE editions ADD COLUMN IF NOT EXISTS signed_pdf_hash VARCHAR(64);
ALTER TABLE editions ADD COLUMN IF NOT EXISTS content_manifest_hash VARCHAR(64);
ALTER TABLE editions ADD COLUMN IF NOT EXISTS signature_validation_status VARCHAR(50);
ALTER TABLE editions ADD COLUMN IF NOT EXISTS signature_validation_details JSON;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS renderer_version VARCHAR(50);
ALTER TABLE editions ADD COLUMN IF NOT EXISTS layout_version VARCHAR(50);
```

Campos legados (`pdf_hash`, `immutability_hash`, `signed_pdf_path`) mantidos para compatibilidade; `pdf_hash` continua sendo preenchido (agora com o hash do PDF assinado) e `signed_pdf_hash` é o campo canônico novo.

## 5. Dependências adicionadas (versões fixadas)

- **signer e API:** `pyhanko==0.37.0`, `pyhanko-certvalidator==0.32.0` (+ transitivas: `asn1crypto`, `lxml`, `aiohttp`, `oscrypto`, `cryptography>=44`).

## 6. Novo fluxo (geração → assinatura separadas)

1. **Geração (WeasyPrint):** monta o PDF completo (capa, sumário, matérias, anexos, validação) a partir do HTML sanitizado + templates corrigidos. Salva como **versão imutável não assinada** e calcula `source_pdf_hash`.
2. **Assinatura:** o endpoint de assinatura **não re-gera/repagina** — usa exatamente os bytes do PDF armazenado, calcula `source_pdf_hash` e os envia ao signer.
3. **Signer (pyHanko):** `IncrementalPdfFileWriter` + `PdfSigner` — acrescenta **somente a revisão incremental da assinatura** (não reconstrói páginas). Gera `/Sig` real, `/ByteRange` cobrindo a revisão assinada e CMS em `/Contents`.
4. **Validação:** o signer confere a integridade criptográfica (`intact`) e só então a API armazena o PDF assinado, calcula `signed_pdf_hash`, grava `content_manifest_hash`, `signature_validation_status` e muda o status para `SIGNED`.
5. **Publicação/verificação:** o hash real do arquivo assinado é exibido na verificação pública; **nada é impresso dentro do PDF alegando ser o hash do próprio arquivo** (apenas código de verificação + QR).

## 7. Resultado dos testes

**Sanitizador** (`tests/test_sanitizer.py`, 7 testes) — **7 passed**:
- alinhamento (left/center/right/justify), negrito/itálico/sublinhado/tachado, cor/tamanho/família/line-height/recuo, `colspan`/`rowspan`/`vertical-align`/largura de tabela, links/imagens, remoção de `script`/`onclick`/`javascript:`, `javascript:` em CSS, listas.

**Assinatura PAdES** (`tests/test_pades_signing.py`, 5 testes) — **5 passed**:
- revisão-base preservada como prefixo (`signed[:len(src)] == src`), `/Sig` real e validação `intact=True`, subfilter `ETSI.CAdES.detached`, `/ByteRange[4]`, adulteração de 1 byte → `intact=False`, páginas/MediaBox inalterados, hash assinado difere do fonte.

## 8. Hash dos PDFs de teste (antes/depois da assinatura)

| Etapa | SHA-256 |
|-------|---------|
| PDF não assinado (fonte) | `d444aba0ae9cd6576d57cdf4d34d24b8192c263634932b7c943cc2f354dc32cb` |
| PDF assinado (incremental) | `492952982e416d75b7a5967f8fd3a4fb2aef5f7446797fb43036c25d0347e724` |

(O hash assinado varia a cada assinatura porque o CMS inclui data/hora; o fonte é estável.)

## 9. Resultado da validação PAdES

- `validation_status: ok` (signer), `format: PAdES`.
- Subfilter padrão `ETSI.CAdES.detached`, `Filter /Adobe.PPKLite`, `/ByteRange` real, CMS íntegro.
- **Revisão-base preservada como prefixo: `True`** (prova de assinatura incremental).
- **Páginas e MediaBox inalterados** entre não assinado e assinado.
- **Adulteração de 1 byte → `intact=False`** (validação falha).

## 10. Comparação visual (não assinado × assinado)

Como a assinatura agora é **incremental e invisível** (padrão; sem selo/reflow), o conteúdo renderizado é **byte-igual ao da pré-visualização**: mesmas páginas, MediaBox, content streams e posições de texto/tabelas/imagens. Não há reformatação, redimensionamento, justificação ou reconstrução. (Para um selo visível, reserva-se uma caixa na última página sem reflow — opcional.)

## 11. Relatório somente-leitura das edições antigas

Comando: `python -m app.commands.audit_editions --org farol` (também `--json`). Resultado para o tenant farol:

```
Total de edições auditadas: 5
  2026/2 [published] sig=False ok=False presente=True -> status marcado como assinado/publicado sem /Sig
  2026/3 [published] sig=False ok=False presente=True -> status marcado como assinado/publicado sem /Sig
  2026/4 [published] sig=False ok=False presente=True -> status marcado como assinado/publicado sem /Sig
  2026/5 [published] sig=False ok=False presente=True -> status marcado como assinado/publicado sem /Sig
  2026/7 [signed]   sig=False ok=False presente=True -> hash armazenado difere do hash real do arquivo, status marcado sem /Sig
```

**Conclusão da auditoria:** as edições publicadas 2–5 e a demo 7 **não possuem `/Sig`** (os PDFs atuais foram regenerados não-assinados após perda anterior de storage efêmero). Isso confirma a divergência banco × arquivo. **Nenhum documento foi alterado/reassinado** — cabe decisão administrativa re-assinar/republicar (exige certificado ICP-Brasil real).

## 12. Procedimento de implantação

```bash
cd /home/ubuntu/sistemaweb/modulo-diario
# 1) Aplicar colunas (já aplicadas neste ambiente; reexecutar é idempotente):
PGPASSWORD=... psql -h 127.0.0.1 -p 9632 -U diario_user -d modulo_diario \
  -c "ALTER TABLE editions ADD COLUMN IF NOT EXISTS source_pdf_hash VARCHAR(64); ..."
# 2) Rebuild das imagens com as novas dependências e código:
docker compose build api signer
# 3) Recriar os containers:
docker compose up -d api signer
# 4) Validar saúde:
curl -s http://127.0.0.1:9203/api/v1/health
docker exec modulo-diario-api-1 curl -s http://signer:8100/api/v1/health
# 5) Rodar testes:
docker exec -w /app modulo-diario-api-1 python -m pytest test_sanitizer.py
docker exec -w /app modulo-diario-signer-1 python -m pytest test_pades_signing.py
```

## 13. Procedimento de rollback

Todos os arquivos alterados possuem cópia original em `.backup_audit_pades_20260901_181304/`. Para reverter:
1. Restaurar os arquivos dos backups (ex.: `cp .backup_audit_pades_20260901_181304/editions.py.bak api/app/api/v1/editions.py`).
2. Remover as colunas novas (opcional; são `NULL` e não afetam leitura): `ALTER TABLE editions DROP COLUMN IF EXISTS source_pdf_hash, ...`.
3. Rebuild + recreate:
```bash
docker compose build api signer && docker compose up -d api signer
```
> O signer **legado** (sem pyhanko) não deve ser restaurado se o objetivo for manter assinaturas PAdES válidas; a versão antiga produzia apenas selo visual sem assinatura real.

## 14. Pendências que dependem de certificado ICP-Brasil, TSA/ACT ou infraestrutura externa

- **Certificado ICP-Brasil real e cadeia/raízes:** os testes usam um PKCS#12 **self-signed de teste**. Para conformidade AD-RB de produção é preciso (a) certificado A1 ICP-Brasil real, (b) as raízes ICP-Brasil em `signer/certs/icp-brasil-roots.pem` (a `validate_icp_brasil` avisa quando ausente), para a validação de cadeia. Com o certificado de teste, `verify()` confirma integridade (`intact`) mas a cadeia não valida (esperado).
- **TSA/ACT (carimbo de tempo RFC 3161):** **não há TSA configurada** — por isso `PdfSignatureMetadata` é usado **sem** `timestamper`. Nenhuma TSA foi inventada. Para PAdES com carimbo de tempo (BES/LTA), configurar uma TSA/ACT autorizada; a assinatura continuará válida sem ela (PAdES-BES), mas sem comprovação temporal externa.
- **OCSP/CRL (revogação):** a `icp_brasil.py` tinha `verify=False` e parsing incorreto de CRL. A validação via pyHanko/pyhanko-certvalidator agora é a fonte primária; a checagem OCSP/CRL completa depende de infraestrutura de revogação (URLs de CRL/OCSP dos certificados reais) e do perfil (LT/LTA) exigido.
- **TLS interno entre API↔signer:** hoje é HTTP em rede interna com `X-Internal-Key`. A comunicação protegida por TLS/mTLS exige decisão de infraestrutura fora deste escopo; enquanto não houver TLS, a chave interna é o controle de acesso (fail-closed) e nenhuma senha/PFX é registrada em log.

---

## Resumo executivo

A **perda de formatação** tinha duas causas (CSS com `!important`/`table-layout: fixed` + sanitizador removendo `font-size/font-family/line-height`), corrigidas. A **assinatura** deixou de ser um selo visual sem criptografia e passou a ser uma **assinatura PAdES incremental real** (pyHanko): preserva integralmente os bytes da revisão-base, adiciona `/Sig`/`/ByteRange`/CMS válidos, é criptograficamente validada e detecta qualquer adulteração de 1 byte. Hashes divergentes foram corrigidos (removido o hash impresso dentro do PDF), campos e migração aditivos criados, e a auditoria read-only revela que as edições publicadas atuais não têm `/Sig` (pendência de decisão administrativa para re-assinar com certificado real).
