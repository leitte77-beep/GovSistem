"""Fixtures dos testes do GovFrota.

Os testes rodam contra um SQLite assíncrono em memória, isolado e recriado a
cada teste. Os modelos usam `postgresql.UUID`; para viabilizar o SQLite,
trocamos esse tipo pelo genérico `sqlalchemy.Uuid` ANTES de importar os
modelos/aplicação.
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
    Combustivel,
    Organization,
    Role,
    RolePermission,
    Tanque,
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
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def _db(_reset_db):
    async with TEST_SESSION() as session:
        yield session


@pytest_asyncio.fixture
async def client(_reset_db):
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
    """Factory de tenant: organização, role, usuário e token administrativo."""

    async def _make(role_name: str = "ADMIN", org: Organization | None = None, perms: set | None = None):
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
            for perm in perms or ROLE_DEFAULT_PERMISSIONS.get(role_name, []):
                _db.add(RolePermission(role_id=role.id, permission=perm))
            await _db.flush()

        user = User(
            email=f"{uuid.uuid4().hex}@test.com",
            name=f"User {role_name}",
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


@pytest_asyncio.fixture
async def setup_frota(_db):
    """Factory de dados base: combustível, tanque, veículo e motorista."""

    async def _make(org: Organization, *, capacidade="15000", estoque_inicial="10000"):
        from datetime import date

        combustivel = Combustivel(
            organization_id=org.id, nome="Diesel S10", unidade="litro", ativo=True
        )
        _db.add(combustivel)
        await _db.flush()

        tanque = Tanque(
            organization_id=org.id,
            nome="Tanque Diesel",
            combustivel_id=combustivel.id,
            capacidade_maxima=capacidade,
            estoque_inicial=estoque_inicial,
            estoque_atual=estoque_inicial,
            estoque_minimo="2000",
        )
        _db.add(tanque)

        from app.models.motorista import AcessoMotorista, Motorista
        from app.models.veiculo import Veiculo
        from app.core.security import hash_secret

        veiculo = Veiculo(
            organization_id=org.id,
            placa=f"ABC{uuid.uuid4().hex[:4].upper()}",
            modelo="Hilux",
            marca="Toyota",
            tipo="CAMINHONETE",
            combustivel_principal_id=combustivel.id,
            quilometragem_atual=50000,
            situacao="DISPONIVEL",
        )
        _db.add(veiculo)

        motorista = Motorista(
            organization_id=org.id,
            nome="João da Silva",
            cpf=f"{uuid.uuid4().int % 10**11:011d}",
            cnh_validade=date.today() + __import__("datetime").timedelta(days=365),
            ativo=True,
        )
        _db.add(motorista)
        await _db.flush()
        acesso = AcessoMotorista(
            organization_id=org.id,
            motorista_id=motorista.id,
            login=f"joao_{uuid.uuid4().hex[:6]}",
            senha_hash=hash_secret("1234"),
        )
        _db.add(acesso)
        await _db.commit()

        return {
            "combustivel": combustivel,
            "tanque": tanque,
            "veiculo": veiculo,
            "motorista": motorista,
            "acesso": acesso,
        }

    return _make


async def criar_entrada(client, headers, tanque_id, combustivel_id, litros="10000", nota="NF-12345"):
    from datetime import date

    resp = await client.post(
        "/api/govfrota/entradas",
        json={
            "tanque_id": str(tanque_id),
            "combustivel_id": str(combustivel_id),
            "quantidade_litros": litros,
            "data_entrada": date.today().isoformat(),
            "numero_nota": nota,
            "valor_total": str(float(litros) * 5.80),
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def abastecer_via_app(client, login, senha, veiculo_placa, litros, km, foto_url=None):
    """Fluxo completo do motorista: login → abastece."""
    resp = await client.post(
        "/api/govfrota/app/motorista/login",
        json={"login": login, "senha": senha},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/govfrota/app/motorista/veiculos", headers=headers)
    assert resp.status_code == 200, resp.text
    veiculo = next(v for v in resp.json() if v["placa"] == veiculo_placa)

    resp = await client.post(
        "/api/govfrota/app/motorista/abastecimentos",
        json={
            "veiculo_id": veiculo["id"],
            "tanque_id": None,
            "quantidade_litros": litros,
            "quilometragem": km,
            "foto_bomba_url": foto_url,
        },
        headers=headers,
    )
    return resp
