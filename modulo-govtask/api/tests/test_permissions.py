"""Testes de permissões (RBAC): usuários sem permissão não executam ações."""

BASE = "/api/govtask"


async def test_nao_assessor_nao_cria_processo(client, make_tenant):
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO")
    r = await client.post(
        f"{BASE}/convenios",
        headers=engenheiro["headers"],
        json={"titulo": "Sem permissão", "tipo": "OBRA"},
    )
    assert r.status_code == 403


async def test_nao_assessor_nao_cria_tarefa(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    gestor = await make_tenant("GESTOR")

    p = await client.post(
        f"{BASE}/convenios", headers=assessor["headers"],
        json={"titulo": "Processo", "tipo": "OBRA"},
    )
    p = p.json()
    e = await client.post(
        f"{BASE}/convenios/{p['id']}/etapas", headers=assessor["headers"],
        json={"nome": "Etapa", "natureza": "INTERNA", "ordem": 1},
    )
    e = e.json()

    # Gestor sem perfil de assessor não cria tarefa
    r = await client.post(
        f"{BASE}/etapas/{e['id']}/tarefas",
        headers=gestor["headers"],
        json={"titulo": "Bloqueado"},
    )
    assert r.status_code == 403


async def test_gestor_visualiza_mas_nao_altera(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    gestor = await make_tenant("GESTOR", org=assessor["org"])

    resp = await client.post(
        f"{BASE}/convenios", headers=assessor["headers"],
        json={"titulo": "Visível", "tipo": "AQUISICAO"},
    )
    p = resp.json()

    # Gestor consegue visualizar (GET não exige ASSESSOR)
    r = await client.get(f"{BASE}/convenios/{p['id']}", headers=gestor["headers"])
    assert r.status_code == 200

    # Mas não consegue editar (PATCH exige ASSESSOR/ADMIN)
    r = await client.patch(
        f"{BASE}/convenios/{p['id']}", headers=gestor["headers"],
        json={"titulo": "Tentativa"},
    )
    assert r.status_code == 403
