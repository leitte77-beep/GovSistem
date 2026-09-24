# PLATFORM_ROLE_REVIEW — Usuários com role de plataforma (regularização)

> Gerado: 2026-08-27 — Fonte: `saas-platform/SCHEMA_ROLES.md` (banco `saas_platform`, 2026-08-27).
> Contagens reais a confirmar no banco após liberação de credenciais.

## Política

`admin.govsistem.com.br` é exclusivo da equipe interna. Acesso exige condição interna inequívoca:
- `platform_role == SUPER_ADMIN`; **ou**
- `is_platform_admin == true`; **ou**
- membership `ORG_ADMIN` na organização interna da plataforma (`slug = 'admin'`) com role válida.

A label `platform_role = SUPPORT` **NÃO** concede acesso ao painel central. Ela será preservada (nada removido) e registrada em auditoria durante a transição, mas não autorizará o painel SaaS.

## Contas internas legítimas

| Nome | Email | Org | Role | is_platform_admin | Vínculo plataforma | Manter |
|------|-------|-----|------|:---:|:---:|:---:|
| Super Admin | admin@saas.com | admin | SUPER_ADMIN | ✅ | ✅ | ✅ |
| User2 | contato@govsistem.com.br | — | — | ✅ | ✅ (is_platform_admin) | ✅ |

## Usuários municipais com `platform_role=SUPPORT` (não são contas internas)

> Nenhum destes deve receber acesso ao painel central. A role será mantida durante a transição e revisada pela equipe SaaS.

### PREFEITURA DE FAROL (`farol`)

| Nome | Email | Role | is_platform_admin | is_org_admin | Aparenta ser usuário comum? | Risco de manter | Proposta |
|------|-------|------|:---:|:---:|:---:|:---:|------|
| Alisson Leite | ti@farol.pr.gov.br | SUPPORT | ❌ | ✅ | Não (admin de TI do órgão) | Médio — admin municipal não é admin SaaS | Manter SUPPORT como label, **sem acesso ao painel central**; garantir ORG_ADMIN via membership |
| Alessandr Jach | educacaofarolpr@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado; sem acesso ao painel |
| ELIEL CROISFELT | elielcroiss@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Gabriel Lima | gabireslima19.23@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Joelma Cruz | joelmacruzoliveira03@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| João Marcos | joaomarcosbuenocordeiro@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| João Ricardo | jhonys005@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Pamela Costa | pamelacostadiretoradeculturafarol@outlook.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |

### SECRETARIA DE SAÚDE (`saude`)

| Nome | Email | Role | is_platform_admin | is_org_admin | Aparenta ser usuário comum? | Risco | Proposta |
|------|-------|------|:---:|:---:|:---:|:---:|------|
| Leite Admin | alisson_leitte@hotmail.com.br | SUPPORT | ❌ | ✅ | Não (admin do órgão) | Médio | Manter SUPPORT como label; sem acesso ao painel; ORG_ADMIN via membership |

### SECRETARIA DE ASSISTÊNCIA SOCIAL (`social`)

| Nome | Email | Role | is_platform_admin | is_org_admin | Aparenta ser usuário comum? | Risco | Proposta |
|------|-------|------|:---:|:---:|:---:|:---:|------|
| Admin Teste | admin@teste.org | SUPPORT | ❌ | ✅ | Não (admin do órgão) | Médio | Manter SUPPORT como label; sem acesso ao painel; ORG_ADMIN via membership |
| Ana Paula Mello | mello-paula@hotmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Eliane Amélia | elianesasfarol@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Gislaine Lima | gislaineasocial@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Maria Terezinha | terezinhasanchesaguera@hotmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Priscila Vanessa | carvalhopvanessa@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Sthefany Victoria | victoriasthefany1910@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |
| Tania Aparecida | cadbolsa2021@gmail.com | SUPPORT | ❌ | ❌ | Sim | Baixo | Revisar/marcar legado |

## Implementação (no backend entregue)

- `get_current_platform_admin` passa a exigir a condição interna inequívoca acima (não apenas a label).
- Nenhum dado é apagado; a label `SUPPORT` fica preservada; ações registradas em `audit_events`.
- Separação por flag `PLATFORM_USERS_SEPARATION_ENABLED`.
