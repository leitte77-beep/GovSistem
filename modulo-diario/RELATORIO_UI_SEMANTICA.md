# Relatório — UI do Motor Semântico (Fases 6, 7, 12, 14 e suíte de acessibilidade)

**Data:** 2026-09-01
**Escopo:** fechamento das pendências de interface do motor semântico sobre o backend já entregue (`RELATORIO_MOTOR_SEMANTICO.md`). Consome as APIs reais, sem novas dependências de backend.

---

## 1. Resumo executivo

As pendências declaradas na entrega anterior foram implementadas no frontend:

1. **Editor por blocos** (Fase 7) — novo componente `SemanticEditor` integrado à etapa Conteúdo do formulário de matéria; documento semântico JSONB como fonte canônica; análise → blocos → confirmação → integridade → salvar via `/matters/{id}/semantic`.
2. **Construtor de modelos** (Fase 6) — páginas `/templates` (lista + criar) e `/templates/[id]` (versões, edição de config JSON, ativar/duplicar versão), consumindo `/templates*`.
3. **Página pública por snapshot** (Fase 12) — reescrita de `/edicoes/[ano]/[numero]` para renderizar a partir do snapshot imutável (`/editions/{y}/{n}/snapshot`), com painel de autenticidade, sumário navegável, busca local, nota de “representação HTML vs PDF oficial” e fallback para o endpoint legado.
4. **Verificação de autenticidade** (Fase 14) — `/verificar/[codigo]` agora exibe os estados granulares (assinado / integridade / cadeia / snapshot) e hashes quando o código resolve a edição.
5. **Suíte de acessibilidade/visual** (Fase 20) — `playwright.config.ts` + `e2e/edition-a11y.spec.ts` (axe-core, um único `h1`, sumário, busca, painel, desktop/mobile).

Tudo compila (`tsc --noEmit`), passa lint e build. Testes unitários novos: **65 no web-admin** (incluindo `semanticBlocks` e `semanticRender`).

---

## 2. Fase 7 — Editor semântico por blocos

**Componentes novos (web-admin):**
- `src/types/semantic.ts` — tipos TS espelhando o schema Pydantic (17 blocos, discriminated union, `SemanticDocument`, `Template`, `TemplateConfig`).
- `src/lib/semanticApi.ts` — cliente das rotas `/matters/{id}/semantic/analyze|(GET|PUT)` e `/templates*`.
- `src/lib/semanticBlocks.ts` — mutações puras (inserir/remover/duplicar/mover/atualizar/dividir, criar bloco vazio) mantendo o JSON canônico como única fonte.
- `src/lib/semanticRender.ts` — renderização determinística de blocos para HTML seguro (mesmo modelo do renderer do backend).
- `src/components/Semantic/SemanticEditor.tsx` — fluxo: colar fonte (HTML/texto) → “Analisar e organizar” → lista de blocos com tipo editável, confiança, confirmação humana, mover/duplicar/remover/inserir → painel de validação/integridade → Salvar.
- `src/components/Semantic/BlockEditor.tsx` — editor de cada tipo (heading, command, article com §/incisos, tabela com rowspan/colspan/total, autoridade, imagem, anexo, lista).

**Integração:** em `MatterForm` (etapa Conteúdo) há um alternador “Editor de conteúdo ↔ Editor semântico por blocos”; para matéria nova, pede salvar antes (precisa de `matter_id`).

**Operações por bloco atendidas:** alterar tipo, editar conteúdo, inserir, duplicar, excluir, mover cima/baixo, dividir, confirmar, transformar/editar tabela real (não texto achatado).

---

## 3. Fase 6 — Construtor de modelos

- `/templates` — lista com nome, tipo, versão ativa, status (Rascunho/Ativo/Arquivado), nº de versões; modal de criação (11 slugs iniciais).
- `/templates/[id]` — lista de versões com ativação (ativação torna a versão imutável no backend), e criação de nova versão rascunho via editor JSON da configuração com hints dos tokens permitidos (allow-list). Backend rejeita JS/Jinja/CSS irrestrito.
- Nav: item “Modelos” adicionado ao `AdminShell`.

---

## 4. Fase 12 — Página pública (snapshot imutável)

