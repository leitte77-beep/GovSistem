"""Fluxo completo de solicitação de caçamba (itens 12 a 17) + regras (item 13)."""

from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


def proximo_dia_util(partir: date) -> date:
    dia = partir
    while dia.weekday() >= 5:  # sábado = 5, domingo = 6
        dia += timedelta(days=1)
    return dia


async def _criar_residuo(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/tipos-residuo",
        json={"chave": "entulho-teste", "nome": "Entulho de teste"},
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    lista = await client.get("/api/govinfra/v1/tipos-residuo", headers=token("atendente"))
    return next(r for r in lista.json() if r["chave"] == "entulho-teste")


async def _criar_veiculo(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/veiculos",
        json={
            "codigo": "VEI-TESTE-01",
            "placa": "ABC1D23",
            "nome": "Caminhão de teste",
            "tipo": "caminhao_cacamba",
            "transporta_cacamba": True,
            "odometro_atual": 50000,
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201, resposta.text
    lista = await client.get(
        "/api/govinfra/v1/veiculos", params={"termo": "VEI-TESTE-01"}, headers=token("gestor")
    )
    return next(v for v in lista.json()["itens"] if v["codigo"] == "VEI-TESTE-01")


async def _criar_solicitacao(client, token, pessoa, residuo, **extra):
    corpo = {
        "pessoa_id": pessoa["id"],
        "logradouro": pessoa["logradouro"],
        "numero": pessoa["numero"],
        "bairro": pessoa["bairro"],
        "espaco_confirmado": True,
        "acesso_caminhao_confirmado": True,
        "tipo_residuo_id": residuo["id"],
        "descricao_material": "Entulho de reforma",
        "quantidade_estimada_m3": 3,
        "ciente_itens_proibidos": True,
        "data_desejada": str(proximo_dia_util(date.today() + timedelta(days=2))),
        "dias_previstos": 3,
        "termo_aceito": True,
    }
    corpo.update(extra)
    return await client.post("/api/govinfra/v1/solicitacoes", json=corpo, headers=token("atendente"))


async def _detalhe(client, token, solicitacao_id):
    resposta = await client.get(
        f"/api/govinfra/v1/solicitacoes/{solicitacao_id}", headers=token("atendente")
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def test_fluxo_completo(client, token, pessoa, cacamba):
    residuo = await _criar_residuo(client, token)
    veiculo = await _criar_veiculo(client, token)

    criada = await _criar_solicitacao(client, token, pessoa, residuo)
    assert criada.status_code == 201, criada.text
    solicitacao = criada.json()
    assert solicitacao["situacao"] == "pendente"
    assert solicitacao["protocolo"]

    # Aprovação exige gestor — atendente não pode.
    sem_perm = await client.post(
        f"/api/govinfra/v1/solicitacoes/{solicitacao['id']}/aprovar",
        json={},
        headers=token("atendente"),
    )
    assert sem_perm.status_code == 403

    aprovada = await client.post(
        f"/api/govinfra/v1/solicitacoes/{solicitacao['id']}/aprovar",
        json={},
        headers=token("gestor"),
    )
    assert aprovada.status_code == 200, aprovada.text
    assert (await _detalhe(client, token, solicitacao["id"]))["situacao"] == "aprovada"

    # Agendamento vincula caçamba e caminhão.
    agendada = await client.post(
        f"/api/govinfra/v1/solicitacoes/{solicitacao['id']}/agendar",
        json={
            "data_agendada": str(proximo_dia_util(date.today() + timedelta(days=3))),
            "dias_previstos": 3,
            "cacamba_id": cacamba["id"],
            "veiculo_id": veiculo["id"],
        },
        headers=token("gestor"),
    )
    assert agendada.status_code == 200, agendada.text
    detalhe = await _detalhe(client, token, solicitacao["id"])
    assert detalhe["situacao"] == "agendada"
    assert detalhe["data_prevista_retirada"]

    # Entrega registrada pelo motorista.
    entregue = await client.post(
        f"/api/govinfra/v1/solicitacoes/{solicitacao['id']}/entrega",
        json={
            "cacamba_id": cacamba["id"],
            "veiculo_id": veiculo["id"],
            "entregue_em": "2026-08-06T10:00:00Z",
            "km_saida": 50000,
            "km_chegada": 50012,
            "recebido_por": pessoa["nome"],
            "latitude": -27.21,
            "longitude": -52.03,
        },
        headers=token("motorista"),
    )
    assert entregue.status_code == 200, entregue.text
    dados = await _detalhe(client, token, solicitacao["id"])
    assert dados["situacao"] == "em_uso"
    assert dados["cacamba_codigo"] == cacamba["codigo"]

    # A caçamba ficou em uso e com localização atualizada.
    detalhe_cacamba = await client.get(
        f"/api/govinfra/v1/cacambas/{cacamba['id']}", headers=token("consulta")
    )
    assert detalhe_cacamba.json()["situacao"] == "em_uso"

    # Retirada conclui o fluxo.
    retirada = await client.post(
        f"/api/govinfra/v1/solicitacoes/{solicitacao['id']}/retirada",
        json={
            "veiculo_id": veiculo["id"],
            "retirada_em": "2026-08-10T09:00:00Z",
            "tipo_material_encontrado": "entulho",
            "destinacao": "Aterro autorizado",
            "destino_cacamba": "limpeza",
        },
        headers=token("motorista"),
    )
    assert retirada.status_code == 200, retirada.text
    dados = await _detalhe(client, token, solicitacao["id"])
    assert dados["situacao"] == "concluida"


async def test_entrega_exige_recursos(client, token, pessoa):
    residuo = await _criar_residuo(client, token)
    criada = await _criar_solicitacao(client, token, pessoa, residuo)
    solicitacao = criada.json()
    resposta = await client.post(
        f"/api/govinfra/v1/solicitacoes/{solicitacao['id']}/entrega",
        json={"entregue_em": "2026-08-06T10:00:00Z"},
        headers=token("motorista"),
    )
    assert resposta.status_code == 422
    assert resposta.json()["erro"] == "recursos_obrigatorios"


async def test_solicitacao_duplicada_mesmo_dia(client, token, pessoa):
    residuo = await _criar_residuo(client, token)
    primeira = await _criar_solicitacao(client, token, pessoa, residuo)
    assert primeira.status_code == 201

    segunda = await _criar_solicitacao(client, token, pessoa, residuo)
    assert segunda.status_code == 422
    assert segunda.json()["erro"] == "impedimento_elegibilidade"


async def test_solicitacao_sem_termo(client, token, pessoa):
    residuo = await _criar_residuo(client, token)
    resposta = await _criar_solicitacao(client, token, pessoa, residuo, termo_aceito=False)
    assert resposta.status_code == 422


async def test_rascunho_nao_valida_regras(client, token, cpf_unico):
    """Rascunho não passa pelas regras de elegibilidade (mecanismo do item 12)."""
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={"nome": "Outro Cidadão", "documento": cpf_unico()},
        headers=token("atendente"),
    )
    detalhe = await client.get(
        f"/api/govinfra/v1/pessoas/{resposta.json()['id']}", headers=token("atendente")
    )
    pessoa2 = detalhe.json()
    residuo = await _criar_residuo(client, token)
    rascunho = await _criar_solicitacao(
        client, token, pessoa2, residuo, rascunho=True, termo_aceito=False
    )
    assert rascunho.status_code == 201, rascunho.text
    assert rascunho.json()["situacao"] == "rascunho"


async def test_recomendar_datas(client, token, pessoa, cacamba):
    await _criar_veiculo(client, token)
    resposta = await client.post(
        "/api/govinfra/v1/solicitacoes/recomendar-datas",
        json={
            "data_preferida": str(proximo_dia_util(date.today() + timedelta(days=2))),
            "dias_uso": 3,
            "quantidade": 3,
        },
        headers=token("atendente"),
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    opcoes = corpo["opcoes"]
    assert isinstance(opcoes, list)
    assert len(opcoes) >= 1
    assert "pontuacao" in opcoes[0]
    assert "data" in opcoes[0]


async def test_bloqueio_impede_solicitacao(client, token, pessoa):
    residuo = await _criar_residuo(client, token)
    criada = await _criar_solicitacao(client, token, pessoa, residuo)
    assert criada.status_code == 201

    bloqueio = await client.post(
        "/api/govinfra/v1/bloqueios",
        json={
            "pessoa_id": pessoa["id"],
            "servico_afetado": "cacambas",
            "tipo": "temporario",
            "motivo": "Pendência em atendimento anterior",
            "descricao": "Caçamba não devolvida",
            "data_inicio": "2026-08-01",
            "data_fim": "2026-12-31",
        },
        headers=token("gestor"),
    )
    assert bloqueio.status_code == 201, bloqueio.text

    nova = await _criar_solicitacao(client, token, pessoa, residuo)
    assert nova.status_code == 422
    motivos = nova.json().get("motivos", [])
    assert any("bloqueio" in (m.get("mensagem") or "").lower() for m in motivos)


async def test_verificacao_bloqueios_endpoint(client, token, pessoa):
    resposta = await client.get(
        "/api/govinfra/v1/bloqueios/verificar",
        params={"pessoa_id": pessoa["id"], "servico": "cacambas"},
        headers=token("atendente"),
    )
    assert resposta.status_code == 200
    assert "elegivel" in resposta.json()
