"""Testes da autenticação do motorista (§43) — login, bloqueio, brute force,
autorização e separação de perfis."""


class TestLoginMotorista:
    async def test_login_sucesso(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert data["motorista"]["nome"] == "João da Silva"

    async def test_senha_incorreta(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "errada"},
        )
        assert resp.status_code == 401

    async def test_login_inexistente_resposta_generica(self, client):
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": "nao_existe", "senha": "1234"},
        )
        assert resp.status_code == 401

    async def test_bloqueio_apos_tentativas(self, client, make_tenant, setup_frota):
        """Proteção contra brute force: 5 falhas → bloqueio temporário."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        for _ in range(5):
            resp = await client.post(
                "/api/govfrota/app/motorista/login",
                json={"login": frota["acesso"].login, "senha": "errada"},
            )
            assert resp.status_code == 401

        # 6ª tentativa mesmo com senha correta → bloqueio temporário (429)
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        assert resp.status_code == 429

    async def test_motorista_nao_acessa_endpoints_administrativos(self, client, make_tenant, setup_frota):
        """§43 — motorista nunca acessa telas administrativas alterando a URL."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        token_motorista = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        # Tenta listar veículos administrativos com o token do motorista
        # (o token é do tipo driver_access, rejeitado pelo get_current_user)
        resp = await client.get("/api/govfrota/veiculos", headers=token_motorista)
        assert resp.status_code in (401, 403)

        resp = await client.get("/api/govfrota/dashboard", headers=token_motorista)
        assert resp.status_code in (401, 403)

        resp = await client.get("/api/govfrota/configuracoes", headers=token_motorista)
        assert resp.status_code in (401, 403)

    async def test_token_admin_nao_funciona_na_area_do_motorista(self, client, make_tenant):
        """Separação estrita de perfis: token admin não abre área do motorista."""
        tenant = await make_tenant("ADMIN")
        resp = await client.get(
            "/api/govfrota/app/motorista/me", headers=tenant["headers"]
        )
        assert resp.status_code == 403

    async def test_criar_e_redefinir_credencial(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        motorista_id = str(frota["motorista"].id)

        # Redefine a credencial
        resp = await client.put(
            f"/api/govfrota/motoristas/{motorista_id}/acesso",
            json={"login": "joao.novo", "senha": "567890"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 201, resp.text

        # Login antigo falha; novo funciona
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        assert resp.status_code == 401

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": "joao.novo", "senha": "567890"},
        )
        assert resp.status_code == 200

        # Bloqueia acesso
        resp = await client.patch(
            f"/api/govfrota/motoristas/{motorista_id}/acesso?bloquear=true",
            json={},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200
        assert resp.json()["bloqueado"] is True

        # Login bloqueado retorna 403
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": "joao.novo", "senha": "567890"},
        )
        assert resp.status_code == 403

    async def test_cnh_vencida_bloqueia_abastecimento_quando_configurado(self, client, make_tenant, setup_frota):
        from datetime import date, timedelta

        from conftest import TEST_SESSION

        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        async with TEST_SESSION() as session:
            from app.models.motorista import Motorista as MotoristaModel

            motorista = await session.get(MotoristaModel, frota["motorista"].id)
            motorista.cnh_validade = date.today() - timedelta(days=1)
            await session.commit()

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        # Login em si é bloqueado pela política de CNH vencida
        assert resp.status_code == 403
