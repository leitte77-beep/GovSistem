# Esquema de Roles, Usuários, Módulos e Organizações — GovSistem SaaS

> Documento de estudo gerado a partir do banco `saas_platform` (produção) e do código do backend.
> Gerado em: 2026-08-27. **Cuidado:** contém dados reais de usuários e organizações.

---

## 1. Como o controle de acesso funciona (visão geral)

O SaaS tem **dois níveis** de acesso que se somam:

1. **Roles de plataforma** — definem poder sobre o próprio SaaS (coluna `users.platform_role` + flags booleanas `is_platform_admin`, `is_organization_admin`). Vivem só na tabela `users`.

2. **Acessos por módulo** — definem "quem pode o quê dentro de cada módulo". Têm **duas fontes**:
   - **Nova (canônica):** tabela `user_module_grants` (`user_id`, `module_slug`, `role_name`) — roles validadas contra `MODULE_ROLE_CATALOG`.
   - **Legado:** coluna JSON `users.module_permissions` (`{"modules": ["diario", ...]}`) — só lista módulos, sem role específica.

Ao entrar num módulo (SSO), o SaaS injeta no token JWT a lista `roles`, montada em `_sync_user_to_modules()` (users.py:104) a partir de: `platform_role`, flags de admin, `ORG_MEMBER` e todos os `role_name` dos grants. O módulo mapeia esses nomes para os perfis locais dele.

> **Atenção (problema em aberto):** muitos usuários ainda têm acesso **somente** pelo legado `module_permissions` (JSON) e **sem grants** na tabela nova. Qualquer mudança que passe a confiar só em `user_module_grants` pode "sumir" o acesso desses usuários. A coluna `module_permissions` do frontend (campo `module_permissions` no PUT de usuário) é preenchida a partir dos slugs dos grants — ou seja, o legado é derivado dos grants no cadastro novo.

---

## 2. Roles de plataforma (definido em `app/models/enums.py` `PlatformRole`)

| Role | Descrição |
|------|-----------|
| `SUPER_ADMIN` | Acesso total ao SaaS. É o único que passa sem `is_platform_admin` (`core/auth.py:99`). |
| `PLATFORM_ADMIN` | Admin da plataforma (poder de gestão do SaaS). |
| `BILLING_MANAGER` | Gestor de cobrança. |
| `SUPPORT` | Suporte (nível de atendimento). |
| `AUDITOR` | Auditor (somente leitura). |

Flags independentes na tabela `users`:
- `is_platform_admin` → acesso administrativo à plataforma (injetado como role `PLATFORM_ADMIN`).
- `is_organization_admin` → admin do órgão (gerencia módulos; injetado como role `ADMIN`).
- `is_active` → se a conta está ativa.
- `force_password_reset` → obriga trocar senha no próximo login.

---

## 3. Catálogo de roles por módulo (`app/core/roles.py` → `MODULE_ROLE_CATALOG`)

Estas são as únicas combinações (módulo, role) aceitas na validação do `PUT /users/{id}/grants`. A tabela `user_module_grants` deve conter apenas nomes deste catálogo.

### diario — Diário Oficial
`AUTOR`, `REVISOR`, `DIAGRAMADOR`, `ASSINADOR`, `PUBLICADOR`, `AUDITOR`, `DIARIO_ADMIN`

### financeiro — Financeiro
`FINANCEIRO_ADMIN`, `BILLING_MANAGER`, `FINANCEIRO_VIEWER`

### chatgov — ChatGov
`CHATGOV_ADMIN`, `CHATGOV_USER`

### govtask — GovTask
`GOVTASK_ADMIN`, `ASSESSOR`, `ENGENHEIRO_TECNICO`, `COMPRAS_LICITACAO`, `GESTOR`

### govfrota — GovFrota
`ADMIN`, `GESTOR_FROTA`, `RESP_COMBUSTIVEL`, `RESP_MANUTENCAO`, `CONSULTA`, `AUDITOR`

