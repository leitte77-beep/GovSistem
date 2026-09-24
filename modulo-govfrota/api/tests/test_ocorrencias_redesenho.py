"""Testes do redesenho da área de Ocorrências/Problemas.

Cobre:
- motorista cria ocorrência com foto e origem corretas;
- anexo persistido e retornado na listagem/detalhe (foto_url);
- admin visualiza foto via endpoint autenticado;
- cross-tenant não acessa (404);
- listagem paginada + busca + filtros;
- resolver ocorrência (auditável);
- converter em manutenção preserva a ocorrência/foto.
"""

import uuid

import pytest


def _fazer_png() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (800, 600), "white").save(buf, format="PNG")
    return buf.getvalue()


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


class TestOcorrencias:
    async def test_motorista_cria_com_foto(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        token = resp.json()["access_token"]
        app_headers = {"Authorization": f"Bearer {token}"}

        # upload da foto pelo motorista
        png = _fazer_png()
        resp = await client.post(
            "/api/govfrota/uploads",
            files={"file": ("problema.png", png, "image/png")},
            headers=app_headers,
        )
        assert resp.status_code == 201, resp.text
        url = resp.json()["url"]

        resp = await client.post(
            "/api/govfrota/app/motorista/problemas",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "categoria": "FREIO",
                "descricao": "Luz de freio de mão acendeu",
                "gravidade": "BAIXA",
                "quilometragem": 50350,
                "foto_url": url,
            },
            headers=app_headers,
        )
        assert resp.status_code == 201, resp.text
        occ_id = resp.json()["id"]

        # admin vê a ocorrência com foto e origem
        resp = await client.get("/api/govfrota/ocorrencias", headers=tenant["headers"])
        itens = resp.json()
        assert len(itens) == 1
        occ = itens[0]
        assert occ["origem"] == "APP_MOTORISTA"
        assert occ["foto_url"] == url
        assert occ["motorista_nome"] == "João da Silva"
        assert occ["veiculo_placa"] == frota["veiculo"].placa

        # detalhe
        resp = await client.get(f"/api/govfrota/ocorrencias/{occ_id}", headers=tenant["headers"])
        assert resp.json()["foto_url"] == url

    async def test_cross_tenant_nao_acessa_foto(self, client, make_tenant, setup_frota, tmp_storage):
        tenant_a = await make_tenant("ADMIN")
        tenant_b = await make_tenant("ADMIN")
        frota = await setup_frota(tenant_a["org"])

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        app_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        resp = await client.post(
            "/api/govfrota/uploads",
            files={"file": ("f.png", _fazer_png(), "image/png")},
            headers=app_headers,
        )
        url = resp.json()["url"]

        await client.post(
            "/api/govfrota/app/motorista/problemas",
            json={"veiculo_id": str(frota["veiculo"].id), "categoria": "PNEU", "descricao": "teste cross", "foto_url": url},
            headers=app_headers,
        )

        # tenant B não consegue ver a ocorrência nem baixar o anexo
        resp = await client.get("/api/govfrota/ocorrencias", headers=tenant_b["headers"])
        assert resp.json() == []

        anexo_id = url.split("/")[-1]
        resp = await client.get(f"/api/govfrota/uploads/{anexo_id}", headers=tenant_b["headers"])
        assert resp.status_code == 404

        # admin do mesmo tenant consegue baixar
        resp = await client.get(f"/api/govfrota/uploads/{anexo_id}", headers=tenant_a["headers"])
        assert resp.status_code == 200

    async def test_listagem_paginada_busca_filtros(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        async def criar(categoria, descricao, gravidade):
            return await client.post(
                "/api/govfrota/ocorrencias",
                json={"veiculo_id": str(frota["veiculo"].id), "categoria": categoria, "descricao": descricao, "gravidade": gravidade, "origem": "ADMIN"},
                headers=tenant["headers"],
            )

        assert (await criar("FREIO", "freio ruim", "ALTA")).status_code == 201
        assert (await criar("PNEU", "pneu furado", "BAIXA")).status_code == 201

        # total no header
        resp = await client.get("/api/govfrota/ocorrencias?limit=1", headers=tenant["headers"])
        assert resp.headers.get("X-Total-Count") == "2"

        # busca
        resp = await client.get("/api/govfrota/ocorrencias?search=pneu", headers=tenant["headers"])
        assert len(resp.json()) == 1

        # filtro por gravidade
        resp = await client.get("/api/govfrota/ocorrencias?gravidade=ALTA", headers=tenant["headers"])
        assert len(resp.json()) == 1

        # filtro por categoria
        resp = await client.get("/api/govfrota/ocorrencias?categoria=FREIO", headers=tenant["headers"])
        assert len(resp.json()) == 1

    async def test_resolver_ocorrencia(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        criada = (
            await client.post(
                "/api/govfrota/ocorrencias",
                json={"veiculo_id": str(frota["veiculo"].id), "categoria": "FREIO", "descricao": "freio ruim", "gravidade": "MEDIA", "origem": "ADMIN"},
                headers=tenant["headers"],
            )
        ).json()

        resp = await client.post(
            f"/api/govfrota/ocorrencias/{criada['id']}/resolver",
            json={"resolucao": "Sensor do freio de mão ajustado."},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "RESOLVIDA"

        # auditoria registra a resolução
        resp = await client.get("/api/govfrota/auditoria?entidade=ocorrencia", headers=tenant["headers"])
        acoes = [a["acao"] for a in resp.json()]
        assert "ocorrencia.resolver" in acoes

    async def test_converter_preserva_ocorrencia_e_foto(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        criada = (
            await client.post(
                "/api/govfrota/ocorrencias",
                json={
                    "veiculo_id": str(frota["veiculo"].id),
                    "categoria": "AVARIA",
                    "descricao": "porta amassada",
                    "gravidade": "CRITICA",
                    "quilometragem": 50500,
                    "foto_url": "/api/govfrota/uploads/fake.png",
                    "origem": "ADMIN",
                },
                headers=tenant["headers"],
            )
        ).json()

        resp = await client.post(
            f"/api/govfrota/ocorrencias/{criada['id']}/converter-manutencao", headers=tenant["headers"]
        )
        assert resp.status_code == 201, resp.text

        # ocorrência continua com a foto e marcada como convertida
        resp = await client.get(f"/api/govfrota/ocorrencias/{criada['id']}", headers=tenant["headers"])
        body = resp.json()
        assert body["status"] == "CONVERTIDA_EM_MANUTENCAO"
        assert body["manutencao_id"] is not None
        assert body["foto_url"] == "/api/govfrota/uploads/fake.png"

        # manutenção referencia a origem (acesso à foto por referência)
        resp = await client.get("/api/govfrota/manutencoes", headers=tenant["headers"])
        manut = next((m for m in resp.json() if m["id"] == body["manutencao_id"]), None)
        assert manut is not None
