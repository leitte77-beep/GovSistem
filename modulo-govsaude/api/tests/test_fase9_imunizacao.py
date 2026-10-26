"""Fase 9 — imunização (B.7-001…013, B.7-024…029).

Esquemas versionados (dados de teste, não o calendário oficial), regras com
alerta/bloqueio e exceção justificada, lote vencido/interditado, baixa de
estoque e de frasco multidose, descarte de frascos, registro externo,
agendamento, aprazamento, busca ativa, carteira com QR verificável,
retificação e RNDS pendente. Inclui negativos de tenant e RBAC.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

V1 = "/api/govsaude/v1"
API = f"{V1}/imunizacao"


def _ha(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


async def _cidadao(client, token, nascimento: date, nome="Criança Teste", sexo="FEMININO"):
    r = await client.post(f"{V1}/cidadaos", json={"nome": nome, "sexo": sexo, "data_nascimento": nascimento.isoformat()}, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _estoque(client, token, mundo, codigo="VAC-X", lote="L1", qtd=10, validade_dias=200):
    prod = await client.post(f"{V1}/estoque/produtos", json={"codigo": codigo, "nome": f"Vacina {codigo}", "tipo": "VACINA", "unidade": "FR"}, headers=token("admin"))
    assert prod.status_code == 201, prod.text
    loc = await client.post(f"{V1}/estoque/locais", json={"estabelecimento_id": str(mundo["estab_a"].id), "nome": f"Sala de vacina {codigo}", "tipo": "SALA_VACINA"}, headers=token("admin"))
    ent = await client.post(f"{V1}/estoque/movimentacoes", json={"local_id": loc.json()["id"], "produto_id": prod.json()["id"], "tipo": "ENTRADA", "quantidade": qtd, "lote_numero": lote, "validade": (date.today() + timedelta(days=validade_dias)).isoformat(), "custo_unitario": 1}, headers=token("admin"))
    assert ent.status_code == 201, ent.text
    return prod.json(), loc.json(), ent.json()[0]["lote_id"]


async def _vacina(client, token, prod, codigo="VAC-X", **extra):
    r = await client.post(f"{API}/vacinas", json={"codigo": codigo, "nome": f"Vacina {codigo}", "produto_id": prod["id"], **extra}, headers=token("gestor"))
    assert r.status_code == 201, r.text
    return r.json()


async def _esquema(client, token, vacina, doses, acao="BLOQUEAR", codigo="ESQ-X", ativar=True):
    r = await client.post(f"{API}/esquemas", json={"vacina_id": vacina["id"], "codigo": codigo, "nome": "Esquema de teste", "vigencia_inicio": "2020-01-01", "acao_violacao": acao, "doses": doses}, headers=token("gestor"))
    assert r.status_code == 201, r.text
    if ativar:
        r = await client.post(f"{API}/esquemas/{r.json()['id']}/ativacao", json={"ativo": True, "fonte_normativa": "Documento de teste (sintético)"}, headers=token("gestor"))
        assert r.status_code == 200, r.text
    return r.json()


def _aplicacao(cidadao, vacina, loc, lote, dose="D1", **extra):
    return {"cidadao_id": cidadao, "vacina_id": vacina["id"], "dose": dose, "local_id": loc["id"], "lote_id": lote, **extra}


@pytest.mark.asyncio
async def test_b7_001_029_cadastro_e_esquema_versionado_com_fonte(client, token, mundo):
    prod, _, _ = await _estoque(client, token, mundo)
    remedio = await client.post(f"{V1}/estoque/produtos", json={"codigo": "REM", "nome": "Remédio", "tipo": "MEDICAMENTO", "unidade": "CP"}, headers=token("admin"))
    assert (await client.post(f"{API}/vacinas", json={"codigo": "M", "nome": "Multi", "doses_por_frasco": 10}, headers=token("gestor"))).status_code == 422
    assert (await client.post(f"{API}/vacinas", json={"codigo": "R", "nome": "Rem", "produto_id": remedio.json()["id"]}, headers=token("gestor"))).json()["codigo"] == "produto_nao_vacina"
    assert (await client.post(f"{API}/vacinas", json={"codigo": "Z", "nome": "Zz"}, headers=token("medico"))).status_code == 403
    vacina = await _vacina(client, token, prod)
    assert (await client.get(f"{API}/vacinas", headers=token("admin_b"))).json() == []

    v1 = await _esquema(client, token, vacina, [{"dose": "D1", "ordem": 1}], ativar=False)
    sem_fonte = await client.post(f"{API}/esquemas/{v1['id']}/ativacao", json={"ativo": True}, headers=token("gestor"))
    assert sem_fonte.status_code == 422 and sem_fonte.json()["codigo"] == "fonte_normativa_obrigatoria"
    await client.post(f"{API}/esquemas/{v1['id']}/ativacao", json={"ativo": True, "fonte_normativa": "Nota técnica de teste"}, headers=token("gestor"))
    v2 = await _esquema(client, token, vacina, [{"dose": "D1", "ordem": 1}, {"dose": "D2", "ordem": 2}])
    assert v2["numero_versao"] == 2
    versoes = {e["numero_versao"]: e for e in (await client.get(f"{API}/esquemas", headers=token("gestor"))).json()}
    assert versoes[1]["ativo"] is False and versoes[1]["vigencia_fim"] is not None, "anterior preservada e encerrada"
    duplicada = await client.post(f"{API}/esquemas", json={"vacina_id": vacina["id"], "codigo": "E2", "nome": "Dup", "vigencia_inicio": "2020-01-01", "doses": [{"dose": "D1", "ordem": 1}, {"dose": "D1", "ordem": 2}]}, headers=token("gestor"))
    assert duplicada.status_code == 422


@pytest.mark.asyncio
async def test_b7_002_009_010_027_regras_excecao_lote_e_baixa_de_estoque(client, token, mundo):
    prod, loc, lote = await _estoque(client, token, mundo)
    vacina = await _vacina(client, token, prod)
    sem_regra = await client.post(f"{API}/aplicacoes", json=_aplicacao(await _cidadao(client, token, date.today() - timedelta(days=400)), vacina, loc, lote), headers=token("gestor"))
    assert sem_regra.status_code == 201 and sem_regra.json()["alertas"][0]["codigo"] == "SEM_ESQUEMA_ATIVO"

    await _esquema(client, token, vacina, [{"dose": "D1", "ordem": 1, "idade_min_dias": 60}, {"dose": "D2", "ordem": 2, "intervalo_min_dias": 30}])
    bebe = await _cidadao(client, token, date.today() - timedelta(days=30), nome="Bebê Novo")
    bloqueada = await client.post(f"{API}/aplicacoes", json=_aplicacao(bebe, vacina, loc, lote), headers=token("gestor"))
    assert bloqueada.status_code == 409 and bloqueada.json()["codigo"] == "regra_vacinal"
    excecao = await client.post(f"{API}/aplicacoes", json=_aplicacao(bebe, vacina, loc, lote, excecao_justificativa="Indicação clínica documentada pelo pediatra"), headers=token("gestor"))
    assert excecao.status_code == 201, excecao.text
    assert excecao.json()["alertas"][0]["codigo"] == "ABAIXO_DA_IDADE_MINIMA" and excecao.json()["excecao_justificativa"]
    cedo = await client.post(f"{API}/aplicacoes", json=_aplicacao(bebe, vacina, loc, lote, dose="D2"), headers=token("gestor"))
    assert "INTERVALO_MINIMO" in str(cedo.json())
    repetida = await client.post(f"{API}/aplicacoes", json=_aplicacao(bebe, vacina, loc, lote), headers=token("gestor"))
    assert "DOSE_JA_APLICADA" in str(repetida.json())

    saldo = (await client.get(f"{V1}/estoque/locais/{loc['id']}/saldos", headers=token("admin"))).json()["itens"][0]["quantidade"]
    assert saldo == 8, "duas aplicações monodose baixaram o estoque"
    await client.post(f"{V1}/estoque/lotes/{lote}/bloqueio", json={"bloqueado": True, "motivo": "Interdição sanitária"}, headers=token("admin"))
    adulto = await _cidadao(client, token, date.today() - timedelta(days=5000), nome="Adulto")
    interditado = await client.post(f"{API}/aplicacoes", json=_aplicacao(adulto, vacina, loc, lote, excecao_justificativa="x" * 30), headers=token("gestor"))
    assert interditado.status_code == 409 and interditado.json()["codigo"] == "lote_bloqueado", "sem exceção"
    _, loc2, vencido = await _estoque(client, token, mundo, codigo="VAC-V", lote="VENC", validade_dias=-1)
    vac2 = await _vacina(client, token, {"id": (await client.get(f"{V1}/estoque/produtos", params={"busca": "VAC-V"}, headers=token("admin"))).json()[0]["id"]}, codigo="VAC-V")
    assert (await client.post(f"{API}/aplicacoes", json=_aplicacao(adulto, vac2, loc2, vencido), headers=token("gestor"))).json()["codigo"] == "lote_vencido"
    assert (await client.post(f"{API}/aplicacoes", json=_aplicacao(adulto, vacina, loc, lote), headers=token("medico"))).status_code == 403


@pytest.mark.asyncio
async def test_b7_003_004_005_026_frasco_multidose_descarte_e_perdas(client, token, mundo):
    prod, loc, lote = await _estoque(client, token, mundo, codigo="VAC-M", qtd=5)
    vacina = await _vacina(client, token, prod, codigo="VAC-M", doses_por_frasco=2, validade_pos_abertura_horas=6)
    cidadao = await _cidadao(client, token, date.today() - timedelta(days=9000), nome="Adulto Multi")
    outro = await _cidadao(client, token, date.today() - timedelta(days=9000), nome="Outro Multi")
    sem_frasco = await client.post(f"{API}/aplicacoes", json=_aplicacao(cidadao, vacina, loc, lote), headers=token("gestor"))
    assert sem_frasco.json()["codigo"] == "sem_frasco_aberto"
    frasco = await client.post(f"{API}/frascos", json={"vacina_id": vacina["id"], "local_id": loc["id"], "lote_id": lote}, headers=token("gestor"))
    assert frasco.status_code == 201, frasco.text
    assert frasco.json()["doses_total"] == 2 and frasco.json()["usar_ate"]
    for c in (cidadao, outro):
        assert (await client.post(f"{API}/aplicacoes", json=_aplicacao(c, vacina, loc, lote), headers=token("gestor"))).status_code == 201
    esgotados = (await client.get(f"{API}/locais/{loc['id']}/frascos", params={"situacao": "ESGOTADO"}, headers=token("gestor"))).json()
    assert len(esgotados) == 1 and esgotados[0]["doses_aplicadas"] == 2

    velho = await client.post(f"{API}/frascos", json={"vacina_id": vacina["id"], "local_id": loc["id"], "lote_id": lote, "aberto_em": _ha(hours=7)}, headers=token("gestor"))
    terceiro = await _cidadao(client, token, date.today() - timedelta(days=9000), nome="Terceiro Multi")
    vencido = await client.post(f"{API}/aplicacoes", json=_aplicacao(terceiro, vacina, loc, lote, frasco_id=velho.json()["id"]), headers=token("gestor"))
    assert vencido.json()["codigo"] == "frasco_vencido"
    desc = await client.post(f"{API}/frascos/descartar-vencidos", headers=token("gestor"))
    assert desc.json() == {"descartados": 1}
    descartado = (await client.get(f"{API}/locais/{loc['id']}/frascos", params={"situacao": "DESCARTADO"}, headers=token("gestor"))).json()[0]
    assert descartado["doses_perdidas"] == 2 and descartado["descarte_automatico"] is True
    saldo = (await client.get(f"{V1}/estoque/locais/{loc['id']}/saldos", headers=token("admin"))).json()["itens"][0]["quantidade"]
    assert saldo == 3, "cada abertura retira um frasco"
    hoje = date.today().isoformat()
    rel = await client.get(f"{API}/relatorios/locais/{loc['id']}/frascos", params={"inicio": (date.today() - timedelta(days=1)).isoformat(), "fim": hoje}, headers=token("gestor"))
    assert rel.json()["linhas"] == [{"chave": "L1", "frascos_abertos": 2, "doses_aplicadas": 2, "doses_perdidas": 2, "descartados": 1, "saldo_frascos": 3}]
    assert (await client.post(f"{API}/frascos/{descartado['id']}/descartar", json={"motivo": "De novo"}, headers=token("gestor"))).status_code == 409
    assert (await client.get(f"{API}/locais/{loc['id']}/frascos", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b7_006_007_008_011_024_agenda_externo_aprazamento_busca_ativa(client, token, mundo):
    prod, loc, lote = await _estoque(client, token, mundo)
    vacina = await _vacina(client, token, prod)
    await _esquema(client, token, vacina, [{"dose": "D1", "ordem": 1, "idade_min_dias": 0}, {"dose": "D2", "ordem": 2, "intervalo_min_dias": 30}], acao="ALERTAR")
    crianca = await _cidadao(client, token, date.today() - timedelta(days=200), nome="Criança Atrasada")
    sem_local = await client.post(f"{API}/aplicacoes", json={"cidadao_id": crianca, "vacina_id": vacina["id"], "dose": "D1", "origem": "EXTERNA", "aplicada_em": _ha(days=40)}, headers=token("gestor"))
    assert sem_local.json()["codigo"] == "local_externo_obrigatorio"
    externa = await client.post(f"{API}/aplicacoes", json={"cidadao_id": crianca, "vacina_id": vacina["id"], "dose": "D1", "origem": "EXTERNA", "aplicada_em": _ha(days=40), "local_externo": "Clínica particular", "lote_externo": "EXT-9"}, headers=token("gestor"))
    assert externa.status_code == 201, externa.text
    assert any(a["codigo"] == "REGISTRO_EXTERNO" for a in externa.json()["alertas"]) and externa.json()["lote_id"] is None
    saldo = (await client.get(f"{V1}/estoque/locais/{loc['id']}/saldos", headers=token("admin"))).json()["itens"][0]["quantidade"]
    assert saldo == 10, "registro externo não movimenta estoque"

    aprazado = (await client.get(f"{API}/cidadaos/{crianca}/aprazamento", headers=token("gestor"))).json()
    assert aprazado[0]["dose"] == "D2" and aprazado[0]["situacao"] == "ATRASADA" and aprazado[0]["dias_atraso"] == 10
    busca = (await client.get(f"{API}/busca-ativa", headers=token("gestor"))).json()
    assert [b["cidadao_id"] for b in busca] == [crianca]

    ag = await client.post(f"{API}/agendamentos", json={"cidadao_id": crianca, "estabelecimento_id": str(mundo["estab_a"].id), "vacina_id": vacina["id"], "dose": "D2", "data_prevista": date.today().isoformat()}, headers=token("gestor"))
    assert ag.status_code == 201, ag.text
    falta = await client.post(f"{API}/agendamentos/{ag.json()['id']}/falta", json={"motivo": "Não compareceu"}, headers=token("gestor"))
    assert falta.json()["situacao"] == "FALTOU"
    novo = await client.post(f"{API}/agendamentos/{ag.json()['id']}/reagendar", json={"data_prevista": date.today().isoformat(), "motivo": "Responsável remarcou"}, headers=token("gestor"))
    assert novo.status_code == 201
    apl = await client.post(f"{API}/aplicacoes", json=_aplicacao(crianca, vacina, loc, lote, dose="D2", agendamento_id=novo.json()["id"]), headers=token("gestor"))
    assert apl.status_code == 201, apl.text
    situacoes = {a["id"]: a["situacao"] for a in (await client.get(f"{API}/cidadaos/{crianca}/agendamentos", headers=token("gestor"))).json()}
    assert situacoes == {ag.json()["id"]: "REAGENDADO", novo.json()["id"]: "APLICADO"}
    assert (await client.get(f"{API}/busca-ativa", headers=token("gestor"))).json() == []
    assert (await client.get(f"{API}/busca-ativa", headers=token("admin_b"))).json() == []


@pytest.mark.asyncio
async def test_b7_012_028_carteira_qr_retificacao_e_rnds_pendente(client, token, mundo):
    prod, loc, lote = await _estoque(client, token, mundo)
    vacina = await _vacina(client, token, prod)
    pessoa = await _cidadao(client, token, date.today() - timedelta(days=12000), nome="Maria Aparecida Souza")
    apl = (await client.post(f"{API}/aplicacoes", json=_aplicacao(pessoa, vacina, loc, lote, estrategia="ROTINA"), headers=token("gestor"))).json()

    carteira = await client.get(f"{API}/cidadaos/{pessoa}/carteira", headers=token("gestor"))
    assert carteira.status_code == 200 and carteira.json()["aplicacoes"][0]["lote"] == "L1"
    token_qr = carteira.json()["token_verificacao"]
    pdf = await client.get(f"{API}/cidadaos/{pessoa}/carteira", params={"formato": "pdf"}, headers=token("gestor"))
    assert pdf.content[:5] == b"%PDF-"
    publico = await client.get(f"{API}/verificar/{token_qr}")
    assert publico.status_code == 200, publico.text
    assert publico.json()["autentico"] is True and "Souza" not in publico.json()["titular"]
    assert publico.json()["historico_alterado_desde_a_emissao"] is False
    assert (await client.get(f"{API}/verificar/{token_qr[:-3]}xyz")).status_code == 404

    curta = await client.post(f"{API}/aplicacoes/{apl['id']}/retificar", json={"estrategia": "CAMPANHA", "justificativa": "curta"}, headers=token("gestor"))
    assert curta.status_code == 422
    ret = await client.post(f"{API}/aplicacoes/{apl['id']}/retificar", json={"estrategia": "CAMPANHA", "justificativa": "Estratégia registrada incorretamente"}, headers=token("gestor"))
    assert ret.status_code == 201 and ret.json()["retifica_de_id"] == apl["id"]
    todas = (await client.get(f"{API}/cidadaos/{pessoa}/aplicacoes", params={"todas": True}, headers=token("gestor"))).json()
    assert {a["situacao"] for a in todas} == {"RETIFICADA", "ATIVA"}
    assert (await client.get(f"{API}/verificar/{token_qr}")).json()["historico_alterado_desde_a_emissao"] is True
    assert (await client.post(f"{API}/aplicacoes/{apl['id']}/retificar", json={"justificativa": "Outra tentativa de retificação"}, headers=token("gestor"))).status_code == 409
    inv = await client.post(f"{API}/aplicacoes/{ret.json()['id']}/invalidar", json={"motivo": "Registrada no cidadão errado"}, headers=token("gestor"))
    assert inv.json()["situacao"] == "INVALIDADA"
    assert (await client.get(f"{API}/cidadaos/{pessoa}/aplicacoes", headers=token("gestor"))).json() == []

    rnds = await client.get(f"{API}/aplicacoes/{apl['id']}/exportacao-rnds", headers=token("gestor"))
    assert rnds.json()["situacao"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
    assert (await client.get(f"{API}/aplicacoes/{apl['id']}", headers=token("admin_b"))).status_code == 404
    hoje = date.today().isoformat()
    rel = await client.get(f"{API}/relatorios/aplicacoes", params={"inicio": hoje, "fim": hoje, "agrupar_por": "dose", "formato": "csv"}, headers=token("gestor"))
    assert rel.status_code == 200 and rel.headers["content-type"].startswith("text/csv")


@pytest.mark.xfail(reason="PENDENTE_ESPECIFICACAO_OFICIAL: StructureDefinitions do modelo RIA (RNDS) não estão em app/integracoes/especificacoes/", strict=True)
@pytest.mark.asyncio
async def test_b7_013_contrato_rnds_ria(client, token, mundo):
    prod, loc, lote = await _estoque(client, token, mundo)
    vacina = await _vacina(client, token, prod)
    pessoa = await _cidadao(client, token, date.today() - timedelta(days=12000))
    apl = (await client.post(f"{API}/aplicacoes", json=_aplicacao(pessoa, vacina, loc, lote), headers=token("gestor"))).json()
    r = await client.get(f"{API}/aplicacoes/{apl['id']}/exportacao-rnds", headers=token("gestor"))
    assert r.json()["situacao"] == "VALIDO"
