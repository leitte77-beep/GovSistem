"""Fase 5 — PEC ambulatorial (B.6-004…058, B.12-013/021…025).

Etapas e campos obrigatórios configuráveis, SOAP cifrado com assinatura e
retificação, sinais vitais com IMC e classificação só por tabela do tenant,
problemas/alergias com baixa lógica, prescrição com alertas e receituários,
cópia assistida, registros configuráveis por formulário, sigilo, retroativo em
contingência e validade de consulta. Inclui negativos de tenant, RBAC, escopo
e sigilo.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text

from app.models.auditoria import AuditTrail
from app.models.prontuario import EvolucaoSOAP

API = "/api/govsaude/v1/prontuarios"
CONF = "/api/govsaude/v1/configuracoes"


def _agora(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


async def _cidadao(client, token, nome="Paciente PEC", sexo="FEMININO", nascimento="1990-01-01"):
    r = await client.post("/api/govsaude/v1/cidadaos", json={"nome": nome, "sexo": sexo, "data_nascimento": nascimento}, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _config(client, token, chave, valor):
    atual = await client.get(f"{CONF}/{chave}", headers=token("admin"))
    headers = token("admin")
    if atual.status_code == 200:
        headers = {**headers, "If-Match": f'"{atual.json()["versao"]}"'}
    r = await client.put(f"{CONF}/{chave}", json={"valor": {"valor": valor}}, headers=headers)
    assert r.status_code == 200, r.text


async def _abrir(client, token, mundo, cidadao, quem="medico", **extra):
    corpo = {"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "iniciado_em": _agora(), **extra}
    return await client.post(f"{API}/atendimentos", json=corpo, headers=token(quem))


@pytest.mark.asyncio
async def test_b6_004_006_etapas_e_campos_obrigatorios_configuraveis(client, token, mundo):
    await _config(client, token, "prontuario.etapas", ["ACOLHIMENTO", "TRIAGEM", "CONSULTA"])
    await _config(client, token, "prontuario.campos_obrigatorios", [
        {"tipo_atendimento": "CONSULTA", "sexo": "FEMININO", "idade_min_anos": 18, "campos": ["avaliacao", "sinais_vitais"]},
        {"tipo_atendimento": "OUTRO", "campos": ["plano"]},
    ])
    cidadao = await _cidadao(client, token)
    at = await _abrir(client, token, mundo, cidadao)
    assert at.status_code == 201, at.text
    at = at.json()
    assert at["etapa"] == "ACOLHIMENTO"

    invalida = await client.post(f"{API}/atendimentos/{at['id']}/etapa", json={"etapa": "UTI"}, headers=token("medico"))
    assert invalida.status_code == 422 and invalida.json()["codigo"] == "etapa_invalida"
    ok = await client.post(f"{API}/atendimentos/{at['id']}/etapa", json={"etapa": "CONSULTA"}, headers=token("medico"))
    assert ok.status_code == 200 and ok.json()["etapa"] == "CONSULTA"
    volta = await client.post(f"{API}/atendimentos/{at['id']}/etapa", json={"etapa": "TRIAGEM"}, headers=token("medico"))
    assert volta.status_code == 409

    pend = await client.get(f"{API}/atendimentos/{at['id']}/pendencias", headers=token("medico"))
    assert pend.json()["campos_pendentes"] == ["avaliacao", "sinais_vitais"]
    bloqueado = await client.post(f"{API}/atendimentos/{at['id']}/encerrar", json={}, headers=token("medico"))
    assert bloqueado.status_code == 422 and bloqueado.json()["codigo"] == "campos_obrigatorios"

    vazio = await client.post(f"{API}/atendimentos/{at['id']}/soap", json={}, headers=token("medico"))
    assert vazio.status_code == 422
    await client.post(f"{API}/atendimentos/{at['id']}/soap", json={"avaliacao": "Quadro estável"}, headers=token("medico"))
    await client.post(f"{API}/atendimentos/{at['id']}/sinais-vitais", json={"dados": {"pa_sistolica": 120}}, headers=token("medico"))
    fim = await client.post(f"{API}/atendimentos/{at['id']}/encerrar", json={}, headers=token("medico"))
    assert fim.status_code == 200 and fim.json()["status"] == "ENCERRADO"
    depois = await client.post(f"{API}/atendimentos/{at['id']}/soap", json={"plano": "x"}, headers=token("medico"))
    assert depois.status_code == 409

    # Regra não se aplica a homem: encerra sem pendência.
    homem = await _cidadao(client, token, nome="Paciente Masculino", sexo="MASCULINO")
    at2 = (await _abrir(client, token, mundo, homem)).json()
    assert (await client.post(f"{API}/atendimentos/{at2['id']}/encerrar", json={}, headers=token("medico"))).status_code == 200


@pytest.mark.asyncio
async def test_b6_057_soap_cifrado_assinatura_e_retificacao(client, token, mundo, db):
    cidadao = await _cidadao(client, token)
    at = (await _abrir(client, token, mundo, cidadao)).json()
    ev = await client.post(f"{API}/atendimentos/{at['id']}/soap", json={"subjetivo": "Cefaleia há 3 dias"}, headers=token("medico"))
    assert ev.status_code == 201, ev.text
    ev = ev.json()
    brutos = (await db.execute(text("SELECT subjetivo FROM evolucoes_soap"))).scalars().all()
    assert brutos and all("Cefaleia" not in b for b in brutos), "SOAP deve estar cifrado em repouso"

    cedo = await client.post(f"{API}/evolucoes/{ev['id']}/retificar", json={"subjetivo": "x", "justificativa": "Correção de digitação do relato"}, headers=token("medico"))
    assert cedo.status_code == 409
    assinado = await client.post(f"{API}/evolucoes/{ev['id']}/assinar", headers=token("medico"))
    assert assinado.status_code == 200 and assinado.json()["assinado_em"]
    assert (await client.post(f"{API}/evolucoes/{ev['id']}/assinar", headers=token("medico"))).status_code == 409
    curta = await client.post(f"{API}/evolucoes/{ev['id']}/retificar", json={"subjetivo": "x", "justificativa": "curta"}, headers=token("medico"))
    assert curta.status_code == 422
    ret = await client.post(f"{API}/evolucoes/{ev['id']}/retificar", json={"subjetivo": "Cefaleia há 5 dias", "justificativa": "Correção de digitação do relato"}, headers=token("medico"))
    assert ret.status_code == 201 and ret.json()["retifica_de_id"] == ev["id"]
    lista = await client.get(f"{API}/atendimentos/{at['id']}/soap", headers=token("medico"))
    assert [e["subjetivo"] for e in lista.json()] == ["Cefaleia há 3 dias", "Cefaleia há 5 dias"], "original preservado"
    assert (await db.scalar(select(EvolucaoSOAP).where(EvolucaoSOAP.retifica_de_id.is_not(None)))) is not None
    trilha = (await db.scalars(select(AuditTrail.acao).where(AuditTrail.recurso == "evolucao_soap"))).all()
    assert {"CRIAR", "ASSINAR", "RETIFICAR", "READ_SENSIVEL"} <= set(trilha)

    assert (await client.get(f"{API}/atendimentos/{at['id']}/soap", headers=token("admin_b"))).status_code == 404
    assert (await client.post(f"{API}/evolucoes/{ev['id']}/assinar", headers=token("admin_b"))).status_code == 404
    assert (await client.post(f"{API}/atendimentos/{at['id']}/soap", json={"plano": "x"}, headers=token("recepcao"))).status_code == 403


@pytest.mark.asyncio
async def test_b6_010_012_imc_classificado_apenas_por_tabela_do_tenant(client, token, mundo):
    cidadao = await _cidadao(client, token)
    at = (await _abrir(client, token, mundo, cidadao)).json()
    url = f"{API}/atendimentos/{at['id']}/sinais-vitais"
    sem_tabela = await client.post(url, json={"dados": {"fc": 80}, "peso_kg": 80, "altura_cm": 200}, headers=token("medico"))
    assert sem_tabela.status_code == 201, sem_tabela.text
    assert sem_tabela.json()["dados"]["imc"] == 20.0
    assert sem_tabela.json()["dados"]["estado_nutricional"] == {"classificacao": None, "pendencia": "TABELA_REFERENCIA_NAO_CONFIGURADA"}
    assert (await client.post(url, json={"dados": {"fc": 80}, "peso_kg": -1}, headers=token("medico"))).status_code == 422

    # Tabela fictícia do teste (não é referência oficial); inativa é ignorada.
    await _config(client, token, "prontuario.tabelas_classificacao_nutricional", [
        {"ciclo_vida": "TESTE", "versao": "t1", "ativo": False, "idade_min_anos": 0, "idade_max_anos": 200, "faixas": [{"imc_min": 0, "classificacao": "INATIVA"}]},
        {"ciclo_vida": "TESTE", "versao": "t2", "ativo": True, "idade_min_anos": 18, "idade_max_anos": 59, "faixas": [{"imc_max": 21, "classificacao": "FAIXA_A"}, {"imc_min": 21, "classificacao": "FAIXA_B"}]},
    ])
    com = await client.post(url, json={"dados": {"fc": 82}, "peso_kg": 100, "altura_cm": 200}, headers=token("medico"))
    assert com.json()["dados"]["estado_nutricional"] == {"classificacao": "FAIXA_B", "ciclo_vida": "TESTE", "tabela_versao": "t2"}

    serie = await client.get(f"{API}/cidadaos/{cidadao}/sinais-vitais", headers=token("medico"))
    assert [s["dados"]["fc"] for s in serie.json()] == [80, 82]
    assert (await client.get(f"{API}/cidadaos/{cidadao}/sinais-vitais", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b6_015_016_problemas_e_alergias_com_baixa_logica(client, token, mundo):
    cidadao = await _cidadao(client, token)
    url = f"{API}/cidadaos/{cidadao}/problemas"
    p = await client.post(url, json={"codigo": "i10", "sistema": "CID10"}, headers=token("medico"))
    assert p.status_code == 201 and p.json()["codigo"] == "I10"
    assert p.json()["validado_referencia"] is False, "sem base CID importada não se valida de memória"
    assert (await client.post(url, json={"codigo": "I10", "sistema": "CID10"}, headers=token("medico"))).status_code == 409
    assert (await client.post(url, json={"codigo": "X", "sistema": "CID11"}, headers=token("medico"))).status_code == 422
    sem_motivo = await client.post(f"{API}/problemas/{p.json()['id']}/encerrar", json={"motivo": ""}, headers=token("medico"))
    assert sem_motivo.status_code == 422
    enc = await client.post(f"{API}/problemas/{p.json()['id']}/encerrar", json={"motivo": "Resolvido após tratamento"}, headers=token("medico"))
    assert enc.status_code == 200 and enc.json()["ativo"] is False
    assert (await client.post(f"{API}/problemas/{p.json()['id']}/encerrar", json={"motivo": "De novo aqui"}, headers=token("medico"))).status_code == 409
    lista = await client.get(url, headers=token("medico"))
    assert len(lista.json()) == 1 and lista.json()[0]["encerrado_motivo"] == "Resolvido após tratamento"

    al = await client.post(f"{API}/cidadaos/{cidadao}/alergias", json={"categoria": "MEDICAMENTO", "agente_codigo": "MED-TESTE-1", "agente_descricao": "Medicamento de teste"}, headers=token("medico"))
    assert al.status_code == 201, al.text
    assert (await client.post(f"{API}/alergias/{al.json()['id']}/encerrar", json={"motivo": "Teste"}, headers=token("admin_b"))).status_code == 404
    assert (await client.get(f"{API}/cidadaos/{cidadao}/alergias", headers=token("admin_b"))).status_code == 404
    assert (await client.post(f"{API}/cidadaos/{cidadao}/alergias", json={"categoria": "MEDICAMENTO", "agente_descricao": "Xyz"}, headers=token("recepcao"))).status_code == 403


@pytest.mark.asyncio
async def test_b6_019_033_prescricao_alertas_receituarios_e_copia(client, token, mundo):
    cidadao = await _cidadao(client, token)
    outro = await _cidadao(client, token, nome="Outro Paciente")
    await client.post(f"{API}/cidadaos/{cidadao}/alergias", json={"categoria": "MEDICAMENTO", "agente_codigo": "MED-A", "agente_descricao": "Medicamento A"}, headers=token("medico"))
    at = (await _abrir(client, token, mundo, cidadao)).json()
    itens = [
        {"medicamento_codigo": "MED-A", "descricao": "Medicamento A", "posologia": "1x ao dia", "uso_continuo": True},
        {"medicamento_codigo": "MED-B", "descricao": "Medicamento B", "posologia": "8/8h", "tipo_receituario": "ANTIMICROBIANO"},
        {"medicamento_codigo": "MED-B", "descricao": "Medicamento B", "posologia": "12/12h", "tipo_receituario": "ANTIMICROBIANO"},
    ]
    p = await client.post(f"{API}/atendimentos/{at['id']}/prescricoes", json={"itens": itens}, headers=token("medico"))
    assert p.status_code == 201, p.text
    alertas = p.json()["alertas"]
    assert [a["medicamento_codigo"] for a in alertas["alergia"]] == ["MED-A"], "alerta, não bloqueia"
    assert alertas["duplicidade"]["na_prescricao"] == ["MED-B"]
    assert alertas["interacao"]["situacao"] == "NAO_AVALIADO"
    assert alertas["medicamento_potencialmente_perigoso"]["situacao"] == "NAO_AVALIADO"
    assert p.json()["receituarios"] == [{"tipo_receituario": "ANTIMICROBIANO", "itens": [1, 2]}, {"tipo_receituario": "COMUM", "itens": [0]}]
    assert (await client.post(f"{API}/atendimentos/{at['id']}/prescricoes", json={"itens": []}, headers=token("medico"))).status_code == 422
    assert (await client.post(f"{API}/atendimentos/{at['id']}/prescricoes", json={"itens": [{"descricao": "Xx", "posologia": "1x", "tipo_receituario": "AMARELA"}]}, headers=token("medico"))).status_code == 422

    at2 = (await _abrir(client, token, mundo, cidadao)).json()
    copia = await client.post(f"{API}/atendimentos/{at2['id']}/prescricoes/copiar", json={"prescricao_origem_id": p.json()["id"], "indices_itens": [0]}, headers=token("medico"))
    assert copia.status_code == 201, copia.text
    assert copia.json()["copiada_de_id"] == p.json()["id"] and len(copia.json()["itens"]) == 1
    assert copia.json()["alertas"]["duplicidade"]["uso_continuo_ativo"] == ["MED-A"]
    fora = await client.post(f"{API}/atendimentos/{at2['id']}/prescricoes/copiar", json={"prescricao_origem_id": p.json()["id"], "indices_itens": [9]}, headers=token("medico"))
    assert fora.status_code == 422
    at_outro = (await _abrir(client, token, mundo, outro)).json()
    alheia = await client.post(f"{API}/atendimentos/{at_outro['id']}/prescricoes/copiar", json={"prescricao_origem_id": p.json()["id"]}, headers=token("medico"))
    assert alheia.status_code == 422 and alheia.json()["codigo"] == "cidadao_divergente"

    ass = await client.post(f"{API}/prescricoes/{p.json()['id']}/assinar", headers=token("medico"))
    assert ass.status_code == 200 and ass.json()["assinada_em"]
    assert (await client.post(f"{API}/prescricoes/{p.json()['id']}/assinar", headers=token("admin_b"))).status_code == 404
    lista = await client.get(f"{API}/cidadaos/{cidadao}/prescricoes", headers=token("medico"))
    assert len(lista.json()) == 2
    assert (await client.post(f"{API}/atendimentos/{at['id']}/prescricoes", json={"itens": itens[:1]}, headers=token("recepcao"))).status_code == 403


@pytest.mark.asyncio
async def test_b6_025_057_registros_configuraveis_formulario_assinatura_retificacao(client, token, mundo):
    form = await client.post(
        "/api/govsaude/v1/formularios",
        json={"codigo": "ESCALA_TESTE", "nome": "Escala de teste", "schema_json": {"type": "object", "additionalProperties": False, "required": ["pontos"], "properties": {"pontos": {"type": "integer"}}}},
        headers=token("admin"),
    )
    assert form.status_code == 201, form.text
    await _config(client, token, "prontuario.tipos_registro", {"ESCALA": {"formulario_codigo": "ESCALA_TESTE"}, "ENCAMINHAMENTO": {}})
    cidadao = await _cidadao(client, token)
    at = (await _abrir(client, token, mundo, cidadao)).json()
    url = f"{API}/registros"
    nao_conf = await client.post(url, json={"cidadao_id": cidadao, "tipo": "QUALQUER", "dados": {"a": 1}}, headers=token("medico"))
    assert nao_conf.status_code == 422 and nao_conf.json()["codigo"] == "tipo_registro_invalido"
    invalido = await client.post(url, json={"cidadao_id": cidadao, "atendimento_id": at["id"], "tipo": "ESCALA", "dados": {"pontos": "dez"}}, headers=token("medico"))
    assert invalido.status_code == 422 and invalido.json()["codigo"] == "formulario_invalido"
    reg = await client.post(url, json={"cidadao_id": cidadao, "atendimento_id": at["id"], "tipo": "ESCALA", "dados": {"pontos": 7}}, headers=token("medico"))
    assert reg.status_code == 201, reg.text
    assert reg.json()["versao_formulario"] == 1
    outro = await _cidadao(client, token, nome="Outro Paciente")
    divergente = await client.post(url, json={"cidadao_id": outro, "atendimento_id": at["id"], "tipo": "ENCAMINHAMENTO", "dados": {"destino": "Cardiologia"}}, headers=token("medico"))
    assert divergente.status_code == 409

    assert (await client.post(f"{url}/{reg.json()['id']}/retificar", json={"dados": {"pontos": 8}, "justificativa": "Soma da escala estava incorreta"}, headers=token("medico"))).status_code == 409
    assert (await client.post(f"{url}/{reg.json()['id']}/assinar", headers=token("medico"))).status_code == 200
    ret = await client.post(f"{url}/{reg.json()['id']}/retificar", json={"dados": {"pontos": 8}, "justificativa": "Soma da escala estava incorreta"}, headers=token("medico"))
    assert ret.status_code == 201 and ret.json()["retifica_de_id"] == reg.json()["id"]
    de_novo = await client.post(f"{url}/{reg.json()['id']}/retificar", json={"dados": {"pontos": 9}, "justificativa": "Soma da escala estava incorreta"}, headers=token("medico"))
    assert de_novo.status_code == 409
    lista = await client.get(f"{API}/cidadaos/{cidadao}/registros", params={"tipo": "ESCALA"}, headers=token("medico"))
    assert {r["status"] for r in lista.json()} == {"RETIFICADO", "ATIVO"}
    assert (await client.post(f"{url}/{reg.json()['id']}/assinar", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b12_021_025_sigilo_escopo_e_linha_do_tempo(client, token, mundo):
    cidadao = await _cidadao(client, token)
    normal = (await _abrir(client, token, mundo, cidadao)).json()
    sigiloso = (await _abrir(client, token, mundo, cidadao, sigiloso=True)).json()
    reg = await client.post(f"{API}/registros", json={"cidadao_id": cidadao, "atendimento_id": sigiloso["id"], "tipo": "NOTIFICACAO", "dados": {"agravo": "teste"}}, headers=token("medico"))
    assert reg.json()["sigiloso"] is True, "herda o sigilo do atendimento"

    # Gestor tem PRONTUARIO_LER mas não PRONTUARIO_LER_SIGILOSO.
    assert (await client.get(f"{API}/atendimentos/{sigiloso['id']}", headers=token("gestor"))).status_code == 404
    assert (await client.get(f"{API}/atendimentos/{normal['id']}", headers=token("gestor"))).status_code == 200
    assert (await client.get(f"{API}/cidadaos/{cidadao}/registros", headers=token("gestor"))).json() == []
    tempo = (await client.get(f"{API}/cidadaos/{cidadao}/linha-do-tempo", headers=token("gestor"))).json()
    velados = [e for e in tempo if e.get("velado")]
    assert len(velados) == 2 and all("status" not in e for e in velados)
    completo = (await client.get(f"{API}/cidadaos/{cidadao}/linha-do-tempo", headers=token("medico"))).json()
    assert len(completo) == 3 and not any(e.get("velado") for e in completo)

    fora = await client.post(f"{API}/atendimentos", json={"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_b"].id), "iniciado_em": _agora()}, headers=token("medico_escopo"))
    assert fora.status_code == 404
    assert (await client.get(f"{API}/cidadaos/{cidadao}/linha-do-tempo", headers=token("admin_b"))).status_code == 404
    assert (await client.get(f"{API}/atendimentos/{normal['id']}", headers=token("recepcao"))).status_code == 403


@pytest.mark.asyncio
async def test_b6_056_retroativo_em_contingencia_e_b6_041_validade(client, token, mundo):
    cidadao = await _cidadao(client, token)
    nao_sinalizado = await _abrir(client, token, mundo, cidadao, iniciado_em=_agora(days=3))
    assert nao_sinalizado.status_code == 422 and nao_sinalizado.json()["codigo"] == "retroativo_nao_sinalizado"
    futuro = await _abrir(client, token, mundo, cidadao, iniciado_em=_agora(days=-1))
    assert futuro.json()["codigo"] == "data_futura"
    justificativa = "Sistema indisponível durante o plantão"
    desligado = await _abrir(client, token, mundo, cidadao, iniciado_em=_agora(days=3), retroativo=True, justificativa_retroativa=justificativa)
    assert desligado.status_code == 409 and desligado.json()["codigo"] == "retroativo_nao_habilitado"

    await _config(client, token, "prontuario.retroativo_contingencia_ativa", True)
    await _config(client, token, "prontuario.retroativo_dias_maximos", 10)
    sem_just = await _abrir(client, token, mundo, cidadao, iniciado_em=_agora(days=3), retroativo=True)
    assert sem_just.json()["codigo"] == "retroativo_sem_justificativa"
    antigo = await _abrir(client, token, mundo, cidadao, iniciado_em=_agora(days=20), retroativo=True, justificativa_retroativa=justificativa)
    assert antigo.json()["codigo"] == "retroativo_fora_do_limite"
    ok = await _abrir(client, token, mundo, cidadao, iniciado_em=_agora(days=3), retroativo=True, justificativa_retroativa=justificativa)
    assert ok.status_code == 201 and ok.json()["retroativo"] is True

    url = f"{API}/cidadaos/{cidadao}/validade-consulta"
    assert (await client.get(url, params={"tipo": "CONSULTA"}, headers=token("medico"))).json()["situacao"] == "NAO_CONFIGURADO"
    await _config(client, token, "prontuario.validade_consulta_dias", {"CONSULTA": 30})
    assert (await client.get(url, params={"tipo": "CONSULTA"}, headers=token("medico"))).json()["situacao"] == "SEM_ATENDIMENTO"
    await client.post(f"{API}/atendimentos/{ok.json()['id']}/encerrar", json={}, headers=token("medico"))
    vigente = (await client.get(url, params={"tipo": "CONSULTA"}, headers=token("medico"))).json()
    assert vigente["situacao"] == "VIGENTE" and vigente["dias_validade"] == 30
    assert (await client.get(url, params={"tipo": "CONSULTA"}, headers=token("admin_b"))).status_code == 404
