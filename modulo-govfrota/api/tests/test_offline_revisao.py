"""Registro feito sem internet (fila offline do app) que chega com problema.

O abastecimento já aconteceu: em vez de recusar na sincronização, o servidor
aceita e grava o alerta para o setor de frota revisar. Online continua
recusando como antes.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.veiculo import Veiculo

API = "/api/govfrota"


async def _login(client, login, pin="1234"):
    resp = await client.post(f"{API}/app/motorista/login", json={"login": login, "pin": pin})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _abastecer(client, headers, veiculo_id, litros, km, offline, chave):
    body = {
        "veiculo_id": str(veiculo_id),
        "quantidade_litros": str(litros),
        "quilometragem": km,
        "data_abastecimento": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "idempotency_key": chave,
    }
    if offline:
        body["registrado_offline"] = True
    return await client.post(f"{API}/app/motorista/abastecimentos", json=body, headers=headers)


@pytest.mark.asyncio
async def test_km_muito_inferior_offline_entra_com_alerta(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login)

    online = await _abastecer(client, headers, f["veiculo"].id, "40", 1000, False, "on-1")
    assert online.status_code == 422

    r = await _abastecer(client, headers, f["veiculo"].id, "40", 1000, True, "off-1")
    assert r.status_code == 201, r.text
    assert "MEDICAO_INFERIOR" in r.json()["alertas"]
    # A medição do veículo nunca volta para trás.
    veiculo = await _db.get(Veiculo, f["veiculo"].id, populate_existing=True)
    assert veiculo.quilometragem_atual == 50000


@pytest.mark.asyncio
async def test_estoque_insuficiente_offline_entra_com_alerta(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"], estoque_inicial="30")
    headers = await _login(client, f["acesso"].login)

    online = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, False, "on-2")
    assert online.status_code == 422

    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, True, "off-2")
    assert r.status_code == 201, r.text
    assert "ESTOQUE_INSUFICIENTE" in r.json()["alertas"]


@pytest.mark.asyncio
async def test_foto_obrigatoria_ausente_offline_entra_com_alerta(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    _db.add(ConfiguracaoGovFrota(organization_id=t["org"].id, foto_bomba_obrigatoria=True))
    await _db.commit()
    headers = await _login(client, f["acesso"].login)

    online = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, False, "on-3")
    assert online.status_code == 422

    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, True, "off-3")
    assert r.status_code == 201, r.text
    assert "SEM_FOTO" in r.json()["alertas"]


@pytest.mark.asyncio
async def test_quantidade_absurda_continua_recusada_offline(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login)

    r = await _abastecer(client, headers, f["veiculo"].id, "9000", 50100, True, "off-4")
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_registro_offline_sem_problema_nao_ganha_alerta(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login)

    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, True, "off-5")
    assert r.status_code == 201, r.text
    assert r.json()["alertas"] == []


# ── Uso do veículo e problema feitos sem internet ───────────────────────────


def _saida(veiculo_id, km, **extra):
    return {"veiculo_id": str(veiculo_id), "finalidade": "Levar documentos", "destino": "Fórum",
            "medicao": km, "foto_url": "/api/govfrota/uploads/x", **extra}


@pytest.mark.asyncio
async def test_uso_offline_com_id_do_celular_e_horarios_do_registro(client, _db, make_tenant, setup_frota):
    import uuid

    t = await make_tenant()
    f = await setup_frota(t["org"])
    h = await _login(client, f["acesso"].login)
    uid = str(uuid.uuid4())
    saiu = datetime.now(timezone.utc) - timedelta(hours=3)
    chegou = saiu + timedelta(hours=1)

    corpo = _saida(f["veiculo"].id, 50000, id=uid, registrado_em=saiu.isoformat())
    r1 = await client.post(f"{API}/app/motorista/usos", json=corpo, headers=h)
    assert r1.status_code == 201, r1.text
    assert r1.json()["id"] == uid
    # Reenvio da fila: devolve o mesmo uso.
    r2 = await client.post(f"{API}/app/motorista/usos", json=corpo, headers=h)
    assert r2.status_code == 201 and r2.json()["id"] == uid

    # Chegada offline com km menor: entra com alerta em vez de ser recusada.
    chegada = {"medicao": 49990, "foto_url": "y", "registrado_em": chegou.isoformat(), "registrado_offline": True}
    r = await client.post(f"{API}/app/motorista/usos/{uid}/chegada", json=chegada, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CONCLUIDO"
    assert [a["tipo"] for a in r.json()["alertas"]] == ["MEDICAO_INFERIOR"]
    assert abs((datetime.fromisoformat(r.json()["chegada_em"]) - chegou).total_seconds()) < 2
    # Reenvio da chegada não dá erro.
    r = await client.post(f"{API}/app/motorista/usos/{uid}/chegada", json=chegada, headers=h)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_problema_offline_nao_duplica(client, _db, make_tenant, setup_frota):
    import uuid

    from app.models.ocorrencia import Ocorrencia

    t = await make_tenant()
    f = await setup_frota(t["org"])
    h = await _login(client, f["acesso"].login)
    corpo = {"id": str(uuid.uuid4()), "veiculo_id": str(f["veiculo"].id), "categoria": "PNEU",
             "descricao": "Pneu furado", "registrado_em": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
    for _ in range(2):
        r = await client.post(f"{API}/app/motorista/problemas", json=corpo, headers=h)
        assert r.status_code == 201, r.text
        assert r.json()["id"] == corpo["id"]
    assert len((await _db.execute(select(Ocorrencia))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_localizacao_gravada_nos_registros(client, _db, make_tenant, setup_frota):
    import uuid

    from app.models.abastecimento import Abastecimento
    from app.models.ocorrencia import Ocorrencia

    t = await make_tenant()
    f = await setup_frota(t["org"])
    h = await _login(client, f["acesso"].login)
    gps = {"latitude": -23.550520, "longitude": -46.633308}

    r = await client.post(f"{API}/app/motorista/abastecimentos", headers=h, json={
        "veiculo_id": str(f["veiculo"].id), "quantidade_litros": "40", "quilometragem": 50100, **gps})
    assert r.status_code == 201, r.text
    assert float(r.json()["latitude"]) == pytest.approx(-23.550520)

    r = await client.post(f"{API}/app/motorista/problemas", headers=h, json={
        "veiculo_id": str(f["veiculo"].id), "categoria": "PNEU", "descricao": "Furou", **gps})
    oc = await _db.get(Ocorrencia, uuid.UUID(r.json()["id"]))
    assert float(oc.longitude) == pytest.approx(-46.633308)

    uid = str(uuid.uuid4())
    r = await client.post(f"{API}/app/motorista/usos", headers=h, json={**_saida(f["veiculo"].id, 50100, id=uid), **gps})
    assert r.json()["saida_latitude"] == pytest.approx(-23.550520)
    r = await client.post(f"{API}/app/motorista/usos/{uid}/chegada", headers=h,
                          json={"medicao": 50150, "foto_url": "y", "latitude": -23.6, "longitude": -46.7})
    assert r.json()["chegada_longitude"] == pytest.approx(-46.7)

    # Coordenada impossível é recusada.
    r = await client.post(f"{API}/app/motorista/problemas", headers=h, json={
        "veiculo_id": str(f["veiculo"].id), "categoria": "PNEU", "descricao": "x" * 5, "latitude": 200})
    assert r.status_code == 422
