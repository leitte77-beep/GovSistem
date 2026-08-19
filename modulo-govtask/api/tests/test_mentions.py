"""Teste de @menções em comentários: gera notificação para o usuário citado."""

BASE = "/api/govtask"


async def test_menção_gera_notificacao(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"], name="João Souza")

    h = assessor["headers"]

    r = await client.post(
        f"{BASE}/convenios", headers=h,
        json={"titulo": "Processo com menção", "tipo": "OBRA"},
    )
    pid = r.json()["id"]

    r = await client.post(
        f"{BASE}/convenios/{pid}/etapas", headers=h,
        json={"nome": "Execução", "natureza": "INTERNA", "ordem": 1},
    )
    eid = r.json()["id"]

    r = await client.post(
        f"{BASE}/etapas/{eid}/tarefas", headers=h,
        json={"titulo": "Tarefa comentada"},
    )
    tid = r.json()["id"]

    # Comentário com @menção ao engenheiro
    r = await client.post(
        f"{BASE}/tarefas/{tid}/comentarios", headers=h,
        json={"texto": "@João pode verificar o orçamento da estrutura?"},
    )
    assert r.status_code == 201

    # O usuário mencionado recebeu notificação de menção
    r = await client.get(f"{BASE}/notificacoes", headers=engenheiro["headers"])
    assert r.status_code == 200
    notifs = r.json()
    assert any(n["tipo"] == "COMENTARIO_MENCAO" for n in notifs)
    assert any("mencionou você" in n["mensagem"] for n in notifs)


async def test_sem_menção_nao_gera_notificacao(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"], name="Maria")

    h = assessor["headers"]
    r = await client.post(f"{BASE}/convenios", headers=h, json={"titulo": "P", "tipo": "OBRA"})
    pid = r.json()["id"]
    r = await client.post(f"{BASE}/convenios/{pid}/etapas", headers=h, json={"nome": "E", "natureza": "INTERNA", "ordem": 1})
    eid = r.json()["id"]
    r = await client.post(f"{BASE}/etapas/{eid}/tarefas", headers=h, json={"titulo": "T"})
    tid = r.json()["id"]

    await client.post(
        f"{BASE}/tarefas/{tid}/comentarios", headers=h,
        json={"texto": "Comentário sem menção a ninguém"},
    )

    r = await client.get(f"{BASE}/notificacoes", headers=engenheiro["headers"])
    assert r.status_code == 200
    assert not any(n["tipo"] == "COMENTARIO_MENCAO" for n in r.json())
