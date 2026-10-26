"""Fase 8 — estoque, almoxarifado e assistência farmacêutica (B.4-001…043).

Ledger imutável, saldo em data, custo médio, FEFO, bloqueio/vencimento de
lote, requisição com atendimento parcial e aceite/recusa, inventário,
competência, dispensação com duplicidade bloqueante justificável, controlados,
temperatura, alertas estatísticos, curva ABC, sugestão de compra e
disponibilidade na prescrição. Inclui negativos de tenant, RBAC e escopo.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from tests.conftest import _criar_usuario

from app.models.auditoria import AuditTrail

API = "/api/govsaude/v1/estoque"


def _ha(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def _validade(dias=365) -> str:
    return (date.today() + timedelta(days=dias)).isoformat()


async def _produto(client, token, codigo="AMOX500", **extra):
    corpo = {"codigo": codigo, "nome": f"Produto {codigo}", "tipo": "MEDICAMENTO", "unidade": "CP", **extra}
    r = await client.post(f"{API}/produtos", json=corpo, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()


async def _local(client, token, mundo, nome="Farmácia UBS A", estab="estab_a", **extra):
    r = await client.post(f"{API}/locais", json={"estabelecimento_id": str(mundo[estab].id), "nome": nome, "tipo": "FARMACIA", **extra}, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()


async def _entrada(client, token, local, produto, qtd, lote="L1", custo=1.0, validade=None, quem="admin", **extra):
    corpo = {"local_id": local["id"], "produto_id": produto["id"], "tipo": "ENTRADA", "quantidade": qtd,
             "lote_numero": lote, "validade": validade or _validade(), "custo_unitario": custo, **extra}
    return await client.post(f"{API}/movimentacoes", json=corpo, headers=token(quem))


async def _saida(client, token, local, produto, qtd, quem="admin", **extra):
    corpo = {"local_id": local["id"], "produto_id": produto["id"], "tipo": "SAIDA", "quantidade": qtd, **extra}
    return await client.post(f"{API}/movimentacoes", json=corpo, headers=token(quem))


async def _cidadao(client, token, nome="Paciente Farmácia"):
    r = await client.post("/api/govsaude/v1/cidadaos", json={"nome": nome, "sexo": "FEMININO", "data_nascimento": "1980-05-05"}, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_b4_001_003_cadastros_isolados_e_restritos(client, token, mundo):
    prod = await _produto(client, token)
    assert (await client.post(f"{API}/produtos", json={"codigo": "AMOX500", "nome": "Dup", "tipo": "MEDICAMENTO", "unidade": "CP"}, headers=token("admin"))).status_code == 409
    assert (await client.post(f"{API}/produtos", json={"codigo": "X", "nome": "Xx", "tipo": "REMEDIO", "unidade": "CP"}, headers=token("admin"))).status_code == 422
    assert (await client.post(f"{API}/produtos", json={"codigo": "Y", "nome": "Yy", "tipo": "MEDICAMENTO", "unidade": "CP", "lista_controle": "Z"}, headers=token("admin"))).status_code == 422
    assert (await client.post(f"{API}/produtos", json={"codigo": "Z", "nome": "Zz", "tipo": "MEDICAMENTO", "unidade": "CP"}, headers=token("medico"))).status_code == 403
    assert (await client.get(f"{API}/produtos", headers=token("admin_b"))).json() == []
    assert (await client.patch(f"{API}/produtos/{prod['id']}", json={"remume": True}, headers=token("admin"))).status_code == 428
    ok = await client.patch(f"{API}/produtos/{prod['id']}", json={"remume": True}, headers={**token("admin"), "If-Match": '"1"'})
    assert ok.status_code == 200 and ok.json()["remume"] is True and ok.json()["versao"] == 2

    loc_b = await _local(client, token, mundo, nome="Almoxarifado UBS B", estab="estab_b", temperatura_min=2, temperatura_max=8)
    assert (await client.post(f"{API}/locais", json={"estabelecimento_id": str(mundo["estab_a"].id), "nome": "X1", "tipo": "SALA", "temperatura_min": 8, "temperatura_max": 2}, headers=token("admin"))).status_code == 422
    # Gestor só tem escopo na UBS A: local da UBS B não existe para ele.
    assert all(x["id"] != loc_b["id"] for x in (await client.get(f"{API}/locais", headers=token("gestor"))).json())
    assert (await client.get(f"{API}/locais/{loc_b['id']}/saldos", headers=token("gestor"))).status_code == 404
    assert (await client.get(f"{API}/locais/{loc_b['id']}/saldos", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b4_006_009_012_027_ledger_saldo_em_data_custo_medio_e_fefo(client, token, mundo, db):
    prod = await _produto(client, token)
    loc = await _local(client, token, mundo)
    sem_custo = await client.post(f"{API}/movimentacoes", json={"local_id": loc["id"], "produto_id": prod["id"], "tipo": "ENTRADA", "quantidade": 1, "lote_numero": "L0", "validade": _validade()}, headers=token("admin"))
    assert sem_custo.json()["codigo"] == "custo_obrigatorio"
    assert (await _entrada(client, token, loc, prod, 100, lote="L-TARDE", custo=1.0, validade=_validade(300), ocorrido_em=_ha(days=10))).status_code == 201
    assert (await _entrada(client, token, loc, prod, 100, lote="L-CEDO", custo=2.0, validade=_validade(60), ocorrido_em=_ha(days=5))).status_code == 201
    divergente = await _entrada(client, token, loc, prod, 1, lote="L-CEDO", validade=_validade(99))
    assert divergente.json()["codigo"] == "lote_validade_divergente"

    saida = await _saida(client, token, loc, prod, 120)
    assert saida.status_code == 201, saida.text
    assert [m["quantidade"] for m in saida.json()] == [-100, -20], "FEFO: vence antes, sai antes"
    assert saida.json()[0]["custo_unitario"] == 1.5
    falta = await _saida(client, token, loc, prod, 1000)
    assert falta.status_code == 409 and falta.json()["codigo"] == "saldo_insuficiente"
    assert (await _saida(client, token, loc, prod, 1, tipo="PERDA")).json()["codigo"] == "motivo_obrigatorio"
    assert (await _saida(client, token, loc, prod, 1, ocorrido_em=_ha(days=-2))).json()["codigo"] == "data_futura"

    hoje = await client.get(f"{API}/locais/{loc['id']}/saldos", headers=token("gestor"))
    item = hoje.json()["itens"][0]
    assert item["quantidade"] == 80 and item["custo_medio"] == 1.5 and item["custo_ultima_aquisicao"] == 2.0
    assert item["valor_total"] == 120.0
    passado = await client.get(f"{API}/locais/{loc['id']}/saldos", params={"em": (date.today() - timedelta(days=7)).isoformat()}, headers=token("gestor"))
    assert passado.json()["itens"][0]["quantidade"] == 100, "saldo em qualquer data"

    extrato = await client.get(f"{API}/locais/{loc['id']}/movimentacoes", headers=token("gestor"))
    assert len(extrato.json()) == 4
    assert (await _saida(client, token, loc, prod, 1, quem="medico")).status_code == 403
    ajuste_sem_perm = await client.post(f"{API}/movimentacoes", json={"local_id": loc["id"], "produto_id": prod["id"], "tipo": "AJUSTE_NEGATIVO", "quantidade": 1, "motivo": "Quebra na conferência"}, headers=token("acs"))
    assert ajuste_sem_perm.status_code == 403
    assert (await db.scalar(select(AuditTrail.id).where(AuditTrail.recurso == "movimentacao_estoque"))) is not None


@pytest.mark.asyncio
async def test_b4_002_012_016_lote_bloqueado_vencido_e_alertas(client, token, mundo):
    prod = await _produto(client, token)
    loc = await _local(client, token, mundo)
    await client.put(f"{API}/locais/{loc['id']}/parametros", json={"produto_id": prod["id"], "minimo": 50, "maximo": 200, "ponto_pedido": 80}, headers=token("admin"))
    assert (await client.put(f"{API}/locais/{loc['id']}/parametros", json={"produto_id": prod["id"], "minimo": 10, "maximo": 5}, headers=token("admin"))).status_code == 422
    entrada = await _entrada(client, token, loc, prod, 30, lote="L-PERTO", validade=_validade(20))
    lote_id = entrada.json()[0]["lote_id"]
    await _entrada(client, token, loc, prod, 5, lote="L-VENCIDO", validade=(date.today() - timedelta(days=1)).isoformat())

    bloq = await client.post(f"{API}/lotes/{lote_id}/bloqueio", json={"bloqueado": True, "motivo": "Alerta sanitário"}, headers=token("admin"))
    assert bloq.status_code == 200 and bloq.json()["bloqueado"] is True
    assert (await client.post(f"{API}/lotes/{lote_id}/bloqueio", json={"bloqueado": True, "motivo": "De novo"}, headers=token("admin"))).status_code == 409
    assert (await _saida(client, token, loc, prod, 1, lote_id=lote_id)).json()["codigo"] == "lote_bloqueado"
    assert (await _saida(client, token, loc, prod, 1)).json()["codigo"] == "saldo_insuficiente", "FEFO ignora bloqueado e vencido"
    vencido_id = (await client.get(f"{API}/produtos/{prod['id']}/lotes", headers=token("gestor"))).json()[0]["id"]
    assert (await _saida(client, token, loc, prod, 1, lote_id=vencido_id)).json()["codigo"] == "lote_vencido"
    nao_vencido = await _saida(client, token, loc, prod, 1, tipo="VENCIMENTO", lote_id=lote_id)
    assert nao_vencido.json()["codigo"] == "lote_nao_vencido"
    baixa = await _saida(client, token, loc, prod, 5, tipo="VENCIMENTO", lote_id=vencido_id, motivo="Vencido no armário", centro_custo="CC-FARMACIA")
    assert baixa.status_code == 201, "vencido sai por baixa de vencimento"
    assert baixa.json()[0]["centro_custo"] == "CC-FARMACIA"
    quebra = await _saida(client, token, loc, prod, 1, tipo="QUEBRA", lote_id=lote_id, motivo="Frasco quebrou")
    assert quebra.status_code == 201, "lote bloqueado pode ser baixado por quebra"

    alertas = (await client.get(f"{API}/locais/{loc['id']}/alertas", headers=token("gestor"))).json()
    assert alertas["abaixo_minimo"][0]["saldo"] == 29
    assert [x["numero"] for x in alertas["a_vencer"]] == ["L-PERTO"]
    assert alertas["vencidos"] == []
    assert alertas["lote_bloqueado"][0]["motivo"] == "Alerta sanitário"
    assert alertas["frascos_abertos"]["situacao"] == "PENDENTE"
    assert (await client.get(f"{API}/locais/{loc['id']}/alertas", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b4_014_015_requisicao_parcial_aceite_e_recusa(client, token, mundo):
    prod = await _produto(client, token)
    outro = await _produto(client, token, codigo="DIPI")
    central = await _local(client, token, mundo, nome="Central", estab="estab_b")
    farmacia = await _local(client, token, mundo, nome="Farmácia")
    await _entrada(client, token, central, prod, 50)

    assert (await client.post(f"{API}/requisicoes", json={"origem_local_id": farmacia["id"], "destino_local_id": farmacia["id"], "itens": [{"produto_id": prod["id"], "quantidade": 1}]}, headers=token("gestor"))).status_code == 422
    req = await client.post(f"{API}/requisicoes", json={"origem_local_id": central["id"], "destino_local_id": farmacia["id"], "itens": [{"produto_id": prod["id"], "quantidade": 80}, {"produto_id": outro["id"], "quantidade": 5}]}, headers=token("gestor"))
    assert req.status_code == 201, req.text
    req = req.json()
    assert req["numero"].endswith("-000001")
    # Gestor não tem escopo na origem (UBS B): não atende.
    assert (await client.post(f"{API}/requisicoes/{req['id']}/atender", json={"itens": [{"produto_id": prod["id"], "quantidade": 50}]}, headers=token("gestor"))).status_code == 404
    pend = (await client.get(f"{API}/locais/{central['id']}/saldos", headers=token("admin"))).json()["pedidos_pendentes"]
    assert pend[0]["papel"] == "FORNECEDOR" and pend[0]["situacao"] == "SOLICITADA"
    excedente = await client.post(f"{API}/requisicoes/{req['id']}/atender", json={"itens": [{"produto_id": prod["id"], "quantidade": 81}]}, headers=token("admin"))
    assert excedente.json()["codigo"] == "quantidade_excedente"
    atendida = await client.post(f"{API}/requisicoes/{req['id']}/atender", json={"itens": [{"produto_id": prod["id"], "quantidade": 50}]}, headers=token("admin"))
    assert atendida.status_code == 200, atendida.text
    assert atendida.json()["situacao"] == "ATENDIDA_PARCIAL"
    saldo_central = (await client.get(f"{API}/locais/{central['id']}/saldos", headers=token("admin"))).json()["itens"]
    assert saldo_central == [], "em trânsito: saiu da origem"
    recebida = await client.post(f"{API}/requisicoes/{req['id']}/receber", headers=token("gestor"))
    assert recebida.status_code == 200 and recebida.json()["situacao"] == "RECEBIDA"
    assert (await client.post(f"{API}/requisicoes/{req['id']}/receber", headers=token("gestor"))).status_code == 409
    farm = (await client.get(f"{API}/locais/{farmacia['id']}/saldos", headers=token("gestor"))).json()["itens"]
    assert farm[0]["quantidade"] == 50 and farm[0]["lotes"][0]["numero"] == "L1"

    req2 = (await client.post(f"{API}/requisicoes", json={"origem_local_id": farmacia["id"], "destino_local_id": central["id"], "itens": [{"produto_id": prod["id"], "quantidade": 10}]}, headers=token("admin"))).json()
    await client.post(f"{API}/requisicoes/{req2['id']}/atender", json={"itens": [{"produto_id": prod["id"], "quantidade": 10}]}, headers=token("admin"))
    recusa = await client.post(f"{API}/requisicoes/{req2['id']}/recusar", json={"motivo": "Embalagem violada"}, headers=token("admin"))
    assert recusa.status_code == 200 and recusa.json()["situacao"] == "RECUSADA"
    farm = (await client.get(f"{API}/locais/{farmacia['id']}/saldos", headers=token("gestor"))).json()["itens"]
    assert farm[0]["quantidade"] == 50, "recusa devolve à origem"
    assert (await client.get(f"{API}/requisicoes/{req['id']}", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b4_017_018_inventario_e_competencia(client, token, mundo):
    prod = await _produto(client, token)
    loc = await _local(client, token, mundo)
    lote_id = (await _entrada(client, token, loc, prod, 40)).json()[0]["lote_id"]
    inv = await client.post(f"{API}/inventarios", json={"local_id": loc["id"]}, headers=token("gestor"))
    assert inv.status_code == 201, inv.text
    assert (await client.post(f"{API}/inventarios", json={"local_id": loc["id"]}, headers=token("gestor"))).status_code == 409
    assert (await _saida(client, token, loc, prod, 1)).json()["codigo"] == "inventario_aberto"
    assert (await client.post(f"{API}/inventarios/{inv.json()['id']}/encerrar", headers=token("gestor"))).json()["codigo"] == "inventario_vazio"
    await client.put(f"{API}/inventarios/{inv.json()['id']}/contagens", json={"contagens": [{"lote_id": lote_id, "quantidade": 37}]}, headers=token("gestor"))
    fim = await client.post(f"{API}/inventarios/{inv.json()['id']}/encerrar", headers=token("gestor"))
    assert fim.status_code == 200 and fim.json()["divergencias"][0]["diferenca"] == -3
    saldo = (await client.get(f"{API}/locais/{loc['id']}/saldos", headers=token("gestor"))).json()["itens"][0]["quantidade"]
    assert saldo == 37
    assert (await client.post(f"{API}/inventarios/{inv.json()['id']}/encerrar", headers=token("gestor"))).status_code == 409
    assert (await client.post(f"{API}/inventarios", json={"local_id": loc["id"]}, headers=token("medico"))).status_code == 403

    passada = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y%m")
    corrente = date.today().strftime("%Y%m")
    assert (await client.post(f"{API}/competencias/{corrente}/encerrar", headers=token("admin"))).json()["codigo"] == "competencia_corrente"
    assert (await client.post(f"{API}/competencias/202613/encerrar", headers=token("admin"))).status_code == 422
    assert (await client.post(f"{API}/competencias/{passada}/encerrar", headers=token("admin"))).status_code == 200
    retro = await _entrada(client, token, loc, prod, 1, lote="L9", ocorrido_em=_ha(days=40))
    assert retro.status_code == 409 and retro.json()["codigo"] == "competencia_encerrada"
    assert (await client.post(f"{API}/competencias/{passada}/reabrir", json={"motivo": "Nota fiscal atrasada"}, headers=token("admin"))).status_code == 200
    assert (await _entrada(client, token, loc, prod, 1, lote="L9", ocorrido_em=_ha(days=40))).status_code == 201


@pytest.mark.asyncio
async def test_b4_020_023_035_dispensacao_parcial_duplicidade_controlado_estorno(client, token, mundo, db):
    prod = await _produto(client, token)
    controlado = await _produto(client, token, codigo="CLON2", controlado=True, lista_controle="LISTA-TENANT")
    loc = await _local(client, token, mundo)
    loc2 = await _local(client, token, mundo, nome="Farmácia 2")
    await _entrada(client, token, loc, prod, 100)
    await _entrada(client, token, loc2, prod, 100)
    await _entrada(client, token, loc, controlado, 10, lote="C1")
    cidadao = await _cidadao(client, token)
    url = f"{API}/dispensacoes"

    d1 = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc["id"], "itens": [{"produto_id": prod["id"], "quantidade": 20, "quantidade_prescrita": 30}]}, headers=token("gestor"))
    assert d1.status_code == 201, d1.text
    assert d1.json()["situacao"] == "PARCIAL" and d1.json()["itens"][0]["lotes"][0]["quantidade"] == 20
    dup = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc2["id"], "itens": [{"produto_id": prod["id"], "quantidade": 10}]}, headers=token("gestor"))
    assert dup.status_code == 409 and dup.json()["codigo"] == "dispensacao_duplicada", "duplicidade em qualquer unidade"
    justificada = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc2["id"], "itens": [{"produto_id": prod["id"], "quantidade": 10}], "justificativa": "Perda do medicamento comprovada por boletim"}, headers=token("gestor"))
    assert justificada.status_code == 201 and justificada.json()["alertas"]["duplicidade"]

    sem_perm = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc["id"], "itens": [{"produto_id": controlado["id"], "quantidade": 1}], "documento": {"numero": "123"}}, headers=token("gestor"))
    assert sem_perm.status_code == 403, "B.4-035: controlado exige estoque:controlados"
    mundo["usuarios"]["farmaceutico"] = await _criar_usuario(db, tenant_id=mundo["org_a"].id, nome="Farmacêutico A", email="farma-a@teste.local", grupo="farmaceutico", estabelecimento_id=mundo["estab_a"].id)
    await db.commit()
    sem_doc = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc["id"], "itens": [{"produto_id": controlado["id"], "quantidade": 1}]}, headers=token("farmaceutico"))
    assert sem_doc.json()["codigo"] == "documento_obrigatorio"
    com_doc = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc["id"], "itens": [{"produto_id": controlado["id"], "quantidade": 1}], "documento": {"numero": "123"}}, headers=token("farmaceutico"))
    assert com_doc.status_code == 201, com_doc.text
    comp = await client.get(f"{url}/{com_doc.json()['id']}/comprovante", headers=token("farmaceutico"))
    assert comp.status_code == 200 and comp.json()["itens"][0]["lote"] == "C1" and comp.json()["profissional"] == "Farmacêutico A"
    assert (await client.get(f"{url}/{com_doc.json()['id']}/comprovante", headers=token("admin_b"))).status_code == 404

    est = await client.post(f"{url}/{d1.json()['id']}/estornar", json={"motivo": "Lançado no cidadão errado"}, headers=token("gestor"))
    assert est.status_code == 200 and est.json()["estornada_em"]
    assert (await client.post(f"{url}/{d1.json()['id']}/estornar", json={"motivo": "Lançado de novo"}, headers=token("gestor"))).status_code == 409
    saldo = (await client.get(f"{API}/locais/{loc['id']}/saldos", params={"produto_id": prod["id"]}, headers=token("gestor"))).json()["itens"][0]["quantidade"]
    assert saldo == 100
    hist = await client.get(f"{API}/cidadaos/{cidadao}/dispensacoes", headers=token("gestor"))
    assert len(hist.json()) == 3
    assert (await client.post(url, json={"cidadao_id": cidadao, "local_id": loc["id"], "itens": [{"produto_id": prod["id"], "quantidade": 1}]}, headers=token("medico"))).status_code == 403
    assert (await client.get(f"{API}/cidadaos/{cidadao}/dispensacoes", headers=token("admin_b"))).status_code == 404
    repetido = await client.post(url, json={"cidadao_id": cidadao, "local_id": loc["id"], "itens": [{"produto_id": prod["id"], "quantidade": 1}, {"produto_id": prod["id"], "quantidade": 1}]}, headers=token("gestor"))
    assert repetido.status_code == 422


@pytest.mark.asyncio
async def test_b4_005_016_019_026_037_indicadores_temperatura_e_disponibilidade(client, token, mundo):
    prod = await _produto(client, token, codigo_obm="OBM-TESTE-1")
    barato = await _produto(client, token, codigo="BARATO")
    loc = await _local(client, token, mundo, temperatura_min=2, temperatura_max=8)
    await _entrada(client, token, loc, prod, 1000, custo=10.0, ocorrido_em=_ha(days=200))
    await _entrada(client, token, loc, barato, 1000, lote="B1", custo=0.1, ocorrido_em=_ha(days=200))
    # Consumo estável nos meses fechados e pico nos últimos 30 dias.
    hoje = date.today().replace(day=15)
    for k, qtd in zip(range(6, 0, -1), [10, 12, 10, 12, 10, 12]):
        mes = (hoje.month - 1 - k) % 12 + 1
        ano = hoje.year + (hoje.month - 1 - k) // 12
        quando = datetime(ano, mes, 15, 12, tzinfo=timezone.utc).isoformat()
        assert (await _saida(client, token, loc, prod, qtd, ocorrido_em=quando)).status_code == 201
    await _saida(client, token, loc, prod, 200, ocorrido_em=_ha(hours=1))
    await _saida(client, token, loc, barato, 5, ocorrido_em=_ha(hours=1))

    alertas = (await client.get(f"{API}/locais/{loc['id']}/alertas", headers=token("gestor"))).json()
    anormal = alertas["consumo_anormal"]
    assert [a["produto_id"] for a in anormal] == [prod["id"]] and "desvio_padrao" in anormal[0]["regra"]

    inicio = (date.today() - timedelta(days=2)).isoformat()
    abc = (await client.get(f"{API}/locais/{loc['id']}/curva-abc", params={"inicio": inicio, "fim": date.today().isoformat()}, headers=token("gestor"))).json()
    assert [(i["produto_id"], i["classe"]) for i in abc["itens"]] == [(prod["id"], "A"), (barato["id"], "C")]
    assert (await client.get(f"{API}/locais/{loc['id']}/curva-abc", params={"inicio": date.today().isoformat(), "fim": inicio}, headers=token("gestor"))).status_code == 422

    await client.put(f"{API}/locais/{loc['id']}/parametros", json={"produto_id": prod["id"], "maximo": 1200, "ideal": 1000}, headers=token("admin"))
    sug = (await client.get(f"{API}/locais/{loc['id']}/sugestao-compra", headers=token("gestor"))).json()
    item = next(i for i in sug["itens"] if i["produto_id"] == prod["id"])
    assert item["quantidade_sugerida"] == 1000 - item["memoria_calculo"]["saldo_atual"]
    assert item["memoria_calculo"]["origem_alvo"] == "parametro_ideal" and item["memoria_calculo"]["formula"]

    fora = await client.post(f"{API}/locais/{loc['id']}/temperaturas", json={"temperatura": 11.5}, headers=token("gestor"))
    assert fora.status_code == 201 and fora.json()["fora_da_faixa"] is True
    dentro = await client.post(f"{API}/locais/{loc['id']}/temperaturas", json={"temperatura": 5}, headers=token("gestor"))
    assert dentro.json()["fora_da_faixa"] is False
    alertas = (await client.get(f"{API}/locais/{loc['id']}/alertas", headers=token("gestor"))).json()
    assert len(alertas["temperatura_fora_da_faixa"]) == 1
    assert (await client.post(f"{API}/locais/{loc['id']}/temperaturas", json={"temperatura": 5}, headers=token("medico"))).status_code == 403

    # B.6-019 — a prescrição consulta a disponibilidade nos locais do estabelecimento.
    cidadao = await _cidadao(client, token)
    at = await client.post("/api/govsaude/v1/prontuarios/atendimentos", json={"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "iniciado_em": _ha(minutes=1)}, headers=token("medico"))
    presc = await client.post(f"/api/govsaude/v1/prontuarios/atendimentos/{at.json()['id']}/prescricoes", json={"itens": [
        {"medicamento_codigo": "OBM-TESTE-1", "descricao": "Produto", "posologia": "1x"},
        {"medicamento_codigo": "OBM-INEXISTENTE", "descricao": "Outro", "posologia": "1x"},
    ]}, headers=token("medico"))
    disp = presc.json()["alertas"]["disponibilidade_estoque"]
    assert disp["situacao"] == "AVALIADO"
    assert disp["itens"][0]["disponivel"] is True and disp["itens"][0]["saldo"] > 0
    assert disp["itens"][1]["disponivel"] is None
