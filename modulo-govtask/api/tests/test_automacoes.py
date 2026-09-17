"""Automação: administração, condições, execução e isolamento de tenant."""

import pytest

BASE = "/api/govtask"


@pytest.mark.asyncio
async def test_automacao_notifica_quando_demanda_e_criada(client, make_tenant, catalogo_padrao):
    admin = await make_tenant("ADMIN")
    criada = await client.post(f"{BASE}/automacoes", headers=admin["headers"], json={
        "nome": "Avisar responsável de nova demanda",
        "gatilho": "DEMANDA_CRIADA",
        "condicao": {"alvo": "demanda", "campo": "prioridade", "operador": "igual", "valor": "ALTA"},
        "acoes": [{"tipo": "NOTIFICAR", "destinatarios": ["RESPONSAVEL_GERAL"], "mensagem": "Demanda alta criada"}],
    })
    assert criada.status_code == 201, criada.text

    resposta = await client.post(f"{BASE}/demandas", headers=admin["headers"], json={
        "titulo": "Demanda prioritária", "prioridade": "ALTA"
    })
    assert resposta.status_code == 201, resposta.text
    notificacoes = await client.get(f"{BASE}/notificacoes", headers=admin["headers"])
    assert any(n["mensagem"] == "Demanda alta criada" for n in notificacoes.json())


@pytest.mark.asyncio
async def test_automacao_nao_vaza_nem_executa_condicao_falsa(client, make_tenant, catalogo_padrao):
    admin = await make_tenant("ADMIN")
    outro = await make_tenant("ADMIN")
    criada = await client.post(f"{BASE}/automacoes", headers=admin["headers"], json={
        "nome": "Somente urgente", "gatilho": "DEMANDA_CRIADA",
        "condicao": {"alvo": "demanda", "campo": "prioridade", "operador": "igual", "valor": "URGENTE"},
        "acoes": [{"tipo": "GERAR_RESUMO", "texto": "Resumo automático"}],
    })
    assert criada.status_code == 201
    normal = await client.post(f"{BASE}/demandas", headers=admin["headers"], json={"titulo": "Normal"})
    assert normal.json()["resumo_executivo"] is None
    externa = await client.post(f"{BASE}/demandas", headers=outro["headers"], json={"titulo": "Urgente externa", "prioridade": "URGENTE"})
    assert externa.json()["resumo_executivo"] is None
    lista_externa = await client.get(f"{BASE}/automacoes", headers=outro["headers"])
    assert lista_externa.json() == []


@pytest.mark.asyncio
async def test_automacao_cria_tarefa_em_resposta_a_conclusao(client, make_tenant, catalogo_padrao):
    admin = await make_tenant("ADMIN")
    regra = await client.post(f"{BASE}/automacoes", headers=admin["headers"], json={
        "nome": "Próxima providência", "gatilho": "TAREFA_CONCLUIDA",
        "acoes": [{"tipo": "CRIAR_TAREFA", "titulo": "Protocolar documento", "atribuida_a_id": str(admin["user"].id), "exige_aceite": False}],
    })
    assert regra.status_code == 201
    demanda = (await client.post(f"{BASE}/demandas", headers=admin["headers"], json={"titulo": "Fluxo"})).json()
    tarefa = (await client.post(f"{BASE}/demandas/{demanda['id']}/tarefas", headers=admin["headers"], json={
        "titulo": "Elaborar documento", "atribuida_a_id": str(admin["user"].id)
    })).json()
    await client.post(f"{BASE}/demandas/{demanda['id']}/tarefas/{tarefa['id']}/iniciar", headers=admin["headers"])
    concluida = await client.post(f"{BASE}/demandas/{demanda['id']}/tarefas/{tarefa['id']}/concluir", headers=admin["headers"], json={"resultado": "feito"})
    assert concluida.status_code == 200, concluida.text
    tarefas = await client.get(f"{BASE}/demandas/{demanda['id']}/tarefas", headers=admin["headers"])
    assert any(item["titulo"] == "Protocolar documento" for item in tarefas.json())
