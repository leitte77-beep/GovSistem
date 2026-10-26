"""Contratos essenciais da Fase 3: território e composição familiar."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_territorio_domicilio_e_historico_familiar(client, token):
    area = await client.post(
        "/api/govsaude/v1/territorios",
        json={"nome": "Área Norte", "tipo": "AREA", "geometria": {"type": "Polygon", "coordinates": []}},
        headers=token("admin"),
    )
    assert area.status_code == 201, area.text
    micro = await client.post(
        "/api/govsaude/v1/territorios",
        json={"nome": "Micro 01", "tipo": "MICROAREA", "territorio_pai_id": area.json()["id"]},
        headers=token("acs"),
    )
    assert micro.status_code == 201, micro.text
    domicilio = await client.post(
        "/api/govsaude/v1/territorios/domicilios",
        json={"logradouro": "Rua das Flores", "numero": "10", "territorio_id": micro.json()["id"]},
        headers=token("acs"),
    )
    assert domicilio.status_code == 201, domicilio.text
    cidadao = await client.post("/api/govsaude/v1/cidadaos", json={"nome": "Ana da Silva"}, headers=token("acs"))
    assert cidadao.status_code == 201, cidadao.text
    familia = await client.post(
        "/api/govsaude/v1/territorios/familias",
        json={"domicilio_id": domicilio.json()["id"], "responsavel_id": cidadao.json()["id"]},
        headers=token("acs"),
    )
    assert familia.status_code == 201, familia.text
    membro = await client.post(
        f"/api/govsaude/v1/territorios/familias/{familia.json()['id']}/membros",
        json={"cidadao_id": cidadao.json()["id"], "responsavel": True},
        headers=token("acs"),
    )
    assert membro.status_code == 201, membro.text
    encerrado = await client.post(
        f"/api/govsaude/v1/territorios/familias/{familia.json()['id']}/membros/{membro.json()['id']}/encerrar",
        json={}, headers=token("acs"),
    )
    assert encerrado.status_code == 200, encerrado.text
    assert encerrado.json()["vigencia_fim"] is not None


@pytest.mark.asyncio
async def test_microarea_exige_area_pai_e_isola_tenant(client, token):
    invalido = await client.post("/api/govsaude/v1/territorios", json={"nome": "Invalida", "tipo": "MICROAREA"}, headers=token("admin"))
    assert invalido.status_code == 422
    area = await client.post("/api/govsaude/v1/territorios", json={"nome": "Área A", "tipo": "AREA"}, headers=token("admin"))
    outro_tenant = await client.get("/api/govsaude/v1/territorios", headers=token("admin_b"))
    assert outro_tenant.status_code == 200
    assert area.json()["id"] not in [item["id"] for item in outro_tenant.json()]
