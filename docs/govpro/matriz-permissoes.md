# GovPro — Matriz de Permissões (RBAC)

> Papéis de sistema (`RoleName`) × ações. "✓" permitido, "–" proibido, "L"
> somente leitura. Escopo por unidade aplica-se a `SERVIDOR`/`CHEFE_UNIDADE`
> (lotação). Implementado em `core/auth.py` (`require_roles`, `PAPEIS_*`).

| Ação | ADMIN | SERVIDOR | CHEFE_UNIDADE | PROTOCOLO | AUTORIDADE_SIGNATARIA | GESTOR_SIGILO | ARQUIVISTA | DPO | AUDITOR |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Visualizar processo/documento | ✓ | ✓ (unid.) | ✓ (unid.) | ✓ | ✓ | ✓ | ✓ | L | L |
| Autuar processo (gerar NUP) | ✓ | – | – | ✓ | – | – | – | – | – |
| Produzir/editar rascunho | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Assinar (nível conforme matriz) | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Tramitar / receber / devolver | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| Concluir na unidade / encerrar | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Reabrir processo | ✓ | – | ✓ | – | – | – | – | – | – |
| Atribuir / redistribuir | ✓ | – | ✓ | ✓ | – | – | – | – | – |
| Classificar/desclassificar sigilo | ✓ | – | – | – | – | ✓ | – | – | – |
| Conceder/revogar credencial | ✓ | – | – | – | – | ✓ | – | – | – |
| Gerenciar TTD / eliminação | ✓ | – | – | – | – | – | ✓ | – | – |
| Configurar regras/matriz/parâmetros | ✓ | – | – | – | – | – | – | – | – |
| Consultar auditoria | ✓ | – | – | – | – | – | – | ✓ | ✓ |
| Exportar acervo / dados abertos | ✓ | – | – | – | – | – | ✓ | – | L |
| Aprovar cadastro externo | ✓ | – | – | ✓ | – | – | – | – | – |
| Emitir intimação / exigência | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| Conceder acesso externo | ✓ | ✓ | ✓ | – | – | – | – | – | – |

## Mapa SaaS → GovPro (`internal.py::_map_role`)

- `govpro.*` → verbatim.
- `PLATFORM_ADMIN` / `ADMIN` → `ADMIN`.
- `ORG_MEMBER` → `SERVIDOR`.

## Regras transversais

- **Menor privilégio**: papéis têm o mínimo para a função; `AUDITOR` nunca edita.
- **Need-to-know**: conteúdo `SIGILOSO` exige credencial nominal, além do papel.
- **Matriz de assinatura**: `perfis_autorizados` por tipo de ato restringe quem
  assina, independentemente do papel atuante.
- **Tenant**: todas as ações validam `get_tenant_id` (fail-closed) + política do
  processo/documento.

> Teste automatizado: `tests/test_matriz_assinatura.py` (perfis), demais permissões
> cobertas em `test_fase2`/`test_fase3`/`test_fase4`/`test_fase5`.
