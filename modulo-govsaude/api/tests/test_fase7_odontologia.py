"""Fase 7 — odontologia (B.3-001…027).

Catálogo parametrizável, notação FDI/faces, odontograma versionado e imutável,
atendimento com anamnese por formulário, digitação retroativa, procedimentos
programados × realizados, documentos, relatórios e LEDI pendente. Inclui
negativos de tenant, RBAC e escopo de estabelecimento.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

API = "/api/govsaude/v1/odontologia"


async def _cidadao(client, token, nome="Paciente Odonto"):
    r = await client.post("/api/govsaude/v1/cidadaos", json={"nome": nome, "sexo": "FEMININO", "data_nascimento": "1990-01-01"}, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _condicao(client, token, codigo, tipo="CONDICAO", aplicavel=("DENTE", "FACE"), **extra):
    corpo = {"codigo": codigo, "nome": f"Item {codigo}", "tipo": tipo, "cor": "#AA3300", "aplicavel_a": list(aplicavel), **extra}
    r = await client.post(f"{API}/condicoes", json=corpo, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()


async def _atendimento(client, token, mundo, cidadao, **extra):
    corpo = {"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "tipo": "PRIMEIRA_CONSULTA", **extra}
    return await client.post(f"{API}/atendimentos", json=corpo, headers=token("medico"))


@pytest.mark.asyncio
async def test_b3_001_catalogo_parametrizavel_isolado_e_restrito(client, token):
    item = await _condicao(client, token, "CARIE")
    assert item["aplicavel_a"] == ["DENTE", "FACE"]
    dup = await client.post(f"{API}/condicoes", json={"codigo": "CARIE", "nome": "Outra", "tipo": "CONDICAO", "aplicavel_a": ["DENTE"]}, headers=token("admin"))
    assert dup.status_code == 409
    cor_ruim = await client.post(f"{API}/condicoes", json={"codigo": "X", "nome": "Xx", "tipo": "CONDICAO", "cor": "vermelho", "aplicavel_a": ["DENTE"]}, headers=token("admin"))
    assert cor_ruim.status_code == 422
    medico = await client.post(f"{API}/condicoes", json={"codigo": "Y", "nome": "Yy", "tipo": "CONDICAO", "aplicavel_a": ["DENTE"]}, headers=token("medico"))
    assert medico.status_code == 403
    outro = await client.get(f"{API}/condicoes", headers=token("admin_b"))
    assert outro.status_code == 200 and outro.json() == []
    recepcao = await client.get(f"{API}/condicoes", headers=token("recepcao"))
    assert recepcao.status_code == 403
    sem_versao = await client.patch(f"{API}/condicoes/{item['id']}", json={"cor": "#000000"}, headers=token("admin"))
    assert sem_versao.status_code == 428
    ok = await client.patch(f"{API}/condicoes/{item['id']}", json={"cor": "#000000"}, headers={**token("admin"), "If-Match": '"1"'})
    assert ok.status_code == 200 and ok.json()["versao"] == 2


@pytest.mark.asyncio
async def test_b3_006_024_odontograma_versionado_fdi_e_faces(client, token):
    carie = await _condicao(client, token, "CARIE")
    so_permanente = await _condicao(client, token, "IMPLANTE", aplicavel=("DENTE",), denticao="PERMANENTE")
    cidadao = await _cidadao(client, token)
    url = f"{API}/cidadaos/{cidadao}/odontograma"

    for marcacao, codigo in [
        ({"dente": 19, "condicao_id": carie["id"]}, "dente_invalido"),
        ({"dente": 11, "faces": ["O"], "condicao_id": carie["id"]}, "face_invalida"),
        ({"dente": 36, "faces": ["P"], "condicao_id": carie["id"]}, "face_invalida"),
        ({"dente": 55, "condicao_id": so_permanente["id"]}, "condicao_inaplicavel"),
        ({"regiao": "BOCA", "condicao_id": carie["id"]}, "condicao_inaplicavel"),
    ]:
        r = await client.post(url, json={"versao_base": 0, "marcacoes": [marcacao]}, headers=token("medico"))
        assert r.status_code == 422, (marcacao, r.text)
        assert r.json()["codigo"] == codigo

    v1 = await client.post(url, json={"versao_base": 0, "marcacoes": [{"dente": 16, "faces": ["O", "M"], "condicao_id": carie["id"]}]}, headers=token("medico"))
    assert v1.status_code == 201, v1.text
    assert v1.json()["numero_versao"] == 1
    concorrente = await client.post(url, json={"versao_base": 0, "marcacoes": []}, headers=token("medico"))
    assert concorrente.status_code == 409
    sem_justificativa = await client.post(url, json={"versao_base": 1, "marcacoes": []}, headers=token("medico"))
    assert sem_justificativa.status_code == 422
    v2 = await client.post(url, json={"versao_base": 1, "marcacoes": [{"dente": 21, "faces": ["I", "P"], "condicao_id": carie["id"]}], "justificativa": "Revisão do exame clínico"}, headers=token("medico"))
    assert v2.status_code == 201, v2.text

    versoes = await client.get(f"{url}/versoes", headers=token("medico"))
    assert [v["numero_versao"] for v in versoes.json()] == [2, 1]
    assert versoes.json()[1]["marcacoes"][0]["dente"] == 16, "versão anterior preservada"
    atual = await client.get(url, headers=token("medico"))
    assert atual.status_code == 200 and atual.json()["versao"]["numero_versao"] == 2
    outro = await client.get(url, headers=token("admin_b"))
    assert outro.status_code == 404


@pytest.mark.asyncio
async def test_b3_005_013_anamnese_risco_e_retroativo(client, token, mundo):
    form = await client.post(
        "/api/govsaude/v1/formularios",
        json={"codigo": "ODONTO_ANAMNESE", "nome": "Anamnese odontológica", "schema_json": {"type": "object", "additionalProperties": False, "required": ["sangramento_gengival"], "properties": {"sangramento_gengival": {"type": "boolean"}}}},
        headers=token("admin"),
    )
    assert form.status_code == 201, form.text
    cidadao = await _cidadao(client, token)
    invalida = await _atendimento(client, token, mundo, cidadao, formulario_anamnese_codigo="ODONTO_ANAMNESE", anamnese={"outro": 1})
    assert invalida.status_code == 422 and invalida.json()["codigo"] == "anamnese_invalida"

    antigo = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    sem_just = await _atendimento(client, token, mundo, cidadao, iniciado_em=antigo)
    assert sem_just.json()["codigo"] == "retroativo_sem_justificativa"
    muito_antigo = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    fora = await _atendimento(client, token, mundo, cidadao, iniciado_em=muito_antigo, retroativo_justificativa="Sistema fora do ar durante o mutirão")
    assert fora.json()["codigo"] == "retroativo_fora_do_limite"
    retro = await _atendimento(client, token, mundo, cidadao, iniciado_em=antigo, retroativo_justificativa="Sistema fora do ar durante o mutirão", formulario_anamnese_codigo="ODONTO_ANAMNESE", anamnese={"sangramento_gengival": True})
    assert retro.status_code == 201, retro.text
    assert retro.json()["retroativo"] is True and retro.json()["versao_formulario"] == 1

    escopo = await client.post(f"{API}/atendimentos", json={"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_b"].id), "tipo": "RETORNO"}, headers=token("medico_escopo"))
    assert escopo.status_code == 403


@pytest.mark.asyncio
async def test_b3_011_022_procedimentos_documentos_relatorio_e_fechamento(client, token, mundo):
    restauracao = await _condicao(client, token, "RESTAURACAO", tipo="PROCEDIMENTO")
    carie = await _condicao(client, token, "CARIE")
    cidadao = await _cidadao(client, token)
    outro_cidadao = await _cidadao(client, token, nome="Outro Paciente")

    nao_proc = await client.post(f"{API}/procedimentos", json={"cidadao_id": cidadao, "condicao_id": carie["id"], "dente": 16}, headers=token("medico"))
    assert nao_proc.status_code == 422
    programado = await client.post(f"{API}/procedimentos", json={"cidadao_id": cidadao, "condicao_id": restauracao["id"], "dente": 16, "faces": ["O"], "programado_para": date.today().isoformat()}, headers=token("medico"))
    assert programado.status_code == 201, programado.text
    assert programado.json()["situacao"] == "PROGRAMADO"
    planejado = await client.get(f"{API}/cidadaos/{cidadao}/odontograma", headers=token("medico"))
    assert len(planejado.json()["planejados"]) == 1

    atendimento = (await _atendimento(client, token, mundo, cidadao)).json()
    alheio = (await _atendimento(client, token, mundo, outro_cidadao)).json()
    errado = await client.post(f"{API}/procedimentos/{programado.json()['id']}/realizar", json={"atendimento_id": alheio["id"]}, headers=token("medico"))
    assert errado.status_code == 422
    feito = await client.post(f"{API}/procedimentos/{programado.json()['id']}/realizar", json={"atendimento_id": atendimento["id"], "insumos": [{"descricao": "Resina", "quantidade": 1}]}, headers=token("medico"))
    assert feito.status_code == 200, feito.text
    assert feito.json()["situacao"] == "REALIZADO"
    de_novo = await client.post(f"{API}/procedimentos/{programado.json()['id']}/realizar", json={"atendimento_id": atendimento["id"]}, headers=token("medico"))
    assert de_novo.status_code == 409

    doc = await client.post(f"{API}/atendimentos/{atendimento['id']}/documentos", json={"tipo": "ATESTADO", "titulo": "Atestado", "conteudo": "Compareceu ao atendimento."}, headers=token("medico"))
    assert doc.status_code == 201, doc.text
    docs = await client.get(f"{API}/atendimentos/{atendimento['id']}/documentos", headers=token("medico"))
    assert docs.json()[0]["conteudo"] == "Compareceu ao atendimento."

    hoje = date.today().isoformat()
    for agrupar, chave in [("dente", "16"), ("face", "16-O")]:
        rel = await client.get(f"{API}/relatorios/procedimentos", params={"inicio": hoje, "fim": hoje, "agrupar_por": agrupar}, headers=token("medico"))
        assert rel.status_code == 200, rel.text
        assert rel.json()["linhas"] == [{"chave": chave, "procedimentos": 1, "quantidade": 1}]

    cancelar = await client.post(f"{API}/atendimentos/{atendimento['id']}/cancelar", json={"motivo": "Engano"}, headers=token("medico"))
    assert cancelar.status_code == 409, "atendimento com produção não é cancelado"
    fim = await client.post(f"{API}/atendimentos/{atendimento['id']}/finalizar", headers=token("medico"))
    assert fim.status_code == 200 and fim.json()["situacao"] == "FINALIZADO"
    depois = await client.patch(f"{API}/atendimentos/{atendimento['id']}", json={"evolucao": "x"}, headers={**token("medico"), "If-Match": f'"{fim.json()["versao"]}"'})
    assert depois.status_code == 409
    leitura_b = await client.get(f"{API}/atendimentos/{atendimento['id']}", headers=token("admin_b"))
    assert leitura_b.status_code == 404


@pytest.mark.asyncio
async def test_b3_027_exportacao_ledi_pendente_de_especificacao(client, token, mundo):
    cidadao = await _cidadao(client, token)
    atendimento = (await _atendimento(client, token, mundo, cidadao)).json()
    r = await client.get(f"{API}/atendimentos/{atendimento['id']}/exportacao-ledi", headers=token("medico"))
    assert r.status_code == 200, r.text
    assert r.json()["situacao"] == "PENDENTE_ESPECIFICACAO_OFICIAL"


@pytest.mark.xfail(reason="PENDENTE_ESPECIFICACAO_OFICIAL: .thrift da LEDI (ficha de atendimento odontológico) não está em app/integracoes/especificacoes/", strict=True)
@pytest.mark.asyncio
async def test_b3_027_contrato_ledi_atendimento_odontologico(client, token, mundo):
    cidadao = await _cidadao(client, token)
    atendimento = (await _atendimento(client, token, mundo, cidadao)).json()
    r = await client.get(f"{API}/atendimentos/{atendimento['id']}/exportacao-ledi", headers=token("medico"))
    assert r.json()["situacao"] == "VALIDO"
