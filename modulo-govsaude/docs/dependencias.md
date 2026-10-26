# Dependências do GovSaúde

## Núcleo (Fase 0)

| Dependência | Uso | Justificativa |
|---|---|---|
| `fastapi`, `uvicorn` | API HTTP | Stack obrigatória da plataforma |
| `SQLAlchemy` async + `asyncpg` | ORM e PostgreSQL | Stack obrigatória |
| `alembic` | Migrações | Stack obrigatória |
| `pydantic` + `pydantic-settings` | Validação e configuração | Stack obrigatória |
| `PyJWT` | Token local e validação do `module_access` | Stack obrigatória |
| `bcrypt` | Senha custo 12 | B.12-051 |
| `cryptography` | Fernet/MultiFernet | Criptografia de coluna |
| `email-validator` | Validação de e-mail | Suporte ao Pydantic `EmailStr` |
| `redis` | Pub/sub do SSE, cache e broker | Stack obrigatória |
| `celery` | Workers/beat | Stack obrigatória |
| `httpx` | Clientes externos com timeout | Stack obrigatória |
| `minio` | Objetos privados e URL pré-assinada | Stack obrigatória |
| `openpyxl`, `WeasyPrint`, `Jinja2` | Planilhas, PDF e templates | Stack obrigatória |
| `pyotp` | MFA TOTP | B.12-049 |
| `python-multipart` | Uploads futuros | Stack obrigatória |

## Dependências permitidas ainda não usadas

`geoalchemy2`, `fhir.resources`, `thriftpy2`, `segno`, `python-barcode`,
`clamd`, `lxml`, `python-dateutil`, `testcontainers[postgres]`.

Justificativa: entram apenas nas fases em que o requisito as exige (PostGIS na
Fase 3; FHIR/LEDI/BNAFAR na Fase 11; QR/etiquetas nas Fases 8–9; ClamAV na rota
de upload do domínio; XSD/lxml na validação LEDI). Não foram instaladas na
Fase 0 para reduzir superfície e tempo de build. `clamd` é importado de forma
tardia e só quando `CLAMAV_ENABLED=true`.

## Dependências de desenvolvimento

`pytest`, `pytest-asyncio`, `aiosqlite` (unitários rápidos), `ruff`,
`testcontainers[postgres]` (opcional, testes de trigger/partição).

## Regra

Qualquer dependência fora da lista da seção 2.3 do prompt deve ser justificada
aqui antes do merge. Não há dependência de IA generativa, telemedicina,
billing ou CRM.

## Adicionadas no fechamento da Fase 0 (2026-10-26)

| Pacote | Motivo |
|---|---|
| `psycopg[binary]` | Driver síncrono do Alembic (`postgresql+psycopg://`). Sem ele o `entrypoint.sh` falha no `alembic upgrade head` e o container entra em crash loop. |
| `clamd` | Cliente ClamAV de `core/antivirus.py` (B.12-054); antes faltava e o antivírus habilitado dava erro. |
| `geoalchemy2`, `segno`, `python-barcode`, `lxml`, `python-dateutil` | Lista permitida da seção 2.3; usados a partir das Fases 3, 8, 9 e 11. |
| `pytest-cov` (dev) | Medir a cobertura de `services/` (meta ≥ 80%). |
