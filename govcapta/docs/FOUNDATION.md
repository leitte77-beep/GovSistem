# Fundação técnica — GOVCAPTA

## Decisões

| Decisão | Motivo |
| --- | --- |
| Monorepo independente em `govcapta/` | Não acopla o novo produto ao Diário Oficial ou aos módulos em manutenção. |
| PostgreSQL 16 | Tipos UUID, JSONB, busca textual, `pg_trgm` e `pgvector` podem ser habilitados por migração. SQLite é proibido. |
| `organization_id` como fronteira | Todo agregado de negócio futuro será tenant-scoped; consultas começam com o filtro de organização. |
| RBAC por permissão | Papéis são agrupamentos; autorização valida chaves como `opportunity.read`, nunca só o cargo. |
| Alembic | O esquema é reproduzível e auditável; alterações manuais no banco não fazem parte do fluxo. |

## Invariantes obrigatórios

1. Uma requisição autenticada terá uma organização ativa e uma membership válida.
2. Um repositório tenant-scoped não busca registros por `id` sem também filtrar `organization_id`.
3. Dados de conectores mantêm fonte, URL, payload bruto, checksum e versão do conector.
4. Documentos são imutáveis por versão e serão persistidos em storage S3, não no filesystem do container.
5. Prazos legais e elegibilidade entram por regras versionadas, nunca como constantes de negócio.
6. Acesso, exportação, alteração de permissões, documentos e uso de IA geram `AuditEvent`.

## Entregue nesta etapa

- Runtime containerizado: API FastAPI, PostgreSQL e Redis;
- configuração apenas por ambiente e sem segredo padrão operacional;
- health (`/health`) e readiness (`/ready`);
- modelo inicial de organização, usuário, membership, papéis, permissões e auditoria;
- convenção de UUID, UTC, nomes de constraints e índices de isolamento.

## Sequência de construção

1. Criar a migração inicial e testes de isolamento multi-tenant.
2. Implementar autenticação (Argon2id, sessões rotativas em cookies HttpOnly, MFA e revogação).
3. Onboarding do órgão, perfil institucional, secretarias e prioridades.
4. Cofre documental versionado em S3, certidões e alertas.
5. Contratos de conectores, importação idempotente e Radar de oportunidades.
6. Motor de elegibilidade/regras e pipeline de captação.

## Limites desta entrega

Ainda não existe tela, login, seed, fonte externa ou oportunidade. Isso é proposital: nenhum dado fictício ou integração supostamente real foi introduzido. A fundação estabelece as fronteiras que esses módulos deverão respeitar.

