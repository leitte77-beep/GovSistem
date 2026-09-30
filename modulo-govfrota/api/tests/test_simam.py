"""SIM-AM/TCE-PR: cálculo da competência, fechamento, travas, estorno e arquivos."""

import io
import json
import zipfile
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.anexo import Anexo
from app.services.simam.competencia import mes_anterior

API = "/api/govfrota"
HOJE = date.today()
ANO_ANT, MES_ANT = mes_anterior(HOJE.year, HOJE.month)


def _data(dia: int, ano=ANO_ANT, mes=MES_ANT) -> str:
    # Meio-dia UTC: continua no mesmo dia no fuso de Brasília.
    return datetime(ano, mes, dia, 15, 0, tzinfo=timezone.utc).isoformat()


async def _cenario(client, _db, make_tenant, setup_frota, *, completo=True):
    t = await make_tenant()
    base = await setup_frota(t["org"])
    h = t["headers"]
    v, c = base["veiculo"], base["combustivel"]
    if completo:
        r = await client.patch(f"{API}/configuracoes", json={"simam_id_pessoa": 123456, "simam_cpf_responsavel": "12345678909"}, headers=h)
        assert r.status_code == 200, r.text
        r = await client.patch(f"{API}/combustiveis/{c.id}", json={"nome": c.nome, "simam_categoria": 1, "simam_objeto": 101}, headers=h)
        assert r.status_code == 200, r.text
        r = await client.patch(
            f"{API}/veiculos/{v.id}",
            json={"patrimonio": "PAT0001", "ano_fabricacao": 2020, "simam_cd_modelo_fipe": "0051950"},
            headers=h,
        )
        assert r.status_code == 200, r.text
    return t, base


async def _abastecer(client, h, base, litros, km, quando):
    r = await client.post(
        f"{API}/abastecimentos",
        json={
            "veiculo_id": str(base["veiculo"].id),
            "combustivel_id": str(base["combustivel"].id),
            "tanque_id": str(base["tanque"].id),
            "quantidade_litros": str(litros),
            "quilometragem": km,
            "data_abastecimento": quando,
        },
        headers=h,
    )
    return r


def _comp(ano=ANO_ANT, mes=MES_ANT):
    return f"{API}/simam/competencias/{ano}/{mes}"


async def test_pendencias_de_cadastro_bloqueiam_fechamento(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota, completo=False)
    assert (await _abastecer(client, t["headers"], base, 40, 50100, _data(5))).status_code == 201
    dados = (await client.get(_comp(), headers=t["headers"])).json()
    textos = " ".join(e["mensagem"] for e in dados["erros"])
    assert "idPessoa" in textos
    assert "código patrimonial" in textos and "código FIPE" in textos and "ano de fabricação" in textos
    assert "sem código SIM-AM" in textos
    r = await client.post(f"{_comp()}/fechar", headers=t["headers"])
    assert r.status_code == 422 and "pendência" in r.json()["detail"]


