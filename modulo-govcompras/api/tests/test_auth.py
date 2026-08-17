"""Autenticação: login de demonstração e SSO da plataforma (module_access)."""

import pytest

from app.core.security import create_access_token

pytestmark = pytest.mark.asyncio


async def test_dev_login_lista_personas(client, mundo):
    resposta = await client.get("/api/govcompras/v1/auth/dev/personas")
    assert resposta.status_code == 200
    emails = {p["email"] for p in resposta.json()}
    assert "admin@govcompras.local" in emails
    assert "saude@govcompras.local" in emails
    assert len(emails) == 7


async def test_dev_login_com_senha_correta(client, mundo):
    resposta = await client.post(
        "/api/govcompras/v1/auth/dev/login",
        json={"email": "compras@govcompras.local", "senha": "Govcompras@123"},
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["usuario"]["perfil"] == "compras"
    assert "govcompras.cotacoes.gerenciar" in corpo["usuario"]["permissoes"]


async def test_dev_login_com_senha_incorreta_falha(client, mundo):
    resposta = await client.post(
        "/api/govcompras/v1/auth/dev/login",
        json={"email": "compras@govcompras.local", "senha": "senha-errada"},
    )
    assert resposta.status_code == 401


async def test_me_sem_token_401(client, mundo):
    resposta = await client.get("/api/govcompras/v1/auth/me")
    assert resposta.status_code == 401


async def test_sso_module_access_provisiona_usuario_novo(client, db):
    """Token com claims da plataforma (não emitido pelo GovCompras) deve
    provisionar organização e usuário just-in-time."""
    token = create_access_token(
        "usuario-externo-999",
        extra={
            "organization_id": "org-externa-123",
            "org_name": "Prefeitura Vinda do SaaS",
            "email": "novo.servidor@prefeitura.gov.br",
            "name": "Novo Servidor",
            "roles": ["govcompras_compras"],
        },
        token_type="module_access",
    )
    resposta = await client.get(
        "/api/govcompras/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["email"] == "novo.servidor@prefeitura.gov.br"
    assert corpo["perfil"] == "compras"
