"""Test fixtures.

Os testes rodam contra um SQLite assíncrono em memória, isolado e
recriado a cada teste. Os modelos usam `postgresql.UUID`; para viabilizar
o SQLite, trocamos esse tipo pelo genérico `sqlalchemy.Uuid` ANTES de
importar os modelos/aplicação.
"""

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Patch do tipo UUID antes de qualquer import de modelo/aplicativo.
import sqlalchemy
import sqlalchemy.dialects.postgresql as _pg

_pg.UUID = sqlalchemy.Uuid

from app.core.database import get_db  # noqa: E402
from app.core.permissions import ROLE_DEFAULT_PERMISSIONS  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    Base,
    Organization,
    Role,
    RolePermission,
    User,
    UserRole,
)

TEST_ENGINE = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TEST_SESSION = async_sessionmaker(TEST_ENGINE, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _reset_db():
    """Recria o schema antes de cada teste e descarta depois."""
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def _db(_reset_db):
    """Sessão de escrita para seeding."""
    async with TEST_SESSION() as session:
        yield session


@pytest_asyncio.fixture
async def client(_reset_db):
    """Cliente HTTP sobre a aplicação real, com DB sobrescrito para o SQLite."""
    app = create_app()

    async def override_get_db():
        async with TEST_SESSION() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def make_tenant(_db):
    """Factory de tenant: cria organização, role (global), usuário e token real.

    - `role_name`: nome da role (ex.: ASSESSOR). Roles são globais e únicas;
      são reutilizadas quando já existirem.
    - `org`: quando informado, cria o usuário na mesma organização (mesmo tenant).
    """

    async def _make(role_name: str = "ASSESSOR", org: Organization | None = None, name: str | None = None):
        org = org or Organization(
            name="Org " + uuid.uuid4().hex[:8],
            slug=uuid.uuid4().hex,
        )
        if org not in _db:
            _db.add(org)
            await _db.flush()

        role = await _db.scalar(select(Role).where(Role.name == role_name))
        if role is None:
            role = Role(name=role_name, label=role_name, is_system=True)
            _db.add(role)
            await _db.flush()
            for perm in ROLE_DEFAULT_PERMISSIONS.get(role_name, []):
                _db.add(RolePermission(role_id=role.id, permission=perm))
            await _db.flush()

        user = User(
            email=f"{uuid.uuid4().hex}@test.com",
            name=name or f"User {role_name}",
            organization_id=org.id,
            is_active=True,
        )
        _db.add(user)
        await _db.flush()
        _db.add(UserRole(user_id=user.id, role_id=role.id))
        await _db.commit()

        token = create_access_token(user.id, [role_name], org.id)
        return {
            "org": org,
            "user": user,
            "role": role_name,
            "token": token,
            "headers": {"Authorization": f"Bearer {token}"},
        }

    return _make
