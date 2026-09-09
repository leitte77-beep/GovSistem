# Incremento 5 (base) — Navegação + Modelos documentais + Config IA (frontend)

Quinto incremento no módulo real `modulo-diario`, em português. Frontend
(Next.js 14, `web-admin`) **validado por typecheck** (`npx tsc --noEmit` → exit
0), consumindo **endpoints reais** já implementados nos Incrementos 1–4. Não
toca os arquivos em andamento do cliente (`editions/page.tsx`,
`types/edition.ts` foram preservados).

## Escopo entregue (a base que desbloqueia o restante)

- **Navegação** (`components/AdminShell.tsx`): novos itens de menu
  "Documentos oficiais", "Modelos documentais" e "Inteligência artificial"
  (admin). Menus de Matérias/Edições preservados.
- **Rota `/documentos`** (Visão geral): cards dos seis tipos
  (Editais, Portarias, Leis, Ofícios, Decretos, Resoluções) com contagem de
  modelos ativos/por tipo (consulta real `GET /document-models`) + atalhos para
  Modelos e Config IA. Deixa claro que sem modelo aprovado não há minuta padrão.
- **Rota `/documentos/modelos`** (Modelos documentais): listagem com filtros por
  estado/tipo; detalhe com versões; ações **enviar p/ aprovação**, **aprovar/
  ativar (imutável)** e **arquivar**; formulário de criação (config JSON validada
  no servidor, com exemplo). Consome os endpoints do Inc2/Inc3.
- **Rota `/settings/ai`** (Configurações → Inteligência artificial): estado
  (configurada/mascarada), limites (timeout/tokens/concorrência), chave como
  campo senha (vazio preserva), ações **Salvar**, **Testar conexão** (chave nova
  sem persistir), **Substituir chave**, **Remover chave**, **Desativar IA** e
  indicador de último teste — consumindo os endpoints seguros do Inc1 (a chave
  nunca retorna ao navegador).
- **Cliente** (`lib/api.ts`) + **tipos** (`types/document_model.ts`): métodos
  para modelos/versões/preview/extração/material/número e para config de IA.

## Reuso
Usa `AdminShell`, `PageHeader`, `RequireRole` (settings/layout), `react-hot-toast`,
`notifyError` e o padrão de listagem/fetch do projeto.

## Validação
`npx tsc --noEmit` no `web-admin` → **exit 0** (nenhum erro de tipo introduzido).
Não há testes de UI novos (exige e2e/browser); a validação é de tipos/compilação
nesta base. Backend segue **570 passed** (não alterado neste incremento).

## Limites reais (não fingidos)
- As **6 listagens por tipo com estados** (editorial/assinatura/publicação) e o
  **"Criar com IA" em etapas** ainda **não** foram implementados: dependem de, no
  backend, amarrar o ato/matéria aos estados de assinatura/publicação e expor
  listagem/filtros por tipo — fluxo que hoje assina a edição, não o ato isolado.
  A Visão geral aponta esse próximo passo (não há botões mortos).
- Não houve build de produção/rodada em navegador aqui; recomenda-se `next build`
  e teste manual na próxima execução do ambiente.

## Arquivos
Novos (frontend): `web-admin/src/app/documentos/{layout,page}.tsx`,
`web-admin/src/app/documentos/modelos/page.tsx`,
`web-admin/src/app/settings/ai/page.tsx`, `web-admin/src/types/document_model.ts`.
Editados: `web-admin/src/lib/api.ts`, `web-admin/src/components/AdminShell.tsx`.
