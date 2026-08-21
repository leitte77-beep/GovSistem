"""Autorização por permissão, não por nome de role.

Cobre a migração de `require_roles(...)` para `require_permission(...)`:
cada setor opera a própria área, o financeiro só é visível a quem tem
`financial.view`, e uma role criada pelo administrador funciona apenas por
carregar a permissão correspondente.
"""

import uuid

from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models import Organization, Role, RolePermission, User, UserRole

BASE = "/api/govtask"


async def _processo(client, dono):
    r = await client.post(
        f"{BASE}/convenios",
        headers=dono["headers"],
        json={"titulo": "Construção de CMEI", "tipo": "OBRA"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _usuario_com_permissoes(db, org, role_name: str, permissoes: list[str]):
    """Cria uma role com permissões arbitrárias — como faria o administrador."""
    role = Role(name=role_name, label=role_name)
    db.add(role)
    await db.flush()
    for p in permissoes:
        db.add(RolePermission(role_id=role.id, permission=p))
    user = User(
        email=f"{uuid.uuid4().hex}@test.com",
        name=role_name,
        organization_id=org.id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()
    token = create_access_token(user.id, [role_name], org.id)
    return {"user": user, "headers": {"Authorization": f"Bearer {token}"}}


# ── Cada setor opera a própria área ─────────────────────────────────────────

async def test_compras_licitacao_cadastra_licitacao_e_contrato(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    compras = await make_tenant("COMPRAS_LICITACAO", org=assessor["org"])
    processo = await _processo(client, assessor)

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/licitacoes",
        headers=compras["headers"],
        json={"numero": "PE 012/2026", "modalidade": "PREGAO_ELETRONICO", "objeto": "Pavimentação"},
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/contratos",
        headers=compras["headers"],
        json={"numero": "CT 045/2026", "fornecedor": "Construtora Alfa", "valor": "2500000.00"},
    )
    assert r.status_code == 201, r.text


async def test_engenharia_nao_cadastra_licitacao(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    processo = await _processo(client, assessor)

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/licitacoes",
        headers=engenheiro["headers"],
        json={"numero": "PE 013/2026"},
    )
    assert r.status_code == 403


async def test_engenharia_registra_obra(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    processo = await _processo(client, assessor)

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/obras",
        headers=engenheiro["headers"],
        json={"nome": "CMEI Modelo", "empresa": "Construtora Alfa"},
    )
    assert r.status_code == 201, r.text


# ── Financeiro exige permissão explícita de leitura ─────────────────────────

async def test_engenharia_nao_ve_financeiro(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    processo = await _processo(client, assessor)

    for url in (
        f"{BASE}/convenios/{processo['id']}/financeiro/resumo",
        f"{BASE}/convenios/{processo['id']}/financeiro/movimentos",
        f"{BASE}/convenios/{processo['id']}/repasses",
    ):
        r = await client.get(url, headers=engenheiro["headers"])
        assert r.status_code == 403, f"{url} -> {r.status_code}"


async def test_gestor_ve_financeiro_mas_nao_lanca(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    gestor = await make_tenant("GESTOR", org=assessor["org"])
    processo = await _processo(client, assessor)

    r = await client.get(
        f"{BASE}/convenios/{processo['id']}/financeiro/resumo", headers=gestor["headers"]
    )
    assert r.status_code == 200, r.text

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/repasses",
        headers=gestor["headers"],
        json={"parcela": 1, "valor_previsto": "500000.00"},
    )
    assert r.status_code == 403


async def test_dashboard_omite_valores_sem_permissao_financeira(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    await _processo(client, assessor)

    r = await client.get(f"{BASE}/dashboard", headers=engenheiro["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["valor_aprovado"] == 0


# ── Role criada pelo administrador funciona sem alterar código ──────────────

async def test_role_customizada_opera_pela_permissao(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    processo = await _processo(client, assessor)

    fiscal = await _usuario_com_permissoes(
        _db, assessor["org"], "FISCAL_DE_OBRA", [Perm.RESOURCE_VIEW, Perm.ENGINEERING_MANAGE]
    )

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/obras",
        headers=fiscal["headers"],
        json={"nome": "Obra fiscalizada"},
    )
    assert r.status_code == 201, r.text

    # A mesma role não alcança o financeiro nem a criação de processos.
    r = await client.get(
        f"{BASE}/convenios/{processo['id']}/financeiro/resumo", headers=fiscal["headers"]
    )
    assert r.status_code == 403
    r = await client.post(
        f"{BASE}/convenios", headers=fiscal["headers"], json={"titulo": "X", "tipo": "OBRA"}
    )
    assert r.status_code == 403


async def test_role_sem_permissoes_configuradas_usa_padrao_do_catalogo(client, make_tenant, _db):
    """Base ainda não migrada: role sem linhas em `role_permissions` continua operando."""
    assessor = await make_tenant("ASSESSOR")
    processo = await _processo(client, assessor)

    # Role de engenharia sem nenhuma permissão gravada.
    engenheiro = await _usuario_com_permissoes(
        _db, assessor["org"], "ENGENHEIRO_TECNICO_LEGADO", []
    )
    role = await _db.scalar(select(Role).where(Role.name == "ENGENHEIRO_TECNICO_LEGADO"))
    role.name = "ENGENHEIRO_TECNICO"  # nome conhecido pelo catálogo de defaults
    await _db.commit()

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/obras",
        headers=engenheiro["headers"],
        json={"nome": "Obra por fallback"},
    )
    assert r.status_code == 201, r.text


# ── Visão consolidada de contratações ───────────────────────────────────────

async def test_lista_consolidada_de_licitacoes_e_contratos(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    compras = await make_tenant("COMPRAS_LICITACAO", org=assessor["org"])
    processo = await _processo(client, assessor)

    await client.post(
        f"{BASE}/convenios/{processo['id']}/licitacoes",
        headers=compras["headers"],
        json={"numero": "PE 020/2026", "objeto": "Pavimentação"},
    )
    await client.post(
        f"{BASE}/convenios/{processo['id']}/contratos",
        headers=compras["headers"],
        json={"numero": "CT 090/2026", "fornecedor": "Construtora Beta"},
    )

    r = await client.get(f"{BASE}/licitacoes", headers=compras["headers"])
    assert r.status_code == 200, r.text
    assert [l["numero"] for l in r.json()] == ["PE 020/2026"]
    assert r.json()[0]["processo_titulo"] == "Construção de CMEI"

    r = await client.get(f"{BASE}/contratos", headers=compras["headers"])
    assert r.status_code == 200, r.text
    assert [c["numero"] for c in r.json()] == ["CT 090/2026"]


async def test_lista_consolidada_respeita_o_tenant(client, make_tenant):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    processo = await _processo(client, a)
    await client.post(
        f"{BASE}/convenios/{processo['id']}/licitacoes",
        headers=a["headers"],
        json={"numero": "PE 099/2026"},
    )

    r = await client.get(f"{BASE}/licitacoes", headers=b["headers"])
    assert r.status_code == 200
    assert r.json() == []
