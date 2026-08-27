# USERS_WITHOUT_TENANT_REVIEW

> Gerado: 2026-08-27 — Fonte: `saas-platform/SCHEMA_ROLES.md` + código.
> **Atenção:** a lista definitiva exige consulta real ao banco (`SELECT * FROM users WHERE organization_id IS NULL AND deleted_at IS NULL`). Sem credenciais, listamos aqui o que é identificável do material disponível.

## Critério

Usuários globais ativos sem vínculo de organização (`organization_id IS NULL`). Não serão vinculados a tenant por suposição.

## Identificados no material disponível

| Nome | Email | Notas |
|------|-------|-------|
| User2 | contato@govsistem.com.br | Conta interna da plataforma (`is_platform_admin=true`). Pode ficar sem tenant; não pertence a órgão. |

> Demais usuários listados em `SCHEMA_ROLES.md` pertencem a Farol/Saúde/Social/Admin. Usuários **sem tenant** adicionais (se houver) só serão conhecidos após consulta real ao banco.

## Tratamento

- Não vincular por suposição.
- No portal `app.govsistem.com.br`: usuário sem membership ativo vê mensagem clara e **não** pode entrar em módulos.
- Conta interna (`contato@govsistem.com.br`) acessa `admin.govsistem.com.br` via `is_platform_admin` (não depende de tenant).
- Registrar em auditoria o estado "sem tenant".

## Pendência de dados

Rodar ao obter acesso ao banco:
```sql
SELECT id, name, email, is_active, platform_role, is_platform_admin
FROM users WHERE organization_id IS NULL AND deleted_at IS NULL;
```
Cada linha deve ser revisada manualmente antes de qualquer vínculo.
