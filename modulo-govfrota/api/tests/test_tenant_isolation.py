"""Testes de isolamento entre tenants (§42) — regra OBRIGATÓRIA.

Um usuário da Empresa A jamais pode acessar dados da Empresa B, mesmo
manipulando IDs, URLs, payloads ou parâmetros.
"""

import uuid

import pytest


@pytest.fixture
async def dois_tenants(make_tenant, setup_frota):
    tenant_a = await make_tenant("ADMIN")
    frota_a = await setup_frota(tenant_a["org"])
    tenant_b = await make_tenant("ADMIN")
    frota_b = await setup_frota(tenant_b["org"])
    return (tenant_a, frota_a), (tenant_b, frota_b)


class TestIsolamentoTenants:
    async def test_veiculo_outro_tenant_retorna_404(self, client, dois_tenants):
        (tenant_a, frota_a), (tenant_b, _) = dois_tenants
        resp = await client.get(
            f"/api/govfrota/veiculos/{frota_a['veiculo'].id}",
            headers=tenant_b["headers"],
        )
        assert resp.status_code == 404

    async def test_tanque_outro_tenant_retorna_404(self, client, dois_tenants):
        (tenant_a, frota_a), (tenant_b, _) = dois_tenants
        resp = await client.get(
            f"/api/govfrota/tanques/{frota_a['tanque'].id}",
            headers=tenant_b["headers"],
        )
        assert resp.status_code == 404

    async def test_motorista_outro_tenant_retorna_404(self, client, dois_tenants):
        (tenant_a, frota_a), (tenant_b, _) = dois_tenants
        resp = await client.get(
            f"/api/govfrota/motoristas/{frota_a['motorista'].id}",
            headers=tenant_b["headers"],
        )
        assert resp.status_code == 404

    async def test_listagens_somente_do_proprio_tenant(self, client, dois_tenants):
        (tenant_a, _), (tenant_b, _) = dois_tenants
        resp_a = await client.get("/api/govfrota/veiculos", headers=tenant_a["headers"])
        resp_b = await client.get("/api/govfrota/veiculos", headers=tenant_b["headers"])
        placas_a = {v["placa"] for v in resp_a.json()}
        placas_b = {v["placa"] for v in resp_b.json()}
        assert len(placas_a) == 1 and len(placas_b) == 1
        assert not (placas_a & placas_b)

    async def test_abastecimento_com_id_de_outro_tenant_falha(self, client, dois_tenants):
        """Tentativa de abastecer veículo de outro tenant via API."""
        (tenant_a, frota_a), (tenant_b, frota_b) = dois_tenants

        # Motorista do tenant B tenta usar o veículo do tenant A
        acesso_b = frota_b["acesso"]
        from conftest import TEST_SESSION

        async with TEST_SESSION() as session:
            login_b = acesso_b.login
            senha_b = "1234"

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": login_b, "senha": senha_b},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Tenta registrar abastecimento no veículo de A com tanque de B — incompatível
        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota_a["veiculo"].id),
                "tanque_id": str(frota_b["tanque"].id),
                "quantidade_litros": "10",
                "quilometragem": 1000,
            },
            headers=headers,
        )
        assert resp.status_code == 404  # veículo não existe para o tenant B

    async def test_cancelar_abastecimento_de_outro_tenant_falha(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        # Abastece
        acesso = frota["acesso"]
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": acesso.login, "senha": "1234"},
        )
        app_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "quantidade_litros": "20",
                "quilometragem": 50100,
            },
            headers=app_headers,
        )
        abast_id = resp.json()["id"]

        # Outro tenant tenta cancelar
        intruso = await make_tenant("ADMIN")
        resp = await client.post(
            f"/api/govfrota/abastecimentos/{abast_id}/cancelar",
            json={"justificativa": "tentativa indevida"},
            headers=intruso["headers"],
        )
        assert resp.status_code == 404

    async def test_motorista_login_isolado_por_org(self, client, make_tenant, setup_frota):
        """Login do motorista pertence obrigatoriamente ao tenant correto."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["motorista"]["organization_id"] == str(tenant["org"].id)
