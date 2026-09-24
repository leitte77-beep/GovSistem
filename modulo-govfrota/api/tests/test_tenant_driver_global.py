"""Testes de tenant automático do motorista, login global e segurança cross-tenant.

Cobrem os requisitos de ajuste final do GovFrota:
- Login sem informar tenant (o backend resolve a organização).
- Manipulação de tenant no body/header/query é ignorada.
- Cross-tenant de veículo, tanque e abastecimento falha de forma segura (404).
- Login globalmente único e normalização (case-insensitive).
- Separação estrita de tokens (driver_access × module_access).
- Rotas protegidas sem token.
- PWA (manifest) com start_url/scope corretos.
"""

import os
import uuid


async def _login(client, login, pin):    return await client.post(
        "/api/govfrota/app/motorista/login",
        json={"login": login, "pin": pin},
    )


async def _headers_after_login(client, login, pin):
    resp = await _login(client, login, pin)
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestLoginSemTenant:
    async def test_login_resolve_org_automaticamente(self, client, make_tenant, setup_frota):
        """§35 — envio apenas de {login, pin}; backend resolve a organização."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        resp = await _login(client, frota["acesso"].login, "1234")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["motorista"]["organization_id"] == str(tenant["org"].id)

        token = data["access_token"]
        assert token

        # /me confirma o tenant resolvido (via token, nunca do frontend)
        me = await client.get(
            "/api/govfrota/app/motorista/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me.status_code == 200, me.text
        assert me.json()["organization_id"] == str(tenant["org"].id)


class TestTenantManipulado:
    async def test_body_organization_id_ignorado_no_login(self, client, make_tenant, setup_frota):
        """§9/§36 — tenant enviado no body do login é ignorado."""
        org_b = None
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        # cria uma 2ª organização para tentar "vazar"
        tenant_b = await make_tenant("ADMIN")
        org_b = tenant_b["org"]

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={
                "login": frota["acesso"].login,
                "pin": "1234",
                "organization_id": str(org_b.id),
                "tenant_id": str(org_b.id),
                "organization_slug": org_b.slug,
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["motorista"]["organization_id"] == str(tenant["org"].id)

    async def test_header_tenant_ignorado_nas_requisicoes(self, client, make_tenant, setup_frota):
        """§13/§36 — X-Organization-ID no header não altera o tenant do token."""
        tenant_a = await make_tenant("ADMIN")
        frota = await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")

        headers = await _headers_after_login(client, frota["acesso"].login, "1234")
        headers["X-Organization-ID"] = str(tenant_b["org"].id)
        headers["X-Tenant-ID"] = str(tenant_b["org"].id)

        veiculos = await client.get("/api/govfrota/app/motorista/veiculos", headers=headers)
        assert veiculos.status_code == 200, veiculos.text
        # Nenhum veículo de B vaza
        placas_b = {v["placa"] for v in veiculos.json()}
        assert all(p == frota["veiculo"].placa for p in placas_b)


class TestCrossTenant:
    async def test_veiculo_de_outro_tenant_404(self, client, make_tenant, setup_frota):
        """§37 — abastecer com veículo de outra organização → 404, sem efeitos."""
        tenant_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")
        frota_b = await setup_frota(tenant_b["org"])

        headers = await _headers_after_login(client, frota_a["acesso"].login, "1234")

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota_b["veiculo"].id),
                "tanque_id": None,
                "quantidade_litros": "50",
                "quilometragem": 50100,
            },
            headers=headers,
        )
        assert resp.status_code == 404, resp.text
        # Nenhum abastecimento criado para A nem para B
        assert not await self._conta_abastecimentos(client, tenant_a, headers, str(frota_a["veiculo"].id))
        # km do veículo de A inalterado
        veiculo_a = await client.get(
            f"/api/govfrota/veiculos/{frota_a['veiculo'].id}", headers=tenant_a["headers"]
        )
        assert veiculo_a.json()["quilometragem_atual"] == 50000

    async def test_tanque_de_outro_tenant_safe_fail(self, client, make_tenant, setup_frota):
        """§38 — tanque de outra organização → falha segura (404)."""
        tenant_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")
        frota_b = await setup_frota(tenant_b["org"])

        headers = await _headers_after_login(client, frota_a["acesso"].login, "1234")

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota_a["veiculo"].id),
                "tanque_id": str(frota_b["tanque"].id),
                "quantidade_litros": "50",
                "quilometragem": 50100,
            },
            headers=headers,
        )
        assert resp.status_code == 404, resp.text

    async def test_abastecimento_de_outro_tenant_admin_404(self, client, make_tenant, setup_frota):
        """§39 — admin de A não consulta abastecimento de B (404, sem vazamento)."""
        tenant_a = await make_tenant("ADMIN")
        await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")
        frota_b = await setup_frota(tenant_b["org"])

        # Cria um abastecimento válido em B (via app, motorista de B)
        headers_b = await _headers_after_login(client, frota_b["acesso"].login, "1234")
        created = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": str(frota_b["veiculo"].id),
                "tanque_id": None,
                "quantidade_litros": "40",
                "quilometragem": 50100,
            },
            headers=headers_b,
        )
        assert created.status_code == 201, created.text
        abast_id = created.json()["id"]

        # Admin de A tenta ler o abastecimento de B
        resp = await client.get(
            f"/api/govfrota/abastecimentos/{abast_id}", headers=tenant_a["headers"]
        )
        assert resp.status_code == 404, resp.text

    @staticmethod
    async def _conta_abastecimentos(client, tenant, headers, veiculo_id):
        lista = await client.get("/api/govfrota/app/motorista/abastecimentos", headers=headers)
        return any(a["veiculo_id"] == veiculo_id for a in lista.json())


class TestLoginGlobal:
    async def test_duplicidade_login_global(self, client, make_tenant, setup_frota):
        """§40 — mesmo login em outra organização é impedido."""
        tenant_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")
        frota_b = await setup_frota(tenant_b["org"])

        # Cria um login único no motorista de A
        login = f"joao.silva.{uuid.uuid4().hex[:4]}"
        resp = await client.put(
            f"/api/govfrota/motoristas/{frota_a['motorista'].id}/acesso",
            json={"login": login, "senha": "123456"},
            headers=tenant_a["headers"],
        )
        assert resp.status_code == 201, resp.text

        # Tenta criar o MESMO login no motorista de B → impedido (422)
        resp_b = await client.put(
            f"/api/govfrota/motoristas/{frota_b['motorista'].id}/acesso",
            json={"login": login, "senha": "123456"},
            headers=tenant_b["headers"],
        )
        assert resp_b.status_code in (409, 422), resp_b.text

    async def test_normalizacao_case_insensitive(self, client, make_tenant, setup_frota):
        """§41 — 'Joao.Silva' e 'joao.silva' são o mesmo login (duplicado)."""
        tenant_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")
        frota_b = await setup_frota(tenant_b["org"])

        login = f"Joao.Silva.{uuid.uuid4().hex[:4]}"

        # Cria com capitalização mista em A
        resp = await client.put(
            f"/api/govfrota/motoristas/{frota_a['motorista'].id}/acesso",
            json={"login": login, "senha": "123456"},
            headers=tenant_a["headers"],
        )
        assert resp.status_code == 201, resp.text

        # Tenta criar em B com minúsculas → duplicado
        resp_b = await client.put(
            f"/api/govfrota/motoristas/{frota_b['motorista'].id}/acesso",
            json={"login": login.lower(), "senha": "123456"},
            headers=tenant_b["headers"],
        )
        assert resp_b.status_code in (409, 422), resp_b.text

        # Login com capitalização diferente funciona (normalização no login)
        resp_login = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": login.upper(), "pin": "123456"},
        )
        assert resp_login.status_code == 200, resp_login.text
        assert resp_login.json()["motorista"]["organization_id"] == str(tenant_a["org"].id)


class TestSeparacaoTokens:
    async def test_driver_token_em_endpoint_admin(self, client, make_tenant, setup_frota):
        """§42 — driver_access em rota administrativa → 401/403."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await _headers_after_login(client, frota["acesso"].login, "1234")
        resp = await client.get("/api/govfrota/veiculos", headers=headers)
        assert resp.status_code in (401, 403), resp.text

    async def test_admin_token_na_area_do_motorista(self, client, make_tenant):
        """§43 — module_access não é tratado como driver_access."""
        tenant = await make_tenant("ADMIN")
        resp = await client.get("/api/govfrota/app/motorista/me", headers=tenant["headers"])
        assert resp.status_code == 403, resp.text


