"""Testes HTTP dos endpoints públicos de catálogo do portal do cidadão."""

from sqlalchemy import select

from app.models.dominio import TipoProcesso


async def test_listar_organizacoes_publicas(cenario, client):
    res = await client.get("/api/govpro/v1/public/organizacoes")
    assert res.status_code == 200
    data = res.json()
    assert any(o["slug"] == "mun-teste" for o in data)
    for o in data:
        assert "slug" in o and "nome" in o


async def test_tipos_processo_publicos(cenario, client):
    res = await client.get(
        "/api/govpro/v1/public/tipos-processo", params={"org_slug": "mun-teste"}
    )
    assert res.status_code == 200
    data = res.json()
    codigos = {t["codigo"] for t in data}
    # Os 5 tipos do seed são publico_externo=True; todos devem aparecer.
    assert {"REQ_GERAL", "ESIC", "LICENCA_OBRA", "CERTIDAO", "RECURSO"} <= codigos


async def test_tipos_processo_publicos_org_inexistente(cenario, client):
    res = await client.get(
        "/api/govpro/v1/public/tipos-processo", params={"org_slug": "nao-existe"}
    )
    assert res.status_code == 404


async def test_tipos_processo_publicos_respeita_publico_externo(cenario, client):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == "ESIC"
        )
    )
    tipo_esic = result.scalar_one()
    tipo_esic.publico_externo = False
    await db.commit()

    res = await client.get(
        "/api/govpro/v1/public/tipos-processo", params={"org_slug": "mun-teste"}
    )
    assert res.status_code == 200
    codigos = {t["codigo"] for t in res.json()}
    assert "ESIC" not in codigos
    assert "REQ_GERAL" in codigos
