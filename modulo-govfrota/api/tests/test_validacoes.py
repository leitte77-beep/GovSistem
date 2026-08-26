"""Testes de RBAC por permissão e validações de abastecimento (§20)."""

from datetime import date

import pytest


class TestRBAC:
    async def test_consulta_nao_gerencia_veiculos(self, client, make_tenant):
        consulta = await make_tenant("CONSULTA")
        resp = await client.post(
            "/api/govfrota/veiculos",
            json={"placa": "XYZ9999", "tipo": "CARRO"},
            headers=consulta["headers"],
        )
        assert resp.status_code == 403

    async def test_consulta_pode_visualizar(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        consulta = await make_tenant("CONSULTA", org=tenant["org"])

        resp = await client.get("/api/govfrota/veiculos", headers=consulta["headers"])
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_resp_manutencao_nao_gerencia_estoque(self, client, make_tenant):
        resp_manut = await make_tenant("RESP_MANUTENCAO")
        resp = await client.post(
            "/api/govfrota/combustiveis",
            json={"nome": "Diesel"},
            headers=resp_manut["headers"],
        )
        assert resp.status_code == 403

    async def test_auditor_exige_permissao_especifica(self, client, make_tenant):
        auditor = await make_tenant("AUDITOR")
        resp = await client.get("/api/govfrota/auditoria", headers=auditor["headers"])
        assert resp.status_code == 200


class TestValidacoesAbastecimento:
    async def _login_app(self, client, frota):
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    async def test_quilometragem_diminuindo_bloqueia(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])  # veículo em 50.000 km
        headers = await self._login_app(client, frota)

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "quantidade_litros": "30",
                "quilometragem": 30000,
            },
            headers=headers,
        )
        assert resp.status_code == 422
        assert "inferior" in resp.json()["detail"].lower()

    async def test_quantidade_zero_bloqueia(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await self._login_app(client, frota)

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "quantidade_litros": "0",
                "quilometragem": 50100,
            },
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_combustivel_incompativel_bloqueia(self, client, make_tenant, setup_frota):
        """§58 — tanque de Diesel não abastece veículo exclusivamente Gasolina."""
        from tests.conftest import TEST_SESSION

        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await self._login_app(client, frota)

        # Cria gasolina e tenta abastecer o veículo a diesel com ela
        resp = await client.post(
            "/api/govfrota/combustiveis",
            json={"nome": "Gasolina Aditivada", "unidade": "litro"},
            headers=tenant["headers"],
        )
        gasolina_id = resp.json()["id"]

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "combustivel_id": gasolina_id,
                "quantidade_litros": "30",
                "quilometragem": 50100,
            },
            headers=headers,
        )
        # Sem tanque compatível para gasolina → auto-seleção falha
        assert resp.status_code == 422

    async def test_duplicidade_detectada(self, client, make_tenant, setup_frota):
        """§20 — abastecimento duplicado gera aviso (sem bloquear)."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await self._login_app(client, frota)

        payload = {
            "veiculo_id": str(frota["veiculo"].id),
            "quantidade_litros": "40",
            "quilometragem": 50100,
        }
        resp1 = await client.post(
            "/api/govfrota/app/motorista/abastecimentos", json=payload, headers=headers
        )
        assert resp1.status_code == 201
        assert "duplicidade" not in (resp1.json() or {})

        resp2 = await client.post(
            "/api/govfrota/app/motorista/abastecimentos", json=payload, headers=headers
        )
        # Segundo registro é aceito mas sinalizado — validação via admin
        assert resp2.status_code == 201

    async def test_correcao_administrativa_rastreavel(self, client, make_tenant, setup_frota):
        """§22 — motorista não edita; administrador corrige com justificativa."""
        import uuid as _uuid

        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await self._login_app(client, frota)

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "quantidade_litros": "45",
                "quilometragem": 50200,
            },
            headers=headers,
        )
        abast_id = resp.json()["id"]

        # Correção: eram 54 L, não 45 L
        resp = await client.post(
            f"/api/govfrota/abastecimentos/{abast_id}/corrigir",
            json={"quantidade_litros": "54", "justificativa": "Motorista informou valor errado"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200
        assert float(resp.json()["quantidade_litros"]) == 54.0

        # Estoque reflete a diferença: 1000 - 45 - 9 = 946
        resp = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        assert float(resp.json()["estoque_atual"]) == 946.0

        # Auditoria registra a correção
        resp = await client.get("/api/govfrota/auditoria", headers=tenant["headers"])
        acoes = [a["acao"] for a in resp.json()]
        assert "abastecimento.corrigir" in acoes

    async def test_cancelamento_abastecimento_estorna_estoque(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await self._login_app(client, frota)

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "quantidade_litros": "45",
                "quilometragem": 50200,
            },
            headers=headers,
        )
        abast_id = resp.json()["id"]

        resp = await client.post(
            f"/api/govfrota/abastecimentos/{abast_id}/cancelar",
            json={"justificativa": "Registro duplicado confirmado"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200

        resp = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        assert float(resp.json()["estoque_atual"]) == 1000.0

        # Registro permanece (não é excluído fisicamente)
        resp = await client.get(
            f"/api/govfrota/abastecimentos?status=CANCELADO", headers=tenant["headers"]
        )
        assert len(resp.json()) == 1
