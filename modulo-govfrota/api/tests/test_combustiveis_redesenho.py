"""Testes do redesenho da área de combustíveis.

Cobre: fotos (tanque/tipo/fornecedor), anexos múltiplos em entrada, indicadores
do fornecedor, evolução e resumo do tanque, e isolamento por tenant de imagem.
"""
import io
import uuid
from datetime import date, timedelta

import pytest


def _png_bytes() -> bytes:
    """PNG mínimo válido (1x1) para o pipeline de upload."""
    import struct
    import zlib

    def chunk(tipo, dados):
        c = tipo + dados
        return struct.pack(">I", len(dados)) + c + struct.pack(">I", zlib.crc32(c))

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


async def _upload(client, headers, ext=".png", conteudo=None):
    arquivo = {"file": (f"arquivo{ext}", conteudo or _png_bytes(), "image/png" if ext == ".png" else "application/pdf")}
    resp = await client.post("/api/govfrota/uploads", files=arquivo, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()  # {id, url}


async def _entrada(client, headers, tanque_id, combustivel_id, litros="5000", nota="98765", fornecedor_id=None, anexos_ids=None):
    if not fornecedor_id:
        resp_f = await client.post(
            "/api/govfrota/fornecedores",
            json={"razao_social": "Fornecedor Padrão", "categoria": "COMBUSTIVEL"},
            headers=headers,
        )
        fornecedor_id = resp_f.json()["id"]
    body = {
        "tanque_id": str(tanque_id),
        "combustivel_id": str(combustivel_id),
        "quantidade_litros": litros,
        "data_entrada": date.today().isoformat(),
        "numero_nota": nota,
        "valor_total": str(float(litros) * 5.80),
        "anexos_ids": anexos_ids or [],
        "fornecedor_id": str(fornecedor_id),
    }
    resp = await client.post("/api/govfrota/entradas", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestImagens:
    async def test_upload_foto_e_anexo(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])

        # Upload de imagem genérica (foto)
        foto = await _upload(client, t["headers"], ".png")
        assert foto["url"].startswith("/api/govfrota/uploads/")

        # Download autenticado dentro do tenant
        resp = await client.get(foto["url"], headers=t["headers"])
        assert resp.status_code == 200

    async def test_download_cross_tenant_404(self, client, make_tenant, setup_frota):
        t1 = await make_tenant("ADMIN")
        t2 = await make_tenant("ADMIN")
        await setup_frota(t1["org"])

        foto = await _upload(client, t1["headers"], ".png")

        # Anexo de outro tenant não é visível (ofuscação → 404).
        resp = await client.get(foto["url"], headers=t2["headers"])
        assert resp.status_code == 404


class TestTanques:
    async def test_foto_do_tanque(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        foto = await _upload(client, t["headers"], ".png")

        # Upload da foto via PATCH (TanqueUpdate.foto_url)
        resp = await client.patch(
            f"/api/govfrota/tanques/{frota['tanque'].id}",
            json={"foto_url": foto["url"]},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["foto_url"] == foto["url"]

        # Aparece na listagem (ultima_movimentacao + foto)
        resp = await client.get("/api/govfrota/tanques", headers=t["headers"])
        assert resp.status_code == 200
        tanque = next(x for x in resp.json() if x["id"] == str(frota["tanque"].id))
        assert tanque["foto_url"] == foto["url"]
        assert "ultima_movimentacao" in tanque

    async def test_evolucao_estoque(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"], estoque_inicial="10000")
        await _entrada(client, t["headers"], frota["tanque"].id, frota["combustivel"].id, litros="5000")

        for dias in (7, 30, 90):
            resp = await client.get(
                f"/api/govfrota/tanques/{frota['tanque'].id}/evolucao?dias={dias}",
                headers=t["headers"],
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()
            assert data["periodo_dias"] == dias
            assert len(data["pontos"]) == dias
            # O último ponto reflete o saldo atual (15.000 L).
            assert data["pontos"][-1]["saldo"] == 15000.0

    async def test_resumo_custo_medio_e_valor(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"], estoque_inicial="10000")
        await _entrada(client, t["headers"], frota["tanque"].id, frota["combustivel"].id, litros="5000")

        resp = await client.get(f"/api/govfrota/tanques/{frota['tanque'].id}/resumo", headers=t["headers"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # 15.000 L, entradas a R$ 5,80/L → custo médio 5.8 e valor estimado 87.000.
        assert data["custo_medio_por_litro"] == 5.8
        assert data["valor_estoque"] is not None
        assert abs(data["valor_estoque"] - 87000.0) < 1


class TestCombustiveis:
    async def test_imagem_e_contagens(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        foto = await _upload(client, t["headers"], ".png")

        resp = await client.patch(
            f"/api/govfrota/combustiveis/{frota['combustivel'].id}",
            json={"nome": "Diesel S10", "unidade": "litro", "ativo": True, "foto_url": foto["url"]},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["foto_url"] == foto["url"]

        # Listagem com contagens de tanques e veículos associados.
        resp = await client.get("/api/govfrota/combustiveis", headers=t["headers"])
        assert resp.status_code == 200
        item = next(x for x in resp.json() if x["id"] == str(frota["combustivel"].id))
        assert item["total_tanques"] >= 1
        assert item["total_veiculos"] >= 1

        # GET por id
        resp = await client.get(f"/api/govfrota/combustiveis/{frota['combustivel'].id}", headers=t["headers"])
        assert resp.status_code == 200


class TestFornecedores:
    async def test_cadastro_com_foto_e_indicadores(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        logo = await _upload(client, t["headers"], ".png")

        resp = await client.post(
            "/api/govfrota/fornecedores",
            json={
                "razao_social": "Distribuidora XYZ",
                "nome_fantasia": "XYZ Combustíveis",
                "cpf_cnpj": "12345678000190",
                "categoria": "COMBUSTIVEL",
                "foto_url": logo["url"],
                "cidade": "Campinas",
                "uf": "SP",
            },
            headers=t["headers"],
        )
        assert resp.status_code == 201, resp.text
        f_id = resp.json()["id"]

        # Criar 2 entradas com este fornecedor.
        await _entrada(client, t["headers"], frota["tanque"].id, frota["combustivel"].id,
                       litros="5000", nota="111", fornecedor_id=f_id)
        await _entrada(client, t["headers"], frota["tanque"].id, frota["combustivel"].id,
                       litros="3000", nota="222", fornecedor_id=f_id)

        resp = await client.get(f"/api/govfrota/fornecedores/{f_id}", headers=t["headers"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["foto_url"] == logo["url"]
        assert data["cidade"] == "Campinas"
        assert data["total_entradas"] == 2
        assert abs(data["litros_fornecidos"] - 8000.0) < 1
        assert data["valor_total"] > 0
        assert data["ultima_compra"] is not None
        assert len(data["historico_entradas"]) == 2


class TestEntradas:
    async def test_anexos_multiplos_e_nomes(self, client, make_tenant, setup_frota):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        pdf = await _upload(client, t["headers"], ".pdf", conteudo=b"%PDF-1.4 test")
        foto = await _upload(client, t["headers"], ".png")

        fornecedor = await client.post(
            "/api/govfrota/fornecedores",
            json={"razao_social": "Posto Central", "categoria": "COMBUSTIVEL"},
            headers=t["headers"],
        )
        f_id = fornecedor.json()["id"]

        entrada = await _entrada(
            client, t["headers"], frota["tanque"].id, frota["combustivel"].id,
            litros="6000", nota="333", fornecedor_id=f_id,
            anexos_ids=[pdf["id"], foto["id"]],
        )
        assert len(entrada["anexos"]) == 2
        assert entrada["fornecedor_nome"] == "Posto Central"
        assert entrada["tanque_nome"] == frota["tanque"].nome
        assert entrada["combustivel_nome"] == frota["combustivel"].nome

        # GET por id devolve os anexos.
        resp = await client.get(f"/api/govfrota/entradas/{entrada['id']}", headers=t["headers"])
        assert resp.status_code == 200
        assert len(resp.json()["anexos"]) == 2

    async def test_anexo_de_outro_tenant_e_rejeitado(self, client, make_tenant, setup_frota):
        t1 = await make_tenant("ADMIN")
        t2 = await make_tenant("ADMIN")
        frota = await setup_frota(t1["org"])

        anexo_t2 = await _upload(client, t2["headers"], ".png")

        resp = await client.post(
            "/api/govfrota/entradas",
            json={
                "tanque_id": str(frota["tanque"].id),
                "combustivel_id": str(frota["combustivel"].id),
                "quantidade_litros": "1000",
                "data_entrada": date.today().isoformat(),
                "anexos_ids": [anexo_t2["id"]],
            },
            headers=t1["headers"],
        )
        assert resp.status_code == 422  # anexo de outro tenant → inválido