### govsocial — GovSocial
`GOVSOCIAL_ADMIN`, `gestor_municipal`, `coordenador_unidade`, `tecnico_superior`, `tecnico_medio`, `recepcao`, `vigilancia`, `conselho`

### govdoc — GovDoc
`admin_geral`, `admin_secretaria`, `gestor_setor`, `colaborador`, `leitor`, `auditor`

### govpro — GovPro *(adicionado em 2026-08-27)*
`ADMIN`, `SERVIDOR`, `CHEFE_UNIDADE`, `PROTOCOLO`, `ARQUIVISTA`, `AUDITOR`, `DPO`, `GESTOR_SIGILO`, `AUTORIDADE_SIGNATARIA`

### govavalia — GovAvalia *(adicionado em 2026-08-27)*
`GOVAVALIA_ADMIN`, `GOVAVALIA_GESTOR`, `GOVAVALIA_OUVIDORIA`

### govouve — GovOuve *(adicionado em 2026-08-27)*
`GOVOUVE_ADMIN`, `GOVOUVE_GESTOR`, `GOVOUVE_OUVIDORIA`

**Mapa de nomes legados** (`LEGACY_ROLE_MAP`): aceita `ADMIN`→`DIARIO_ADMIN` (diario), `ADMIN`→`GOVTASK_ADMIN` (govtask), `ADMIN`→`GOVSOCIAL_ADMIN` + `AUDITOR`→`auditor` (govsocial/govdoc). Ao gravar, normaliza para o nome canônico.

---

## 4. Organizações (`organizations`)

| Nome | Slug | CNPJ | Cidade | Ativa | Observação |
|------|------|------|--------|-------|------------|
| Admin | `admin` | — | — | ✅ | Órgão interno da plataforma (teste/admin) |
| CAMARA MUNICIPAL DE FAROL | `camara` | 00.397.822/0001-58 | Farol/PR | ❌ | Inativa |
| PREFEITURA DE FAROL | `farol` | 95.640.124/0001-48 | Farol/PR | ✅ | **Principal órgão em uso** |
| Prefeitura Teste | `prefeitura-teste` | — | — | ❌ | Teste, inativa |
| SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL | `social` | 18.111.121/0001-76 | — | ✅ | Em uso |
| SECRETARIA MUNICIPAL DE SAÚDE | `saude` | 10.537.130/0001-11 | — | ✅ | Em uso |

**Câmara e Prefeitura Teste estão inativas** mas ainda existem; usuários vinculados a elas podem estar afetados.

---

## 5. Módulos disponíveis e quais organizações têm acesso (`organization_modules`)

Módulo ativo por organização. Nota: **`govavalia` e `govouve` estão ativos mas nenhuma organização os contratou** (0 vínculos). `financeiro` só no órgão Admin.

| Módulo | Admin | Farol | Social | Saúde | Camara | Pref. Teste |
|--------|:-----:|:-----:|:------:|:-----:|:------:|:-----------:|
| **chatgov** | | ✅ | ✅ | ✅ | | |
| **diario** | ✅ | ✅ | | | | |
| **financeiro** | ✅ | | | | | |
| **govavalia** | | | | | | |
| **govdoc** | ✅ | ✅ | ✅ | | | |
| **govfrota** | ✅ | ✅ | ✅ | ✅ | | |
| **govouve** | | | | | | |
| **govpro** | | ✅ | | | | |
| **govsocial** | ✅ | ✅ | ✅ | | | |
| **govtask** | ✅ | ✅ | | | | |

---

## 6. Usuários — acesso por módulo e roles

### 6.1 Admin da plataforma / internos

| Nome | Email | Org | platform_role | is_platform_admin | is_org_admin | Módulos legado |
|------|-------|-----|---------------|:-----------------:|:------------:|----------------|
| Super Admin | admin@saas.com | admin | `SUPER_ADMIN` | ✅ | ❌ | — |
| User2 | contato@govsistem.com.br | — | — | ✅ | ❌ | — |

