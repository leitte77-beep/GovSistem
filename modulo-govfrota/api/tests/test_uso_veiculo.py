"""Registro de uso de veículos: saída/chegada pelo app, acompanhamento e encerramento pelo painel."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.uso_veiculo import UsoVeiculo
from app.models.veiculo import Veiculo

API = "/api/govfrota"


async def _login(client, f):
    r = await client.post(f"{API}/app/motorista/login", json={"login": f["acesso"].login, "senha": "1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _saida(veiculo_id, km, **extra):
    return {"veiculo_id": str(veiculo_id), "finalidade": "Levar documentos", "destino": "Fórum",
            "medicao": km, "foto_url": "/api/govfrota/uploads/x", **extra}


@pytest.mark.asyncio
async def test_saida_e_chegada_pelo_app(client, _db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    f = await setup_frota(admin["org"])
    h = await _login(client, f)
    vid = f["veiculo"].id

    assert (await client.get(f"{API}/app/motorista/usos/atual", headers=h)).json() is None
    r = await client.post(f"{API}/app/motorista/usos", json=_saida(vid, 50000), headers=h)
    assert r.status_code == 201, r.text
    uso = r.json()
    assert uso["status"] == "EM_USO" and uso["avisos"] == [] and uso["veiculo_placa"] == f["veiculo"].placa
    assert (await client.get(f"{API}/app/motorista/usos/atual", headers=h)).json()["id"] == uso["id"]
    await _db.refresh(f["veiculo"])
    assert f["veiculo"].situacao == "EM_USO"

    # Segunda saída com uso aberto é recusada.
    assert (await client.post(f"{API}/app/motorista/usos", json=_saida(vid, 50000), headers=h)).status_code == 409

    # Chegada menor que a saída é erro de digitação.
    r = await client.post(f"{API}/app/motorista/usos/{uso['id']}/chegada", json={"medicao": 49990, "foto_url": "y"}, headers=h)
    assert r.status_code == 422
    r = await client.post(f"{API}/app/motorista/usos/{uso['id']}/chegada", json={"medicao": 50042, "foto_url": "y"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CONCLUIDO" and r.json()["percorrido"] == 42

    await _db.refresh(f["veiculo"])
    assert f["veiculo"].quilometragem_atual == 50042 and f["veiculo"].situacao == "DISPONIVEL"
    assert (await client.get(f"{API}/app/motorista/usos/atual", headers=h)).json() is None

    resumo = (await client.get(f"{API}/usos/resumo", headers=admin["headers"])).json()
    assert resumo == {"total": 1, "concluidos": 1, "km": 42.0, "horas": 0.0, "com_alerta": 0, "veiculos": 1}
    lista = (await client.get(f"{API}/usos", headers=admin["headers"])).json()
    assert [u["id"] for u in lista] == [uso["id"]]
    xlsx = await client.get(f"{API}/usos/exportar", params={"formato": "xlsx"}, headers=admin["headers"])
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
    pdf = await client.get(f"{API}/usos/exportar", params={"formato": "pdf"}, headers=admin["headers"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


@pytest.mark.asyncio
async def test_km_divergente_so_avisa(client, _db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    f = await setup_frota(admin["org"])
    h = await _login(client, f)
    r = await client.post(f"{API}/app/motorista/usos", json=_saida(f["veiculo"].id, 49000), headers=h)
    assert r.status_code == 201, r.text
    assert "diferente do último" in r.json()["avisos"][0]
    assert r.json()["alertas"][0]["tipo"] == "MEDICAO_DIVERGENTE"


@pytest.mark.asyncio
async def test_veiculo_em_uso_por_outro(client, _db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    f = await setup_frota(admin["org"])
    g = await setup_frota(admin["org"])
    h1, h2 = await _login(client, f), await _login(client, g)
    assert (await client.post(f"{API}/app/motorista/usos", json=_saida(f["veiculo"].id, 50000), headers=h1)).status_code == 201
    r = await client.post(f"{API}/app/motorista/usos", json=_saida(f["veiculo"].id, 50000), headers=h2)
    assert r.status_code == 409 and "em uso por" in r.json()["detail"]


@pytest.mark.asyncio
async def test_gestor_encerra_uso_esquecido_e_alerta(client, _db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    f = await setup_frota(admin["org"])
    h = await _login(client, f)
    uso = (await client.post(f"{API}/app/motorista/usos", json=_saida(f["veiculo"].id, 50000), headers=h)).json()

    # Recuado 9 h: vira alerta no sininho e "atrasado" no painel.
    obj = (await _db.execute(select(UsoVeiculo))).scalar_one()
    obj.saida_em = datetime.now(timezone.utc) - timedelta(hours=9)
    await _db.commit()
    alertas = (await client.get(f"{API}/alertas", headers=admin["headers"])).json()
    assert any(a["tipo"] == "USO_ABERTO" for a in alertas["itens"])
    em_uso = (await client.get(f"{API}/usos/em-uso", headers=admin["headers"])).json()
    assert em_uso[0]["atrasado"] is True

    consulta = await make_tenant("CONSULTA", org=admin["org"])
    corpo = {"medicao": 50080, "motivo": "Motorista esqueceu de registrar"}
    assert (await client.post(f"{API}/usos/{uso['id']}/encerrar", json=corpo, headers=consulta["headers"])).status_code == 403
    r = await client.post(f"{API}/usos/{uso['id']}/encerrar", json=corpo, headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ENCERRADO_GESTOR" and r.json()["motivo_encerramento"] == corpo["motivo"]
    alertas = (await client.get(f"{API}/alertas", headers=admin["headers"])).json()
    assert not any(a["tipo"] == "USO_ABERTO" for a in alertas["itens"])


@pytest.mark.asyncio
async def test_lancamento_pelo_painel_com_horimetro(client, _db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    f = await setup_frota(admin["org"])
    v = f["veiculo"]
    v.usa_horimetro = True
    v.horimetro_atual = 1200
    await _db.commit()
    ontem = datetime.now(timezone.utc) - timedelta(days=1)
    r = await client.post(f"{API}/usos", json={
        "veiculo_id": str(v.id), "motorista_id": str(f["motorista"].id), "finalidade": "Patrolamento",
        "destino": "Estrada rural", "saida_em": ontem.isoformat(), "medicao_saida": 1200,
        "chegada_em": (ontem + timedelta(hours=5)).isoformat(), "medicao_chegada": 1204.5,
    }, headers=admin["headers"])
    assert r.status_code == 201, r.text
    assert r.json()["origem"] == "PAINEL" and r.json()["usa_horimetro"] is True and r.json()["percorrido"] == 4.5
    v = (await _db.execute(select(Veiculo).where(Veiculo.id == v.id).execution_options(populate_existing=True))).scalar_one()
    assert float(v.horimetro_atual) == 1204.5
