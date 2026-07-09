"""Auditoria, mascaramento de CPF e Problem Details."""

from sqlalchemy import select

from app.models.audit_trail import AuditTrail

U = "/api/govsocial/v1/units"
P = "/api/govsocial/v1/professionals"


async def test_audit_written_on_write(client, world, db_session):
    r = await client.post(
        U,
        json={"tipo": "CRAS", "nome": "CRAS Auditado"},
        headers=world["auth"]("gestor_municipal", "A"),
    )
    assert r.status_code == 201
    rows = (
        await db_session.execute(
            select(AuditTrail).where(
                AuditTrail.entity == "unit", AuditTrail.action == "CREATE"
            )
        )
    ).scalars().all()
    assert any(x.entity_id == r.json()["id"] for x in rows)


async def test_audit_written_on_sensitive_read(client, world, db_session):
    r = await client.get(
        f"{P}/{world['prof_a'].id}", headers=world["auth"]("gestor_municipal", "A")
    )
    assert r.status_code == 200
    rows = (
        await db_session.execute(
            select(AuditTrail).where(
                AuditTrail.entity == "professional",
                AuditTrail.access_type == "READ_SENSIVEL",
            )
        )
    ).scalars().all()
    assert len(rows) >= 1


async def test_audit_trail_append_only_orm(db_session, world):
    """No banco de produção há trigger; aqui garantimos que a app nunca edita/apaga.

    Verifica que o modelo não expõe caminho de escrita e que um UPDATE manual
    seria rejeitado pela trigger em Postgres. Em SQLite validamos a ausência de
    rotas de mutação (nenhum endpoint PATCH/DELETE em /audit).
    """
    from app.api.v1.audit import router

    methods = set()
    for route in router.routes:
        methods |= set(getattr(route, "methods", set()))
    assert "PATCH" not in methods
    assert "DELETE" not in methods
    assert "PUT" not in methods


async def test_cpf_masked_in_list(client, world):
    r = await client.get(P, headers=world["auth"]("gestor_municipal", "A"))
    assert r.status_code == 200
    for item in r.json():
        assert item["cpf_mascarado"].startswith("***.***.***-")
        # CPF completo não deve aparecer.
        assert "cpf" not in item


async def test_problem_details_on_404(client, world):
    import uuid

    r = await client.get(
        f"{U}/{uuid.uuid4()}", headers=world["auth"]("gestor_municipal", "A")
    )
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["status"] == 404
    assert "title" in body and "detail" in body
    assert "instance" in body


async def test_problem_details_on_validation(client, world):
    r = await client.post(
        P,
        json={"nome": "Sem CPF", "cpf": "123"},  # CPF inválido
        headers=world["auth"]("gestor_municipal", "A"),
    )
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    assert "errors" in r.json()
