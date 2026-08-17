"""Testes HTTP das listagens de documentos e tramitações por processo."""

from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


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


async def _autuar(client, token, tipo_id, protocolo_id):
    res = await client.post(
        "/api/govpro/v1/processos",
        json={
            "tipo_processo_id": tipo_id,
            "especificacao": "Processo para listagem",
            "interessados": [{"tipo_pessoa": "PF", "nome": "Fulano"}],
            "nivel_acesso": "PUBLICO",
            "unidade_protocolizadora_id": protocolo_id,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_listar_documentos_processo(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    tipos = (await client.get(
        "/api/govpro/v1/dominio/tipos-processo", headers={"Authorization": f"Bearer {token}"}
    )).json()
    unidades = (await client.get(
        "/api/govpro/v1/dominio/unidades", headers={"Authorization": f"Bearer {token}"}
    )).json()
    tipo_id = next(t["id"] for t in tipos if t["codigo"] == "REQ_GERAL")
    protocolo_id = next(u["id"] for u in unidades if u["sigla"] == "PROTOCOLO")

    processo = await _autuar(client, token, tipo_id, protocolo_id)

    res = await client.get(
        f"/api/govpro/v1/processos/{processo['id']}/documentos",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == []


async def test_listar_tramitacoes_processo(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    tipos = (await client.get(
        "/api/govpro/v1/dominio/tipos-processo", headers={"Authorization": f"Bearer {token}"}
    )).json()
    unidades = (await client.get(
        "/api/govpro/v1/dominio/unidades", headers={"Authorization": f"Bearer {token}"}
    )).json()
    tipo_id = next(t["id"] for t in tipos if t["codigo"] == "REQ_GERAL")
    protocolo_id = next(u["id"] for u in unidades if u["sigla"] == "PROTOCOLO")

    processo = await _autuar(client, token, tipo_id, protocolo_id)

    res = await client.get(
        f"/api/govpro/v1/processos/{processo['id']}/tramitacoes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == []


async def test_filtros_avancados_de_processos(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}
    tipos = (
        await client.get("/api/govpro/v1/dominio/tipos-processo", headers=headers)
    ).json()
    unidades = (await client.get("/api/govpro/v1/dominio/unidades", headers=headers)).json()
    tipo_geral = next(t["id"] for t in tipos if t["codigo"] == "REQ_GERAL")
    tipo_esic = next(t["id"] for t in tipos if t["codigo"] == "ESIC")
    protocolo_id = next(u["id"] for u in unidades if u["sigla"] == "PROTOCOLO")

    p1 = await _autuar(client, token, tipo_geral, protocolo_id)
    await _autuar(client, token, tipo_esic, protocolo_id)

    res = await client.get(
        f"/api/govpro/v1/processos?tipo_processo_id={tipo_geral}", headers=headers
    )
    assert res.status_code == 200
    ids = {p["id"] for p in res.json()}
    assert p1["id"] in ids
    assert all(p["tipo_processo_id"] == tipo_geral for p in res.json())

    res = await client.get(
        "/api/govpro/v1/processos?situacao=EM_TRAMITACAO", headers=headers
    )
    assert res.status_code == 200
    assert all(p["situacao"] == "EM_TRAMITACAO" for p in res.json())

    res = await client.get(
        "/api/govpro/v1/processos?nivel_acesso=SIGILOSO", headers=headers
    )
    assert res.status_code == 200
    assert res.json() == []