### 6.2 PREFEITURA DE FAROL (`farol`) — ativa

| Nome | Email | platform_role | Org-admin | Ativo | Módulos (legado) | Grants (módulo → roles) |
|------|-------|---------------|:---------:|:-----:|------------------|--------------------------|
| Admin Farol | admin@farol.pr.gov.br | — | ✅ | ✅ | diario, govtask | diario→AUTOR · govtask→ENGENHEIRO_TECNICO |
| Alessandr Jach | educacaofarolpr@gmail.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Alisson | leitte77@gmail.com | — | ❌ | ✅ | diario, chatgov, govtask | diario→AUTOR,ASSINADOR,AUDITOR,DIAGRAMADOR,PUBLICADOR,REVISOR · chatgov→CHATGOV_ADMIN,USER · govtask→ASSESSOR |
| Alisson Leite | ti@farol.pr.gov.br | SUPPORT | ✅ | ✅ | diario, chatgov, govsocial, govdoc, govpro, govtask, govfrota | diario→ASSINADOR,AUDITOR,AUTOR,DIAGRAMADOR,DIARIO_ADMIN,PUBLICADOR,REVISOR · chatgov→CHATGOV_ADMIN,USER · govdoc→admin_geral · govfrota→ADMIN · govpro→ADMIN · govsocial→GOVSOCIAL_ADMIN · govtask→GOVTASK_ADMIN |
| CIBELI APARECIDA | cibeliapa7@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Cleide de Souza | tesouraria@farol.pr.gov.br | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Departamento de Compras | farolcompras.pr@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Diego Proença | rh.pmfarol@hotmail.com | — | ❌ | ✅ | chatgov, diario, govdoc | chatgov→CHATGOV_USER · diario→AUTOR,ASSINADOR,AUDITOR,DIAGRAMADOR,PUBLICADOR,REVISOR |
| Douglas Jose Laquias | douglas@farol.pr.gov.br | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| ELIEL CROISFELT | elielcroiss@gmail.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Elaine Castro | elainecastro.nutricionista@gmail.com | — | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Emeline Santiago | emelinesantiago@hotmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Felipe Franciscato | felipefranciscato58@gmail.com | — | ❌ | ❌ | chatgov | chatgov→CHATGOV_USER (inativo) |
| Gabriel Lima | gabireslima19.23@gmail.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Gabriel Mendonça | planejamentofarol@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Higor Vitor | higorvbceloni@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Jaqueline Garcia | jakgarcia92@gmail.com | — | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Joelma Cruz | joelmacruzoliveira03@gmail.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| João Marcos | joaomarcosbuenocordeiro@gmail.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| João Ricardo | jhonys005@gmail.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Juliana Amaral | juamaralfe@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Karina Medeiros | karina.fiscalop@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Leandro Saul | tributacao@farol.pr.gov.br | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Luciano Junior | educacaofarolcompras@gmail.com | — | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Maria Clara | gabinete@farol.pr.gov.br | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Maria izabelly | mariaizabellydejesusgil@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Nathan Pierry | nathanpierry@icloud.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Noemi Ester | noemisme24@gmail.com | — | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Pamela Costa | pamelacostadiretoradeculturafarol@outlook.com | SUPPORT | ❌ | ✅ | chatgov | chatgov→CHATGOV_USER |
| Rosemeri Motta | merimotta6@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Servidor Farol | servidor@farol.pr.gov.br | — | ❌ | ✅ | diario, govdoc | diario→AUTOR |

### 6.3 SECRETARIA DE SAÚDE (`saude`) — ativa

