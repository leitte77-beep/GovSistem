"""Criação de usuário, idempotência, If-Match e validação de documento."""

from __future__ import annotations

import uuid


def _payload(email: str = "novo@example.com") -> dict:
    return {
        "nome": "Novo Usuário",
        "email": email,
        "nome_acesso": f"novo-{uuid.uuid4().hex[:6]}",
        "cpf": "52998224725",
        "grupo": "medico",
        "senha": "SenhaForte1!",
    }


async def test_criar_com_idempotency_key(client, mundo, token):
    corpo = _payload()
    chave = str(uuid.uuid4())
    primeira = await client.post(
        "/api/govsaude/v1/usuarios",
        json=corpo,
        headers={**token("admin"), "Idempotency-Key": chave},
    )
    assert primeira.status_code == 201, primeira.text
    segunda = await client.post(
        "/api/govsaude/v1/usuarios",
        json=corpo,
        headers={**token("admin"), "Idempotency-Key": chave},
    )
    assert segunda.status_code == 201
    assert primeira.json()["id"] == segunda.json()["id"]


async def test_idempotency_key_com_corpo_diferente_conflita(client, mundo, token):
    chave = str(uuid.uuid4())
    primeira = await client.post(
        "/api/govsaude/v1/usuarios",
        json=_payload("a@example.com"),
        headers={**token("admin"), "Idempotency-Key": chave},
    )
    assert primeira.status_code == 201, primeira.text
    segunda = await client.post(
        "/api/govsaude/v1/usuarios",
        json=_payload("b@example.com"),
        headers={**token("admin"), "Idempotency-Key": chave},
    )
    assert segunda.status_code == 409


async def test_cpf_invalido_rejeitado(client, mundo, token):
    corpo = _payload()
    corpo["cpf"] = "11111111111"
    resposta = await client.post(
        "/api/govsaude/v1/usuarios", json=corpo, headers=token("admin")
    )
    assert resposta.status_code == 422
    assert resposta.json()["errors"][0]["codigo_regra"] == "cpf"


async def test_patch_exige_if_match(client, mundo, token):
    criado = await client.post(
        "/api/govsaude/v1/usuarios", json=_payload(), headers=token("admin")
    )
    assert criado.status_code == 201, criado.text
    usuario_id = criado.json()["id"]

    sem = await client.patch(
        f"/api/govsaude/v1/usuarios/{usuario_id}",
        json={"nome": "Alterado"},
        headers=token("admin"),
    )
    assert sem.status_code == 428

    conflito = await client.patch(
        f"/api/govsaude/v1/usuarios/{usuario_id}",
        json={"nome": "Alterado"},
        headers={**token("admin"), "If-Match": '"99"'},
    )
    assert conflito.status_code == 409

    ok = await client.patch(
        f"/api/govsaude/v1/usuarios/{usuario_id}",
        json={"nome": "Alterado"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["nome"] == "Alterado"
    assert ok.headers["etag"] == '"2"'


async def test_usuario_de_outro_tenant_404(client, mundo, token):
    alvo = mundo["usuarios"]["admin_b"]
    resposta = await client.patch(
        f"/api/govsaude/v1/usuarios/{alvo.id}",
        json={"nome": "Invasão"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert resposta.status_code == 404


async def test_cpf_duplicado_por_tenant_rejeitado(client, mundo, token):
    primeiro = await client.post(
        "/api/govsaude/v1/usuarios", json=_payload("um@example.com"), headers=token("admin")
    )
    assert primeiro.status_code == 201, primeiro.text
    segundo = await client.post(
        "/api/govsaude/v1/usuarios",
        json={**_payload("dois@example.com"), "nome_acesso": "outro-acesso"},
        headers=token("admin"),
    )
    assert segundo.status_code == 409
