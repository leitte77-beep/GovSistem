"""Testes de regressão para a UX do app do motorista.

Cobre: me() com organização e config de fotos; veículos com nome do
combustível e KM/horímetro; busca por placa insensível a caixa/espaço; e
últimos abastecimentos com placa/modelo/combustível.
"""

import uuid

import pytest


async def _login(client, login, senha):
    resp = await client.post(
        "/api/govfrota/app/motorista/login",
        json={"login": login, "senha": senha},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_me_retorna_org_e_config(client, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login, "1234")

    resp = await client.get("/api/govfrota/app/motorista/me", headers=headers)
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    assert dados["nome"] == "João da Silva"
    assert dados["organization_id"] == str(t["org"].id)
    assert dados["organization_name"] == t["org"].name
    assert "foto_bomba_obrigatoria" in dados
    assert "foto_km_obrigatoria" in dados


@pytest.mark.asyncio
async def test_veiculos_traz_combustivel_e_km(client, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login, "1234")

    resp = await client.get("/api/govfrota/app/motorista/veiculos", headers=headers)
    assert resp.status_code == 200, resp.text
    veiculo = next(v for v in resp.json() if v["id"] == str(f["veiculo"].id))
    assert veiculo["combustivel_principal_nome"] == "Diesel S10"
    assert veiculo["quilometragem_atual"] == 50000
    assert veiculo["usa_horimetro"] is False


@pytest.mark.asyncio
async def test_busca_placa_insensivel_a_caixa(client, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login, "1234")
    placa = f["veiculo"].placa

    # busca em minúsculas com hífen (formato solto)
    resp = await client.get(
        "/api/govfrota/app/motorista/veiculos",
        params={"search": placa.lower()},
        headers=headers,
    )
    assert resp.status_code == 200
    assert any(v["placa"] == placa for v in resp.json())


@pytest.mark.asyncio
async def test_meus_abastecimentos_com_placa_modelo_combustivel(
    client, make_tenant, setup_frota
):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login, "1234")

    resp = await client.post(
        "/api/govfrota/app/motorista/abastecimentos",
        json={
            "veiculo_id": str(f["veiculo"].id),
            "tanque_id": str(f["tanque"].id),
            "quantidade_litros": "45.5",
            "quilometragem": 50350,
            "idempotency_key": str(uuid.uuid4()),
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    lista = await client.get(
        "/api/govfrota/app/motorista/abastecimentos", headers=headers
    )
    assert lista.status_code == 200
    item = next(x for x in lista.json() if x["id"] == resp.json()["id"])
    assert item["placa"] == f["veiculo"].placa
    assert item["modelo"] == "Hilux"
    assert item["combustivel"] == "Diesel S10"
    assert float(item["litros"]) == 45.5
    assert item["km"] == 50350
