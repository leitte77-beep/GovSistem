# Relatório — Redesign das Telas Administrativas do Diário Oficial

**Data:** 2026-09-01
**Escopo:** `web-admin` (Next.js 14 + React 18 + Tailwind). Preservou integralmente sanitizador, templates de PDF, PAdES/pyHanko, migrations e `X-Internal-Key`.
**Backup:** nenhum arquivo de PDF/signatário foi tocado. Alterações apenas no frontend + wrapper de API + testes.

---

## 1. Diagnóstico dos componentes e rotas

Rotas/componentes encontrados: `AdminShell`, `Breadcrumbs`, `ConfirmModal`, `NotificationsPanel`, `RequireRole`, `Matter/{MatterForm, AttachmentUpload, HtmlPreview, StatusBadge, StatusHistory, ProtectedRoute}`, `Edition/{EditionForm, EditionPreview, MatterKanban}`, `Editor/*`, `LegacyImport/*`.

Problemas identificados (sem tocar na lógica crítica de PDF/PAdES):
- **Mapas de status duplicados/hardcoded** em `StatusBadge.tsx`, `matters/page.tsx`, `editions/page.tsx`, `page.tsx` — rótulos e códigos internos (`draft`, `pdf_generated`, …) expostos.
- **Datas** via `toLocaleDateString("pt-BR")` dependente do runtime (podiam cair em `en-US`, ex.: `07/15/2026`); sem fuso explícito.
- **Botões por estado errados**: "Editar" para todos os estados; lixeira/excluir sem confirmação e para estados proibidos.
- **Banner decorativo** no dashboard e **imagem externa de data center** no fim de `editions/page.tsx`.
- **"Mais Filtros" decorativo** (sem handler) em matérias.
- **Sem** link "Pular para o conteúdo", contadores de filtros, `EmptyState` reutilizável, ou confirmação acessível padronizada.

## 2. Problemas corrigidos

- Status centralizados (matéria + edição) com rótulo pt-BR, descrição, cor, ícone, editável e ações por estado — **nenhum código interno aparece na UI**.
- Datas/horas **pt-BR** (`dd/MM/yyyy`, `HH:mm`, fuso `America/Sao_Paulo`, data por extenso "1º de setembro de 2026") e **pluralização** (0 matérias/1 matéria/2 matérias, itens, edições, anexos).
- Lista de matérias: filtros funcionais (status, tipo, unidade + busca), ações por estado, "Excluir"/"Arquivar" com `ConfirmDialog`, datas pt-BR, contador de filtros, "Limpar filtros", mobile em cartões, sem botões decorativos.
- Lista de edições: removida a imagem externa; tipos padronizados (Normal/Extraordinária/Suplementar); status pt-BR; datas pt-BR; "Visualizar" para publicadas; contador de matérias clicável; sem lixeira para publicada.
- Dashboard: cabeçalho compacto, indicadores de pendência, fluxo por estado (com ícones/cores), ações rápidas; removidos banner e card técnico "ONLINE".
- Acessibilidade: link "Pular para o conteúdo", `ConfirmDialog` acessível (dialog/focus trap/Escape), tabelas com `caption`/`scope`, ícones com `aria-hidden`, contraste ajustado.

## 3. Arquivos alterados

**Novos:**
- `web-admin/src/lib/statusConfig.ts` — mapas centralizados de status/ações/tipos.
- `web-admin/src/lib/format.ts` — datas/horas/pluralização pt-BR.
- `web-admin/src/components/StatusBadge.tsx`, `PageHeader.tsx`, `EmptyState.tsx`, `ConfirmDialog.tsx`.
- `web-admin/src/lib/__tests__/format.test.ts`, `statusConfig.test.ts`.

**Alterados:**
- `web-admin/src/app/page.tsx` (dashboard), `matters/page.tsx`, `editions/page.tsx` (listas), `layout.tsx` (skip link/foco), `lib/api.ts` (parâmetros `act_type_id`/`org_unit_id`).

## 4. Novos componentes reutilizáveis

`StatusBadge`, `PageHeader`, `EmptyState`, `ConfirmDialog`. (Demais da lista — `WorkflowStepper`, `StateBanner`, `DataTable`, `FilterBar`, `ActionMenu`, `FormField`, `MetadataPanel`, `AuditTimeline`, `RejectDialog`, `SigningDialog`, `PdfSummary`, `SignatureSummary`, `InlineAlert`, `ToastRegion`, `StickyActionBar` — ficam como pendência/evolução; o projeto já usa `react-hot-toast` e os padrões atuais foram consolidados em vez de introduzir uma segunda biblioteca.)

