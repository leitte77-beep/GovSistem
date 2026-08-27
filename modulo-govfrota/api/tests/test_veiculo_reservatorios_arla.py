"""Testes do suporte a reservatório auxiliar / ARLA 32 no cadastro de veículos.

Cobrem os requisitos da tarefa de ajuste do GovFrota:
- Cadastro de tanque principal + reservatório auxiliar (Diesel + ARLA).
- Separação de estoque: Diesel não baixa ARLA e vice-versa.
- Validação de capacidade por reservatório.
- Motorista escolhe Diesel ou ARLA no abastecimento.
- Veículo antigo (somente principal) continua funcionando.
- Cross-tenant e relatórios separados.
"""

from conftest import TEST_SESSION


async def _login(client, login, pin):
    return await client.post(
        "/api/govfrota/app/motorista/login", json={"login": login, "pin": pin}
    )


async def _login_headers(client, login, pin):
    resp = await _login(client, login, pin)
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _estoque_tanque(org_id, combustivel_id):
    from sqlalchemy import select

    from app.models.combustivel import Tanque

    async with TEST_SESSION() as s:
        t = await s.scalar(
            select(Tanque).where(
                Tanque.organization_id == org_id,
                Tanque.combustivel_id == combustivel_id,
            )
        )
        return float(t.estoque_atual) if t else None


async def _criar_arla(_db, org):
    """Cria o produto ARLA 32 (fluido auxiliar) + um tanque de armazenamento."""
    from app.models.combustivel import Combustivel, Tanque

    arla = Combustivel(
        organization_id=org.id, nome="ARLA 32", unidade="litro", categoria="FLUIDO_AUXILIAR"
    )
    _db.add(arla)
    await _db.flush()
    tanque_arla = Tanque(
        organization_id=org.id,
        nome="Tanque ARLA",
        combustivel_id=arla.id,
        capacidade_maxima="2000",
        estoque_inicial="1000",
        estoque_atual="1000",
        estoque_minimo="200",
    )
    _db.add(tanque_arla)
    await _db.commit()
    return arla, tanque_arla


