"""Isolamento de tenant (camada de aplicação) — vazamentos DEVEM falhar."""

U = "/api/govsocial/v1/units"
P = "/api/govsocial/v1/professionals"


async def test_block_cross_tenant_read_units(client, world):
    # Gestor do tenant A não vê unidade do tenant B na listagem.
    r = await client.get(U, headers=world["auth"]("gestor_municipal", "A"))
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()}
    assert str(world["unit_a"].id) in ids
    assert str(world["unit_b"].id) not in ids

    # GET direto do recurso de B pelo usuário de A → 404 (não vaza existência).
    r2 = await client.get(
        f"{U}/{world['unit_b'].id}", headers=world["auth"]("gestor_municipal", "A")
    )
    assert r2.status_code == 404


async def test_block_cross_tenant_read_professionals(client, world):
    r = await client.get(P, headers=world["auth"]("gestor_municipal", "A"))
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()}
    assert str(world["prof_a"].id) in ids
    assert str(world["prof_b"].id) not in ids


async def test_block_cross_tenant_write(client, world):
    # A tenta PATCH em unidade de B → 404
    r = await client.patch(
        f"{U}/{world['unit_b'].id}",
        json={"nome": "hack"},
        headers=world["auth"]("gestor_municipal", "A"),
    )
    assert r.status_code == 404

    # A tenta DELETE em unidade de B → 404
    r2 = await client.delete(
        f"{U}/{world['unit_b'].id}", headers=world["auth"]("gestor_municipal", "A")
    )
    assert r2.status_code == 404


async def test_domain_seed_is_tenant_scoped(client, world):
    ra = await client.get(
        "/api/govsocial/v1/service-types", headers=world["auth"]("gestor_municipal", "A")
    )
    rb = await client.get(
        "/api/govsocial/v1/service-types",
        headers=world["auth"]("gestor_municipal", "B"),
    )
    assert ra.status_code == 200 and rb.status_code == 200
    ids_a = {i["id"] for i in ra.json()}
    ids_b = {i["id"] for i in rb.json()}
    assert ids_a and ids_b
    assert ids_a.isdisjoint(ids_b)


async def test_user_without_tenant_is_rejected(client, world):
    # ADMIN não tem organization_id → get_tenant_id rejeita (fail-closed) em rotas de negócio.
    r = await client.get(U, headers=world["auth"]("ADMIN", "A"))
    assert r.status_code in (400, 403)
