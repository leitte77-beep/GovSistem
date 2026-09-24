# Melhorias no Frontend — Sistema DOE

Documentação das melhorias implementadas no frontend (admin + portal público) em 19/05/2026.

---

## 1. Acessibilidade (A11y)

### 1.1 Labels e Inputs vinculados (`htmlFor` / `id`)
Todos os formulários agora possuem labels clicáveis que focam o campo correto:

| Arquivo | Inputs vinculados |
|---|---|
| `apps/web-admin/src/app/login/page.tsx` | Email (`login-email`), Senha (`login-password`) |
| `apps/web-admin/src/app/users/new/page.tsx` | Nome (`user-name`), Email (`user-email`), Senha (`user-password`) |
| `apps/web-admin/src/app/users/[id]/edit/page.tsx` | Nome (`edit-user-name`), Email (`edit-user-email`) |
| `apps/web-admin/src/components/Matter/MatterForm.tsx` | Título (`matter-title`), Súmula (`matter-summary`), Unidade (`matter-org-unit`) |
| `apps/web-admin/src/components/Edition/EditionForm.tsx` | Data de publicação (`edition-pub-date`) |
| `apps/web-admin/src/app/settings/page.tsx` | Todos os inputs dinâmicos (`setting-{id}`) |

### 1.2 `aria-label` em botões só-ícone
Adicionados `aria-label` descritivos em todos os botões sem texto visível:

- **Toolbar do editor** — todos os ~40 botões receberam `aria-label` via componente `Button` atualizado
- **AdminShell** — botões de abrir/fechar menu lateral (`Abrir menu lateral` / `Fechar menu lateral`)
- **Password toggles** — `Mostrar senha` / `Ocultar senha` em login, novo usuário e settings
- **Ações de usuário** — editar e excluir com aria-label incluindo o nome do usuário
- **Reabrir edição** — 4 botões com `Reabrir edição para edição`

### 1.3 `focus:` → `focus-visible:`
Substituído `focus:` por `focus-visible:` em TODOS os inputs, selects e textareas do admin. Isso elimina o anel de foco durante cliques de mouse (estilo `:focus-visible` só aparece na navegação por teclado), melhorando a aparência sem perder acessibilidade.

Arquivos alterados: `login/page.tsx`, `matters/page.tsx`, `editions/page.tsx`, `users/new/page.tsx`, `users/[id]/edit/page.tsx`, `settings/page.tsx`, `settings/certificates/page.tsx`, `MatterForm.tsx`, `EditionForm.tsx`.

---

## 2. Autenticação e Segurança

### 2.1 Interceptor 401 global + refresh automático de token
**Arquivo:** `apps/web-admin/src/lib/api.ts`

- Quando uma requisição recebe `401`, o sistema tenta automaticamente renovar o token usando o `refresh_token`
- A renovação é deduplicada (`refreshPromise` global) — múltiplas requisições simultâneas que falham disparam apenas um refresh
- Se o refresh falhar, os tokens são removidos e um evento `auth:logout` é disparado

### 2.2 Listener de logout forçado
**Arquivo:** `apps/web-admin/src/lib/auth-context.tsx`

- O `AuthProvider` escuta o evento `auth:logout` e zera o estado `user`, forçando redirecionamento ao login
- Impede que o usuário fique com a UI quebrada após expiração do token

### 2.3 Confirmação de logout
**Arquivo:** `apps/web-admin/src/components/AdminShell.tsx`

- Ambos os botões de logout (sidebar e dropdown do header) agora pedem confirmação antes de sair
- Padrão: primeiro clique mostra "Confirmar"/"Cancelar", segundo clique executa o logout

### 2.4 Validação de arquivos no upload
**Arquivo:** `apps/web-admin/src/components/Matter/AttachmentUpload.tsx`

- Valida extensão do arquivo (PDF, DOCX, XLSX, CSV, JPG, PNG)
- Valida tamanho máximo (50MB)
- Exibe toast de erro em vez de alert()

**Arquivo:** `apps/web-admin/src/app/settings/certificates/page.tsx`

- Valida tipo de certificado (apenas `.pfx` e `.p12`)
- Valida tamanho máximo (10MB)

---

## 3. Navegação

### 3.1 Breadcrumbs
**Novo componente:** `apps/web-admin/src/components/Breadcrumbs.tsx`

Componente de trilha de navegação com ícone Home. Implementado em:

- `users/new/page.tsx` — `Usuários > Novo Usuário`
- `users/[id]/edit/page.tsx` — `Usuários > Editar Usuário`
- `MatterForm.tsx` — `Matérias > Nova Matéria` ou `Matérias > Editar Matéria`

Substitui os botões "Voltar" genéricos por breadcrumbs navegáveis.

### 3.2 Paginação nas listas
**Arquivos:** `matters/page.tsx`, `editions/page.tsx`

- Listas paginadas com 15 itens por página
- Botões Anterior/Próximo com indicador de página atual
- Botões desabilitados quando na primeira/última página

### 3.3 Busca e Filtro nas Edições
**Arquivo:** `editions/page.tsx`

- Campo de busca por título, tipo (Normal/Extra/Suplementar) e ano/número
- Filtro por status: Rascunho, Fechada, PDF Gerado, Assinada, Publicada
- Filtro client-side sobre os dados da API

---

## 4. UX e Visual

### 4.1 Skeletons nos loading states
**Arquivos:** `matters/page.tsx`, `editions/page.tsx`

- Substituídos os spinners genéricos por skeleton rows com animação `animate-pulse`
- Shapes que mimetizam a estrutura real da tabela (título largo, badge arredondado, números curtos)

