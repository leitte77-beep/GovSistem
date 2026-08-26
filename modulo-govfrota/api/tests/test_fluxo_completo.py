"""Testes do fluxo completo (§60): compra → entrada → motorista abastece →
estoque baixa → dashboard → relatório."""


async def criar_entrada(client, headers, tanque_id, combustivel_id, litros="10000", nota="NF-12345"):
    from datetime import date

    resp_f = await client.post(
        "/api/govfrota/fornecedores",
        json={"razao_social": "Distribuidora XYZ", "categoria": "COMBUSTIVEL"},
        headers=headers,
    )
    fornecedor_id = resp_f.json()["id"]

    resp = await client.post(
        "/api/govfrota/entradas",
        json={
            "tanque_id": str(tanque_id),
            "combustivel_id": str(combustivel_id),
            "quantidade_litros": litros,
            "data_entrada": date.today().isoformat(),
            "numero_nota": nota,
            "valor_total": str(float(litros) * 5.80),
            "fornecedor_id": fornecedor_id,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestFluxoCompleto:
    async def test_cenario_60_completo(self, client, make_tenant, setup_frota):
        """§60 — PASSO 1 a 15: o cenário completo deve funcionar ponta a ponta."""
        tenant = await make_tenant("ADMIN")
        frota = await setup_frota(tenant["org"], estoque_inicial="0")

        # PASSO 3: entrada de 10.000 L (NF 12345)
        entrada = await criar_entrada(
            client,
            tenant["headers"],
            frota["tanque"].id,
            frota["combustivel"].id,
            litros="10000",
            nota="12345",
        )
        assert entrada["quantidade_litros"] == "10000.00"

        # PASSO 4: tanque mostra 10.000 / 15.000
        resp = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        assert resp.status_code == 200
        tanque = resp.json()
        assert float(tanque["estoque_atual"]) == 10000.0
        assert float(tanque["capacidade_maxima"]) == 15000.0

        # PASSOS 7-11: João abastece pelo celular: 45 L em 50.350 km
        acesso = frota["acesso"]
        resp = await client.post(
            "/api/govfrota/app/motorista/login",
            json={"login": acesso.login, "senha": "1234"},
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        app_headers = {"Authorization": f"Bearer {token}"}

        resp = await client.get("/api/govfrota/app/motorista/veiculos", headers=app_headers)
        veiculo = next(v for v in resp.json() if v["placa"] == frota["veiculo"].placa)

        resp = await client.get("/api/govfrota/app/motorista/tanques", headers=app_headers)
        tanques_app = resp.json()
        assert len(tanques_app) == 1  # auto-seleção possível

        resp = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": veiculo["id"],
                "tanque_id": tanques_app[0]["id"],
                "quantidade_litros": "45",
                "quilometragem": 50350,
                "foto_bomba_url": "/api/govfrota/uploads/fake.jpg",
            },
            headers=app_headers,
        )
        assert resp.status_code == 201, resp.text
        abastecimento = resp.json()

        # PASSO 12: sistema registrou tudo automaticamente
        assert abastecimento["motorista_id"] == str(frota["motorista"].id)
        assert abastecimento["origem"] == "APP_MOTORISTA"
        assert abastecimento["foto_bomba_url"] is not None
        assert abastecimento["quilometragem"] == 50350

        # KM atualizado no veículo
        resp = await client.get(
            f"/api/govfrota/veiculos/{frota['veiculo'].id}", headers=tenant["headers"]
        )
        assert resp.json()["quilometragem_atual"] == 50350

        # Estoque baixado: 9.955 litros
        resp = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}", headers=tenant["headers"]
        )
        assert float(resp.json()["estoque_atual"]) == 9955.0

        # PASSO 13: dashboard atualiza
        resp = await client.get("/api/govfrota/dashboard", headers=tenant["headers"])
        dash = resp.json()
        assert dash["abastecimentos"]["hoje_litros"] == 45.0
        assert dash["tanques"][0]["estoque_atual"] == 9955.0

        # PASSO 14: histórico do veículo mostra o abastecimento
        resp = await client.get(
            "/api/govfrota/abastecimentos?veiculo_id=" + str(frota["veiculo"].id),
            headers=tenant["headers"],
        )
        assert len(resp.json()) == 1

        # PASSO 15: histórico do tanque mostra entrada e saída
        resp = await client.get(
            f"/api/govfrota/tanques/{frota['tanque'].id}/movimentacoes",
            headers=tenant["headers"],
        )
        movs = resp.json()
        tipos = {(m["tipo"], m["sinal"]) for m in movs}
        assert ("ENTRADA", 1) in tipos
        assert ("SAIDA", -1) in tipos

        # Auditoria registra o abastecimento do motorista
        resp = await client.get("/api/govfrota/auditoria", headers=tenant["headers"])
        acoes = [a["acao"] for a in resp.json()]
        assert "abastecimento.registrar" in acoes
