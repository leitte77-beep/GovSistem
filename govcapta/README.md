# GOVCAPTA

Fundação do SaaS para captação, gestão de instrumentos e acompanhamento de recursos públicos.

## Princípios já aplicados

- PostgreSQL, Redis e armazenamento S3 compatível como dependências de produção;
- API versionada em `/api/v1`, health e readiness separados;
- isolamento por `organization_id` como regra de domínio e de consulta;
- RBAC baseado em permissões efetivas, não em nomes de cargos;
- UUIDs, timestamps UTC, trilha de auditoria e migrações Alembic;
- nenhuma oportunidade, integração ou dado de produção é simulado.

## Desenvolvimento

```bash
cp .env.example .env
docker compose up --build
```

A API fica em `http://localhost:8300`; a documentação OpenAPI fica em `/docs`.

## Próxima fatia vertical

Autenticação com Argon2id e sessões em cookie, onboarding do órgão e o primeiro fluxo de Perfil Institucional. Consulte [docs/FOUNDATION.md](docs/FOUNDATION.md).

