"""FASE 2 — famílias, pessoas, busca, duplicata, mesclagem, isolamento, RBAC."""

import uuid

FAM = "/api/govsocial/v1/families"
PER = "/api/govsocial/v1/persons"
SEARCH = "/api/govsocial/v1/search"


# ── Pessoas: criação, duplicata, unicidade ────────────────────────
async def test_create_person_ok(client, world):
    r = await client.post(
        PER,
        json={"nome_civil": "Carlos Andrade", "data_nascimento": "1999-03-03"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["created"] is True
    assert body["person"]["nome_exibicao"] == "Carlos Andrade"


async def test_nome_social_precedence(client, world):
    r = await client.post(
        PER,
        json={"nome_civil": "Roberto Lima", "nome_social": "Bruna Lima"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 201
    assert r.json()["person"]["nome_exibicao"] == "Bruna Lima"


async def test_duplicate_detection_blocks_then_confirms(client, world):
    payload = {"nome_civil": "Maria da Silva", "data_nascimento": "1990-05-10"}
    r1 = await client.post(PER, json=payload, headers=world["auth"]("recepcao", "A"))
    assert r1.status_code == 201
    assert r1.json()["created"] is False
    assert len(r1.json()["duplicates"]) >= 1

    payload["confirmar_duplicata"] = True
    r2 = await client.post(PER, json=payload, headers=world["auth"]("recepcao", "A"))
    assert r2.status_code == 201
    assert r2.json()["created"] is True


async def test_cpf_unique_per_tenant(client, world):
    # CPF já usado por person_a (52998224725)
    r = await client.post(
        PER,
        json={"nome_civil": "Outro", "cpf": "529.982.247-25", "confirmar_duplicata": True},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 409


async def test_invalid_cpf_problem_details(client, world):
    r = await client.post(
        PER,
        json={"nome_civil": "X", "cpf": "111"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")


# ── Mascaramento e leitura sensível ───────────────────────────────
async def test_person_list_masks_cpf(client, world):
    r = await client.get(PER, headers=world["auth"]("recepcao", "A"))
    assert r.status_code == 200
    for item in r.json():
        if item["cpf_mascarado"]:
            assert item["cpf_mascarado"].startswith("***.***.***-")
        assert "cpf" not in item


async def test_get_person_audits_sensitive_read(client, world, db_session):
    from sqlalchemy import select

    from app.models.audit_trail import AuditTrail

    r = await client.get(
        f"{PER}/{world['person_a'].id}", headers=world["auth"]("tecnico_superior", "A")
    )
    assert r.status_code == 200
    rows = (
        await db_session.execute(
            select(AuditTrail).where(
                AuditTrail.entity == "person",
                AuditTrail.access_type == "READ_SENSIVEL",
            )
        )
    ).scalars().all()
    assert len(rows) >= 1


# ── Deficiência sensível criptografada ────────────────────────────
async def test_deficiencia_detalhe_encrypted_at_rest(client, world, db_session):
    from sqlalchemy import select

    from app.models.person import Person

    r = await client.post(
        PER,
        json={
            "nome_civil": "Paulo Deficiente",
            "tipo_deficiencia": "FISICA",
            "deficiencia_detalhe": "cadeirante - detalhe sensivel",
        },
        headers=world["auth"]("tecnico_superior", "A"),
    )
    assert r.status_code == 201
    pid = r.json()["person"]["id"]
    row = (
        await db_session.execute(select(Person).where(Person.id == uuid.UUID(pid)))
    ).scalar_one()
    # No banco não pode estar em claro.
    assert row.deficiencia_detalhe_enc is not None
    assert "cadeirante" not in row.deficiencia_detalhe_enc
    # Na API volta decriptado.
    assert r.json()["person"]["deficiencia_detalhe"] == "cadeirante - detalhe sensivel"


# ── Merge ─────────────────────────────────────────────────────────
async def test_merge_persons(client, world, db_session):
    a = await client.post(
        PER, json={"nome_civil": "Fulano Um"}, headers=world["auth"]("gestor_municipal", "A")
    )
    b = await client.post(
        PER, json={"nome_civil": "Fulano Dois"}, headers=world["auth"]("gestor_municipal", "A")
    )
    keep_id = a.json()["person"]["id"]
    drop_id = b.json()["person"]["id"]

    r = await client.post(
        f"{PER}/merge",
        json={"keep_id": keep_id, "drop_id": drop_id, "justificativa": "mesma pessoa"},
        headers=world["auth"]("coordenador_unidade", "A"),
    )
    assert r.status_code == 200
    assert r.json()["id"] == keep_id

    # drop soft-deletado → 404
    r2 = await client.get(
        f"{PER}/{drop_id}", headers=world["auth"]("tecnico_superior", "A")
    )
    assert r2.status_code == 404


async def test_merge_requires_privilege(client, world):
    r = await client.post(
        f"{PER}/merge",
        json={
            "keep_id": str(world["person_a"].id),
            "drop_id": str(world["person_a"].id),
            "justificativa": "x",
        },
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 403


# ── Famílias + membros ────────────────────────────────────────────
async def test_family_sequential_code(client, world):
    r1 = await client.post(
        FAM, json={"bairro": "Centro"}, headers=world["auth"]("recepcao", "A")
    )
    r2 = await client.post(
        FAM, json={"bairro": "Centro"}, headers=world["auth"]("recepcao", "A")
    )
    assert r1.status_code == 201 and r2.status_code == 201
    # já existe família código 1 no seed do tenant A
    assert r2.json()["codigo"] == r1.json()["codigo"] + 1


async def test_add_and_move_member(client, world):
    # cria pessoa
    p = await client.post(
        PER, json={"nome_civil": "Membro Movido"}, headers=world["auth"]("recepcao", "A")
    )
    pid = p.json()["person"]["id"]
    # duas famílias
    f1 = await client.post(FAM, json={"bairro": "A1"}, headers=world["auth"]("recepcao", "A"))
    f2 = await client.post(FAM, json={"bairro": "A2"}, headers=world["auth"]("recepcao", "A"))
    f1id, f2id = f1.json()["id"], f2.json()["id"]

    add = await client.post(
        f"{FAM}/{f1id}/members",
        json={"person_id": pid, "parentesco": "FILHO"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert add.status_code == 201
    assert any(m["person_id"] == pid for m in add.json()["membros"])

    mv = await client.post(
        f"{FAM}/{f1id}/members/{pid}/move",
        json={"destino_family_id": f2id, "motivo": "mudança"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert mv.status_code == 200
    assert mv.json()["id"] == f2id
    assert any(m["person_id"] == pid for m in mv.json()["membros"])

    # não aparece mais como ativo na origem
    orig = await client.get(f"{FAM}/{f1id}/members", headers=world["auth"]("recepcao", "A"))
    assert all(m["person_id"] != pid or m["status"] != "ATIVO" for m in orig.json())


# ── Busca unificada ───────────────────────────────────────────────
async def test_unified_search_accent_insensitive(client, world):
    # person_a = "Maria da Silva"
    r = await client.get(
        SEARCH, params={"q": "maria"}, headers=world["auth"]("recepcao", "A")
    )
    assert r.status_code == 200
    assert any(i["person_id"] == str(world["person_a"].id) for i in r.json())


async def test_unified_search_by_cpf(client, world):
    r = await client.get(
        SEARCH, params={"q": "52998224725"}, headers=world["auth"]("recepcao", "A")
    )
    assert r.status_code == 200
    assert any(i["person_id"] == str(world["person_a"].id) for i in r.json())


# ── Isolamento de tenant ──────────────────────────────────────────
async def test_persons_tenant_isolation(client, world):
    r = await client.get(PER, headers=world["auth"]("gestor_municipal", "A"))
    ids = {p["id"] for p in r.json()}
    assert str(world["person_a"].id) in ids
    assert str(world["person_b"].id) not in ids

    # GET direto cross-tenant → 404
    r2 = await client.get(
        f"{PER}/{world['person_b'].id}", headers=world["auth"]("tecnico_superior", "A")
    )
    assert r2.status_code == 404


async def test_families_tenant_isolation(client, world):
    r = await client.get(
        f"{FAM}/{world['family_b'].id}", headers=world["auth"]("gestor_municipal", "A")
    )
    assert r.status_code == 404


async def test_search_scoped_to_tenant(client, world):
    # tenant A busca CPF que pertence ao person_b (tenant B) → não retorna
    r = await client.get(
        SEARCH, params={"q": "16899535009"}, headers=world["auth"]("recepcao", "A")
    )
    assert r.status_code == 200
    assert all(i["person_id"] != str(world["person_b"].id) for i in r.json())


# ── RBAC ──────────────────────────────────────────────────────────
async def test_conselho_cannot_read_persons(client, world):
    assert (await client.get(PER, headers=world["auth"]("conselho", "A"))).status_code == 403


async def test_tecnico_medio_cannot_create_person(client, world):
    r = await client.post(
        PER, json={"nome_civil": "X"}, headers=world["auth"]("tecnico_medio", "A")
    )
    assert r.status_code == 403


async def test_vigilancia_can_read_but_not_write_family(client, world):
    assert (await client.get(FAM, headers=world["auth"]("vigilancia", "A"))).status_code == 200
    r = await client.post(FAM, json={"bairro": "Z"}, headers=world["auth"]("vigilancia", "A"))
    assert r.status_code == 403
