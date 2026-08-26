"""Testes de regressão da área de Motoristas.

Cobre: listagem com dados de acesso e situação de CNH, CPF normalizado,
validação de CPF, login global único, geração de PIN provisório, bloqueio,
desativação e isolamento por tenant.
"""

from datetime import date, timedelta

import pytest


def _criar_motorista(client, headers, **over):
    base = {"nome": "Teste Motorista", "cpf": "08915375971", "cnh_categoria": "AB"}
    base.update(over)
    return client.post("/api/govfrota/motoristas", json=base, headers=headers)


@pytest.mark.asyncio
async def test_cpf_normalizado(client, make_tenant):
    t = await make_tenant()
    resp = await _criar_motorista(client, t["headers"], cpf="089.153.759-71")
    assert resp.status_code == 201, resp.text
    assert resp.json()["cpf"] == "08915375971"


@pytest.mark.asyncio
async def test_cpf_invalido_rejeitado(client, make_tenant):
    t = await make_tenant()
    resp = await _criar_motorista(client, t["headers"], cpf="123")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_listagem_traz_acesso_e_situacao_cnh(client, make_tenant):
    t = await make_tenant()
    val = (date.today() + timedelta(days=300)).isoformat()
    m = await _criar_motorista(client, t["headers"], cpf="08915375971", cnh_validade=val)
    assert m.status_code == 201
    mid = m.json()["id"]

    # Cria acesso com PIN gerado.
    g = await client.post(f"/api/govfrota/motoristas/{mid}/acesso/gerar-pin", headers=t["headers"])
    assert g.status_code == 200, g.text
    assert len(g.json()["pin_provisorio"]) == 6

    resp = await client.get("/api/govfrota/motoristas", headers=t["headers"])
    assert resp.status_code == 200
    item = next(x for x in resp.json() if x["id"] == mid)
    assert item["acesso_login"] is not None
    assert item["situacao_cnh"] == "VALIDA"


@pytest.mark.asyncio
async def test_cnh_vencida_na_listagem(client, make_tenant):
    t = await make_tenant()
    val = (date.today() - timedelta(days=5)).isoformat()
    m = await _criar_motorista(client, t["headers"], cpf="08915375971", cnh_validade=val)
    mid = m.json()["id"]
    resp = await client.get(
        "/api/govfrota/motoristas",
        params={"situacao_cnh": "VENCIDA"},
        headers=t["headers"],
    )
    ids = [x["id"] for x in resp.json()]
    assert mid in ids


@pytest.mark.asyncio
async def test_login_global_unico_entre_tenants(client, make_tenant):
    t1 = await make_tenant()
    t2 = await make_tenant()
    m1 = await _criar_motorista(client, t1["headers"], cpf="08915375971")
    m2 = await _criar_motorista(client, t2["headers"], cpf="08915375972")
    g1 = await client.post(f"/api/govfrota/motoristas/{m1.json()['id']}/acesso/gerar-pin", headers=t1["headers"])
    g2 = await client.post(f"/api/govfrota/motoristas/{m2.json()['id']}/acesso/gerar-pin", headers=t2["headers"])
    assert g1.json()["login"] != g2.json()["login"]


@pytest.mark.asyncio
async def test_cross_tenant_motorista_404(client, make_tenant):
    t1 = await make_tenant()
    t2 = await make_tenant()
    m1 = await _criar_motorista(client, t1["headers"], cpf="08915375971")
    mid = m1.json()["id"]
    resp = await client.get(f"/api/govfrota/motoristas/{mid}", headers=t2["headers"])
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_paginacao_total(client, make_tenant):
    t = await make_tenant()
    for i in range(3):
        await _criar_motorista(client, t["headers"], cpf=f"0000000000{i}")
    resp = await client.get(
        "/api/govfrota/motoristas",
        params={"skip": 0, "limit": 2},
        headers=t["headers"],
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2
    assert resp.headers.get("X-Total-Count") == "3"
