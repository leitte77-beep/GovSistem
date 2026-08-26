"""Testes de regressão para a área de Veículos.

Cobre: validação de placa (padrão antigo + Mercosul), normalização e
unicidade, busca por renavam, filtros, ordenação server-side, paginação com
total e isolamento por tenant.
"""

import uuid

import pytest


@pytest.mark.asyncio
async def test_placa_normalizada_e_mercossul(client, make_tenant):
    t = await make_tenant()
    resp = await client.post(
        "/api/govfrota/veiculos",
        json={"placa": "abc-1d23", "tipo": "CARRO", "marca": "Toyota", "modelo": "Corolla"},
        headers=t["headers"],
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["placa"] == "ABC1D23"


@pytest.mark.asyncio
async def test_placa_invalida_rejeitada(client, make_tenant):
    t = await make_tenant()
    for placa in ["12345", "ABCD123", "ABC123", "ZZ"]:
        resp = await client.post(
            "/api/govfrota/veiculos",
            json={"placa": placa, "tipo": "CARRO"},
            headers=t["headers"],
        )
        assert resp.status_code == 422, f"placa {placa!r} deveria ser rejeitada: {resp.text}"


@pytest.mark.asyncio
async def test_placa_duplicada_rejeitada(client, make_tenant):
    t = await make_tenant()
    first = await client.post(
        "/api/govfrota/veiculos",
        json={"placa": "ABC1234", "tipo": "CARRO"},
        headers=t["headers"],
    )
    assert first.status_code == 201
    # mesma placa, com separador — deve colidir após normalização
    dup = await client.post(
        "/api/govfrota/veiculos",
        json={"placa": "abc-1234", "tipo": "CARRO"},
        headers=t["headers"],
    )
    assert dup.status_code == 422
    assert "já existe" in dup.json()["detail"].lower()


@pytest.mark.asyncio
async def test_busca_por_renavam(client, make_tenant):
    t = await make_tenant()
    await client.post(
        "/api/govfrota/veiculos",
        json={"placa": "ABC1234", "renavam": "12345678901", "marca": "Toyota", "tipo": "CARRO"},
        headers=t["headers"],
    )
    resp = await client.get(
        "/api/govfrota/veiculos", params={"search": "12345678901"}, headers=t["headers"]
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["placa"] == "ABC1234"


@pytest.mark.asyncio
async def test_filtro_por_tipo_e_situacao(client, make_tenant):
    t = await make_tenant()
    await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC1234", "tipo": "CAMINHAO"}, headers=t["headers"]
    )
    await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC1235", "tipo": "CARRO"}, headers=t["headers"]
    )
    resp = await client.get(
        "/api/govfrota/veiculos",
        params={"tipo": "caminhao", "situacao": "disponivel"},
        headers=t["headers"],
    )
    assert resp.status_code == 200
    placas = [v["placa"] for v in resp.json()]
    assert placas == ["ABC1234"]


@pytest.mark.asyncio
async def test_ordenacao_por_placa_desc(client, make_tenant):
    t = await make_tenant()
    for placa in ["ABC1000", "ABC2000", "ABC3000"]:
        await client.post(
            "/api/govfrota/veiculos", json={"placa": placa, "tipo": "CARRO"}, headers=t["headers"]
        )
    resp = await client.get(
        "/api/govfrota/veiculos",
        params={"sort_by": "placa", "order": "desc"},
        headers=t["headers"],
    )
    assert resp.status_code == 200
    assert [v["placa"] for v in resp.json()] == ["ABC3000", "ABC2000", "ABC1000"]


@pytest.mark.asyncio
async def test_paginacao_com_total(client, make_tenant):
    t = await make_tenant()
    for i in range(5):
        await client.post(
            "/api/govfrota/veiculos",
            json={"placa": f"ABC{i}000" if i else "ABC0000", "tipo": "CARRO"},
            headers=t["headers"],
        )
    resp = await client.get(
        "/api/govfrota/veiculos",
        params={"skip": 0, "limit": 2},
        headers=t["headers"],
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2
    assert resp.headers.get("X-Total-Count") == "5"


@pytest.mark.asyncio
async def test_isolamento_por_tenant(client, make_tenant):
    t1 = await make_tenant()
    t2 = await make_tenant()
    await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC1234", "tipo": "CARRO"}, headers=t1["headers"]
    )
    resp2 = await client.get("/api/govfrota/veiculos", headers=t2["headers"])
    assert resp2.status_code == 200
    assert resp2.json() == []


@pytest.mark.asyncio
async def test_renavam_duplicado_rejeitado(client, make_tenant):
    t = await make_tenant()
    base = {"placa": "ABC1234", "tipo": "CARRO", "renavam": "12345678901"}
    first = await client.post("/api/govfrota/veiculos", json=base, headers=t["headers"])
    assert first.status_code == 201
    # mesmo RENAVAM, placa diferente
    dup = await client.post(
        "/api/govfrota/veiculos", json={**base, "placa": "ABC9999"}, headers=t["headers"]
    )
    assert dup.status_code == 422
    assert "RENAVAM" in dup.json()["detail"]


@pytest.mark.asyncio
async def test_renavam_normalizado_rejeita_formatos_diferentes(client, make_tenant):
    t = await make_tenant()
    await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC1234", "tipo": "CARRO", "renavam": "123.456.789-01"}, headers=t["headers"]
    )
    dup = await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC9999", "tipo": "CARRO", "renavam": "12345678901"}, headers=t["headers"]
    )
    assert dup.status_code == 422


@pytest.mark.asyncio
async def test_chassi_duplicado_rejeitado(client, make_tenant):
    t = await make_tenant()
    await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC1234", "tipo": "CARRO", "chassi": "9BWZZZ377VT004251"}, headers=t["headers"]
    )
    dup = await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC9999", "tipo": "CARRO", "chassi": "9BWZZZ377VT004251"}, headers=t["headers"]
    )
    assert dup.status_code == 422
    assert "chassi" in dup.json()["detail"].lower()


@pytest.mark.asyncio
async def test_renavam_duplicado_apenas_na_mesma_org(client, make_tenant):
    t1 = await make_tenant()
    t2 = await make_tenant()
    renavam = "12345678901"
    r1 = await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC1234", "tipo": "CARRO", "renavam": renavam}, headers=t1["headers"]
    )
    assert r1.status_code == 201
    r2 = await client.post(
        "/api/govfrota/veiculos", json={"placa": "ABC9999", "tipo": "CARRO", "renavam": renavam}, headers=t2["headers"]
    )
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_maquina_usa_horimetro(client, make_tenant):
    t = await make_tenant()
    resp = await client.post(
        "/api/govfrota/veiculos",
        json={
            "placa": "TRX1234",
            "tipo": "MAQUINA",
            "usa_horimetro": True,
            "horimetro_atual": "2480.5",
            "quilometragem_atual": 0,
        },
        headers=t["headers"],
    )
    assert resp.status_code == 201, resp.text
    dados = resp.json()
    assert dados["usa_horimetro"] is True
    assert float(dados["horimetro_atual"]) == 2480.5
