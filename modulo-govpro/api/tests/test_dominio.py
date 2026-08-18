"""Testes HTTP dos endpoints de catálogo (/dominio/*) — leitura (Fase web-admin)
e CRUD de administração (Fase 6 — Administração → Catálogos).
"""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import RoleName
from app.models.role import Role
from app.models.user_role import UserRole


def _token(user, org_id) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "roles": ["SERVIDOR"],
        "type": "module_access",
        "organization_id": str(org_id),
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


async def _tornar_admin(db, user) -> None:
    role = (await db.execute(select(Role).where(Role.name == RoleName.ADMIN.value))).scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()


async def test_tipos_processo(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get("/api/govpro/v1/dominio/tipos-processo", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    codigos = {t["codigo"] for t in data}
    assert {"REQ_GERAL", "ESIC", "LICENCA_OBRA", "CERTIDAO", "RECURSO"} <= codigos
    for t in data:
        assert "id" in t and "nome" in t and "niveis_permitidos" in t


async def test_unidades(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get("/api/govpro/v1/dominio/unidades", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    siglas = {u["sigla"] for u in data}
    assert {"PROTOCOLO", "GAB", "SEC_ADM", "SEC_OBRAS"} <= siglas
    protocolo = next(u for u in data if u["sigla"] == "PROTOCOLO")
    assert protocolo["protocolizadora"] is True


async def test_tipos_documento(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get("/api/govpro/v1/dominio/tipos-documento", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    codigos = {t["codigo"] for t in data}
    assert {"DESPACHO", "OFICIO", "PARECER", "PORTARIA"} <= codigos


async def test_hipoteses_legais(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get("/api/govpro/v1/dominio/hipoteses-legais", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    codigos = {h["codigo"] for h in data}
    assert {"INF_PESSOAL", "SIG_FISCAL", "RESERVADO", "SECRETO"} <= codigos


async def test_plano_classificacao(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get("/api/govpro/v1/dominio/plano-classificacao", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    codigos = {c["codigo"] for c in data}
    assert {"000", "010", "110", "120"} <= codigos


async def test_motivos_sobrestamento(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get("/api/govpro/v1/dominio/motivos-sobrestamento", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 5


async def test_catalogo_exige_autenticacao(cenario, client):
    res = await client.get("/api/govpro/v1/dominio/unidades")
    assert res.status_code == 401


# ── CRUD (Administração → Catálogos) ─────────────────────────────────────────
async def test_servidor_nao_cria_tipo_processo(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.post(
        "/api/govpro/v1/dominio/tipos-processo",
        json={"codigo": "NOVO", "nome": "Novo tipo"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


async def test_admin_cria_atualiza_e_remove_tipo_processo(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/tipos-processo",
        json={
            "codigo": "TESTE_CRUD",
            "nome": "Processo de teste",
            "niveis_permitidos": ["PUBLICO", "RESTRITO"],
            "prazo_legal_dias": 30,
        },
        headers=headers,
    )
    assert res.status_code == 201
    criado = res.json()
    assert criado["codigo"] == "TESTE_CRUD"
    assert criado["ativo"] is True

    res = await client.patch(
        f"/api/govpro/v1/dominio/tipos-processo/{criado['id']}",
        json={"nome": "Processo de teste (renomeado)", "prazo_legal_dias": 45},
        headers=headers,
    )
    assert res.status_code == 200
    atualizado = res.json()
    assert atualizado["nome"] == "Processo de teste (renomeado)"
    assert atualizado["prazo_legal_dias"] == 45
    assert atualizado["codigo"] == "TESTE_CRUD"

    res = await client.delete(
        f"/api/govpro/v1/dominio/tipos-processo/{criado['id']}", headers=headers
    )
    assert res.status_code == 204

    res = await client.get("/api/govpro/v1/dominio/tipos-processo", headers=headers)
    assert criado["id"] not in {t["id"] for t in res.json()}

    res = await client.patch(
        f"/api/govpro/v1/dominio/tipos-processo/{criado['id']}",
        json={"nome": "Não deveria funcionar"},
        headers=headers,
    )
    assert res.status_code == 404


async def test_codigo_duplicado_retorna_409(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/tipos-processo",
        json={"codigo": "REQ_GERAL", "nome": "Duplicado"},
        headers=headers,
    )
    assert res.status_code == 409


async def test_cria_tipo_processo_sem_codigo_gera_slug(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/tipos-processo",
        json={"nome": "Licença Ambiental"},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["codigo"] == "LICENCA_AMBIENTAL"


async def test_cria_tipo_processo_sem_codigo_colisao_gera_sufixo(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    for i in range(2):
        res = await client.post(
            "/api/govpro/v1/dominio/tipos-processo",
            json={"nome": "Alvará Sanitário"},
            headers=headers,
        )
        assert res.status_code == 201

    codigos = [
        t["codigo"]
        for t in (
            await client.get("/api/govpro/v1/dominio/tipos-processo", headers=headers)
        ).json()
    ]
    assert "ALVARA_SANITARIO" in codigos
    assert "ALVARA_SANITARIO_2" in codigos


async def test_cria_hipotese_legal_sem_codigo_gera_slug(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/hipoteses-legais",
        json={"descricao": "Segredo de Justiça"},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["codigo"] == "SEGREDO_DE_JUSTICA"


async def test_cria_unidade_com_pai(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    unidades = (
        await client.get("/api/govpro/v1/dominio/unidades", headers=headers)
    ).json()
    gabinete = next(u for u in unidades if u["sigla"] == "GAB")

    res = await client.post(
        "/api/govpro/v1/dominio/unidades",
        json={"sigla": "GAB_ADJ", "nome": "Gabinete Adjunto", "unidade_pai_id": gabinete["id"]},
        headers=headers,
    )
    assert res.status_code == 201
    nova = res.json()
    assert nova["unidade_pai_id"] == gabinete["id"]

    # Referência a unidade de outro tenant/inexistente é rejeitada (fail-closed).
    import uuid

    res = await client.post(
        "/api/govpro/v1/dominio/unidades",
        json={"sigla": "ORFA", "nome": "Órfã", "unidade_pai_id": str(uuid.uuid4())},
        headers=headers,
    )
    assert res.status_code == 422


async def test_isolamento_entre_tenants_no_crud(cenario, client, db_session):
    from app.models.organization import Organization
    from app.models.user import User

    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/tipos-processo",
        json={"codigo": "TENANT_A", "nome": "Tipo do tenant A"},
        headers=headers,
    )
    tipo_id = res.json()["id"]

    outra_org = Organization(name="Outro Município", slug="outro-mun", is_active=True)
    db_session.add(outra_org)
    await db_session.flush()

    outro_admin = User(
        organization_id=outra_org.id,
        name="Admin B",
        email="admin-b@teste.local",
        is_active=True,
        password_hash=None,
    )
    db_session.add(outro_admin)
    await db_session.flush()
    await _tornar_admin(db_session, outro_admin)

    token_b = _token(outro_admin, outra_org.id)
    res = await client.patch(
        f"/api/govpro/v1/dominio/tipos-processo/{tipo_id}",
        json={"nome": "Não deveria funcionar"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res.status_code == 404

    res = await client.get(
        "/api/govpro/v1/dominio/tipos-processo", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert "TENANT_A" not in {t["codigo"] for t in res.json()}