class TestRotasProtegidas:
    async def test_rotas_administrativas_sem_token(self, client):
        """§44 — sem SSO, rotas admin → 401."""
        resp = await client.get("/api/govfrota/auth/me")
        assert resp.status_code == 401, resp.text
        resp = await client.get("/api/govfrota/veiculos")
        assert resp.status_code == 401, resp.text

    async def test_rotas_motorista_sem_token(self, client):
        """§44 — sem driver_access, rotas do motorista → 401."""
        resp = await client.get("/api/govfrota/app/motorista/me")
        assert resp.status_code == 401, resp.text
        resp = await client.get("/api/govfrota/app/motorista/veiculos")
        assert resp.status_code == 401, resp.text
        resp = await client.get("/api/govfrota/app/motorista/abastecimentos")
        assert resp.status_code == 401, resp.text

    async def test_health_publico(self, client):
        """§49 — health continua acessível sem autenticação (200 ou degraded 503)."""
        resp = await client.get("/api/govfrota/health")
        assert resp.status_code in (200, 503), resp.text
        assert "status" in resp.json()


class TestPWA:
    def test_manifest_pwa(self):
        """§45 — manifest com start_url/scope corretos para o domínio definitivo."""
        manifest_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "web-admin", "public", "manifest.json"
        )
        import json

        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        assert manifest["start_url"] == "/motorista"
        assert manifest["scope"] == "/motorista/"
        assert manifest["display"] == "standalone"
        assert manifest["short_name"] == "GovFrota"

    def test_service_worker_nao_cacheia_api(self):
        """§21 — o SW não cacheia rotas /api/ nem esquemas não-http(s)."""
        sw_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "web-admin", "public", "sw.js"
        )
        with open(sw_path, encoding="utf-8") as f:
            content = f.read()
        assert 'pathname.includes("/api/")' in content
        assert "return;" in content
        assert 'url.protocol !== "http:"' in content
        assert 'url.protocol !== "https:"' in content
