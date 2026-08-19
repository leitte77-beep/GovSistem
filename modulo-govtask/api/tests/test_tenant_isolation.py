"""Teste crítico de isolamento entre tenants (§102).

Usuário do tenant A não pode acessar processos/tarefas do tenant B, nem
manipulá-los via URL/requisição.
"""

BASE = "/api/govtask"


async def _criar_processo(client, headers, titulo):
    resp = await client.post(
        f"{BASE}/convenios",
        headers=headers,
        json={"titulo": titulo, "tipo": "OBRA"},
    )
    assert resp.status_code == 201
    return resp.json()


async def test_usuario_a_nao_acessa_processo_b(client, make_tenant):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")

    pa = await _criar_processo(client, a["headers"], "Processo A")
    pb = await _criar_processo(client, b["headers"], "Processo B")

    # A não consegue GET do processo B
    r = await client.get(f"{BASE}/convenios/{pb['id']}", headers=a["headers"])
    assert r.status_code == 404

    # B não consegue GET do processo A
    r = await client.get(f"{BASE}/convenios/{pa['id']}", headers=b["headers"])
    assert r.status_code == 404

    # A não consegue PATCH do processo B (IDOR/BOLA)
    r = await client.patch(
        f"{BASE}/convenios/{pb['id']}",
        headers=a["headers"],
        json={"titulo": "Invasão"},
    )
    assert r.status_code == 404

    # A não consegue DELETE do processo B
    r = await client.request("DELETE", f"{BASE}/convenios/{pb['id']}", headers=a["headers"])
    assert r.status_code == 404

    # A lista apenas seus processos
    r = await client.get(f"{BASE}/convenios", headers=a["headers"])
    ids = [c["id"] for c in r.json()]
    assert pa["id"] in ids
    assert pb["id"] not in ids


async def test_isolation_em_tarefas(client, make_tenant):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")

    pa = await _criar_processo(client, a["headers"], "Processo A")
    # etapa no processo A
    r = await client.post(
        f"{BASE}/convenios/{pa['id']}/etapas",
        headers=a["headers"],
        json={"nome": "Execução", "natureza": "INTERNA", "ordem": 1},
    )
    etapa = r.json()
    # tarefa no processo A
    r = await client.post(
        f"{BASE}/etapas/{etapa['id']}/tarefas",
        headers=a["headers"],
        json={"titulo": "Tarefa secreta A"},
    )
    tarefa = r.json()

    # B não consegue ver a tarefa do tenant A
    r = await client.get(f"{BASE}/tarefas/{tarefa['id']}", headers=b["headers"])
    assert r.status_code == 404

    # B não consegue aceitar a tarefa do tenant A
    r = await client.post(f"{BASE}/tarefas/{tarefa['id']}/aceitar", headers=b["headers"])
    assert r.status_code == 404


async def test_sem_token_retorna_401(client):
    r = await client.get(f"{BASE}/convenios")
    assert r.status_code == 401