### 4.2 Modal de confirmação para ações destrutivas
**Novo componente:** `apps/web-admin/src/components/ConfirmModal.tsx`

Modal reutilizável com variantes `danger` (exclusão) e `warning`. Substitui confirmações inline por diálogo modal:

| Página | Ação |
|---|---|
| `users/page.tsx` | Excluir usuário — mostra nome do usuário no modal |
| `settings/certificates/page.tsx` | Remover certificado — mostra nome do certificado no modal |
| `Editor/Toolbar.tsx` | Limpar conteúdo do editor — confirmação inline |

### 4.3 Ícones nos Status Badges
**Arquivo:** `components/Matter/StatusBadge.tsx`

Cada status agora exibe um ícone ao lado do texto:

| Status | Ícone |
|---|---|
| Rascunho | Clock |
| Em Revisão | Eye |
| Aprovado | CheckCircle |
| Publicado | Globe |
| Arquivado | Archive |
| Rejeitado | XCircle |

### 4.4 Tabelas com cabeçalho sticky
**Arquivos:** `matters/page.tsx`, `editions/page.tsx`

- Adicionado `sticky top-0 z-10` nos `<thead>`
- Cabeçalho da tabela permanece visível ao rolar

### 4.5 Melhoria de contraste
- Texto da dashboard: `text-slate-400` → `text-slate-300` (mais legível em fundo escuro)
- Títulos de página: `text-gray-800` → `text-slate-800` (consistência com o resto do app)

---

## 5. Error Handling

### 5.1 Error Boundaries
**Novo arquivo:** `apps/web-admin/src/app/error.tsx`

- Captura erros de runtime em qualquer rota do admin
- Exibe UI amigável com botão "Tentar novamente"
- Loga o erro no console para debug

### 5.2 Página 404 customizada
**Novos arquivos:**
- `apps/web-admin/src/app/not-found.tsx`
- `apps/web-public/src/app/not-found.tsx`

Páginas de "não encontrado" estilizadas de acordo com cada tema (admin com slate, público com Material Design).

### 5.3 Loading global
**Novo arquivo:** `apps/web-admin/src/app/loading.tsx`

Tela de carregamento global para o admin durante navegação entre rotas.

---

## 6. Bug Fixes

### 6.1 Botão duplicado no portal público
**Arquivo:** `apps/web-public/src/app/page.tsx`

- Os botões "Ver Edição" e "Ver Sumário" apontavam para a mesma URL
- Corrigido: "Ver Sumário" agora vai para `/edicoes/{year}/{number}#sumario`

### 6.2 Tooltips em botões desabilitados
- Adicionado `title="Preencha todos os campos obrigatórios"` no botão "Enviar para Revisão" desabilitado (`MatterForm.tsx`)
- Adicionado `title="Selecione um certificado ou faça upload do PFX"` no botão "Assinar" desabilitado (`EditionForm.tsx`)

### 6.3 Confirmação antes de limpar editor
**Arquivo:** `components/Editor/Toolbar.tsx`

- Botão "Limpar conteúdo" agora requer confirmação (2 cliques) para evitar perda acidental

---

## Resumo de Arquivos Modificados

### Admin (`apps/web-admin`)

| Arquivo | Mudanças |
|---|---|
| `src/app/error.tsx` | **Novo** — Error boundary |
| `src/app/loading.tsx` | **Novo** — Loading global |
| `src/app/not-found.tsx` | **Novo** — Página 404 |
| `src/components/Breadcrumbs.tsx` | **Novo** — Componente de breadcrumb |
| `src/components/ConfirmModal.tsx` | **Novo** — Modal de confirmação |
| `src/lib/api.ts` | Refresh automático de token, interceptor 401 |
| `src/lib/auth-context.tsx` | Listener de logout forçado |
| `src/components/AdminShell.tsx` | aria-labels, confirmação de logout |
| `src/app/login/page.tsx` | htmlFor/id, focus-visible, aria-label |
| `src/app/page.tsx` | Contraste melhorado |
| `src/app/matters/page.tsx` | Paginação, skeletons, sticky header, focus-visible |
| `src/app/editions/page.tsx` | Busca/filtro, paginação, skeletons, sticky header, focus-visible |
| `src/app/users/page.tsx` | ConfirmModal para delete, aria-labels |
| `src/app/users/new/page.tsx` | htmlFor/id, focus-visible, breadcrumbs |
| `src/app/users/[id]/edit/page.tsx` | htmlFor/id, focus-visible, breadcrumbs |
| `src/app/settings/page.tsx` | htmlFor/id, focus-visible, aria-label |
| `src/app/settings/certificates/page.tsx` | ConfirmModal, validação upload, focus-visible |
| `src/components/Matter/MatterForm.tsx` | htmlFor/id, focus-visible, breadcrumbs, tooltips |
| `src/components/Matter/StatusBadge.tsx` | Ícones nos status |
| `src/components/Matter/AttachmentUpload.tsx` | Validação de arquivo |
| `src/components/Editor/Toolbar.tsx` | aria-labels, confirmação de limpar conteúdo |
| `src/components/Edition/EditionForm.tsx` | htmlFor/id, focus-visible, aria-labels, tooltips |

### Portal Público (`apps/web-public`)

| Arquivo | Mudanças |
|---|---|
| `src/app/not-found.tsx` | **Novo** — Página 404 |
| `src/app/page.tsx` | Fix: botão "Ver Sumário" com URL distinta |

---

## Verificação

- TypeScript compila sem erros no admin (`tsc --noEmit` passou limpo)
- Nenhuma dependência nova foi adicionada
- Nenhuma breaking change na API ou nos tipos