`web-public/src/app/edicoes/[ano]/[numero]/page.tsx` (reescrita):
- Prefere `/editions/{y}/{n}/snapshot`; fallback para `by-year/{y}/{n}`.
- Header institucional (brasão, município, DOE), dados da edição, ações (baixar PDF oficial, imprimir, copiar link, compartilhar, verificar).
- **Aviso de conformidade:** “Representação HTML da edição oficial — para o documento assinado, baixe o PDF oficial”.
- Sumário navegável, busca local na edição (filtra matérias), corpo completo das matérias com âncoras diretas e anexos.
- Painel de autenticidade (arquivo assinado, integridade, cadeia, snapshot íntegro), assinante, serial mascarado, código de verificação, `signed_pdf_hash` e `content_manifest_hash`.
- Nota de impressão: “cópia para impressão — não substitui o PDF oficial”.
- API pública: `getEditionSnapshot` + `editionDownloadUrl` (download imutável com bytes idênticos).

---

## 5. Fase 14 — Verificação

`/verificar/[codigo]` agora, quando o código resolve a edição, também carrega o snapshot e exibe:
- Estados granulares (arquivo assinado / integridade criptográfica / cadeia / snapshot imutável).
- `signed_pdf_hash` e `content_manifest_hash`.
- Legenda de interpretação (válida e confiável / integridade válida mas cadeia não verificada / indisponível).

---

## 6. Fase 20 — Suíte visual + acessibilidade (pronta para rodar)

- `web-public/playwright.config.ts` — projetos desktop (1440×900) e mobile (iPhone 12).
- `web-public/e2e/edition-a11y.spec.ts` — smoke: título, um único `<h1>`, sumário navegável, busca local, painel de autenticidade/hashes, e auditoria **axe-core** (sem violações critical/serious).
- Executar com infra no ar: `PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test`.
- `@playwright/test` adicionado a devDependencies do web-public; `e2e/` excluído do tsconfig (não afeta build).

---

## 7. Arquivos criados / alterados

**web-admin (novos):**
`src/types/semantic.ts` · `src/lib/semanticApi.ts` · `src/lib/semanticBlocks.ts` · `src/lib/semanticRender.ts` · `src/components/Semantic/SemanticEditor.tsx` · `src/components/Semantic/BlockEditor.tsx` · `src/app/templates/{layout,page}.tsx` · `src/app/templates/[id]/page.tsx` · `src/lib/__tests__/semanticBlocks.test.ts` · `src/lib/__tests__/semanticRender.test.ts`

**web-admin (alterados):**
`src/lib/api.ts` (helpers genéricos `post`/`put`) · `src/components/Matter/MatterForm.tsx` (alternador semântico) · `src/components/AdminShell.tsx` (item “Modelos”)

**web-public (novos):**
`playwright.config.ts` · `e2e/edition-a11y.spec.ts`

**web-public (alterados):**
`src/app/edicoes/[ano]/[numero]/page.tsx` (reescrita snapshot) · `src/app/verificar/[codigo]/page.tsx` (estados granulares) · `src/lib/api.ts` (snapshot/download) · `tsconfig.json` (exclui e2e) · `package.json` (`@playwright/test`)

**Backend:** nenhuma alteração.

---

## 8. Testes e resultados

- `web-admin`: `npx tsc --noEmit` **ok** · `npm run build` **sucesso** · `npx vitest run` **65 passed** (novos `semanticBlocks` + `semanticRender` inclusos) · `npx eslint` nas novas rotas **0 erros**.
- `web-public`: `npx tsc --noEmit` **ok** · `npm run build` **sucesso** · `npx eslint` **0 erros**.
- Backend (regressão): `tests/test_semantic_engine.py` + `test_sanitizer.py` + `test_matter_content.py` + `test_matters.py` → **66 passed**. As falhas da suíte ampla do host são **pré-existentes de ambiente/fixture** (401 de auth e mocks do `test_public_v1.py`), não relacionadas a estas mudanças — o backend não foi tocado nesta entrega.

---

## 9. Pendências restantes (externas / infra)

- **Certificado ICP-Brasil real** e raízes (`trusted=False` esperado em homologação com certificado de teste).
- **TSA/ACT** e perfil LT/LTA (hoje PAdES-BES).
- **Execução da suíte Playwright/axe** exige subir `web-public` + API (ambiente de homologação ativo).
- **Imagem/anexos** no editor semântico dependem de upload real dos arquivos (`file_id`).
- **Integração opcional de IA** (Fase 5) continua reservada atrás de `ai_classification_enabled`.

---

## 10. Rollback

Alterações 100% no frontend (aditivas). Para reverter:
```bash
cd /home/ubuntu/sistemaweb/modulo-diario
git checkout -- web-admin/src web-public/src web-public/tsconfig.json web-public/package.json
rm -f web-public/playwright.config.ts web-public/e2e/edition-a11y.spec.ts
```
Nenhum dado, modelo, matéria, PDF ou assinatura é afetado; feature flags continuam controlando o motor.
