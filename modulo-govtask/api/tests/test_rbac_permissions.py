"""Testes do RBAC granular (permissões por recurso, sobre as roles)."""

from app.models import Role, RolePermission, UserRole

BASE = "/api/govtask"


async def test_auth_me_retorna_permissions(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    r = await client.get(f"{BASE}/auth/me", headers=assessor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "permissions" in data
    assert "resource.create" in data["permissions"]
    assert "financial.manage" in data["permissions"]
    assert "admin.config" not in data["permissions"]  # assessor não administra config


async def test_sem_permissao_delete_nao_exclui(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    gestor = await make_tenant("GESTOR", org=assessor["org"])

    p = await client.post(
        f"{BASE}/convenios", headers=assessor["headers"],
        json={"titulo": "A excluir", "tipo": "OBRA"},
    )
    p = p.json()

    # Gestor não tem resource.delete -> 403
    r = await client.delete(f"{BASE}/convenios/{p['id']}", headers=gestor["headers"])
    assert r.status_code == 403

    # Assessor tem resource.delete -> 204
    r = await client.delete(f"{BASE}/convenios/{p['id']}", headers=assessor["headers"])
    assert r.status_code == 204


async def test_sem_permissao_financeiro_nao_gerencia(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    gestor = await make_tenant("GESTOR", org=assessor["org"])

    p = await client.post(
        f"{BASE}/convenios", headers=assessor["headers"],
        json={"titulo": "Financeiro", "tipo": "OBRA"},
    )
    p = p.json()

    # Gestor sem financial.manage -> 403
    r = await client.post(
        f"{BASE}/convenios/{p['id']}/financeiro/movimentos",
        headers=gestor["headers"],
        json={"tipo": "PAGAMENTO", "valor": 100.0},
    )
    assert r.status_code == 403


async def test_permissao_granular_por_role(client, make_tenant, _db):
    """Uma role customizada com apenas resource.delete consegue excluir, mas não editar."""
    assessor = await make_tenant("ASSESSOR")

    p = await client.post(
        f"{BASE}/convenios", headers=assessor["headers"],
        json={"titulo": "Granular", "tipo": "OBRA"},
    )
    p = p.json()

    # Cria role customizada com apenas resource.delete
    role = Role(name="SOMENTE_EXCLUIR", label="Só exclui", is_system=False)
    _db.add(role)
    await _db.flush()
    _db.add(RolePermission(role_id=role.id, permission="resource.delete"))

    from app.models import User
    user = User(
        email="somente.excluir@test.com",
        name="Excluidor",
        organization_id=assessor["org"].id,
        is_active=True,
    )
    _db.add(user)
    await _db.flush()
    _db.add(UserRole(user_id=user.id, role_id=role.id))
    await _db.commit()

    from app.core.security import create_access_token
    token = create_access_token(user.id, ["SOMENTE_EXCLUIR"], assessor["org"].id)
    headers = {"Authorization": f"Bearer {token}"}

    # Pode excluir (tem resource.delete)
    r = await client.delete(f"{BASE}/convenios/{p['id']}", headers=headers)
    assert r.status_code == 204

    # Não pode criar (não tem resource.create)
    r = await client.post(f"{BASE}/convenios", headers=headers, json={"titulo": "X", "tipo": "OBRA"})
    assert r.status_code == 403
