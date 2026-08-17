"""Testes HTTP de "Minha Caixa" (/minha-caixa/*), atribuição e visualização."""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models.dominio import TipoProcesso
from app.models.unidade import LotacaoUsuario, Unidade
from app.services import tramitacao as tramitacao_service
from app.services.autuacao import autuar


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


async def _autuar(cenario):
    db = cenario["db"]
    tipo = (
        await db.execute(
            select(TipoProcesso).where(
                TipoProcesso.tenant_id == cenario["tenant_id"], TipoProcesso.codigo == "REQ_GERAL"
            )
        )
    ).scalar_one()
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo para minha caixa",
        interessados=[{"nome": "X"}],
        unidade_protocolizadora_id=cenario["unidade"].id,
    )


async def _unidade(db, tenant_id, sigla):
    return (
        await db.execute(
            select(Unidade).where(Unidade.tenant_id == tenant_id, Unidade.sigla == sigla)
        )
    ).scalar_one()


async def test_aguardando_acao_e_nao_visualizados(cenario, client):
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    token = _token(cenario["user"], tenant_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/govpro/v1/minha-caixa/aguardando-acao", headers=headers)
    assert res.status_code == 200
    assert str(processo.id) in {p["id"] for p in res.json()}

    res = await client.get("/api/govpro/v1/minha-caixa/nao-visualizados", headers=headers)
    assert str(processo.id) in {p["id"] for p in res.json()}

    # Abrir o processo marca como visualizado (idempotente).
    res = await client.get(f"/api/govpro/v1/processos/{processo.id}", headers=headers)
    assert res.status_code == 200
    res = await client.get(f"/api/govpro/v1/processos/{processo.id}", headers=headers)
    assert res.status_code == 200

    res = await client.get("/api/govpro/v1/minha-caixa/nao-visualizados", headers=headers)
    assert str(processo.id) not in {p["id"] for p in res.json()}


async def test_atribuicao(cenario, client):
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    token = _token(cenario["user"], tenant_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/govpro/v1/minha-caixa/atribuidos", headers=headers)
    assert str(processo.id) not in {p["id"] for p in res.json()}

    res = await client.patch(
        f"/api/govpro/v1/processos/{processo.id}/atribuir",
        json={"usuario_id": str(cenario["user"].id)},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["responsavel_id"] == str(cenario["user"].id)

    res = await client.get("/api/govpro/v1/minha-caixa/atribuidos", headers=headers)
    assert str(processo.id) in {p["id"] for p in res.json()}

    res = await client.patch(
        f"/api/govpro/v1/processos/{processo.id}/atribuir",
        json={"usuario_id": None},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["responsavel_id"] is None


async def test_enviados_e_aguardando_retorno(cenario, client):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)
    gabinete = await _unidade(db, tenant_id, "GAB")

    await tramitacao_service.tramitar(
        db, tenant_id, cenario["user"],
        processo_id=processo.id,
        unidade_origem_id=cenario["unidade"].id,
        destinos=[{"unidade_id": gabinete.id, "prazo_dias": 5}],
    )

    token = _token(cenario["user"], tenant_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/govpro/v1/minha-caixa/enviados", headers=headers)
    assert res.status_code == 200
    assert any(t["processo_id"] == str(processo.id) for t in res.json())

    res = await client.get("/api/govpro/v1/minha-caixa/aguardando-retorno", headers=headers)
    assert res.status_code == 200
    assert any(t["processo_id"] == str(processo.id) for t in res.json())

    # O usuário também está lotado no Gabinete (adicionamos): deve ver em "recebidos".
    db.add(LotacaoUsuario(tenant_id=tenant_id, user_id=cenario["user"].id, unidade_id=gabinete.id))
    await db.commit()

    res = await client.get("/api/govpro/v1/minha-caixa/recebidos", headers=headers)
    assert str(processo.id) in {p["id"] for p in res.json()}


async def test_concluidos(cenario, client):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)

    await tramitacao_service.concluir_na_unidade(
        db, tenant_id, cenario["user"], processo_id=processo.id, unidade_id=cenario["unidade"].id
    )

    token = _token(cenario["user"], tenant_id)
    res = await client.get(
        "/api/govpro/v1/minha-caixa/concluidos", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert str(processo.id) in {p["id"] for p in res.json()}


async def test_minha_caixa_exige_autenticacao(client):
    res = await client.get("/api/govpro/v1/minha-caixa/recebidos")
    assert res.status_code == 401
