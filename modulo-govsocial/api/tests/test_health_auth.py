

async def test_health(client):
    r = await client.get("/api/govsocial/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["app"] == "GovSocial API"


async def test_login_and_me(client, world):
    # login via CPF do gestor do tenant A
    gestor = world["users"][("A", "gestor_municipal")]
    r = await client.post(
        "/api/govsocial/v1/auth/login",
        json={"login": gestor.cpf, "password": "senha123"},
    )
    assert r.status_code == 200
    token = r.json()["access_token"]

    r2 = await client.get(
        "/api/govsocial/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["organization_id"] == str(world["org_a"].id)


async def test_login_invalid(client, world):
    r = await client.post(
        "/api/govsocial/v1/auth/login",
        json={"login": "00000000000", "password": "x"},
    )
    assert r.status_code == 401
