"""Painéis por perfil, motivo de parada e ajustes da prefeitura."""

import pytest

pytestmark = pytest.mark.asyncio


async def _novo(cliente, **extra):
    corpo = {"titulo": "Carro doado pelo deputado", "tipo": "AQUISICAO", **extra}
    r = await cliente.post("/pedidos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


async def test_motivo_de_parada_aparece_e_some_quando_o_pedido_anda(como, assessor):
    async with como(assessor) as c:
        p = await _novo(c)
        assert p["situacao_desde"] is not None
        assert p["dias_na_situacao"] == 0

        r = await c.post(
            f"/pedidos/{p['id']}/parada",
            json={"motivo": "ASSINATURA", "texto": "Prefeito viajando"},
        )
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["motivo_parada"] == "ASSINATURA"
        assert p["motivo_parada_texto"] == "Prefeito viajando"
        assert p["andamentos"][-1]["tipo"] == "PARADA"

        r = await c.post(
            f"/pedidos/{p['id']}/encaminhar",
            json={"setor": "JURIDICO", "assunto": "Elaborar ofício"},
        )
        p = r.json()
        assert p["motivo_parada"] is None
        assert p["setor_atual"] == "JURIDICO"


async def test_aguardar_governo_marca_o_motivo(como, assessor):
    async with como(assessor) as c:
        p = await _novo(c)
        r = await c.post(
            f"/pedidos/{p['id']}/aguardar-terceiro", json={"texto": "Protocolado na SEDUR"}
        )
        p = r.json()
        assert p["situacao"] == "AGUARDANDO_TERCEIRO"
        assert p["motivo_parada"] == "GOVERNO"
        assert p["motivo_parada_texto"] == "Protocolado na SEDUR"


async def test_departamento_nao_define_parada_de_pedido_alheio(como, assessor, engenheiro):
    async with como(assessor) as c:
        p = await _novo(c)
    async with como(engenheiro) as c:
        r = await c.post(f"/pedidos/{p['id']}/parada", json={"motivo": "OUTRO"})
    assert r.status_code == 403


async def test_painel_do_prefeito(como, assessor, prefeito):
    async with como(assessor) as c:
        await _novo(
            c,
            origem="DEPUTADO",
            origem_nome="Deputado Fulano",
            valor_previsto="134000.00",
            emenda="EM 2026/123",
        )
        obra = await _novo(c, titulo="Pavimentação do Bairro Novo", tipo="OBRA")
        await c.post(
            f"/pedidos/{obra['id']}/encaminhar",
            json={"setor": "ENGENHARIA", "assunto": "Projeto básico"},
        )
    async with como(prefeito) as c:
        r = await c.get("/painel/prefeito")
    assert r.status_code == 200, r.text
    painel = r.json()
    assert painel["kpis"]["em_andamento"] == 2
    assert painel["dias_alerta_parado"] == 15
    assert painel["por_parlamentar"][0]["rotulo"] == "Deputado Fulano"
    assert float(painel["por_parlamentar"][0]["valor"]) == 134000.0
    assert [g["setor"] for g in painel["gargalos"]] == ["ENGENHARIA"]
    assert painel["obras"][0]["titulo"] == "Pavimentação do Bairro Novo"
    assert painel["recentes"]


async def test_departamento_nao_ve_painel_do_prefeito(como, engenheiro):
    async with como(engenheiro) as c:
        r = await c.get("/painel/prefeito")
    assert r.status_code == 403


async def test_painel_do_assessor_e_ajustes(como, assessor, prefeito):
    async with como(assessor) as c:
        await _novo(c)
        r = await c.get("/painel/assessor")
        assert r.status_code == 200, r.text
        assert r.json()["contagens"]["caixa"] == 1

        r = await c.patch("/ajustes", json={"dias_alerta_parado": 7})
        assert r.status_code == 200, r.text
        r = await c.get("/painel/assessor")
        assert r.json()["dias_alerta_parado"] == 7

    async with como(prefeito) as c:
        r = await c.patch("/ajustes", json={"dias_alerta_parado": 3})
        assert r.status_code == 403
        r = await c.get("/painel/assessor")
        assert r.status_code == 403


async def test_filtro_por_parlamentar(como, assessor):
    async with como(assessor) as c:
        await _novo(c, origem="DEPUTADO", origem_nome="Deputado Fulano")
        await _novo(c, titulo="Outro pedido")
        r = await c.get("/pedidos", params={"parlamentar": "deputado fulano"})
    assert r.json()["total"] == 1


async def test_parado_ha_muito_tempo_entra_no_painel(como, assessor, prefeito):
    import uuid
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import update

    from app.core.database import async_session
    from app.models.pedido import Pedido

    async with como(assessor) as c:
        p = await _novo(c)
    async with async_session() as s:
        await s.execute(
            update(Pedido)
            .where(Pedido.id == uuid.UUID(p["id"]))
            .values(situacao_desde=datetime.now(timezone.utc) - timedelta(days=20))
        )
        await s.commit()
    async with como(prefeito) as c:
        painel = (await c.get("/painel/prefeito")).json()
    assert painel["kpis"]["parados"] == 1
    assert painel["parados"][0]["dias_na_situacao"] == 20
