# Migração do Acervo e Esquema

## Migrações de esquema

- Gerenciadas por **Alembic** (`api/alembic/versions`). **Nunca** usar `create_all()` em produção.
- `ALEMBIC_EXPECTED_HEAD` (config) faz verificação fail-closed no startup da API: se o banco não
  estiver no head esperado, o processo aborta.
- Heads: **consolidados em um único head**. Head atual: `j7k8l9m0n1o2`
  (Fase 5C: `matters.workflow_status` — fluxo de criação/revisão do documento;
  `down_revision = i6j7k8l9m0n1`, que trouxe as fundações do construtor visual
  de modelos documentais). Ver `RELATORIO_MODELOS_DOCUMENTAIS_FASE1.md`.
- Tabelas aditivas da fase de hardening são aplicadas via DDL idempotente
  `api/sql/hardening_timestamp_and_audit.sql` no passo de deploy (padrão da casa para fases aditivas,
  sem alterar o grafo do Alembic).

## Migração do acervo histórico

Objetivo: **nunca renumera/ressina/substitui** o acervo. Preservar byte a byte o PDF original.

- Módulo `LegacyImport`: `api/app/services/legacy_importer.py` + `api/app/api/v1/legacy_import.py`.
- Fontes: exportação da plataforma antiga, API, banco exportado, arquivos, crawler controlado
  (último recurso).
- Estados: `DISCOVERED → DOWNLOADED → HASHED → PARSED → VALIDATED → IMPORTED → ERROR`.

### Regras

- Cada edição histórica guarda número/ano/data/URL/PDF/hash/páginas/assinaturas/metadados/status.
- PDFs com assinatura são mantidos como **`LEGACY_ORIGINAL`** (nunca reaberto/reassinado).
- Representação HTML derivada é claramente marcada como índice de consulta — **nunca** alegada como o
  arquivo oficial assinado.
- Relatório de consistência obrigatório antes de ir a produção:
  `origem == importadas`, hashes OK, primeira/última edição, lacunas numéricas, datas, arquivos.

## Linkage de URLs legadas

`api/app/models/legacy_url_map.py` (`legacy_url_maps`) mapeia URLs históricas →
novos caminhos; redirects 301 (rota `/go/{path}`) preservam SEO. Ver `LANDING/API` docs.

## Indicador `legacy_original`

Metadado explícito para cada material importado do legado, com `source_url/source_hash/imported_at/
source_system/signature_detected/signature_validation_status`. Nenhuma reconstrução silenciosa.
