"""Testes da Fase 2 — robustez e preparação para produção.

Cobre: upload/storage e isolamento, idempotência, rollback, cancelamentos,
custo médio, timezone, auditoria append-only, exportação XLSX/PDF, CNH
(alerta/bloqueio), estoque negativo e sessão expirada do motorista.
"""

import asyncio
import io
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────────────


async def _login_app(client, frota):
    resp = await client.post(
        "/api/govfrota/app/motorista/login",
        json={"login": frota["acesso"].login, "senha": "1234"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _abastecer(client, headers, veiculo_id, litros, km, extra=None):
    body = {
        "veiculo_id": str(veiculo_id),
        "quantidade_litros": str(litros),
        "quilometragem": km,
    }
    if extra:
        body.update(extra)
    return await client.post(
        "/api/govfrota/app/motorista/abastecimentos", json=body, headers=headers
    )


# ── Upload / storage e isolamento de arquivos ─────────────────────────────


@pytest.fixture
async def tmp_storage(tmp_path, monkeypatch):
    """Redireciona o storage local para um diretório temporário."""
    from app.api.v1 import uploads as uploads_mod
    from app.core import storage as storage_core
    from app.core.storage import LocalStorage

    storage_core.settings.STORAGE_LOCAL_PATH = str(tmp_path / "uploads")
    backend = LocalStorage()
    monkeypatch.setattr(storage_core, "storage", backend)
    monkeypatch.setattr(uploads_mod, "storage", backend)
    return backend


def _fazer_png_cor(retangulo: tuple = (0, 0, 0, 0)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (800, 600), "white").save(buf, format="PNG")
    return buf.getvalue()


class TestStorage:
    async def test_upload_imagem_ok(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await _login_app(client, frota)
        png = _fazer_png_cor()
        resp = await client.post(
            "/api/govfrota/uploads",
            files={"file": ("foto.png", png, "image/png")},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["id"]

        # Download pelo mesmo motorista funciona
        dl = await client.get(data["url"], headers=headers)
        assert dl.status_code == 200

    async def test_cross_tenant_arquivo_404(self, client, make_tenant, setup_frota, tmp_storage):
        tenant_a = await make_tenant("ADMIN")
        frota_a = await setup_frota(tenant_a["org"])
        tenant_b = await make_tenant("ADMIN")
        await setup_frota(tenant_b["org"])

        headers_a = await _login_app(client, frota_a)
        resp = await client.post(
            "/api/govfrota/uploads",
            files={"file": ("foto.png", _fazer_png_cor(), "image/png")},
            headers=headers_a,
        )
        url = resp.json()["url"]

        # Admin do tenant B tenta baixar arquivo do tenant A
        dl = await client.get(url, headers=tenant_b["headers"])
        assert dl.status_code == 404

    async def test_upload_extensao_invalida_422(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await _login_app(client, frota)
        resp = await client.post(
            "/api/govfrota/uploads",
            files={"file": ("malware.exe", b"MZ...", "application/octet-stream")},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_upload_pdf_invalido_422(self, client, make_tenant, setup_frota, tmp_storage):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await _login_app(client, frota)
        resp = await client.post(
            "/api/govfrota/uploads",
            files={"file": ("nf.pdf", b"not a pdf at all", "application/pdf")},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_processamento_imagem_normaliza(self):
        """Recompressão mantém legibilidade e reduz peso (orientação EXIF)."""
        from app.services.images import process_image

        png = _fazer_png_cor()
        novo, mime = process_image(png, max_dimension=400, quality=70)
        assert mime == "image/jpeg"
        assert novo[:3] == b"\xff\xd8\xff"  # virou JPEG
        assert len(novo) < len(png)


# ── Idempotência / duplo envio ────────────────────────────────────────────


class TestIdempotencia:
    async def test_reenvio_mesma_chave_nao_duplica(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await _login_app(client, frota)
        chave = uuid.uuid4().hex

        resp1 = await _abastecer(
            client, headers, frota["veiculo"].id, "40", 50100,
            extra={"idempotency_key": chave},
        )
        assert resp1.status_code == 201, resp1.text
        id1 = resp1.json()["id"]

        # Reenvio com a mesma chave → mesmo registro, sem nova baixa
        resp2 = await _abastecer(
            client, headers, frota["veiculo"].id, "40", 50100,
            extra={"idempotency_key": chave},
        )
        assert resp2.status_code == 201
        assert resp2.json()["id"] == id1

        # Estoque baixado apenas uma vez: 1000 - 40 = 960
        tanque = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        assert float(tanque.json()["estoque_atual"]) == 960.0

        # Apenas 1 registro
        lista = await client.get(
            f"/api/govfrota/abastecimentos?veiculo_id={frota['veiculo'].id}",
            headers=tenant["headers"],
        )
        assert len(lista.json()) == 1

    async def test_duplo_clique_concorrente(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await _login_app(client, frota)
        chave = uuid.uuid4().hex

        async def post():
            try:
                return (await _abastecer(
                    client, headers, frota["veiculo"].id, "30", 50200,
                    extra={"idempotency_key": chave},
                )).status_code
            except Exception:
                return None

        await asyncio.gather(post(), post())
        # Em SQLite (conexão única compartilhada) o resultado pode variar, mas o
        # invariante de integridade é: NUNCA gerar dois registros nem baixar o
        # estoque duas vezes para a mesma chave de idempotência.
        tanque = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        estoque = float(tanque.json()["estoque_atual"])
        assert estoque in (970.0, 1000.0)
        lista = await client.get(
            f"/api/govfrota/abastecimentos?veiculo_id={frota['veiculo'].id}",
            headers=tenant["headers"],
        )
        assert len(lista.json()) <= 1


# ── Transação / rollback ──────────────────────────────────────────────────


class TestTransacao:
    async def test_rollback_estoque_insuficiente(self, client, make_tenant, setup_frota):
        """Se a baixa falhar, nenhum abastecimento é persistido."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="10")
        headers = await _login_app(client, frota)

        resp = await _abastecer(client, headers, frota["veiculo"].id, "50", 50100)
        assert resp.status_code == 422

        lista = await client.get(
            f"/api/govfrota/abastecimentos?veiculo_id={frota['veiculo'].id}",
            headers=tenant["headers"],
        )
        assert lista.json() == []

        # Quilometragem não foi atualizada
        veiculo = await client.get(
            f"/api/govfrota/veiculos/{frota['veiculo'].id}", headers=tenant["headers"]
        )
        assert veiculo.json()["quilometragem_atual"] == 50000


# ── Cancelamentos ─────────────────────────────────────────────────────────


class TestCancelamento:
    async def _relaxar_exigencias(self, client, headers):
        r = await client.patch(
            "/api/govfrota/configuracoes",
            json={"exigir_nf_entrada": False, "exigir_fornecedor_entrada": False},
            headers=headers,
        )
        assert r.status_code == 200

    async def test_cancelar_abastecimento_estorna_exato(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await _login_app(client, frota)

        resp = await _abastecer(client, headers, frota["veiculo"].id, "50", 50100)
        abast_id = resp.json()["id"]

        tanque_antes = float(
            (await client.get(f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"])).json()["estoque_atual"]
        )
        assert tanque_antes == 950.0

        resp_c = await client.post(
            f"/api/govfrota/abastecimentos/{abast_id}/cancelar",
            json={"justificativa": "Lançamento incorreto"},
            headers=tenant["headers"],
        )
        assert resp_c.status_code == 200

        tanque_depois = float(
            (await client.get(f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"])).json()["estoque_atual"]
        )
        assert tanque_depois == 1000.0  # retorna exatamente 50 L

    async def test_duplo_cancelamento_bloqueado(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await _login_app(client, frota)
        resp = await _abastecer(client, headers, frota["veiculo"].id, "50", 50100)
        abast_id = resp.json()["id"]

        r1 = await client.post(
            f"/api/govfrota/abastecimentos/{abast_id}/cancelar",
            json={"justificativa": "primeiro"},
            headers=tenant["headers"],
        )
        assert r1.status_code == 200
        r2 = await client.post(
            f"/api/govfrota/abastecimentos/{abast_id}/cancelar",
            json={"justificativa": "segundo"},
            headers=tenant["headers"],
        )
        assert r2.status_code == 422

        # Estoque não foi estornado duas vezes
        tanque = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        assert float(tanque.json()["estoque_atual"]) == 1000.0

    async def test_cancelar_entrada_inviavel_sem_estoque(self, client, make_tenant, setup_frota):
        """Entrada de 10.000L consumida em 8.000L não pode ser cancelada (evita negativo)."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="0")
        await self._relaxar_exigencias(client, tenant["headers"])

        entrada = await client.post(
            "/api/govfrota/entradas",
            json={
                "tanque_id": str(frota["tanque"].id),
                "combustivel_id": str(frota["combustivel"].id),
                "quantidade_litros": "10000",
                "data_entrada": date.today().isoformat(),
                "numero_nota": "NF100",
                "valor_total": "58000",
            },
            headers=tenant["headers"],
        )
        assert entrada.status_code == 201
        entrada_id = entrada.json()["id"]

        # Consome 8.000 L em abastecimentos
        headers = await _login_app(client, frota)
        for i in range(8):
            await _abastecer(client, headers, frota["veiculo"].id, "1000", 50000 + i)

        tanque = await client.get(f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"])
        assert float(tanque.json()["estoque_atual"]) == 2000.0

        # Cancelar os 10.000 L agora é inviável (saldo 2000 < 10000)
        resp = await client.post(
            f"/api/govfrota/entradas/{entrada_id}/cancelar",
            json={"justificativa": "tentativa de cancelamento"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 422
        assert "inferior" in resp.json()["detail"].lower()

        # Estoque permanece não-negativo
        tanque2 = await client.get(f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"])
        assert float(tanque2.json()["estoque_atual"]) == 2000.0

    async def test_cancelar_entrada_com_saldo_ok(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="0")
        await self._relaxar_exigencias(client, tenant["headers"])
        entrada = await client.post(
            "/api/govfrota/entradas",
            json={
                "tanque_id": str(frota["tanque"].id),
                "combustivel_id": str(frota["combustivel"].id),
                "quantidade_litros": "1000",
                "data_entrada": date.today().isoformat(),
                "numero_nota": "NF101",
                "valor_total": "5000",
            },
            headers=tenant["headers"],
        )
        entrada_id = entrada.json()["id"]
        resp = await client.post(
            f"/api/govfrota/entradas/{entrada_id}/cancelar",
            json={"justificativa": "NF emitida incorretamente"},
            headers=tenant["headers"],
        )
        assert resp.status_code == 200
        tanque = await client.get(f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"])
        assert float(tanque.json()["estoque_atual"]) == 0.0


# ── Custo médio ───────────────────────────────────────────────────────────


class TestCustoMedio:
    async def _entrada(self, client, headers, tanque, combustivel, litros, valor):
        r = await client.patch(
            "/api/govfrota/configuracoes",
            json={"exigir_nf_entrada": False, "exigir_fornecedor_entrada": False},
            headers=headers,
        )
        assert r.status_code == 200
        rr = await client.post(
            "/api/govfrota/entradas",
            json={
                "tanque_id": str(tanque),
                "combustivel_id": str(combustivel),
                "quantidade_litros": str(litros),
                "data_entrada": date.today().isoformat(),
                "numero_nota": "NF-" + uuid.uuid4().hex[:6],
                "valor_total": str(valor),
            },
            headers=headers,
        )
        assert rr.status_code == 201, rr.text
        return rr.json()

    async def test_custo_medio_ponderado(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="0")
        await self._entrada(client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id, 1000, 5000)
        await self._entrada(client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id, 1000, 6000)

        headers = await _login_app(client, frota)
        resp = await _abastecer(client, headers, frota["veiculo"].id, "500", 50500)
        assert resp.status_code == 201
        ab = resp.json()
        # 1000*5 + 1000*6 = 11000 / 2000 = 5.5
        assert float(ab["custo_medio_litro"]) == pytest.approx(5.5, abs=0.01)
        assert float(ab["custo_total"]) == pytest.approx(2750.0, abs=0.01)

    async def test_custo_medio_apos_cancelamento_entrada(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="0")
        ent_a = await self._entrada(client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id, 1000, 5000)
        ent_b = await self._entrada(client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id, 1000, 6000)

        headers = await _login_app(client, frota)
        ab1 = await _abastecer(client, headers, frota["veiculo"].id, "500", 50500)
        assert float(ab1.json()["custo_medio_litro"]) == pytest.approx(5.5, abs=0.01)

        # Cancela a entrada de R$6,00 (saldo 1500 >= 1000)
        r = await client.post(
            f"/api/govfrota/entradas/{ent_b['id']}/cancelar",
            json={"justificativa": "NF cancelada pelo fornecedor"},
            headers=tenant["headers"],
        )
        assert r.status_code == 200

        # Novo custo médio = apenas entrada A: 5000/1000 = 5.0
        ab2 = await _abastecer(client, headers, frota["veiculo"].id, "300", 50800)
        assert float(ab2.json()["custo_medio_litro"]) == pytest.approx(5.0, abs=0.01)

    async def test_custo_medio_apos_estorno_abastecimento(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="0")
        await self._entrada(client, tenant["headers"], frota["tanque"].id, frota["combustivel"].id, 1000, 5000)
        headers = await _login_app(client, frota)
        ab = await _abastecer(client, headers, frota["veiculo"].id, "500", 50500)
        assert float(ab.json()["custo_medio_litro"]) == pytest.approx(5.0, abs=0.01)

        # Estorno do abastecimento não altera a base de custo (só devolve litros)
        r = await client.post(
            f"/api/govfrota/abastecimentos/{ab.json()['id']}/cancelar",
            json={"justificativa": "teste estorno"},
            headers=tenant["headers"],
        )
        assert r.status_code == 200
        ab2 = await _abastecer(client, headers, frota["veiculo"].id, "200", 50700)
        assert float(ab2.json()["custo_medio_litro"]) == pytest.approx(5.0, abs=0.01)


# ── Timezone ──────────────────────────────────────────────────────────────


class TestTimezone:
    async def test_abastecimento_23h30_nao_vaza_para_o_dia_seguinte(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        data_alvo = datetime(2026, 8, 20, 23, 30, tzinfo=timezone.utc)

        # Lançamento administrativo com data específica (UTC aware)
        resp = await client.post(
            "/api/govfrota/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "tanque_id": str(frota["tanque"].id),
                "combustivel_id": str(frota["combustivel"].id),
                "quantidade_litros": "40",
                "quilometragem": 50500,
                "data_abastecimento": data_alvo.isoformat(),
            },
            headers=tenant["headers"],
        )
        assert resp.status_code == 201, resp.text

        dia = data_alvo.date().isoformat()
        dia_seguinte = (data_alvo.date() + timedelta(days=1)).isoformat()

        no_dia = await client.get(
            f"/api/govfrota/abastecimentos?data_inicio={dia}&data_fim={dia}",
            headers=tenant["headers"],
        )
        assert len(no_dia.json()) == 1

        # No dia seguinte não aparece
        no_seguinte = await client.get(
            f"/api/govfrota/abastecimentos?data_inicio={dia_seguinte}&data_fim={dia_seguinte}",
            headers=tenant["headers"],
        )
        assert no_seguinte.json() == []


# ── Auditoria append-only ─────────────────────────────────────────────────


class TestAuditoriaAppendOnly:
    async def test_sem_rota_de_alteracao_exclusao(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        headers = await _login_app(client, frota)
        await _abastecer(client, headers, frota["veiculo"].id, "40", 50100)

        audit = await client.get("/api/govfrota/auditoria", headers=tenant["headers"])
        regs = audit.json()
        assert len(regs) >= 1
        rid = regs[0]["id"]

        # Não há como editar/excluir histórico por APIs normais.
        for method in ("patch", "put", "delete"):
            resp = await getattr(client, method)(f"/api/govfrota/auditoria/{rid}", headers=tenant["headers"])
            assert resp.status_code in (404, 405, 422), f"{method} deveria ser bloqueado"


# ── Exportações XLSX / PDF ────────────────────────────────────────────────


class TestExportacao:
    async def _setup_dados(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")
        headers = await _login_app(client, frota)
        await _abastecer(client, headers, frota["veiculo"].id, "45", 50350)
        return tenant, frota

    async def test_xlsx_abastecimentos(self, client, make_tenant, setup_frota):
        tenant, _ = await self._setup_dados(client, make_tenant, setup_frota)
        resp = await client.get("/api/govfrota/relatorios/abastecimentos?formato=xlsx", headers=tenant["headers"])
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/vnd.openxmlformats")
        assert resp.content[:2] == b"PK"  # zip (xlsx)

    async def test_pdf_abastecimentos(self, client, make_tenant, setup_frota):
        tenant, _ = await self._setup_dados(client, make_tenant, setup_frota)
        resp = await client.get("/api/govfrota/relatorios/abastecimentos?formato=pdf", headers=tenant["headers"])
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/pdf")
        assert resp.content[:4] == b"%PDF"

    async def test_xlsx_pdf_consumo_veiculos(self, client, make_tenant, setup_frota):
        tenant, _ = await self._setup_dados(client, make_tenant, setup_frota)
        for fmt in ("xlsx", "pdf"):
            resp = await client.get(f"/api/govfrota/relatorios/veiculos/consumo?formato={fmt}", headers=tenant["headers"])
            assert resp.status_code == 200, resp.text

    async def test_relatorio_veiculo_consolidado_pdf_xlsx(self, client, make_tenant, setup_frota):
        tenant, frota = await self._setup_dados(client, make_tenant, setup_frota)
        vid = str(frota["veiculo"].id)
        for fmt in ("xlsx", "pdf"):
            resp = await client.get(f"/api/govfrota/relatorios/veiculos/{vid}?formato={fmt}", headers=tenant["headers"])
            assert resp.status_code == 200, resp.text
        # JSON também disponível
        resp = await client.get(f"/api/govfrota/relatorios/veiculos/{vid}", headers=tenant["headers"])
        assert resp.status_code == 200
        body = resp.json()
        assert body["identificacao"]["placa"] == frota["veiculo"].placa
        assert "indicadores" in body


# ── CNH: alerta vs bloqueio ───────────────────────────────────────────────


class TestCNH:
    async def test_cnh_vencida_modo_alerta_permite(self, client, make_tenant, setup_frota):
        from conftest import TEST_SESSION

        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="1000")

        # Muda a política para "apenas alertar"
        cfg = await client.patch(
            "/api/govfrota/configuracoes",
            json={"bloquear_cnh_vencida": False},
            headers=tenant["headers"],
        )
        assert cfg.status_code == 200

        # Expira a CNH
        async with TEST_SESSION() as session:
            from app.models.motorista import Motorista as M

            m = await session.get(M, frota["motorista"].id)
            m.cnh_validade = date.today() - timedelta(days=10)
            await session.commit()

        headers = await _login_app(client, frota)
        assert headers["Authorization"]
        resp = await _abastecer(client, headers, frota["veiculo"].id, "30", 50100)
        assert resp.status_code == 201

    async def test_cnh_vencida_modo_bloqueio_bloqueia(self, client, make_tenant, setup_frota):
        from conftest import TEST_SESSION

        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])

        async with TEST_SESSION() as session:
            from app.models.motorista import Motorista as M

            m = await session.get(M, frota["motorista"].id)
            m.cnh_validade = date.today() - timedelta(days=10)
            await session.commit()

        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": frota["acesso"].login, "senha": "1234"},
        )
        assert resp.status_code == 403


# ── Estoque negativo ──────────────────────────────────────────────────────


class TestEstoqueNegativo:
    async def test_estoque_negativo_bloqueado_padrao(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="10")
        headers = await _login_app(client, frota)
        resp = await _abastecer(client, headers, frota["veiculo"].id, "50", 50100)
        assert resp.status_code == 422

    async def test_estoque_negativo_administrativo_com_permissao(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="10")
        await client.patch(
            "/api/govfrota/configuracoes",
            json={"permitir_estoque_negativo": True},
            headers=tenant["headers"],
        )
        resp = await client.post(
            "/api/govfrota/abastecimentos",
            json={
                "veiculo_id": str(frota["veiculo"].id),
                "tanque_id": str(frota["tanque"].id),
                "combustivel_id": str(frota["combustivel"].id),
                "quantidade_litros": "50",
                "quilometragem": 50100,
                "data_abastecimento": datetime.now(timezone.utc).isoformat(),
            },
            headers=tenant["headers"],
        )
        # Admin com FUEL_MANAGE e config habilitada → permitido (estoque pode ficar negativo)
        assert resp.status_code == 201, resp.text


# ── Sessão expirada do motorista ──────────────────────────────────────────


class TestSessaoMotorista:
    async def test_token_invalido_sessao_expirada(self, client, make_tenant, setup_frota):
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"])
        _ = tenant, frota
        resp = await client.get(
            "/api/govfrota/app/motorista/me",
            headers={"Authorization": "Bearer token_invalido_e_expirado"},
        )
        assert resp.status_code in (401, 403)
