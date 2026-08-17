"""Solicitação de contratação (seções 8-10) e abertura de processo."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_criar_e_enviar_solicitacao_abre_processo(client, token, mundo):
    setores = mundo["setores"]
    payload = {
        "secretaria_id": str(setores["_secretaria_saude"].id),
        "setor_id": str(setores["solicitante_saude"].id),
        "objeto": "Aquisição de 5 impressoras multifuncionais",
        "justificativa": "As impressoras atuais estão fora de garantia e sem peças de reposição.",
        "prioridade": "normal",
        "itens": [
            {"descricao": "Impressora multifuncional laser", "unidade": "unidade", "quantidade": 5, "valor_unitario_estimado": 1200.0}
        ],
    }
    criada = await client.post("/api/govcompras/v1/solicitacoes", json=payload, headers=token("solicitante"))
    assert criada.status_code == 201, criada.text
    corpo = criada.json()
    assert corpo["status"] == "rascunho"
    assert corpo["valor_estimado_total"] == 6000.0
    assert len(corpo["itens"]) == 1

    enviada = await client.post(
        f"/api/govcompras/v1/solicitacoes/{corpo['id']}/enviar",
        json={"tipo_processo": "pregao"},
        headers=token("solicitante"),
    )
    assert enviada.status_code == 200, enviada.text
    processo = enviada.json()
    assert processo["status_geral"] == "em_andamento"
    assert processo["etapa_atual_codigo"] == "solicitacao"
    assert processo["numero_processo"].endswith("/2026") or "/" in processo["numero_processo"]


async def test_enviar_solicitacao_duas_vezes_falha(client, token, mundo):
    setores = mundo["setores"]
    payload = {
        "secretaria_id": str(setores["_secretaria_saude"].id),
        "objeto": "Aquisição de cadeiras de escritório",
        "justificativa": "Substituição de mobiliário danificado.",
        "itens": [],
    }
    criada = await client.post("/api/govcompras/v1/solicitacoes", json=payload, headers=token("solicitante"))
    solicitacao_id = criada.json()["id"]

    primeira = await client.post(
        f"/api/govcompras/v1/solicitacoes/{solicitacao_id}/enviar",
        json={"tipo_processo": "dispensa"},
        headers=token("solicitante"),
    )
    assert primeira.status_code == 200

    segunda = await client.post(
        f"/api/govcompras/v1/solicitacoes/{solicitacao_id}/enviar",
        json={"tipo_processo": "dispensa"},
        headers=token("solicitante"),
    )
    assert segunda.status_code == 409


async def test_criar_solicitacao_sem_permissao_falha(client, token, mundo):
    setores = mundo["setores"]
    payload = {
        "secretaria_id": str(setores["_secretaria_saude"].id),
        "objeto": "Objeto qualquer",
        "justificativa": "Justificativa qualquer.",
        "itens": [],
    }
    resposta = await client.post("/api/govcompras/v1/solicitacoes", json=payload, headers=token("fiscal"))
    assert resposta.status_code == 403
