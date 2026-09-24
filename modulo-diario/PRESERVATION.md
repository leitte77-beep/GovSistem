# Preservação Digital (CONARQ / e-ARQ / RDC-Arq)

## Objetivo

Tratar o acervo como documento institucional permanente, observando orientações CONARQ, e-ARQ e
RDC-Arq, **sem tocar** nos arquivos assinados já produzidos.

## PDF/A — POC (estado)

- **Não iniciado a conversão automática.** A compatibilidade PDF/A × WeasyPrint × PAdES × pyHanko ×
  carimbo de tempo exige POC dedicada.
- Princípio: **converter para o formato de preservação ANTES da assinatura**; nunca
  `PDF assinado → PDF/A` (quebraria a assinatura).
- Avaliar PDF/A-2 ou perfil tecnicamente compatível.
- Ver `PRESERVATION_POC.md` (gerado quando a POC for executada). Se a POC demonstrar incompatibilidade
  ou risco, **não forçar** — documentar a decisão.

## Convenções já adotadas

- Assinatura PAdES **incremental** preserva os bytes da revisão-base (não reconstrói).
- Todos os processamentos (compressão, OCR, watermark, metadata, thumbnail, otimização) ocorrem
  **antes** da assinatura; depois de assinar o objeto é imutável.
- Hashes em camadas: `source_pdf_hash`, `signed_pdf_hash`, `content_manifest_hash`, `matter_content_hash`.

## Metadados de preservação

- Publicação mantém snapshot imutável (`edition_publication_snapshots`).
- Assinatura, carimbo de tempo (`timestamp_records`), auditoria (`signature_operation_audits`),
  manifesto e cadeia de certificados necessária à validação devem ser preservados.
- Proveniência: registros de importação (`legacy_original`), URL de origem, fonte, hashes.

## Object Lock / WORM (POC)

- Avaliar WORM no MinIO para PDFs publicados, manifests, assinaturas e timestamp tokens.
- **Não ativar destrutivamente em produção sem homologue** e validação de infraestrutura.

## Ações recomendadas

1. Executar POC PDF/A (em `PRESERVATION_POC.md`).
2. Habilitar Object Lock em bucket dedicado (homologação → produção).
3. Estratégia 3-2-1 com teste de restauração (ver `BACKUP_RESTORE.md`).
