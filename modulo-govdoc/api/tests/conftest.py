"""Configuração da suíte de testes.

Roda contra SQLite em arquivo temporário (o mesmo engine da aplicação, para que
tarefas em segundo plano também funcionem) e armazenamento local isolado.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="govdoc-tests-")

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "chave-de-teste-do-govdoc-nao-usar-em-producao")
os.environ.setdefault("INTERNAL_API_KEY", "chave-interna-de-teste-do-govdoc")
os.environ.setdefault("DATABASE_URL_OVERRIDE", f"sqlite+aiosqlite:///{_TMP}/govdoc.db")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", f"{_TMP}/arquivos")
os.environ.setdefault("BACKUP_DESTINATION", f"{_TMP}/backups")
os.environ.setdefault("SCHEDULER_ENABLED", "false")
os.environ.setdefault("RATE_LIMIT_REQUESTS", "100000")
os.environ.setdefault("EXTERNAL_RATE_LIMIT_REQUESTS", "100000")
os.environ.setdefault("PUBLIC_URL", "http://127.0.0.1:43000")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.database import async_session, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.enums import Classification, Profile  # noqa: E402
from app.models.organization import Department, Institution, Secretariat  # noqa: E402
from app.models.user import User  # noqa: E402

SENHA = "SenhaDeTeste#2026"


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
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://teste"
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def mundo(db):
    """Instituição com 2 secretarias, setores e um usuário por perfil."""
    institution = Institution(
        name="Prefeitura de Teste",
        slug="prefeitura-teste",
        storage_limit_bytes=10 * 1024 * 1024 * 1024,
    )
    db.add(institution)
    await db.flush()

    saude = Secretariat(
        institution_id=institution.id, name="Saúde", acronym="SMS", color="#0f766e"
    )
    educacao = Secretariat(
        institution_id=institution.id, name="Educação", acronym="SME", color="#b45309"
    )
    db.add_all([saude, educacao])
    await db.flush()

    adm_saude = Department(
        institution_id=institution.id, secretariat_id=saude.id, name="Administrativo"
    )
    vigilancia = Department(
        institution_id=institution.id, secretariat_id=saude.id, name="Vigilância"
    )
    adm_educacao = Department(
        institution_id=institution.id, secretariat_id=educacao.id, name="Administrativo"
    )
    db.add_all([adm_saude, vigilancia, adm_educacao])
    await db.flush()

    usuarios = {}
    definicoes = [
        ("admin", "Administrador Geral", Profile.ADMIN_GERAL, None, None),
        ("admin_saude", "Admin Saúde", Profile.ADMIN_SECRETARIA, saude, None),
        ("gestor", "Gestor Administrativo", Profile.GESTOR_SETOR, saude, adm_saude),
        ("colaborador", "Colaborador Saúde", Profile.COLABORADOR, saude, adm_saude),
        ("leitor", "Leitor Saúde", Profile.LEITOR, saude, adm_saude),
        ("auditor", "Auditor", Profile.AUDITOR, None, None),
        ("externo", "Servidor Educação", Profile.COLABORADOR, educacao, adm_educacao),
        ("vigilancia", "Fiscal Vigilância", Profile.COLABORADOR, saude, vigilancia),
    ]
    for chave, nome, perfil, secretaria, setor in definicoes:
        user = User(
            institution_id=institution.id,
            name=nome,
            email=f"{chave}@teste.local",
            password_hash=hash_password(SENHA),
            profile=perfil.value,
            secretariat_id=secretaria.id if secretaria else None,
            department_id=setor.id if setor else None,
        )
        db.add(user)
        usuarios[chave] = user
    await db.flush()
    await db.commit()

    return {
        "instituicao": institution,
        "saude": saude,
        "educacao": educacao,
        "adm_saude": adm_saude,
        "vigilancia": vigilancia,
        "adm_educacao": adm_educacao,
        "usuarios": usuarios,
    }


@pytest.fixture
def token(mundo):
    """Gera o cabeçalho de autorização para um usuário do cenário."""
    from app.core.security import create_access_token

    def _token(chave: str) -> dict:
        user = mundo["usuarios"][chave]
        return {
            "Authorization": f"Bearer {create_access_token(str(user.id), extra={'perfil': user.profile})}"
        }

    return _token


@pytest_asyncio.fixture
async def pasta_saude(client, token, mundo):
    """Pasta raiz da Saúde criada pelo administrador."""
    resposta = await client.post(
        "/api/govdoc/v1/pastas",
        json={
            "nome": "Contratos",
            "secretaria_id": str(mundo["saude"].id),
            "setor_id": str(mundo["adm_saude"].id),
            "classificacao": Classification.INTERNO.value,
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def arquivo_pdf(texto: str = "Documento de teste") -> bytes:
    """PDF mínimo válido (assinatura %PDF- reconhecida pela validação)."""
    conteudo = (
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        f"3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\n"
        f"4 0 obj<</Length {len(texto)}>>stream\n({texto})\nendstream endobj\n"
        "trailer<</Root 1 0 R>>\n%%EOF\n"
    )
    return conteudo.encode("latin-1")