class TestCadastroReservatorios:
    async def test_veiculo_somente_diesel_legado(self, client, make_tenant, setup_frota):
        """Veículo antigo (somente principal) continua funcionando e retorna PRIMARY."""
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        resp = await client.get(
            f"/api/govfrota/veiculos/{frota['veiculo'].id}", headers=t["headers"]
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["combustivel_principal_id"] == str(frota["veiculo"].combustivel_principal_id)
        assert len(data["tanques"]) >= 1
        principal = [x for x in data["tanques"] if x["tank_type"] == "PRIMARY"]
        assert principal

    async def test_criar_veiculo_com_auxiliar(self, client, make_tenant, setup_frota, _db):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        arla, _ = await _criar_arla(_db, t["org"])

        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "modelo": "Atego",
                "marca": "Mercedes-Benz",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "capacidade_tanque_litros": "400",
                "tanques_auxiliares": [
                    {"combustivel_id": str(arla.id), "capacidade": "50", "identificacao": "Tanque ARLA"}
                ],
            },
            headers=t["headers"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        tanques = {x["tank_type"]: x for x in data["tanques"]}
        assert tanques["PRIMARY"]["combustivel_id"] == str(diesel_id)
        assert float(tanques["PRIMARY"]["capacidade"]) == 400
        assert tanques["AUXILIARY"]["combustivel_id"] == str(arla.id)
        assert float(tanques["AUXILIARY"]["capacidade"]) == 50
        assert tanques["AUXILIARY"]["combustivel_nome"] == "ARLA 32"

    async def test_editar_adicionar_e_remover_auxiliar(self, client, make_tenant, setup_frota, _db):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        arla, _ = await _criar_arla(_db, t["org"])

        vid = str(frota["veiculo"].id)
        # Adiciona auxiliar
        resp = await client.patch(
            f"/api/govfrota/veiculos/{vid}",
            json={"tanques_auxiliares": [{"combustivel_id": str(arla.id), "capacidade": "50"}]},
            headers=t["headers"],
        )
        assert resp.status_code == 200, resp.text
        assert any(x["tank_type"] == "AUXILIARY" for x in resp.json()["tanques"])

        # Remove auxiliar (lista vazia)
        resp = await client.patch(
            f"/api/govfrota/veiculos/{vid}",
            json={"tanques_auxiliares": []},
            headers=t["headers"],
        )
        assert resp.status_code == 200
        assert not [x for x in resp.json()["tanques"] if x["tank_type"] == "AUXILIARY"]

        # Dados do principal preservados na edição
        assert resp.json()["combustivel_principal_id"] == str(diesel_id)


class TestAbastecimentoSeparado:
    async def test_ponta_a_ponta_diesel_e_arla(self, client, make_tenant, setup_frota, _db):
        """Cenário E2E: Atego Diesel(400) + ARLA(50); tanques 10.000 Diesel / 1.000 ARLA."""
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        diesel_tanque_id = frota["tanque"].id
        arla, arla_tanque = await _criar_arla(_db, t["org"])
        login = frota["acesso"].login

        # Cria o caminhão com reservatório auxiliar.
        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "modelo": "Atego",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "capacidade_tanque_litros": "400",
                "tanques_auxiliares": [{"combustivel_id": str(arla.id), "capacidade": "50"}],
            },
            headers=t["headers"],
        )
        assert resp.status_code == 201, resp.text
        veiculo_id = resp.json()["id"]

        headers = await _login_headers(client, login, "1234")

        # O veículo oferece os dois produtos.
        veiculos = (await client.get("/api/govfrota/app/motorista/veiculos", headers=headers)).json()
        atego = next(v for v in veiculos if v["placa"] == "ABC1D23")
        produtos = {p["nome"]: p for p in atego["combustiveis"]}
        assert "Diesel S10" in produtos
        assert "ARLA 32" in produtos
        assert float(produtos["ARLA 32"]["capacidade"]) == 50

        # Motorista abastece 180 L de Diesel → só o tanque de Diesel baixa.
        ab = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": veiculo_id,
                "combustivel_id": str(diesel_id),
                "quantidade_litros": "180",
                "quilometragem": 50000,
            },
            headers=headers,
        )
        assert ab.status_code == 201, ab.text
        assert await _estoque_tanque(t["org"].id, diesel_id) == 9820.0
        assert await _estoque_tanque(t["org"].id, arla.id) == 1000.0

        # Motorista abastece 20 L de ARLA → só o tanque de ARLA baixa.
        ab2 = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": veiculo_id,
                "combustivel_id": str(arla.id),
                "quantidade_litros": "20",
                "quilometragem": 50000,
            },
            headers=headers,
        )
        assert ab2.status_code == 201, ab2.text
        assert await _estoque_tanque(t["org"].id, diesel_id) == 9820.0
        assert await _estoque_tanque(t["org"].id, arla.id) == 980.0

        # Ambos aparecem separadamente no histórico (relatório filtrável).
        lista = (await client.get(
            f"/api/govfrota/abastecimentos?veiculo_id={veiculo_id}", headers=t["headers"]
        )).json()
        nomes = [x["combustivel_nome"] for x in lista]
        assert nomes.count("Diesel S10") == 1
        assert nomes.count("ARLA 32") == 1

        # Estoques nunca se misturam (tanque Diesel intocado no registro de ARLA).
        diesel_tanque = (await client.get(
            f"/api/govfrota/tanques/{diesel_tanque_id}", headers=t["headers"]
        )).json()
        arla_tanque = (await client.get(
            f"/api/govfrota/tanques/{arla_tanque.id}", headers=t["headers"]
        )).json()
        assert float(diesel_tanque["estoque_atual"]) == 9820.0
        assert float(arla_tanque["estoque_atual"]) == 980.0

    async def test_quantidade_superior_capacidade_arla(self, client, make_tenant, setup_frota, _db):
        """ARLA capacidade 50 L: registrar 80 L é bloqueado."""
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        arla, _ = await _criar_arla(_db, t["org"])
        login = frota["acesso"].login

        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "capacidade_tanque_litros": "400",
                "tanques_auxiliares": [{"combustivel_id": str(arla.id), "capacidade": "50"}],
            },
            headers=t["headers"],
        )
        veiculo_id = resp.json()["id"]
        headers = await _login_headers(client, login, "1234")

        ab = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": veiculo_id,
                "combustivel_id": str(arla.id),
                "quantidade_litros": "80",
                "quilometragem": 50000,
            },
            headers=headers,
        )
        assert ab.status_code == 422, ab.text
        assert "capacidade" in ab.json()["detail"].lower()

    async def test_veiculo_sem_arla_nao_abastece_arla(self, client, make_tenant, setup_frota, _db):
        """Veículo somente Diesel não pode registrar ARLA."""
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        arla, _ = await _criar_arla(_db, t["org"])
        login = frota["acesso"].login

        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "capacidade_tanque_litros": "400",
            },
            headers=t["headers"],
        )
        veiculo_id = resp.json()["id"]
        headers = await _login_headers(client, login, "1234")

        ab = await client.post(
            "/api/govfrota/app/motorista/abastecimentos",
            json={
                "veiculo_id": veiculo_id,
                "combustivel_id": str(arla.id),
                "quantidade_litros": "20",
                "quilometragem": 50000,
            },
            headers=headers,
        )
        assert ab.status_code == 422, ab.text
        assert "incompat" in ab.json()["detail"].lower()

    async def test_tanque_empresa_incompativel(self, client, make_tenant, setup_frota, _db):
        """Admin tenta abastecer ARLA a partir de tanque de Diesel → 422."""
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        diesel_tanque_id = frota["tanque"].id
        arla, _ = await _criar_arla(_db, t["org"])

        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "capacidade_tanque_litros": "400",
                "tanques_auxiliares": [{"combustivel_id": str(arla.id), "capacidade": "50"}],
            },
            headers=t["headers"],
        )
        veiculo_id = resp.json()["id"]

        from datetime import datetime, timezone

        ab = await client.post(
            "/api/govfrota/abastecimentos",
            json={
                "veiculo_id": veiculo_id,
                "tanque_id": str(diesel_tanque_id),  # tanque de Diesel
                "combustivel_id": str(arla.id),       # produto ARLA
                "quantidade_litros": "20",
                "quilometragem": 50000,
                "data_abastecimento": datetime.now(timezone.utc).isoformat(),
            },
            headers=t["headers"],
        )
        assert ab.status_code == 422, ab.text


