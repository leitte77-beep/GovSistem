import os

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-govpro-tests")
os.environ.setdefault("JWT_SECRET", "govpro-test-secret")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("STORAGE_BACKEND", "local")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db
from app.core.seeds import seed_dominio, seed_roles
from app.main import create_app
from app.models.base import Base
from app.models.enums import RoleName
from app.models.organization import Organization
from app.models.role import Role
from app.models.unidade import LotacaoUsuario, Unidade
from app.models.user import User
from app.models.user_role import UserRole

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    app = create_app()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def cenario(db_session: AsyncSession):
    """Cria roles, tenant, unidades, tipos e um usuário SERVIDOR. Retorna contexto."""
    db = db_session
    await seed_roles(db)

    org = Organization(name="Município Teste", slug="mun-teste", is_active=True)
    db.add(org)
    await db.flush()

    await seed_dominio(db, org.id)

    result = await db.execute(
        select(Unidade).where(Unidade.tenant_id == org.id, Unidade.sigla == "PROTOCOLO")
    )
    protocolo = result.scalar_one()

    user = User(
        organization_id=org.id,
        name="Servidor Teste",
        email="servidor@teste.local",
        is_active=True,
        password_hash=None,
    )
    db.add(user)
    await db.flush()

    result = await db.execute(select(Role).where(Role.name == RoleName.SERVIDOR.value))
    role_servidor = result.scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role_servidor.id))

    db.add(
        LotacaoUsuario(
            tenant_id=org.id,
            user_id=user.id,
            unidade_id=protocolo.id,
            principal=True,
        )
    )

    await db.commit()

    return {"db": db, "tenant_id": org.id, "user": user, "unidade": protocolo}
