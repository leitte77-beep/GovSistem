"""Infraestrutura de teste: banco real, migrations reais, API real.

Postgres de verdade e não SQLite, porque o módulo usa tipos e restrições do
Postgres (UUID nativo, unique composta). Teste que não exercita a mesma
restrição do ambiente de produção não prova nada sobre ele.
"""

import os
import uuid

os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "15499")
os.environ.setdefault("POSTGRES_DB", "govtask_novo_test")
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("SECRET_KEY", "chave-de-teste-com-tamanho-suficiente-000")
os.environ.setdefault("INTERNAL_API_KEY", "chave-interna-de-teste")
os.environ.setdefault("UPLOAD_DIR", "/tmp/govtask2-test-uploads")

import pytest
import pytest_asyncio
from fastapi import Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import async_session, engine, get_db
from app.core.permissions import ROLE_DEFAULT_PERMISSIONS
from app.main import app
from app.models import Base, Organization, Role, User, UserRole


@pytest_asyncio.fixture(scope="function", autouse=True)
async def banco():
    """Esquema limpo por teste, e engine descartado no fim.

    O descarte é obrigatório: o engine é criado no import e guarda conexões
    presas ao event loop do teste que as abriu. Sem `dispose`, o teste
    seguinte recebe uma conexão de um loop já fechado e falha com
    RuntimeError — só quando a suíte roda inteira, nunca isolada.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def db():
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def organizacao(db):
    from app.services import setores as setor_service

    org = Organization(id=uuid.uuid4(), name="Prefeitura de Teste", slug="teste")
    db.add(org)
    for nome in ROLE_DEFAULT_PERMISSIONS:
        db.add(Role(id=uuid.uuid4(), name=nome, label=nome.title(), is_system=True))
    await db.flush()
    # Toda prefeitura nasce com os setores padrão, como em produção.
    await setor_service.garantir_setores(db, org.id)
    await db.commit()
    return org


async def _criar_usuario(
    db, org, nome: str, email: str, papel: str, setor: str | None = None
) -> User:
    from sqlalchemy import select

    user = User(
        id=uuid.uuid4(),
        organization_id=org.id,
        name=nome,
        email=email,
        setor=setor,
    )
    db.add(user)
    await db.flush()
    role = await db.scalar(select(Role).where(Role.name == papel))
    db.add(UserRole(id=uuid.uuid4(), user_id=user.id, role_id=role.id))
    await db.commit()
    return user


@pytest_asyncio.fixture
async def assessor(db, organizacao):
    return await _criar_usuario(db, organizacao, "Ana Assessora", "ana@teste.gov.br", "ASSESSOR")


@pytest_asyncio.fixture
async def juridico(db, organizacao):
    return await _criar_usuario(
        db, organizacao, "Jorge Jurídico", "jorge@teste.gov.br", "DEPARTAMENTO",
        setor="JURIDICO",
    )


@pytest_asyncio.fixture
async def engenheiro(db, organizacao):
    return await _criar_usuario(
        db, organizacao, "Eva Engenheira", "eva@teste.gov.br", "DEPARTAMENTO",
        setor="ENGENHARIA",
    )


@pytest_asyncio.fixture
async def engenheiro2(db, organizacao):
    return await _criar_usuario(
        db, organizacao, "Elias Engenheiro", "elias@teste.gov.br", "DEPARTAMENTO",
        setor="ENGENHARIA",
    )


@pytest_asyncio.fixture
async def prefeito(db, organizacao):
    return await _criar_usuario(db, organizacao, "Pedro Prefeito", "pedro@teste.gov.br", "PREFEITO")


@pytest.fixture
def como():
    """Autentica o cliente como um usuário, sem passar por JWT.

    A verificação do token tem teste próprio; aqui o alvo é a regra de
    negócio, e cada teste diz explicitamente de quem é a mão que age.
    """

    def _fabrica(user: User):
        async def _override(db: AsyncSession = Depends(get_db)):
            """Carrega o usuário na MESMA sessão do endpoint, como em produção.

            Uma sessão separada devolveria um objeto destacado, que os
            `populate_existing` das consultas do endpoint nunca tocam — e foi
            justamente esse refresh que expirava `user_roles` e virava
            MissingGreenlet em produção.
            """
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            carregado = await db.execute(
                select(User)
                .where(User.id == user.id)
                .options(
                    selectinload(User.user_roles)
                    .selectinload(UserRole.role)
                    .selectinload(Role.permissions)
                )
            )
            return carregado.scalar_one()

        app.dependency_overrides[get_current_user] = _override
        return AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test/api/govtask"
        )

    return _fabrica