class TestCrossTenantERelatorios:
    async def test_cross_tenant_nao_edita_auxiliar(self, client, make_tenant, setup_frota, _db):
        t_a = await make_tenant("ADMIN")
        frota = await setup_frota(t_a["org"])
        arla, _ = await _criar_arla(_db, t_a["org"])
        diesel_id = frota["combustivel"].id

        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "tanques_auxiliares": [{"combustivel_id": str(arla.id), "capacidade": "50"}],
            },
            headers=t_a["headers"],
        )
        vid = resp.json()["id"]

        t_b = await make_tenant("ADMIN")
        # Admin de B não vê o veículo de A.
        assert (await client.get(f"/api/govfrota/veiculos/{vid}", headers=t_b["headers"])).status_code == 404
        # Nem edita.
        resp = await client.patch(
            f"/api/govfrota/veiculos/{vid}",
            json={"tanques_auxiliares": []},
            headers=t_b["headers"],
        )
        assert resp.status_code == 404, resp.text

    async def test_combustivel_categoria_arla(self, client, make_tenant, _db):
        t = await make_tenant("ADMIN")
        arla, _ = await _criar_arla(_db, t["org"])
        resp = await client.get(
            f"/api/govfrota/combustiveis/{arla.id}", headers=t["headers"]
        )
        assert resp.status_code == 200
        assert resp.json()["categoria"] == "FLUIDO_AUXILIAR"

    async def test_relatorio_separa_por_combustivel(self, client, make_tenant, setup_frota, _db):
        t = await make_tenant("ADMIN")
        frota = await setup_frota(t["org"])
        diesel_id = frota["combustivel"].id
        arla, _ = await _criar_arla(_db, t["org"])
        login = frota["acesso"].login

        resp = await client.post(
            "/api/govfrota/veiculos",
            json={
                "placa": "ABC1D23",
                "tipo": "CAMINHAO",
                "combustivel_principal_id": str(diesel_id),
                "tanques_auxiliares": [{"combustivel_id": str(arla.id), "capacidade": "50"}],
            },
            headers=t["headers"],
        )
        veiculo_id = resp.json()["id"]
        headers = await _login_headers(client, login, "1234")

        await client.post("/api/govfrota/app/motorista/abastecimentos", json={
            "veiculo_id": veiculo_id, "combustivel_id": str(diesel_id),
            "quantidade_litros": "180", "quilometragem": 50000}, headers=headers)
        await client.post("/api/govfrota/app/motorista/abastecimentos", json={
            "veiculo_id": veiculo_id, "combustivel_id": str(arla.id),
            "quantidade_litros": "20", "quilometragem": 50000}, headers=headers)

        # Filtro por ARLA retorna somente ARLA.
        so_arla = (await client.get(
            f"/api/govfrota/abastecimentos?combustivel_id={arla.id}", headers=t["headers"]
        )).json()
        assert len(so_arla) == 1 and so_arla[0]["combustivel_nome"] == "ARLA 32"

        # Filtro por Diesel retorna somente Diesel.
        so_diesel = (await client.get(
            f"/api/govfrota/abastecimentos?combustivel_id={diesel_id}", headers=t["headers"]
        )).json()
        assert len(so_diesel) == 1 and so_diesel[0]["combustivel_nome"] == "Diesel S10"
