"""Testes do endpoint agregado da dashboard (§29/§61).

Cobre: nome da organização, contadores de onboarding, agregações do mês,
estoque dos tanques e isolamento entre tenants nas agregações.
"""

from datetime import date, timedelta

import pytest

from tests.test_fluxo_completo import criar_entrada

pytestmark = pytest.mark.asyncio

URL = "/api/govfrota/dashboard"


async def _abastecer(client, headers, frota, litros="100", km=50100, data=None):
    from datetime import datetime, timezone

    payload = {
        "veiculo_id": str(frota["veiculo"].id),
        "motorista_id": str(frota["motorista"].id),
        "tanque_id": str(frota["tanque"].id),
        "combustivel_id": str(frota["combustivel"].id),
        "quantidade_litros": litros,
        "quilometragem": km,
        "data_abastecimento": (data or datetime.now(timezone.utc)).isoformat(),
    }
    resp = await client.post("/api/govfrota/abastecimentos", json=payload, headers=headers)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


class TestOrganizacao:
    async def test_dashboard_devolve_nome_da_organizacao_do_tenant(self, client, make_tenant):
        from app.models import Organization

        org = Organization(name="Prefeitura Municipal de Farol", slug="farol-teste")
        tenant = await make_tenant("ADMIN", org=org)

        resp = await client.get(URL, headers=tenant["headers"])
        assert resp.status_code == 200
        assert resp.json()["organizacao"]["nome"] == "Prefeitura Municipal de Farol"
        assert resp.json()["organizacao"]["id"] == str(org.id)

    async def test_auth_me_devolve_nome_da_organizacao(self, client, make_tenant):
        from app.models import Organization

        org = Organization(name="Transportadora XYZ", slug="xyz-teste")
        tenant = await make_tenant("ADMIN", org=org)

        resp = await client.get("/api/govfrota/auth/me", headers=tenant["headers"])
        assert resp.status_code == 200
        assert resp.json()["organization_name"] == "Transportadora XYZ"
        # O nome do usuário nunca deve ser usado como nome da organização.
        assert resp.json()["name"] != resp.json()["organization_name"]


