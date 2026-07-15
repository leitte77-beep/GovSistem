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


# ── Persistência completa do cadastro ─────────────────────────────
async def test_create_person_persists_every_field(client, world):
    """Regressão: os campos do CadÚnico eram aceitos e silenciosamente
    descartados na criação (só o PATCH gravava)."""
    enviado = {
        "nome_civil": "Joana Completa",
        "nome_social": "Joana C.",
        "nis": "12345678900",
        "data_nascimento": "1985-07-21",
        "sexo": "FEMININO",
        "escolaridade": "MEDIO_COMPLETO",
        "ocupacao": "Costureira",
        "tipo_deficiencia": "VISUAL",
        "raca_cor": "PARDA",
        "estado_civil": "UNIAO_ESTAVEL",
        "frequenta_escola": False,
        "situacao_mercado_trabalho": "AUTONOMO",
        "gestante": True,
        "amamentando": False,
        "renda_mensal": 1320.5,
        "confirmar_duplicata": True,
    }
    r = await client.post(PER, json=enviado, headers=world["auth"]("recepcao", "A"))
    assert r.status_code == 201
    pid = r.json()["person"]["id"]

    lido = (
        await client.get(f"{PER}/{pid}", headers=world["auth"]("recepcao", "A"))
    ).json()
    for campo, valor in enviado.items():
        if campo in ("nis", "confirmar_duplicata"):
            continue
        assert lido[campo] == valor, f"campo {campo} não foi persistido"
    assert lido["nis_mascarado"] is not None


# ── Responsável familiar ──────────────────────────────────────────
async def test_set_responsavel_requires_active_member(client, world):
    fora = await client.post(
        PER, json={"nome_civil": "Alheio Silva"}, headers=world["auth"]("recepcao", "A")
    )
    r = await client.patch(
        f"{FAM}/{world['family_a'].id}",
        json={"responsavel_id": fora.json()["person"]["id"]},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 422
    assert "membro ativo" in r.json()["detail"].lower()


async def test_set_responsavel_moves_parentesco_and_nis(client, world):
    fid = str(world["family_a"].id)
    novo = await client.post(
        PER,
        json={"nome_civil": "Novo Responsavel", "nis": "23456789013"},
        headers=world["auth"]("recepcao", "A"),
    )
    npid = novo.json()["person"]["id"]
    add = await client.post(
        f"{FAM}/{fid}/members",
        json={"person_id": npid, "parentesco": "CONJUGE"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert add.status_code == 201

    r = await client.patch(
        f"{FAM}/{fid}",
        json={"responsavel_id": npid},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["responsavel_id"] == npid
    assert body["responsavel_nome"] == "Novo Responsavel"
    # NIS da família acompanha o novo responsável
    assert body["nis_responsavel_mascarado"] is not None

    por_pessoa = {m["person_id"]: m for m in body["membros"]}
    assert por_pessoa[npid]["parentesco"] == "RESPONSAVEL"
    assert por_pessoa[npid]["is_responsavel"] is True
    # o anterior deixa de ser RESPONSAVEL e fica sem parentesco declarado
    antigo = por_pessoa[str(world["person_a"].id)]
    assert antigo["parentesco"] is None
    assert antigo["is_responsavel"] is False


async def test_update_member_parentesco(client, world):
    fid = str(world["family_a"].id)
    p = await client.post(
        PER, json={"nome_civil": "Filho Um"}, headers=world["auth"]("recepcao", "A")
    )
    pid = p.json()["person"]["id"]
    await client.post(
        f"{FAM}/{fid}/members",
        json={"person_id": pid, "parentesco": "FILHO"},
        headers=world["auth"]("recepcao", "A"),
    )

    r = await client.patch(
        f"{FAM}/{fid}/members/{pid}",
        json={"parentesco": "ENTEADO"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 200
    membro = next(m for m in r.json()["membros"] if m["person_id"] == pid)
    assert membro["parentesco"] == "ENTEADO"


async def test_update_member_cannot_forge_responsavel(client, world):
    fid = str(world["family_a"].id)
    p = await client.post(
        PER, json={"nome_civil": "Filho Dois"}, headers=world["auth"]("recepcao", "A")
    )
    pid = p.json()["person"]["id"]
    await client.post(
        f"{FAM}/{fid}/members",
        json={"person_id": pid, "parentesco": "FILHO"},
        headers=world["auth"]("recepcao", "A"),
    )
    r = await client.patch(
        f"{FAM}/{fid}/members/{pid}",
        json={"parentesco": "RESPONSAVEL"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 422


async def test_update_member_requires_active_link(client, world):
    r = await client.patch(
        f"{FAM}/{world['family_a'].id}/members/{uuid.uuid4()}",
        json={"parentesco": "FILHO"},
        headers=world["auth"]("recepcao", "A"),
    )
    assert r.status_code == 404


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
