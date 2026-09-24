"""Configuração da suíte de testes do GovInfra.

Roda contra SQLite em arquivo temporário (mesmo engine da aplicação) e
armazenamento local isolado, com rate limit alto para não interferir.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="govinfra-tests-")

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "chave-de-teste-do-govinfra-nao-usar-em-producao")
os.environ.setdefault("INTERNAL_API_KEY", "chave-interna-de-teste-do-govinfra")
os.environ.setdefault("DATABASE_URL_OVERRIDE", f"sqlite+aiosqlite:///{_TMP}/govinfra.db")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", f"{_TMP}/arquivos")
os.environ.setdefault("SCHEDULER_ENABLED", "false")
os.environ.setdefault("RATE_LIMIT_REQUESTS", "1000000")
os.environ.setdefault("PUBLIC_RATE_LIMIT_REQUESTS", "1000000")
os.environ.setdefault("PUBLIC_URL", "http://127.0.0.1:44001")
os.environ.setdefault("GEOCODE_PROVIDER", "none")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.database import async_session, engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.organizacao import Organizacao, User  # noqa: E402


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
    """Organização e um usuário por perfil, prontos para os cenários."""
    organizacao = Organizacao(
        externo_id="teste-org", nome="Prefeitura de Teste", slug="prefeitura-teste", uf="SC"
    )
    db.add(organizacao)
    await db.flush()

    usuarios = {}
    definicoes = [
        ("admin", "Administrador", "administrador"),
        ("gestor", "Gestor", "gestor"),
        ("atendente", "Atendente", "atendente"),
        ("tecnico", "Técnico", "tecnico"),
        ("operador", "Operador", "operador"),
        ("motorista", "Motorista", "motorista"),
        ("combustivel", "Combustível", "combustivel"),
        ("manutencao", "Manutenção", "manutencao"),
        ("consulta", "Consulta", "consulta"),
    ]
    for chave, nome, perfil in definicoes:
        user = User(
            organizacao_id=organizacao.id,
            externo_id=f"teste-{chave}",
            nome=nome,
            email=f"{chave}@teste.local",
            perfil=perfil,
            ativo=True,
        )
        db.add(user)
        usuarios[chave] = user
    await db.commit()
    return {"organizacao": organizacao, "usuarios": usuarios}


@pytest.fixture
def token(mundo):
    """Cabeçalho de autorização para um usuário do cenário."""

    def _token(chave: str) -> dict:
        user = mundo["usuarios"][chave]
        return {
            "Authorization": f"Bearer {create_access_token(str(user.id), extra={'perfil': user.perfil})}"
        }

    return _token


@pytest.fixture
def cpf_unico():
    """Gera CPFs fictícios válidos (somente dígitos)."""
    import random

    def _gerar() -> str:
        digitos = [random.randint(0, 9) for _ in range(9)]
        for _ in range(2):
            soma = sum((len(digitos) + 1 - i) * v for i, v in enumerate(digitos))
            resto = (soma * 10) % 11
            digitos.append(0 if resto == 10 else resto)
        return "".join(str(d) for d in digitos)

    return _gerar


@pytest_asyncio.fixture
async def pessoa(client, token, cpf_unico):
    """Cria uma pessoa e devolve o JSON de detalhe."""
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={
            "nome": "Cidadão de Teste",
            "documento": cpf_unico(),
            "telefone": "49999990001",
            "logradouro": "Rua das Flores",
            "numero": "123",
            "bairro": "Centro",
            "municipio": "Testópolis",
            "uf": "SC",
            "tipos": ["cidadao"],
        },
        headers=token("atendente"),
    )
    assert resposta.status_code == 201, resposta.text
    detalhe = await client.get(
        f"/api/govinfra/v1/pessoas/{resposta.json()['id']}", headers=token("atendente")
    )
    assert detalhe.status_code == 200, detalhe.text
    return detalhe.json()


@pytest_asyncio.fixture
async def cacamba(client, token):
    """Cria uma caçamba disponível."""
    resposta = await client.post(
        "/api/govinfra/v1/cacambas",
        json={
            "codigo": "CB-TESTE-001",
            "capacidade_m3": 4,
            "estado_conservacao": "bom",
            "localizacao_padrao": "Pátio",
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201, resposta.text
    detalhe = await client.get(
        f"/api/govinfra/v1/cacambas/{resposta.json()['id']}", headers=token("consulta")
    )
    assert detalhe.status_code == 200, detalhe.text
    return detalhe.json()


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