class TestOnboarding:
    async def test_organizacao_nova_fica_pendente(self, client, make_tenant):
        tenant = await make_tenant("ADMIN")
        dados = (await client.get(URL, headers=tenant["headers"])).json()

        assert dados["onboarding"]["pendente"] is True
        assert dados["onboarding"]["veiculos"] == 0
        assert dados["onboarding"]["motoristas"] == 0
        assert dados["onboarding"]["tanques"] == 0
        assert dados["onboarding"]["abastecimentos"] == 0

    async def test_organizacao_configurada_nao_fica_pendente(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        await setup_frota(tenant["org"])

        dados = (await client.get(URL, headers=tenant["headers"])).json()
        assert dados["onboarding"]["pendente"] is False
        assert dados["onboarding"]["veiculos"] == 1
        assert dados["onboarding"]["motoristas"] == 1
        assert dados["onboarding"]["tanques"] == 1

    async def test_sem_movimento_no_mes_nao_volta_a_ser_onboarding(
        self, client, make_tenant, setup_frota
    ):
        """Frota cadastrada e nenhum abastecimento não é organização nova."""
        tenant = await make_tenant("ADMIN")
        await setup_frota(tenant["org"])

        dados = (await client.get(URL, headers=tenant["headers"])).json()
        assert dados["abastecimentos"]["mes_litros"] == 0
        assert dados["onboarding"]["pendente"] is False


class TestEstoqueEAgregacoes:
    async def test_tanque_traz_percentual_status_e_minimo(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], capacidade="15000", estoque_inicial="8420")

        tanque = (await client.get(URL, headers=tenant["headers"])).json()["tanques"][0]
        assert tanque["capacidade"] == 15000
        assert tanque["estoque_atual"] == 8420
        assert tanque["estoque_minimo"] == 2000
        assert tanque["percentual"] == pytest.approx(56.1, abs=0.1)
        assert tanque["status_estoque"] == "NORMAL"

    async def test_estoque_abaixo_do_minimo_fica_baixo(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        await setup_frota(tenant["org"], capacidade="5000", estoque_inicial="900")

        tanque = (await client.get(URL, headers=tenant["headers"])).json()["tanques"][0]
        assert tanque["status_estoque"] == "BAIXO"

    async def test_estoque_zerado_fica_critico(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        await setup_frota(tenant["org"], capacidade="5000", estoque_inicial="0")

        tanque = (await client.get(URL, headers=tenant["headers"])).json()["tanques"][0]
        assert tanque["status_estoque"] == "CRITICO"

    async def test_ultimos_abastecimentos_e_agregacao_do_mes(
        self, client, make_tenant, setup_frota
    ):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        await criar_entrada(
            client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id
        )
        await _abastecer(client, tenant["headers"], frota, litros="45", km=50350)

        dados = (await client.get(URL, headers=tenant["headers"])).json()
        assert dados["abastecimentos"]["mes_litros"] == 45
        assert len(dados["ultimos_abastecimentos"]) == 1

        ultimo = dados["ultimos_abastecimentos"][0]
        assert ultimo["placa"] == frota["veiculo"].placa
        assert ultimo["motorista"] == "João da Silva"
        assert ultimo["combustivel"] == "Diesel S10"
        assert ultimo["litros"] == 45
        assert ultimo["quilometragem"] == 50350

    async def test_ultimos_abastecimentos_limitado_a_cinco(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        await criar_entrada(
            client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id
        )
        for i in range(7):
            await _abastecer(client, tenant["headers"], frota, litros="10", km=50100 + i * 100)

        dados = (await client.get(URL, headers=tenant["headers"])).json()
        assert len(dados["ultimos_abastecimentos"]) == 5

    async def test_evolucao_mensal_traz_seis_meses_com_quantidade(
        self, client, make_tenant, setup_frota
    ):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        await criar_entrada(
            client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id
        )
        await _abastecer(client, tenant["headers"], frota, litros="30", km=50400)

        meses = (await client.get(URL, headers=tenant["headers"])).json()["graficos"][
            "evolucao_mensal"
        ]
        assert len(meses) == 6
        assert meses == sorted(meses, key=lambda m: m["mes"])  # ordem cronológica
        assert meses[-1]["quantidade"] == 1
        assert meses[-1]["litros"] == 30

    async def test_ranking_sem_historico_nao_inventa_consumo_medio(
        self, client, make_tenant, setup_frota
    ):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        await criar_entrada(
            client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id
        )
        await _abastecer(client, tenant["headers"], frota, litros="50", km=50500)

        ranking = (await client.get(URL, headers=tenant["headers"])).json()["graficos"][
            "ranking_veiculos"
        ]
        assert len(ranking) == 1
        # Um único abastecimento não permite calcular km/L — nunca devolver 0.
        assert ranking[0]["consumo_medio_km_l"] is None

    async def test_preventiva_vencida_aparece_na_lista(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        resp = await client.post(
            "/api/govfrota/planos-preventivos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "nome": "Troca de óleo",
                "base": "QUILOMETRAGEM",
                "intervalo_km": 10000,
                "ultima_execucao_km": 30000,
            },
            headers=tenant["headers"],
        )
        assert resp.status_code in (200, 201), resp.text

        dados = (await client.get(URL, headers=tenant["headers"])).json()
        assert dados["manutencao"]["preventivas_vencidas"] == 1
        plano = dados["proximas_preventivas"][0]
        assert plano["situacao"] == "VENCIDA"
        assert plano["nome"] == "Troca de óleo"
        assert plano["placa"] == frota["veiculo"].placa
        assert plano["restante_km"] == 40000 - 50000

    async def test_documento_vencendo_aparece(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        resp = await client.post(
            f"/api/govfrota/veiculos/{frota['veiculo'].id}/documentos",
            json={
                "descricao": "Licenciamento",
                "vencimento": (date.today() + timedelta(days=5)).isoformat(),
            },
            headers=tenant["headers"],
        )
        assert resp.status_code in (200, 201), resp.text

        docs = (await client.get(URL, headers=tenant["headers"])).json()["documentos_vencendo"]
        assert len(docs) == 1
        assert docs[0]["descricao"] == "Licenciamento"
        assert docs[0]["dias_restantes"] == 5


class TestIsolamentoDashboard:
    async def test_agregacoes_nao_misturam_tenants(self, client, make_tenant, setup_frota):
        tenant_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(tenant_a["org"])
        await criar_entrada(
            client, tenant_a["headers"], frota_a["tanque"].id, frota_a["combustivel"].id
        )
        await _abastecer(client, tenant_a["headers"], frota_a, litros="80", km=50800)

        tenant_b = await make_tenant("ADMIN")

        dados_b = (await client.get(URL, headers=tenant_b["headers"])).json()
        assert dados_b["frota"]["total"] == 0
        assert dados_b["tanques"] == []
        assert dados_b["abastecimentos"]["mes_litros"] == 0
        assert dados_b["ultimos_abastecimentos"] == []
        assert dados_b["graficos"]["ranking_veiculos"] == []
        assert dados_b["onboarding"]["pendente"] is True
        assert dados_b["organizacao"]["id"] == str(tenant_b["org"].id)

        dados_a = (await client.get(URL, headers=tenant_a["headers"])).json()
        assert dados_a["frota"]["total"] == 1
        assert dados_a["abastecimentos"]["mes_litros"] == 80
