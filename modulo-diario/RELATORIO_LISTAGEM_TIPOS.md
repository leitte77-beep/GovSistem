# Bloco — Vínculo ato↔estados por tipo + listagem (fecha Inc5 base)

Emenda ao Incremento 5, em português, aditiva e **sem tocar** `matters.py`/
`editions.py` (em andamento do cliente). Backend validado por testes; frontend
validado por `tsc --noEmit` (exit 0).

## Backend

- **Coluna aditiva** `matters.document_type` (+ índice) — migração
  `h5i6j7k8l9m0` (down `g2a3b4c5d6e7`); cabeça alembic atualizada. Populada ao
  criar minuta via modelo (`ingest.create_rendered_matter` lê
  `document.document_type`); nula em matérias legadas.
- **Endpoint `GET /document-models/materials`** (escopado por organização, com
  permissões de leitura de modelos): lista atos por tipo com **estados
  separados por dimensão** derivados do fluxo **real**:
  * `editorial_status` = estado da matéria;
  * `signature_status` = `edition_signed`/`none` (o ato está em edição
    assinada) e `publication_status` = `published`/`not_published` — ambos via
    `edition_items` → `editions`. O rótulo deixa claro que a assinatura PAdES é
    da **edição**, não do ato isolado (nada de assinatura criptográfica fingida).
  * Filtros: `document_type`, `editorial`, `signature` (`signed`/`none`),
    `publication`, `search`, paginação. Cada menu/tipo usa um filtro de estado.

## Frontend

- `lib/api.ts`: `listMaterials(...)`.
- Página genérica **`/documentos/tipos/[tipo]`** com abas: Todos, Rascunhos,
  Em revisão, Aprovados, Aguardando assinatura, Assinados, Publicados — cada aba
  mapeia a um filtro real do endpoint (ex.: "Aguardando assinatura" =
  `editorial=approved&signature=none`). Colunas: número/ano (ou "Sem número"),
  documento/ementa, situação, assinatura, publicação, edições.
- Visão geral (`/documentos`) agora aponta cada tipo para sua listagem.

## Validação
- Teste novo em `test_document_models_material_number.py` (listagem por tipo com
  estados derivados: draft/`none`/`not_published`, filtros vazios corretos,
  isolamento por tipo). **6 passed** no arquivo.
- Backend completo: **571 passed** (as 7 falhas são as pré-existentes/
  ambientais). Frontend: `npx tsc --noEmit` → **exit 0**.

## Limites reais (não fingidos)
- Assinatura/publicação por ato são **derivadas** do vínculo à edição (é o que
  existe de verdade). Não há ainda assinatura criptográfica individual do ato
  nem "Criar com IA" em etapas ligado ao editor — próximos blocos.
- Listagem em memória até 500 por chamada (paginação depois dos derivados);
  escala via SQL dedicado quando necessário.
- Migração `h5i6j7k8l9m0` **não aplicada** ao banco vivo (rebuild + `alembic
  upgrade head`).
