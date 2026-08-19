"""Teste funcional do fluxo completo (cenário CMEI — §103/§140).

Processo criado → proposta → protocolo → etapa → tarefa → aceite → entrega
→ devolução → correção → conclusão, com timeline e isolamento preservados.
"""

BASE = "/api/govtask"


async def test_fluxo_completo_cmei(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    h = assessor["headers"]

    # 1. Processo criado
    r = await client.post(
        f"{BASE}/convenios",
        headers=h,
        json={
            "titulo": "Construção do CMEI Modelo",
            "tipo": "OBRA",
            "categoria": "EMENDA_PARLAMENTAR",
            "esfera": "FEDERAL",
            "valor": 2500000,
            "valor_aprovado": 2500000,
            "parlamentar": "Deputado XXXXX",
        },
    )
    assert r.status_code == 201
    processo = r.json()
    pid = processo["id"]

    # 2. Proposta protocolada no Governo
    r = await client.post(
        f"{BASE}/convenios/{pid}/protocolo",
        headers=h,
        json={"numero_protocolo": "09032026-012345", "data_protocolo": "2026-08-18"},
    )
    assert r.status_code == 200
    assert r.json()["numero_protocolo_governo"] == "09032026-012345"

    # 3. Governo solicita documentação → etapa
    r = await client.post(
        f"{BASE}/convenios/{pid}/etapas",
        headers=h,
        json={"nome": "Documentação e Análise Jurídica", "natureza": "GOVERNO", "ordem": 1},
    )
    assert r.status_code == 201
    etapa = r.json()
    eid = etapa["id"]

    # 4. Tarefa para o Jurídico
    r = await client.post(
        f"{BASE}/etapas/{eid}/tarefas",
        headers=h,
        json={"titulo": "Emitir parecer jurídico e reunir certidões", "prioridade": "ALTA"},
    )
    assert r.status_code == 201
    tarefa = r.json()
    tid = tarefa["id"]

    # 5. Jurídico aceita e entrega
    r = await client.post(f"{BASE}/tarefas/{tid}/aceitar", headers=h)
    assert r.status_code == 200
    r = await client.post(f"{BASE}/tarefas/{tid}/entregar", headers=h)
    assert r.json()["status"] == "ENTREGUE"

    # 6. Assessor devolve pedindo correção
    r = await client.post(
        f"{BASE}/tarefas/{tid}/devolver",
        headers=h,
        json={"texto": "Projeto devolvido porque falta assinatura do responsável técnico"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "DEVOLVIDA"

    # 7. Correção → aceita → entrega → conclui
    await client.post(f"{BASE}/tarefas/{tid}/aceitar", headers=h)
    await client.post(f"{BASE}/tarefas/{tid}/entregar", headers=h)
    r = await client.post(f"{BASE}/tarefas/{tid}/concluir", headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "CONCLUIDA"

    # 8. Timeline registra as movimentações
    r = await client.get(f"{BASE}/convenios/{pid}/timeline", headers=h)
    assert r.status_code == 200
    descricoes = [ev["descricao"] for ev in r.json()]
    assert any("criado" in d.lower() for d in descricoes)
    assert any("aceita" in d.lower() for d in descricoes)
    assert any("entregue" in d.lower() for d in descricoes)
    assert any("devolvida" in d.lower() for d in descricoes)


async def test_fluxo_diligencia(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    h = assessor["headers"]

    r = await client.post(
        f"{BASE}/convenios", headers=h,
        json={"titulo": "Processo com diligência", "tipo": "OBRA"},
    )
    pid = r.json()["id"]

    # Diligência recebida do Governo
    r = await client.post(
        f"{BASE}/diligencias/convenios/{pid}",
        headers=h,
        json={
            "origem": "GOVERNO_FEDERAL",
            "descricao": "Solicitada correção do orçamento",
            "prazo": "2026-09-01",
        },
    )
    assert r.status_code == 201
    dil = r.json()
    assert dil["status"] == "RECEBIDA"

    # Resposta interna
    r = await client.post(
        f"{BASE}/diligencias/{dil['id']}/responder",
        headers=h,
        json={"resposta_interna": "Orçamento corrigido pela Engenharia"},
    )
    assert r.status_code == 200

    # Protocolar resposta ao órgão
    r = await client.post(
        f"{BASE}/diligencias/{dil['id']}/protocolar",
        headers=h,
        json={"resposta_protocolo": "PROT-999"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "PROTOCOLADA"