async def test_consumo_e_hodometro_do_mes(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    for litros, km, dia in [("42.5", 50100, 3), ("51.2", 50400, 12), ("39.8", 50800, 20)]:
        assert (await _abastecer(client, h, base, litros, km, _data(dia))).status_code == 201
    dados = (await client.get(_comp(), headers=h)).json()
    assert dados["erros"] == [], dados["erros"]
    consumo = dados["arquivos"]["ConsumoCombustivel"]
    assert len(consumo) == 1 and consumo[0]["nrQuantidade"] == "133.500"
    assert consumo[0]["nrSequencialConsumo"] is None  # nasce no fechamento
    medicao = dados["arquivos"]["HodometroHorimetro"][0]
    assert (medicao["nrMedicaoInicial"], medicao["nrMedicaoFinal"]) == ("50100.000", "50800.000")
    assert medicao["idTipoMedidor"] == 1 and medicao["nrSequencialHodoHori"] == 1
    veic = dados["arquivos"]["VeiculoEquipamento"][0]
    assert veic["cdBem"] == "PAT0001" and veic["idTipoObjetoDespesa"] == 101


async def test_fechar_trava_reabrir_e_sequencial_estavel(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    r = await _abastecer(client, h, base, 40, 50100, _data(5))
    abast_id = r.json()["id"]

    r = await client.post(f"{_comp()}/fechar", headers=h)
    assert r.status_code == 200, r.text
    seq = (await client.get(_comp(), headers=h)).json()["arquivos"]["ConsumoCombustivel"][0]["nrSequencialConsumo"]
    assert seq == 1

    # Mês fechado: não aceita lançamento nem alteração.
    assert (await _abastecer(client, h, base, 10, 50200, _data(6))).status_code == 409
    r = await client.post(f"{API}/abastecimentos/{abast_id}/cancelar", json={"justificativa": "lançado errado"}, headers=h)
    assert r.status_code == 409

    # Mês corrente não fecha.
    assert (await client.post(f"{_comp(HOJE.year, HOJE.month)}/fechar", headers=h)).status_code == 422

    r = await client.post(f"{_comp()}/reabrir", json={"justificativa": "faltou lançamento"}, headers=h)
    assert r.status_code == 200
    assert (await _abastecer(client, h, base, 10, 50200, _data(6))).status_code == 201
    assert (await client.post(f"{_comp()}/fechar", headers=h)).status_code == 200
    linha = (await client.get(_comp(), headers=h)).json()["arquivos"]["ConsumoCombustivel"][0]
    assert linha["nrSequencialConsumo"] == 1 and linha["nrQuantidade"] == "50.000"


async def test_exportada_gera_estorno_no_mes_corrente(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    a1 = (await _abastecer(client, h, base, 40, 50100, _data(5))).json()
    a2 = (await _abastecer(client, h, base, 30, 50300, _data(9))).json()
    assert (await client.post(f"{_comp()}/fechar", headers=h)).status_code == 200
    assert (await client.post(f"{_comp()}/exportada", headers=h)).status_code == 200
    assert (await client.post(f"{_comp()}/reabrir", json={"justificativa": "tentativa"}, headers=h)).status_code == 422

    # Aumentar litros ou mudar km de mês enviado: bloqueado.
    r = await client.post(
        f"{API}/abastecimentos/{a2['id']}/corrigir",
        json={"quantidade_litros": "35", "justificativa": "nota diferente"},
        headers=h,
    )
    assert r.status_code == 409
    # Reduzir litros: permitido, vira estorno.
    r = await client.post(
        f"{API}/abastecimentos/{a2['id']}/corrigir",
        json={"quantidade_litros": "25", "justificativa": "nota com 25 litros"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    r = await client.post(f"{API}/abastecimentos/{a1['id']}/cancelar", json={"justificativa": "duplicado"}, headers=h)
    assert r.status_code == 200 and "Estorno SIM-AM" in r.json()["mensagem"]

    atual = (await client.get(_comp(HOJE.year, HOJE.month), headers=h)).json()
    estornos = atual["arquivos"]["EstornoConsumoCombustivel"]
    assert [(e["nrEstorno"], e["nrQuantidade"], e["nrSequencialConsumo"]) for e in estornos] == [
        (1, "5.000", 1),
        (2, "40.000", 1),
    ]
    assert all(e["nrMesEstorno"] == HOJE.month for e in estornos)
    # O retrato enviado não muda.
    enviado = (await client.get(_comp(), headers=h)).json()["arquivos"]["ConsumoCombustivel"][0]
    assert enviado["nrQuantidade"] == "70.000"


async def test_arquivo_zip_segue_layout(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    await _abastecer(client, h, base, "42.5", 50100, _data(5))
    assert (await client.get(f"{_comp()}/arquivo", headers=h)).status_code == 422
    await client.post(f"{_comp()}/fechar", headers=h)
    r = await client.get(f"{_comp()}/arquivo", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert "ConsumoCombustivel.txt" in z.namelist()
    linha = z.read("ConsumoCombustivel.txt").decode("cp1252")
    assert linha == f"123456|1|PAT0001|1|101|{MES_ANT}|{ANO_ANT}|42.500|\r\n"
    hodo = z.read("HodometroHorimetro.txt").decode("cp1252")
    assert hodo.startswith("123456|PAT0001|1|") and hodo.endswith("|0.000||\r\n")


async def test_hodometro_encadeia_com_mes_anterior(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    await _abastecer(client, h, base, 40, 50100, _data(5))
    await _abastecer(client, h, base, 40, 50900, _data(25))
    await client.post(f"{_comp()}/fechar", headers=h)
    atual = (await client.get(_comp(HOJE.year, HOJE.month), headers=h)).json()
    medicao = atual["arquivos"]["HodometroHorimetro"][0]
    assert medicao["nrMedicaoInicial"] == "50900.000"


async def test_troca_de_medidor_e_medicao_declarada(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    v = base["veiculo"]
    anexo = Anexo(organization_id=t["org"].id, nome_arquivo="laudo.pdf", tipo="DOCUMENTO", mime_type="application/pdf", caminho="x/laudo.pdf")
    _db.add(anexo)
    await _db.commit()

    await _abastecer(client, h, base, 40, 50100, _data(3))
    r = await client.post(
        f"{API}/simam/veiculos/{v.id}/medicoes-declaradas",
        json={"data_referencia": f"{ANO_ANT}-{MES_ANT:02d}-10", "quantidade": "620", "justificativa": "hodômetro parado"},
        headers=h,
    )
    assert r.status_code == 422  # sem documento
    r = await client.post(
        f"{API}/simam/veiculos/{v.id}/medicoes-declaradas",
        json={"data_referencia": f"{ANO_ANT}-{MES_ANT:02d}-10", "quantidade": "620", "justificativa": "hodômetro parado", "anexo_id": str(anexo.id)},
        headers=h,
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        f"{API}/simam/veiculos/{v.id}/trocar-medidor",
        json={"data_troca": f"{ANO_ANT}-{MES_ANT:02d}-15", "leitura_final_antigo": "50100", "leitura_inicial_novo": "0", "motivo": "hodômetro substituído"},
        headers=h,
    )
    assert r.status_code == 201 and r.json()["sequencial"] == 2
    await _abastecer(client, h, base, 40, 350, _data(20))

    linhas = (await client.get(_comp(), headers=h)).json()["arquivos"]["HodometroHorimetro"]
    por_seq = {l["nrSequencialHodoHori"]: l for l in linhas}
    assert por_seq[1]["nrMedicaoDeclarada"] == "620.000" and por_seq[1]["dsNotaExplicativa"] == "hodômetro parado"
    assert por_seq[1]["nrMedicaoFinal"] == "50100.000"
    assert (por_seq[2]["nrMedicaoInicial"], por_seq[2]["nrMedicaoFinal"]) == ("0.000", "350.000")


async def test_saida_extra_exige_nota_e_debita_estoque(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    tanque = base["tanque"]
    corpo = {"tanque_id": str(tanque.id), "tipo_saida": 3, "data_saida": HOJE.isoformat(), "quantidade": "80"}
    assert (await client.post(f"{API}/simam/saidas-extra", json=corpo, headers=h)).status_code == 422
    r = await client.post(f"{API}/simam/saidas-extra", json={**corpo, "nota_explicativa": "vazamento na válvula"}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["numero"] == 1 and r.json()["responsavel_cpf"] == "12345678909"
    # Uso em oficina dispensa nota; convênio exige dados do convênio.
    r = await client.post(f"{API}/simam/saidas-extra", json={**corpo, "tipo_saida": 4}, headers=h)
    assert r.status_code == 201
    assert (await client.post(f"{API}/simam/saidas-extra", json={**corpo, "tipo_saida": 6}, headers=h)).status_code == 422

    tq = (await client.get(f"{API}/tanques/{tanque.id}", headers=h)).json()
    assert float(tq["estoque_atual"]) == 10000 - 160
    atual = (await client.get(_comp(HOJE.year, HOJE.month), headers=h)).json()
    assert [s["idTipoSaidaCombustivel"] for s in atual["arquivos"]["SaidaExtraCombustivel"]] == [3, 4]
    estoque = atual["arquivos"]["EstoqueCombustivel"][0]
    assert estoque["nrQuantidadeFinal"] == "9840.000"


async def test_entrada_extraorcamentaria(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    corpo = {
        "tanque_id": str(base["tanque"].id),
        "combustivel_id": str(base["combustivel"].id),
        "quantidade_litros": "500",
        "data_entrada": HOJE.isoformat(),
        "tipo_entrada": "DOACAO",
        "repassador_nome": "Cooperativa X",
        "repassador_cpf_cnpj": "11.222.333/0001-81",
    }
    r = await client.post(f"{API}/entradas", json=corpo, headers=h)
    assert r.status_code == 422 and "nota explicativa" in r.json()["detail"]
    r = await client.post(f"{API}/entradas", json={**corpo, "nota_explicativa": "Doação conforme termo 12/2026"}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["simam_numero"] == 1 and r.json()["repassador_cpf_cnpj"] == "11222333000181"
    atual = (await client.get(_comp(HOJE.year, HOJE.month), headers=h)).json()
    entrada = atual["arquivos"]["EntradaExtraCombustivel"][0]
    assert entrada["idTipoEntradaCombustivel"] == 1 and entrada["nrCPF"] == "12345678909"


async def test_inventario_com_falta_vira_saida_extra(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    h = t["headers"]
    inv = (
        await client.post(
            f"{API}/tanques/inventario",
            json={"tanque_id": str(base["tanque"].id), "estoque_fisico": "9950", "data_conferencia": HOJE.isoformat()},
            headers=h,
        )
    ).json()
    r = await client.post(
        f"{API}/tanques/inventario/{inv['id']}/aplicar",
        json={"justificativa": "evaporação no verão", "tipo_saida_simam": 1},
        headers=h,
    )
    assert r.status_code == 200, r.text
    saidas = (await client.get(f"{API}/simam/saidas-extra", headers=h)).json()
    assert len(saidas) == 1 and saidas[0]["tipo_saida"] == 1 and float(saidas[0]["quantidade"]) == 50


async def test_isolamento_entre_organizacoes(client, _db, make_tenant, setup_frota):
    t, base = await _cenario(client, _db, make_tenant, setup_frota)
    await _abastecer(client, t["headers"], base, 40, 50100, _data(5))
    outro = await make_tenant()
    dados = (await client.get(_comp(), headers=outro["headers"])).json()
    assert dados["arquivos"]["ConsumoCombustivel"] == []
    r = await client.get(f"{API}/simam/veiculos/{base['veiculo'].id}/medidores", headers=outro["headers"])
    assert r.status_code == 404
