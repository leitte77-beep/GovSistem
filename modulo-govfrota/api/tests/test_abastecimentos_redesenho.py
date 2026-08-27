"""Testes do redesenho da área de Abastecimentos.

Cobre os endpoints novos/estendidos:
- listagem paginada (header X-Total-Count) e ordenação;
- busca por placa / modelo / motorista / id;
- filtro de origem (motorista vs administrativo);
- resumo de indicadores;
- linha do tempo de correções;
- bloqueio de lançamento retroativo.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest


async def _login_app(client, frota):
    resp = await client.post(
        "/api/govfrota/app/motorista/login",
        json={"login": frota["acesso"].login, "senha": "1234"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _abastecer_app(client, headers, veiculo_id, litros, km):
    return await client.post(
        "/api/govfrota/app/motorista/abastecimentos",
        json={
            "veiculo_id": str(veiculo_id),
            "quantidade_litros": str(litros),
            "quilometragem": km,
        },
        headers=headers,
    )


async def _abastecer_admin(client, tenant, frota, litros, km, dias_atras=0):
    data = (datetime.now(timezone.utc) - timedelta(days=dias_atras)).isoformat()
    return await client.post(
        "/api/govfrota/abastecimentos",
        json={
            "veiculo_id": str(frota["veiculo"].id),
            "tanque_id": str(frota["tanque"].id),
            "combustivel_id": str(frota["combustivel"].id),
            "quantidade_litros": str(litros),
            "quilometragem": km,
            "data_abastecimento": data,
        },
        headers=tenant["headers"],
    )


class TestListagem:
    async def test_paginacao_total_no_header(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        app_headers = await _login_app(client, frota)

        assert (await _abastecer_app(client, app_headers, frota["veiculo"].id, 45, 50350)).status_code == 201
        assert (await _abastecer_app(client, app_headers, frota["veiculo"].id, 30, 50600)).status_code == 201

        resp = await client.get(
            "/api/govfrota/abastecimentos?limit=1", headers=tenant["headers"]
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-Total-Count") == "2"
        assert len(resp.json()) == 1

        resp = await client.get(
            "/api/govfrota/abastecimentos?limit=1&skip=1", headers=tenant["headers"]
        )
        assert len(resp.json()) == 1

    async def test_ordenacao_por_litros(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        app_headers = await _login_app(client, frota)
        await _abastecer_app(client, app_headers, frota["veiculo"].id, 45, 50350)
        await _abastecer_app(client, app_headers, frota["veiculo"].id, 80, 50600)

        resp = await client.get(
            "/api/govfrota/abastecimentos?sort_by=litros&order=desc", headers=tenant["headers"]
        )
        itens = resp.json()
        assert itens[0]["quantidade_litros"] == "80.00"
        assert itens[1]["quantidade_litros"] == "45.00"

    async def test_busca_por_placa_modelo_motorista(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        app_headers = await _login_app(client, frota)
        await _abastecer_app(client, app_headers, frota["veiculo"].id, 45, 50350)

        # por placa
        resp = await client.get(
            f"/api/govfrota/abastecimentos?search={frota['veiculo'].placa}",
            headers=tenant["headers"],
        )
        assert len(resp.json()) == 1

        # por modelo
        resp = await client.get(
            "/api/govfrota/abastecimentos?search=Hilux", headers=tenant["headers"]
        )
        assert len(resp.json()) == 1

        # por motorista (nome)
        resp = await client.get(
            "/api/govfrota/abastecimentos?search=Jo%C3%A3o", headers=tenant["headers"]
        )
        assert len(resp.json()) == 1

        # busca sem resultado
        resp = await client.get(
            "/api/govfrota/abastecimentos?search=xyz-inexistente", headers=tenant["headers"]
        )
        assert resp.json() == []

    async def test_filtro_origem(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        app_headers = await _login_app(client, frota)

        await _abastecer_app(client, app_headers, frota["veiculo"].id, 45, 50350)
        resp = await _abastecer_admin(client, tenant, frota, 30, 50600)
        assert resp.status_code == 201, resp.text
        assert resp.json()["origem"] == "ADMIN"

        resp = await client.get(
            "/api/govfrota/abastecimentos?origem=APP_MOTORISTA", headers=tenant["headers"]
        )
        assert len(resp.json()) == 1
        assert resp.json()[0]["origem"] == "APP_MOTORISTA"

        resp = await client.get(
            "/api/govfrota/abastecimentos?origem=ADMIN", headers=tenant["headers"]
        )
        assert len(resp.json()) == 1
        assert resp.json()[0]["origem"] == "ADMIN"

    async def test_detalhe_enriquecido(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        app_headers = await _login_app(client, frota)
        criado = (await _abastecer_app(client, app_headers, frota["veiculo"].id, 45, 50350)).json()

        resp = await client.get(
            f"/api/govfrota/abastecimentos/{criado['id']}", headers=tenant["headers"]
        )
        body = resp.json()
        assert body["veiculo_placa"] == frota["veiculo"].placa
        assert body["veiculo_modelo"] == "Hilux"
        assert body["motorista_nome"] == "João da Silva"
        assert body["created_at"] is not None


class TestResumo:
    async def test_resumo_indicadores(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        app_headers = await _login_app(client, frota)
        await _abastecer_app(client, app_headers, frota["veiculo"].id, 45, 50350)
        await _abastecer_app(client, app_headers, frota["veiculo"].id, 30, 50600)

        resp = await client.get("/api/govfrota/abastecimentos/resumo", headers=tenant["headers"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["hoje_quantidade"] == 2
        assert data["hoje_litros"] == 75.0
        assert data["mes_litros"] == 75.0
        assert data["mes_gasto"] >= 0


class TestCorrecoes:
    async def test_linha_do_tempo(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        criado = (await _abastecer_admin(client, tenant, frota, 45, 50350)).json()

        resp = await client.get(
            f"/api/govfrota/abastecimentos/{criado['id']}/correcoes", headers=tenant["headers"]
        )
        assert resp.status_code == 200
        assert resp.json() == []  # nenhuma correção ainda

        # corrige
        resp = await client.post(
            f"/api/govfrota/abastecimentos/{criado['id']}/corrigir",
            json={"quantidade_litros": "50", "quilometragem": 50350, "justificativa": "correção de digitação"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200, resp.text

        resp = await client.get(
            f"/api/govfrota/abastecimentos/{criado['id']}/correcoes", headers=tenant["headers"]
        )
        corrs = resp.json()
        assert len(corrs) == 1
        assert corrs[0]["tipo_correcao"] == "CORRECAO"

        # cancela
        resp = await client.post(
            f"/api/govfrota/abastecimentos/{criado['id']}/cancelar",
            json={"justificativa": "abastecimento indevido"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200, resp.text

        resp = await client.get(
            f"/api/govfrota/abastecimentos/{criado['id']}/correcoes", headers=tenant["headers"]
        )
        tipos = {c["tipo_correcao"] for c in resp.json()}
        assert {"CORRECAO", "CANCELAMENTO"} <= tipos


class TestRetroativo:
    async def test_retroativo_bloqueado(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        # Desabilita retroativo e testa o bloqueio.
        resp = await client.patch(
            "/api/govfrota/configuracoes",
            json={"permitir_retroativo": False},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200, resp.text
        resp = await _abastecer_admin(client, tenant, frota, 45, 50350, dias_atras=2)
        assert resp.status_code == 422
        assert "retroativo" in resp.json()["detail"].lower()
