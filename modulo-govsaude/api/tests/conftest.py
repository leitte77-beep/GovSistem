"""Fixtures da suíte do GovSaúde (SQLite isolado + PostgreSQL opcional)."""

from __future__ import annotations

import os
import random
import tempfile
import uuid
from datetime import date

_TMP = tempfile.mkdtemp(prefix="govsaude-tests-")

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "chave-de-teste-do-govsaude-nao-usar-em-producao")
os.environ.setdefault("SAAS_JWT_SECRET", "segredo-saas-de-teste-nao-usar-em-producao")
os.environ.setdefault("INTERNAL_API_KEY", "chave-interna-de-teste-do-govsaude")
os.environ.setdefault("DATABASE_URL_OVERRIDE", f"sqlite+aiosqlite:///{_TMP}/govsaude.db")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", f"{_TMP}/arquivos")
os.environ.setdefault("SCHEDULER_ENABLED", "false")
os.environ.setdefault("RATE_LIMIT_REQUESTS", "1000000")
os.environ.setdefault("PUBLIC_RATE_LIMIT_REQUESTS", "1000000")
os.environ.setdefault("TERMS_REQUIRED_DEFAULT", "false")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.database import async_session, engine  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.nucleo import Grupo, Usuario, UsuarioGrupo  # noqa: E402
from app.services.provisionamento import provisionar_organizacao  # noqa: E402


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(autouse=True)
async def banco():
    async with engine.begin() as conn:
        for tabela in reversed(Base.metadata.sorted_tables):
            await conn.execute(tabela.delete())
    yield


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


def gerar_cpf() -> str:
    digitos = [random.randint(0, 9) for _ in range(9)]
    for _ in range(2):
        pesos = list(range(len(digitos) + 1, 1, -1))
        soma = sum(d * p for d, p in zip(digitos, pesos))
        resto = (soma * 10) % 11
        digitos.append(0 if resto == 10 else resto)
    return "".join(map(str, digitos))


def gerar_cns() -> str:
    while True:
        digitos = [random.choice([1, 2, 7, 8, 9])] + [random.randint(0, 9) for _ in range(13)]
        soma = sum(d * (15 - i) for i, d in enumerate(digitos))
        dv = (11 - soma % 11) % 11
        if dv < 10:
            return "".join(map(str, digitos)) + str(dv)


def _senha_hash(senha: str) -> str:
    return hash_password(senha)


async def _criar_usuario(
    db,
    *,
    tenant_id,
    nome: str,
    email: str,
    grupo: str,
    estabelecimento_id=None,
    senha: str = "SenhaForte1!",
):
    usuario = Usuario(
        tenant_id=tenant_id,
        externo_id=nome.lower(),
        nome=nome,
        email=email,
        nome_acesso=nome.lower(),
        cpf_hash=None,
        cpf_cifrado=None,
        cpf_final=None,
        password_hash=_senha_hash(senha),
        ativo=True,
        token_version=1,
    )
    db.add(usuario)
    await db.flush()
    grupo_db = await db.scalar(
        select(Grupo).where(Grupo.tenant_id == tenant_id, Grupo.codigo == grupo)
    )
    assert grupo_db is not None, grupo
    db.add(
        UsuarioGrupo(
            tenant_id=tenant_id,
            usuario_id=usuario.id,
            grupo_id=grupo_db.id,
            estabelecimento_id=estabelecimento_id,
            vigencia_inicio=date.today(),
            ativo=True,
        )
    )
    await db.flush()
    return usuario


@pytest_asyncio.fixture
async def mundo(db):
    org_a = await provisionar_organizacao(
        db,
        organization_id=uuid.uuid4(),
        nome="Prefeitura de Teste A",
        slug="prefeitura-a",
        uf="PR",
        municipio_ibge="4106902",
    )
    org_b = await provisionar_organizacao(
        db,
        organization_id=uuid.uuid4(),
        nome="Prefeitura de Teste B",
        slug="prefeitura-b",
        uf="SC",
        municipio_ibge="4205407",
    )
    from app.models.nucleo import Estabelecimento

    estab_a = Estabelecimento(
        tenant_id=org_a.id, cnes="1234567", nome="UBS A", tipo="UBS", ativo=True
    )
    estab_b = Estabelecimento(
        tenant_id=org_a.id, cnes="7654321", nome="UBS B", tipo="UBS", ativo=True
    )
    db.add_all([estab_a, estab_b])
    await db.flush()

    usuarios = {}
    definicoes = [
        ("admin", "Admin A", "admin-a@teste.local", "ADMIN"),
        ("gestor", "Gestor A", "gestor-a@teste.local", "gestor_municipal"),
        ("medico", "Médico A", "medico-a@teste.local", "medico"),
        ("recepcao", "Recepção A", "recepcao-a@teste.local", "recepcao"),
        ("dpo", "DPO A", "dpo-a@teste.local", "encarregado_dados"),
        ("faturista", "Faturista A", "faturista-a@teste.local", "faturista"),
        ("acs", "ACS A", "acs-a@teste.local", "acs"),
        ("consulta", "Consulta A", "consulta-a@teste.local", "consulta_gestao"),
    ]
    for chave, nome, email, grupo in definicoes:
        usuarios[chave] = await _criar_usuario(
            db,
            tenant_id=org_a.id,
            nome=nome,
            email=email,
            grupo=grupo,
            estabelecimento_id=estab_a.id,
        )
    usuarios["admin_b"] = await _criar_usuario(
        db,
        tenant_id=org_b.id,
        nome="Admin B",
        email="admin-b@teste.local",
        grupo="ADMIN",
    )
    # Usuário com escopo apenas na UBS A (teste de escopo).
    usuarios["medico_escopo"] = await _criar_usuario(
        db,
        tenant_id=org_a.id,
        nome="Médico Escopo",
        email="medico-escopo@teste.local",
        grupo="medico",
        estabelecimento_id=estab_a.id,
    )
    await db.commit()
    return {
        "org_a": org_a,
        "org_b": org_b,
        "estab_a": estab_a,
        "estab_b": estab_b,
        "usuarios": usuarios,
    }


@pytest.fixture
def token(mundo):
    def _token(chave: str) -> dict:
        usuario = mundo["usuarios"][chave]
        return {
            "Authorization": (
                "Bearer "
                + create_access_token(
                    usuario.id,
                    tenant_id=usuario.tenant_id,
                    token_version=usuario.token_version,
                    extra={"perfil": "teste"},
                )
            )
        }

    return _token


@pytest.fixture
def internal_headers() -> dict:
    return {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}


@pytest.fixture
def senha_padrao() -> str:
    return "SenhaForte1!"
