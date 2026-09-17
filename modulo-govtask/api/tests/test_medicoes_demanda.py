"""Medições sob a demanda e auditoria vinculada à demanda (§58, §104)."""

import pytest

BASE = "/api/govtask"
DEMANDAS = f"{BASE}/demandas"


async def _demanda(client, headers):
    resp = await client.post(
        DEMANDAS, json={"titulo": "Construção de Unidade de Saúde"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_medicao_nasce_sob_demanda_e_entra_na_timeline(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])

    criada = await client.post(
        f"{DEMANDAS}/{demanda['id']}/medicoes",
        json={"numero": 1, "valor": "150000.00", "percentual": "25.00"},
        headers=t["headers"],
    )
    assert criada.status_code == 201, criada.text
    medicao = criada.json()
    assert medicao["demanda_id"] == demanda["id"]
    assert medicao["convenio_id"] is None

    lista = (await client.get(f"{DEMANDAS}/{demanda['id']}/medicoes", headers=t["headers"])).json()
    assert len(lista) == 1

    aprovada = await client.post(
        f"{DEMANDAS}/{demanda['id']}/medicoes/{medicao['id']}/aprovar",
        headers=t["headers"],
    )
    assert aprovada.status_code == 200, aprovada.text
    assert aprovada.json()["status"] == "APROVADA"

    timeline = (await client.get(f"{DEMANDAS}/{demanda['id']}/timeline", headers=t["headers"])).json()
    tipos = [e["tipo_evento"] for e in timeline["items"]]
    assert "MEDICAO_REGISTRADA" in tipos
    assert "MEDICAO_APROVADA" in tipos


@pytest.mark.asyncio
async def test_medicao_de_outro_tenant_responde_404(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    medicao = (
        await client.post(
            f"{DEMANDAS}/{demanda['id']}/medicoes", json={"numero": 1}, headers=a["headers"]
        )
    ).json()

    # O pai (a demanda) é autorizado antes de qualquer id de medição ser tocado.
    assert (
        await client.get(f"{DEMANDAS}/{demanda['id']}/medicoes", headers=b["headers"])
    ).status_code == 404
    assert (
        await client.post(
            f"{DEMANDAS}/{demanda['id']}/medicoes/{medicao['id']}/aprovar",
            headers=b["headers"],
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_auditoria_registra_a_demanda(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    await client.post(
        f"{DEMANDAS}/{demanda['id']}/medicoes", json={"numero": 1}, headers=t["headers"]
    )

    registros = (
        await client.get(f"{BASE}/auditoria?demanda_id={demanda['id']}", headers=t["headers"])
    ).json()
    assert any(
        r["acao"] == "medicao.criar" and r["demanda_id"] == demanda["id"] for r in registros
    )
