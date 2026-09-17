"""Test fixtures.

Os testes rodam contra um SQLite assíncrono em memória, isolado e
recriado a cada teste. Os modelos usam `postgresql.UUID`; para viabilizar
o SQLite, trocamos esse tipo pelo genérico `sqlalchemy.Uuid` ANTES de
importar os modelos/aplicação.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool, StaticPool

# SQLite não entende o tipo específico do PostgreSQL. Em CI/integração é
# possível definir TEST_DATABASE_URL para rodar a mesma suíte contra um
# PostgreSQL temporário; nesse caso preservamos o tipo nativo.
import sqlalchemy
import sqlalchemy.dialects.postgresql as _pg

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite://")
IS_POSTGRES = not TEST_DATABASE_URL.startswith("sqlite")
if not IS_POSTGRES:
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

_ENGINE_KWARGS = (
    {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
    if not IS_POSTGRES
    # `NullPool` no PostgreSQL: cada teste roda em um event loop próprio e o
    # asyncpg não aceita reaproveitar uma conexão de outro loop. Sem isto, o
    # primeiro teste passa e todos os seguintes estouram `InterfaceError`.
    else {"poolclass": NullPool}
)
TEST_ENGINE = create_async_engine(TEST_DATABASE_URL, **_ENGINE_KWARGS)
TEST_SESSION = async_sessionmaker(TEST_ENGINE, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def _pg_schema():
    """No PostgreSQL, monta o schema pelas migrations — uma vez por sessão.

    `create_all` não serve aqui: `busca_tsv` e `busca_texto` são colunas geradas
    criadas por migration e não existem nos metadados. Montar pelas migrations
    é o que faz a suíte exercitar, de fato, o schema de produção — inclusive a
    busca full-text.
    """
    if not IS_POSTGRES:
        yield
        return
    url = make_url(TEST_DATABASE_URL)
    ambiente = {
        **os.environ,
        "POSTGRES_HOST": url.host or "localhost",
        "POSTGRES_PORT": str(url.port or 5432),
        "POSTGRES_DB": url.database or "",
        "POSTGRES_USER": url.username or "",
        "POSTGRES_PASSWORD": url.password or "",
        "DEBUG": "true",
    }
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=Path(__file__).resolve().parents[1],
        env=ambiente,
        check=True,
    )
    yield


@pytest_asyncio.fixture(autouse=True)
def _storage_temporario(tmp_path, monkeypatch):
    """Isola os arquivos enviados nos testes.

    Sem isto, o storage local escreveria em `uploads/` dentro do repositório e
    os arquivos de teste ficariam acumulados no disco de quem roda a suíte.
    """
    from app.core import storage as modulo_storage

    monkeypatch.setattr(
        modulo_storage.storage, "base_path", str(tmp_path / "storage"), raising=False
    )
    return tmp_path


_TABELAS = [t.name for t in Base.metadata.sorted_tables]


@pytest_asyncio.fixture(autouse=True)
async def _reset_db(_pg_schema):
    """Limpa o schema antes de cada teste.

    SQLite: recria pelos metadados. PostgreSQL: o schema foi montado pelas
    migrations na sessão; aqui só se apaga o conteúdo, preservando as colunas
    geradas de busca e a configuração de full-text.
    """
    async with TEST_ENGINE.begin() as conn:
        if IS_POSTGRES:
            await conn.execute(
                text("TRUNCATE " + ", ".join(_TABELAS) + " RESTART IDENTITY CASCADE")
            )
        else:
            await conn.run_sync(Base.metadata.create_all)
    yield
    if not IS_POSTGRES:
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


@pytest_asyncio.fixture
async def catalogo_padrao(_db):
    """Semeia o catálogo padrão do sistema (tipos e status de demanda).

    Em produção o catálogo entra pela migration; nos testes ele é recriado aqui
    porque o schema é montado direto pelos metadados.
    """
    from app.core.seeds_demanda import STATUS_PADRAO, TIPOS_PADRAO
    from app.models import StatusDemanda, TipoDemanda

    tipos = {}
    for ordem, item in enumerate(TIPOS_PADRAO):
        tipo = TipoDemanda(
            organization_id=None, chave=item["chave"], rotulo=item["rotulo"],
            ordem=ordem, is_system=True,
            exige_obra=item.get("exige_obra", False),
            exige_financeiro=item.get("exige_financeiro", False),
            exige_convenio=item.get("exige_convenio", False),
            exige_licitacao=item.get("exige_licitacao", False),
            exige_contrato=item.get("exige_contrato", False),
            exige_prestacao_contas=item.get("exige_prestacao_contas", False),
        )
        _db.add(tipo)
        tipos[item["chave"]] = tipo

    status = {}
    for ordem, item in enumerate(STATUS_PADRAO):
        st = StatusDemanda(
            organization_id=None, chave=item["chave"], rotulo=item["rotulo"],
            ordem=ordem, cor=item.get("cor"), is_system=True,
            is_inicial=item.get("is_inicial", False),
            is_final=item.get("is_final", False),
            is_aguardando_externo=item.get("is_aguardando_externo", False),
            conta_como_atrasavel=item.get("conta_como_atrasavel", True),
        )
        _db.add(st)
        status[item["chave"]] = st

    await _db.commit()
    return {"tipos": tipos, "status": status}


@pytest_asyncio.fixture
async def workflows_padrao(_db, catalogo_padrao):
    """Semeia os modelos de fluxo do sistema, como faz a migration."""
    from app.core.seeds_workflow import WORKFLOWS_PADRAO, etapa_com_padroes
    from app.models import (
        Workflow,
        WorkflowEtapa,
        WorkflowTarefaModelo,
        WorkflowVersao,
    )
    from app.models.enums import StatusWorkflowVersao

    criados = {}
    for modelo in WORKFLOWS_PADRAO:
        wf = Workflow(
            organization_id=None,
            chave=modelo["chave"],
            nome=modelo["nome"],
            descricao=modelo.get("descricao"),
            tipo_demanda_id=catalogo_padrao["tipos"][modelo["tipo_demanda"]].id,
            is_system=True,
        )
        _db.add(wf)
        await _db.flush()

        versao = WorkflowVersao(
            workflow_id=wf.id, versao=1, status=StatusWorkflowVersao.PUBLICADA
        )
        _db.add(versao)
        await _db.flush()

        for bruta in modelo["etapas"]:
            etapa = etapa_com_padroes(bruta)
            tarefas = etapa.pop("tarefas")
            we = WorkflowEtapa(versao_id=versao.id, **etapa)
            _db.add(we)
            await _db.flush()
            for t in tarefas:
                _db.add(WorkflowTarefaModelo(etapa_id=we.id, **t))
        criados[modelo["chave"]] = wf

    await _db.commit()
    return criados