| Nome | Email | platform_role | Org-admin | Ativo | Módulos (legado) | Grants |
|------|-------|---------------|:---------:|:-----:|------------------|--------|
| Leite Admin | alisson_leitte@hotmail.com.br | SUPPORT | ✅ | ✅ | chatgov | chatgov→CHATGOV_ADMIN |

### 6.4 SECRETARIA DE ASSISTÊNCIA SOCIAL (`social`) — ativa

| Nome | Email | platform_role | Org-admin | Ativo | Módulos (legado) | Grants |
|------|-------|---------------|:---------:|:-----:|------------------|--------|
| Admin Teste | admin@teste.org | SUPPORT | ✅ | ✅ | chatgov, govsocial, govdoc | chatgov→CHATGOV_ADMIN,USER · govsocial→GOVSOCIAL_ADMIN |
| Ana Paula Mello | mello-paula@hotmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Eliane Amélia | elianesasfarol@gmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_ADMIN,USER |
| Gislaine Lima | gislaineasocial@gmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Maria Terezinha | terezinhasanchesaguera@hotmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Priscila Vanessa | carvalhopvanessa@gmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Sara Gabrielle | socialsaragabrielle@gmail.com | — | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Sthefany Victoria | victoriasthefany1910@gmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |
| Tania Aparecida | cadbolsa2021@gmail.com | SUPPORT | ❌ | ✅ | chatgov, govdoc | chatgov→CHATGOV_USER |

---

## 7. Observações e inconsistências para estudo

1. **Orgão `camara` e `prefeitura-teste` estão inativos**, mas não foram removidos. Verificar se há usuários/dados residuais.

2. **`govavalia` e `govouve` são módulos ativos mas sem nenhuma organização contratada** (0 vínculos em `organization_modules`). Só agora ganharam roles no catálogo (2026-08-27). São produtos aparentemente "Avaliação & Ouvidoria" — possivelmente um supera o outro (rebranding). Decidir se ambos seguem ou se um deve ser desativado.

3. **Duas fontes de acesso por módulo** (grants vs `module_permissions` legado). A maioria dos usuários de chatgov tem **apenas** o legado (não têm grant na tabela nova). Se o SSO passar a ignorar o legado, o acesso some.

4. **Roles genéricas/duplicadas:** o mesmo nome `ADMIN` significa coisas diferentes conforme o módulo (govfrota→ADMIN, govpro→ADMIN). No govpro há `AUDITOR` e `ADMIN` que também existem em outros módulos — são independentes por módulo (validadas por `module_slug`), sem colisão real, mas podem confundir na administração.

5. **`financeiro` só existe no órgão Admin** (interno) — nenhuma prefeitura usa o módulo financeiro de fato.

6. **Único grant `govpro` é `ti@farol.pr.gov.br` (ADMIN)** — foi a causa do bug 422 (módulo não estava no catálogo). Agora catalogado.

7. **Felipe Franciscato está `is_active=false`** mas ainda tem grant CHATGOV_USER.

8. **`module_permissions` no cadastro é derivado dos grants** (frontend envia os slugs dos grants no PUT). Logo, o campo legado e os grants devem estar consistentes para usuários recadastrados; divergências indicam usuários criados antes do sistema de grants ou por outro fluxo.

---

## 8. Comandos SQL úteis

```sql
-- Usuário com grants por módulo
SELECT u.email, g.module_slug, string_agg(g.role_name, ', ')
FROM user_module_grants g
JOIN users u ON u.id = g.user_id
WHERE u.deleted_at IS NULL
GROUP BY u.email, g.module_slug ORDER BY u.email;

-- Grants com módulo/role FORA do catálogo (inconsistências)
SELECT DISTINCT module_slug, role_name FROM user_module_grants;

-- Organizações inativas
SELECT name, slug, is_active FROM organizations WHERE is_active = false;

-- Módulos sem organização contratada
SELECT m.slug, m.name FROM modules m
WHERE NOT EXISTS (SELECT 1 FROM organization_modules om WHERE om.module_id = m.id);
```
