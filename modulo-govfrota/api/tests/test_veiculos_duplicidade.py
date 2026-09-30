"""Duplicidade de placa, RENAVAM e chassi: cadastro, edição e consulta prévia."""

import pytest

URL = "/api/govfrota/veiculos"


async def _criar(client, headers, **dados):
    resp = await client.post(URL, json={"tipo": "CARRO", **dados}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_edicao_nao_pode_copiar_renavam_ou_chassi(client, make_tenant):
    t = await make_tenant()
    a = await _criar(client, t["headers"], placa="AAA1111", renavam="00123456789", chassi="9BWZZZ377VT004251")
    b = await _criar(client, t["headers"], placa="BBB2222")

    for campo, valor in (("renavam", "001.2345.6789"), ("chassi", "9bwzzz377vt004251")):
        resp = await client.patch(f"{URL}/{b['id']}", json={campo: valor}, headers=t["headers"])
        assert resp.status_code == 422, resp.text
        assert "AAA1111" in resp.json()["detail"]

    # Salvar o próprio veículo com o mesmo valor não é duplicidade.
    resp = await client.patch(f"{URL}/{a['id']}", json={"renavam": "00123456789"}, headers=t["headers"])
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_edicao_normaliza_identificadores(client, make_tenant):
    t = await make_tenant()
    v = await _criar(client, t["headers"], placa="CCC3333")
    resp = await client.patch(
        f"{URL}/{v['id']}", json={"renavam": "123.456.789-01", "chassi": "9bw zzz377vt00425-1"}, headers=t["headers"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["renavam"] == "12345678901"
    assert resp.json()["chassi"] == "9BWZZZ377VT004251"


@pytest.mark.asyncio
async def test_verificar_duplicidade(client, make_tenant):
    t = await make_tenant()
    outro = await make_tenant()
    v = await _criar(client, t["headers"], placa="DDD4444", chassi="9BWZZZ377VT004251")

    resp = await client.get(f"{URL}/verificar-duplicidade", params={"campo": "placa", "valor": "ddd-4444"}, headers=t["headers"])
    assert resp.json() == {"duplicado": True, "veiculo_id": v["id"], "placa": "DDD4444"}

    # Ignorando o próprio veículo (edição) não acusa.
    resp = await client.get(
        f"{URL}/verificar-duplicidade",
        params={"campo": "chassi", "valor": "9BWZZZ377VT004251", "ignorar_id": v["id"]},
        headers=t["headers"],
    )
    assert resp.json() == {"duplicado": False}

    # Outra organização pode ter a mesma placa.
    resp = await client.get(f"{URL}/verificar-duplicidade", params={"campo": "placa", "valor": "DDD4444"}, headers=outro["headers"])
    assert resp.json() == {"duplicado": False}

    resp = await client.get(f"{URL}/verificar-duplicidade", params={"campo": "cor", "valor": "x"}, headers=t["headers"])
    assert resp.status_code == 422
