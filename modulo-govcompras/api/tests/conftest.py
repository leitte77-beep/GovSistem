"""Configuração da suíte de testes do GovCompras.

Roda contra SQLite em arquivo temporário (mesmo engine da aplicação), com
rate limit alto para não interferir nos testes.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="govcompras-tests-")

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "chave-de-teste-do-govcompras-nao-usar-em-producao")
os.environ.setdefault("INTERNAL_API_KEY", "chave-interna-de-teste-do-govcompras")
# Força (não `setdefault`) o isolamento do banco de teste: em contêiner, o
# ambiente do serviço `api` já define `DATABASE_URL_OVERRIDE=""` (para usar o
# Postgres real), e `setdefault` não substitui uma chave só porque está vazia
# — os testes acabariam rodando contra o Postgres de verdade. A suíte nunca
# deve depender do banco ambiente, sempre do seu próprio SQLite isolado.
os.environ["DATABASE_URL_OVERRIDE"] = f"sqlite+aiosqlite:///{_TMP}/govcompras.db"
os.environ.setdefault("ENABLE_DEV_LOGIN", "true")
os.environ.setdefault("RATE_LIMIT_REQUESTS", "1000000")
os.environ.setdefault("PUBLIC_URL", "http://127.0.0.1:45001")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.database import async_session, engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def banco():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db():
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def app():
    return create_app()


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://teste") as ac:
        yield ac


@pytest_asyncio.fixture
async def mundo(db):
    """Organização, estrutura organizacional, as 7 personas e os 6 workflows
    — reaproveita exatamente as mesmas funções do `scripts/seed.py` para não
    duplicar a definição do fluxo entre testes e demonstração."""
    from scripts.seed import (
        seed_estrutura,
        seed_organizacao_e_personas,
        seed_workflow_templates,
    )

    organizacao, usuarios = await seed_organizacao_e_personas(db)
    setores = await seed_estrutura(db, organizacao, usuarios)
    templates = await seed_workflow_templates(db, organizacao)
    await db.commit()
    return {"organizacao": organizacao, "usuarios": usuarios, "setores": setores, "templates": templates}


@pytest.fixture
def token(mundo):
    """Cabeçalho de autorização para uma persona do cenário (chave = valor
    do Perfil, ex. "administrador", "compras", "solicitante")."""

    def _token(chave: str) -> dict:
        user = mundo["usuarios"][chave]
        return {
            "Authorization": f"Bearer {create_access_token(str(user.id), extra={'perfil': user.perfil})}"
        }

    return _token