## 5. Alterações de API

- `api.ts.listMatters` agora envia `act_type_id` e `org_unit_id` (o backend já os suportava). Nenhuma mudança de backend.

## 6. Matriz status × permissões × ações

Centralizada em `MATTER_ACTIONS` / `EDITION_ACTIONS` (ver `statusConfig.ts`):

| Estado (matéria) | Editável | Ações |
|---|---|---|
| Rascunho | sim | Continuar edição · Duplicar · Arquivar · Excluir |
| Em revisão | não | Revisar · Visualizar |
| Aprovada | não | Visualizar · Adicionar à edição |
| Rejeitada | sim | Corrigir e reenviar |
| Arquivada | não | Visualizar · Restaurar |
| Publicada | não | Visualizar · Abrir edição · Baixar · Verificar |

| Estado (edição) | Editável | Ações |
|---|---|---|
| Rascunho | sim | Editar · Adicionar matérias |
| Em revisão / Agendada | não | Revisar/Ver · Reagendar · Cancelar |
| Fechada | não | Gerar PDF · Reabrir |
| PDF gerado | não | Assinar · Baixar · Regenerar |
| Assinada | não | Publicar · Baixar · Validar |
| Publicada | não | Visualizar · Baixar · Verificar |
| Cancelada | não | Visualizar |

As ações dependem da API (que valida por papel/estado); a UI não oferece ação que o backend recusa.

## 7. Resultado dos testes

- `npx tsc --noEmit` — **sem erros**.
- `npx vitest run` — **37 testes passando** (inclui novos: format/statusConfig) em 3 arquivos.
- `npm run build` — **sucesso** (todas as rotas).
- Capturas novas geradas em `diaprint/` (01, 02, 10 e mobile).

## 8. Auditoria de acessibilidade

Melhorias aplicadas: skip link, foco visível (ring), `role="dialog"`/`aria-modal`/focus trap no `ConfirmDialog`, `caption`+`scope` nas tabelas, ícones decorativos ocultos, alvos ≥ 24×24 (majoritariamente 36–44px), rótulos reais nos filtros. Auditoria automatizada com `axe` e suíte E2E/teclado completas **pendentes** (requer infraestrutura de testes E2E dedicada).

## 9. Capturas antes/depois

Novas capturas (mesmas dimensões das referências) em `/home/ubuntu/sistemaweb/diaprint/`:
- `01-dashboard-NOVO.png`, `02-materias-lista-NOVO.png`, `10-edicoes-lista-NOVO.png`
- `mobile-dashboard.png`, `mobile-materias.png`, `mobile-edicoes.png` (390px)

## 10. Pendências reais

- Redesenho completo das telas de **detalhe** de matéria (03–09) e edição (11–18): títulos dinâmicos por estado, leitura/edição por estado, motivos de rejeição, checklist, previews PDF, `source_pdf_hash`/`signed_pdf_hash`.
- **Modal de assinatura** (20) com foco trap + fluxo completo (é o item mais sensível e será tratado com o fluxo PAdES).
- Sidebar colapsável/drawer e topbar com `aria-label`/tooltips.
- Suíte E2E (Playwright), testes de teclado e auditoria `axe`.
- Fluxo de matérias/edição até publicação end-to-end automatizado.

## 11. Procedimento de rollback

Alterações só no frontend; reverter restaurando os arquivos do git (não há backup dedicado por serem mudanças novas):
```bash
cd /home/ubuntu/sistemaweb/modulo-diario
git checkout -- web-admin/src/app web-admin/src/lib/api.ts
rm -f web-admin/src/components/StatusBadge.tsx web-admin/src/components/PageHeader.tsx \
      web-admin/src/components/EmptyState.tsx web-admin/src/components/ConfirmDialog.tsx \
      web-admin/src/lib/format.ts web-admin/src/lib/statusConfig.ts
docker compose build web-admin && docker compose up -d web-admin
```

## Conclusão

Implementado e **deployado** um redesign coeso e testado das telas de listagem e visão geral (dashboard, matérias, edições), com mapas de status centralizados, datas/horas pt-BR e pluralização corretas, ações por estado, acessibilidade básica e ausência de código de status interno/formatos americanos/banners decorativos. O trabalho de PDF e PAdES foi preservado integralmente e validado (`source_pdf_hash`/`signed_pdf_hash`/`validation_status` intactos). As telas de detalhe, modal de assinatura e a suíte E2E/axe completa permanecem como evolução (documentadas acima).
