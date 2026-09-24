"""Testes do gerenciamento administrativo de usuário e PIN do motorista.

Cobrem os requisitos da tarefa de ajuste do GovFrota:
- Criar acesso (manual e automático).
- Alterar usuário/login (normalização, unicidade global, login antigo falha).
- Redefinir PIN (manual com confirmação, automático; PIN antigo falha).
- Política do PIN (6–12 dígitos numéricos, confirmação).
- Revogação de sessão após alteração de login/PIN/bloqueio.
- Bloquear/desbloquear acesso.
- Cross-tenant (404) e permissões (403).
- Auditoria: PIN/hash nunca registrados.
"""

import json

from conftest import TEST_SESSION


async def _login(client, login, pin):
    return await client.post(
        "/api/govfrota/app/motorista/login", json={"login": login, "pin": pin}
    )


async def _login_headers(client, login, pin):
    resp = await _login(client, login, pin)
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _criar_motorista_sem_acesso(client, headers, cpf):
    resp = await client.post(
        "/api/govfrota/motoristas",
        json={"nome": "Teste Motorista", "cpf": cpf},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _auditoria(motorista_id):
    from sqlalchemy import select

    from app.models.auditoria import Auditoria

    async with TEST_SESSION() as s:
        rows = (
            await s.execute(
                select(Auditoria)
                .where(Auditoria.motorista_id == motorista_id)
                .order_by(Auditoria.created_at)
            )
        ).scalars().all()
        return [
            {
                "acao": r.acao,
                "anteriores": json.loads(r.dados_anteriores) if r.dados_anteriores else None,
                "novos": json.loads(r.dados_novos) if r.dados_novos else None,
            }
            for r in rows
        ]


class TestCriarAcesso:
    async def test_criar_acesso_manual(self, client, make_tenant):
        t = await make_tenant("ADMIN")
        mid = await _criar_motorista_sem_acesso(client, t["headers"], "08915375971")

        resp = await client.put(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein", "pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["login"] == "alisson.klein"
        assert resp.json()["pin_provisorio"] == "458921"

        # Login recém-criado funciona.
        ok = await _login(client, "alisson.klein", "458921")
        assert ok.status_code == 200

    async def test_criar_acesso_gera_pin_automatico(self, client, make_tenant):
        t = await make_tenant("ADMIN")
        mid = await _criar_motorista_sem_acesso(client, t["headers"], "08915375971")

        resp = await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/gerar-pin", headers=t["headers"]
        )
        assert resp.status_code == 200, resp.text
        pin = resp.json()["pin_provisorio"]
        assert len(pin) == 6 and pin.isdigit()

        # PIN gerado autentica.
        ok = await _login(client, resp.json()["login"], pin)
        assert ok.status_code == 200

    async def test_confirmacao_incorreta_nao_salva(self, client, make_tenant):
        t = await make_tenant("ADMIN")
        mid = await _criar_motorista_sem_acesso(client, t["headers"], "08915375971")

        resp = await client.put(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein", "pin": "458921", "confirm_pin": "458922"},
            headers=t["headers"],
        )
        assert resp.status_code == 422, resp.text
        assert "não coincidem" in json.dumps(resp.json(), ensure_ascii=False)

        # Nenhum acesso foi criado.
        get = await client.get(f"/api/govfrota/motoristas/{mid}/acesso", headers=t["headers"])
        assert get.json()["login"] is None

    async def test_pin_invalido_menor_6_digitos(self, client, make_tenant):
        t = await make_tenant("ADMIN")
        mid = await _criar_motorista_sem_acesso(client, t["headers"], "08915375971")
        resp = await client.put(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein", "pin": "123", "confirm_pin": "123"},
            headers=t["headers"],
        )
        assert resp.status_code == 422, resp.text

    async def test_pin_nao_numerico(self, client, make_tenant):
        t = await make_tenant("ADMIN")
        mid = await _criar_motorista_sem_acesso(client, t["headers"], "08915375971")
        resp = await client.put(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein", "pin": "abc123", "confirm_pin": "abc123"},
            headers=t["headers"],
        )
        assert resp.status_code == 422, resp.text


class TestAlterarLogin:
    async def test_alterar_login(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)
        login_antigo = frota["acesso"].login

        # Login antigo funciona antes.
        assert (await _login(client, login_antigo, "1234")).status_code == 200

        # Alteração de login (sem tocar no PIN).
        resp = await client.patch(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein"},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["login"] == "alisson.klein"
        assert resp.json()["pin_alterado"] is False

        # Login antigo falha; novo login funciona com o MESMO PIN.
        assert (await _login(client, login_antigo, "1234")).status_code == 401
        ok = await _login(client, "alisson.klein", "1234")
        assert ok.status_code == 200

    async def test_login_duplicado_retorna_409(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)
        login = frota["acesso"].login

        resp = await client.patch(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": login},
            headers=t["headers"],
        )
        # O mesmo motorista já possui este login → não é conflito, retorna 200.
        assert resp.status_code == 200, resp.text

        # Outro motorista tentando usar o mesmo login → conflito.
        m2 = await _criar_motorista_sem_acesso(client, t["headers"], "08915375972")
        resp = await client.put(
            f"/api/govfrota/motoristas/{m2}/acesso",
            json={"login": login, "pin": "123456"},
            headers=t["headers"],
        )
        assert resp.status_code == 409, resp.text
        assert "já está sendo utilizado" in resp.json()["detail"]

    async def test_case_insensitive_mesmo_login(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        # Normalização: "  Alisson.Klein  " → "alisson.klein".
        resp = await client.patch(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "  Alisson.Klein  "},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["login"] == "alisson.klein"

        # Tentar outro motorista com "Alisson.Klein" (case dif) → conflito.
        m2 = await _criar_motorista_sem_acesso(client, t["headers"], "08915375972")
        resp = await client.put(
            f"/api/govfrota/motoristas/{m2}/acesso",
            json={"login": "Alisson.Klein", "pin": "123456"},
            headers=t["headers"],
        )
        assert resp.status_code == 409, resp.text


class TestRedefinirPin:
    async def test_pin_manual(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        resp = await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin",
            json={"pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["pin_provisorio"] == "458921"

        # PIN antigo falha; novo funciona.
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 401
        ok = await _login(client, frota["acesso"].login, "458921")
        assert ok.status_code == 200

    async def test_reset_pin_confirmacao_incorreta(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        resp = await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin",
            json={"pin": "458921", "confirm_pin": "458922"},
            headers=t["headers"],
        )
        assert resp.status_code == 422, resp.text

        # PIN original permanece.
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 200

    async def test_reset_pin_automatico(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        resp = await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin", json={}, headers=t["headers"]
        )
        assert resp.status_code == 200, resp.text
        pin = resp.json()["pin_provisorio"]
        assert len(pin) == 6 and pin.isdigit()

        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 401
        assert (await _login(client, frota["acesso"].login, pin)).status_code == 200

    async def test_alterar_login_e_pin_juntos(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        resp = await client.patch(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein", "pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["pin_provisorio"] == "458921"
        assert resp.json()["login"] == "alisson.klein"

        # Combinação antiga falha; nova funciona.
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 401
        assert (await _login(client, "alisson.klein", "1234")).status_code == 401
        assert (await _login(client, frota["acesso"].login, "458921")).status_code == 401
        assert (await _login(client, "alisson.klein", "458921")).status_code == 200


class TestRevogacaoDeSessao:
    async def test_sessao_invalidada_apos_redefinir_pin(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        headers = await _login_headers(client, frota["acesso"].login, "1234")
        assert (await client.get("/api/govfrota/app/motorista/me", headers=headers)).status_code == 200

        # Admin redefine o PIN → token antigo revogado.
        await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin",
            json={"pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )
        resp = await client.get("/api/govfrota/app/motorista/me", headers=headers)
        assert resp.status_code == 401, resp.text

        # Novo login gera nova sessão válida.
        new_headers = await _login_headers(client, frota["acesso"].login, "458921")
        assert (await client.get("/api/govfrota/app/motorista/me", headers=new_headers)).status_code == 200

    async def test_sessao_invalidada_apos_alterar_login(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        headers = await _login_headers(client, frota["acesso"].login, "1234")

        await client.patch(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein"},
            headers=t["headers"],
        )
        resp = await client.get("/api/govfrota/app/motorista/me", headers=headers)
        assert resp.status_code == 401, resp.text

    async def test_sessao_invalidada_apos_bloquear(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        headers = await _login_headers(client, frota["acesso"].login, "1234")

        await client.post(f"/api/govfrota/motoristas/{mid}/acesso/block", headers=t["headers"])
        resp = await client.get("/api/govfrota/app/motorista/me", headers=headers)
        # Sessão ativa anterior é inválida (bloqueio).
        assert resp.status_code in (401, 403), resp.text

        # Login direto também é recusado.
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 403


class TestBloqueioDesbloqueio:
    async def test_bloquear_e_desbloquear(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        # Bloqueia.
        resp = await client.post(f"/api/govfrota/motoristas/{mid}/acesso/block", headers=t["headers"])
        assert resp.status_code == 200, resp.text
        assert resp.json()["bloqueado"] is True
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 403

        # Credencial e motorista permanecem cadastrados.
        get = await client.get(f"/api/govfrota/motoristas/{mid}/acesso", headers=t["headers"])
        assert get.json()["login"] is not None

        # Desbloqueia — mesmas credenciais voltam a funcionar.
        resp = await client.post(f"/api/govfrota/motoristas/{mid}/acesso/unblock", headers=t["headers"])
        assert resp.status_code == 200, resp.text
        assert resp.json()["bloqueado"] is False
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 200

    async def test_bloquear_limpa_lockout(self, client, make_tenant, setup_frota):
        """Redefinição de PIN administrativa limpa o lockout por tentativas."""
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        # 5 falhas → lockout (429).
        for _ in range(5):
            await _login(client, frota["acesso"].login, "000000")
        assert (await _login(client, frota["acesso"].login, "1234")).status_code == 429

        # Redefinição administrativa limpa o lockout.
        await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin",
            json={"pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )
        assert (await _login(client, frota["acesso"].login, "458921")).status_code == 200


class TestCrossTenantEPermissao:
    async def test_cross_tenant_nao_altera_acesso(self, client, make_tenant, setup_frota):
        t_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(t_a["org"])
        t_b = await make_tenant("ADMIN")

        mid = str(frota_a["motorista"].id)
        # Admin de B tenta alterar/ler acesso de motorista de A → 404.
        assert (await client.get(f"/api/govfrota/motoristas/{mid}/acesso", headers=t_b["headers"])).status_code == 404
        assert (
            await client.patch(
                f"/api/govfrota/motoristas/{mid}/acesso",
                json={"login": "hacked"},
                headers=t_b["headers"],
            )
        ).status_code == 404
        assert (
            await client.post(f"/api/govfrota/motoristas/{mid}/acesso/reset-pin", json={}, headers=t_b["headers"])
        ).status_code == 404
        assert (
            await client.post(f"/api/govfrota/motoristas/{mid}/acesso/block", headers=t_b["headers"])
        ).status_code == 404

        # Acesso de A permanece intacto.
        assert (await _login(client, frota_a["acesso"].login, "1234")).status_code == 200

    async def test_sem_permissao_retorna_403(self, client, make_tenant, setup_frota):
        t = await make_tenant("CONSULTA")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        resp = await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin",
            json={"pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )
        assert resp.status_code == 403, resp.text


class TestAuditoria:
    async def test_login_alterado_registra_anterior_novo(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)
        login_antigo = frota["acesso"].login

        await client.patch(
            f"/api/govfrota/motoristas/{mid}/acesso",
            json={"login": "alisson.klein"},
            headers=t["headers"],
        )

        eventos = await _auditoria(frota["motorista"].id)
        alteracao = next(e for e in eventos if e["acao"] == "motorista.acesso_login_alterar")
        assert alteracao["anteriores"] == {"login": login_antigo}
        assert alteracao["novos"] == {"login": "alisson.klein"}

    async def test_pin_redefinido_nunca_registra_pin_ou_hash(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        await client.post(
            f"/api/govfrota/motoristas/{mid}/acesso/reset-pin",
            json={"pin": "458921", "confirm_pin": "458921"},
            headers=t["headers"],
        )

        eventos = await _auditoria(frota["motorista"].id)
        redef = next(e for e in eventos if e["acao"] == "motorista.acesso_redefinir")
        # Sinaliza redefinição, mas NUNCA expõe PIN/hash.
        assert redef["novos"] == {"pin_redefinido": True}
        serializado = json.dumps(eventos, ensure_ascii=False)
        assert "458921" not in serializado
        assert "$2b$" not in serializado  # prefixo bcrypt

    async def test_bloqueio_desbloqueio_registrados(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        mid = str(frota["motorista"].id)

        await client.post(f"/api/govfrota/motoristas/{mid}/acesso/block", headers=t["headers"])
        await client.post(f"/api/govfrota/motoristas/{mid}/acesso/unblock", headers=t["headers"])

        eventos = await _auditoria(frota["motorista"].id)
        acoes = [e["acao"] for e in eventos]
        assert "motorista.acesso_bloquear" in acoes
        assert "motorista.acesso_desbloquear" in acoes
