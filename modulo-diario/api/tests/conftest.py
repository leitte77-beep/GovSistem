import os

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("STORAGE_BACKEND", "local")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles


# Allow the full metadata (incl. the Postgres-only TSVECTOR search column) to
# be created on the in-memory SQLite test database.
@compiles(TSVECTOR, "sqlite")
def _compile_tsvector_sqlite(element, compiler, **kw):  # noqa: ANN001
    return "TEXT"


from app.core.database import get_db
from app.main import app as _global_app
from app.models.base import Base

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
    # Use the module-level app instance (app.main:app) so that dependency
    # overrides registered by tests against that same instance (e.g. auth)
    # take effect. Creating a fresh app here caused 401s: tests overrode the
    # global app while the client exercised a different instance.
    app = _global_app

    # Only wire the real test DB when the test did not already override get_db
    # (many suites override get_db with mocks via their own autouse fixture).
    # Fixture ordering runs autouse overrides before this client fixture, so we
    # must not clobber an existing override.
    if get_db not in app.dependency_overrides:
        async def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    # Reset only the db override we may have installed; test-specific overrides
    # are cleared by each test's own fixture to avoid cross-test leakage.
    app.dependency_overrides.pop(get_db, None)
