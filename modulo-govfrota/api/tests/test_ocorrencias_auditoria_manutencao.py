"""Testes de refinamento: auditoria com responsável e deep-link ocorrência↔manutenção.

Cobre:
- auditoria de admin retorna actor_name do usuário;
- auditoria de motorista retorna actor_name do motorista;
- fallback quando responsável não existe mais;
- conversão persiste maintenance_id na ocorrência;
- API de manutenção retorna vínculo com a ocorrência de origem;
- cross-tenant continua bloqueado na manutenção.
"""

import uuid

import pytest


class TestAuditoriaResponsavel:
    async def test_admin_retorna_nome(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        criada = (
            await client.post(
                "/api/govfrota/ocorrencias",
                json={"veiculo_id": str(frota["veiculo"].id), "categoria": "PNEU", "descricao": "pneu furado", "gravidade": "MEDIA", "origem": "ADMIN"},
                headers=tenant["headers"],
            )
        ).json()

        resp = await client.get("/api/govfrota/auditoria?entidade=ocorrencia", headers=tenant["headers"])
        reg = next(r for r in resp.json() if r["entidade_id"] == criada["id"] and r["acao"] == "ocorrencia.registrar")
        assert reg["actor_type"] == "user"
        assert reg["actor_id"] == str(tenant["user"].id)
        assert reg["actor_name"] == tenant["user"].name

    async def test_motorista_retorna_nome(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        app_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        criada = (
            await client.post(
                "/api/govfrota/app/motorista/problemas",
                json={"veiculo_id": str(frota["veiculo"].id), "categoria": "FREIO", "descricao": "freio ruim"},
                headers=app_headers,
            )
        ).json()

        resp = await client.get("/api/govfrota/auditoria?entidade=ocorrencia", headers=tenant["headers"])
        reg = next(r for r in resp.json() if r["entidade_id"] == criada["id"])
        assert reg["actor_type"] == "driver"
        assert reg["actor_id"] == str(frota["motorista"].id)
        assert reg["actor_name"] == "João da Silva"

    async def test_fallback_quando_responsavel_removido(self, client, make_tenant, _db):
        from app.models.auditoria import Auditoria

        tenant = await make_tenant("ADMIN")
        fantasma = uuid.uuid4()
        _db.add(
            Auditoria(
                organization_id=tenant["org"].id,
                usuario_id=fantasma,
                acao="ocorrencia.atualizar",
                entidade="ocorrencia",
                entidade_id=uuid.uuid4(),
                dados_novos='{"status":"EM_ANALISE"}',
            )
        )
        _db.add(
            Auditoria(
                organization_id=tenant["org"].id,
                motorista_id=fantasma,
                acao="ocorrencia.registrar",
                entidade="ocorrencia",
                entidade_id=uuid.uuid4(),
            )
        )
        await _db.commit()

        resp = await client.get("/api/govfrota/auditoria?entidade=ocorrencia", headers=tenant["headers"])
        regs = resp.json()
        nomes = {r["actor_name"] for r in regs}
        assert "Usuário removido" in nomes
        assert "Motorista removido" in nomes


class TestDeepLinkManutencao:
    async def test_conversao_persiste_vinc_ulo_e_reverso(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        criada = (
            await client.post(
                "/api/govfrota/ocorrencias",
                json={"veiculo_id": str(frota["veiculo"].id), "categoria": "AVARIA", "descricao": "porta amassada", "gravidade": "MEDIA", "origem": "ADMIN"},
                headers=tenant["headers"],
            )
        ).json()

        resp = await client.post(
            f"/api/govfrota/ocorrencias/{criada['id']}/converter-manutencao", headers=tenant["headers"]
        )
        assert resp.status_code == 201
        manut_id = resp.json()["id"]

        # ocorrência mantém maintenance_id (deep-link)
        resp = await client.get(f"/api/govfrota/ocorrencias/{criada['id']}", headers=tenant["headers"])
        assert resp.json()["manutencao_id"] == manut_id

        # manutenção retorna o vínculo com a ocorrência de origem
        resp = await client.get(f"/api/govfrota/manutencoes/{manut_id}", headers=tenant["headers"])
        assert resp.status_code == 200
        body = resp.json()
        assert body["ocorrencia_origem_id"] == criada["id"]
        assert body["veiculo_placa"] == frota["veiculo"].placa

    async def test_cross_tenant_manutencao_bloqueado(self, client, make_tenant, setup_frota, tmp_storage):
        tenant_a = await make_tenant("ADMIN")
        tenant_b = await make_tenant("ADMIN")
        frota = await setup_frota(tenant_a["org"])
        criada = (
            await client.post(
                "/api/govfrota/ocorrencias",
                json={"veiculo_id": str(frota["veiculo"].id), "categoria": "PNEU", "descricao": "pneu furado", "gravidade": "BAIXA", "origem": "ADMIN"},
                headers=tenant_a["headers"],
            )
        ).json()
        manut_id = (
            await client.post(
                f"/api/govfrota/ocorrencias/{criada['id']}/converter-manutencao", headers=tenant_a["headers"]
            )
        ).json()["id"]

        # tenant B não acessa a manutenção
        resp = await client.get(f"/api/govfrota/manutencoes/{manut_id}", headers=tenant_b["headers"])
        assert resp.status_code == 404

        # tenant B não vê a ocorrência de origem
        resp = await client.get(f"/api/govfrota/ocorrencias/{criada['id']}", headers=tenant_b["headers"])
        assert resp.status_code == 404


@pytest.fixture
async def tmp_storage(tmp_path, monkeypatch):
    from app.api.v1 import uploads as uploads_mod
    from app.core import storage as storage_core
    from app.core.storage import LocalStorage

    storage_core.settings.STORAGE_LOCAL_PATH = str(tmp_path / "uploads")
    backend = LocalStorage()
    monkeypatch.setattr(storage_core, "storage", backend)
    monkeypatch.setattr(uploads_mod, "storage", backend)
    return backend
