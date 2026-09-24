"""Testes de combustível: tanques, estoque, abastecimentos e alertas (item 37)."""

import pytest

pytestmark = pytest.mark.asyncio


async def criar_maquina_aux(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/categorias-maquina",
        json={"chave": "retro-teste", "nome": "Retroescavadeira"},
        headers=token("admin"),
    )
    assert resposta.status_code == 201
    categoria = next(
        c
        for c in (await client.get("/api/govinfra/v1/categorias-maquina", headers=token("gestor"))).json()
        if c["chave"] == "retro-teste"
    )
    resposta = await client.post(
        "/api/govinfra/v1/maquinas",
        json={
            "codigo": "MAQ-CB-01",
            "nome": "Retro de teste",
            "categoria_id": categoria["id"],
            "tipo_combustivel": "diesel_s10",
            "horimetro_atual": 1000,
            "capacidade_tanque_litros": 200,
            "consumo_medio_litros_hora": 12,
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201
    return next(
        m
        for m in (await client.get("/api/govinfra/v1/maquinas", headers=token("gestor"))).json()["itens"]
        if m["codigo"] == "MAQ-CB-01"
    )


async def _criar_tanque(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/combustivel/tanques",
        json={
            "codigo": "TQ-TESTE",
            "nome": "Tanque de teste",
            "tipo_combustivel": "diesel_s10",
            "local": "Pátio",
            "capacidade_litros": 5000,
            "estoque_minimo_litros": 500,
            "bombas": ["Bomba 1"],
        },
        headers=token("combustivel"),
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _comprar(client, token, tanque_id, litros, nota="NF-TESTE"):
    """Registra a entrada de combustível (compra) que abastece o estoque."""
    return await client.post(
        f"/api/govinfra/v1/combustivel/tanques/{tanque_id}/movimentos",
        json={
            "tipo": "entrada",
            "quantidade_litros": litros,
            "fornecedor": "Posto de teste",
            "nota_fiscal": nota,
            "motivo": "Compra de combustível",
        },
        headers=token("combustivel"),
    )


async def test_criar_tanque_e_abastecer(client, token):
    tanque = await _criar_tanque(client, token)
    maquina = await criar_maquina_aux(client, token)
    compra = await _comprar(client, token, tanque["id"], 3000)
    assert compra.status_code == 200, compra.text

    abastecimento = await client.post(
        "/api/govinfra/v1/combustivel/abastecimentos",
        json={
            "maquina_id": maquina["id"],
            "quantidade_litros": 100,
            "tipo_combustivel": "diesel_s10",
            "horimetro": 1010,
            "tanque_id": tanque["id"],
            "bomba": "Bomba 1",
            "local": "Pátio",
            "requisicao": "REQ-TESTE-01",
            "chave_idempotencia": "idem-001",
        },
        headers=token("combustivel"),
    )
    assert abastecimento.status_code == 201, abastecimento.text
    assert abastecimento.json()["id"]
    assert abastecimento.json()["estoque_atual"] == 2900

    # Estoque foi baixado na mesma transação (3000 - 100).
    extrato = await client.get(
        f"/api/govinfra/v1/combustivel/tanques/{tanque['id']}/movimentos",
        headers=token("combustivel"),
    )
    assert extrato.status_code == 200
    saida = next(m for m in extrato.json()["itens"] if m["tipo"] == "saida")
    assert saida["saldo_anterior"] == 3000
    assert saida["saldo_posterior"] == 2900


async def test_abastecimento_duplicado_idempotente(client, token):
    tanque = await _criar_tanque(client, token)
    maquina = await criar_maquina_aux(client, token)
    await _comprar(client, token, tanque["id"], 3000)
    corpo = {
        "maquina_id": maquina["id"],
        "quantidade_litros": 50,
        "tipo_combustivel": "diesel_s10",
        "horimetro": 1015,
        "tanque_id": tanque["id"],
        "chave_idempotencia": "idem-002",
    }
    primeiro = await client.post(
        "/api/govinfra/v1/combustivel/abastecimentos", json=corpo, headers=token("combustivel")
    )
    segundo = await client.post(
        "/api/govinfra/v1/combustivel/abastecimentos", json=corpo, headers=token("combustivel")
    )
    assert primeiro.status_code == 201
    assert segundo.status_code == 201
    assert primeiro.json()["id"] == segundo.json()["id"]

    lista = await client.get(
        "/api/govinfra/v1/combustivel/abastecimentos", headers=token("combustivel")
    )
    assert lista.json()["total"] == 1


async def test_estoque_negativo_bloqueado(client, token):
    tanque = await _criar_tanque(client, token)
    resposta = await client.post(
        f"/api/govinfra/v1/combustivel/tanques/{tanque['id']}/movimentos",
        json={"tipo": "saida", "quantidade_litros": 99999, "motivo": "Teste de limite"},
        headers=token("combustivel"),
    )
    assert resposta.status_code in (422, 409)
    assert "estoque" in resposta.json()["mensagem"].lower()


async def test_ajuste_estoque_auditado(client, token):
    tanque = await _criar_tanque(client, token)
    resposta = await _comprar(client, token, tanque["id"], 1000)
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["estoque_atual"] == 1000


async def test_indicadores(client, token):
    tanque = await _criar_tanque(client, token)
    maquina = await criar_maquina_aux(client, token)
    await _comprar(client, token, tanque["id"], 3000)
    await client.post(
        "/api/govinfra/v1/combustivel/abastecimentos",
        json={
            "maquina_id": maquina["id"],
            "quantidade_litros": 60,
            "tipo_combustivel": "diesel_s10",
            "horimetro": 1020,
            "tanque_id": tanque["id"],
        },
        headers=token("combustivel"),
    )
    resposta = await client.get(
        "/api/govinfra/v1/combustivel/indicadores", headers=token("combustivel")
    )
    assert resposta.status_code == 200
    assert resposta.json()["litros_total"] == 60
