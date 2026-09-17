"""Teste de escalonamento de atrasos configurável (§59)."""

from datetime import datetime, timedelta, timezone

BASE = "/api/govtask"


async def test_escalonamento_gera_notificacoes_por_nivel(client, make_tenant):
    coord = await make_tenant("ASSESSOR")
    org = coord["org"]
    responsavel = await make_tenant("ENGENHEIRO_TECNICO", org=org, name="Responsável")
    gestor = await make_tenant("GESTOR", org=org, name="Gestor")
    admin = await make_tenant("ADMIN", org=org, name="Admin")

    h = coord["headers"]

    # Configuração de escalonamento com defaults (1/3/5 dias)
    cfg = await client.get(f"{BASE}/admin/escalonamento", headers=h)
    assert cfg.status_code == 200

    # Processo, etapa e tarefa atrasada há 6 dias, atribuída ao responsável
    r = await client.post(f"{BASE}/convenios", headers=h, json={"titulo": "P", "tipo": "OBRA"})
    pid = r.json()["id"]
    r = await client.post(f"{BASE}/convenios/{pid}/etapas", headers=h, json={"nome": "E", "natureza": "INTERNA", "ordem": 1})
    eid = r.json()["id"]

    prazo_atrasado = (datetime.now(timezone.utc) - timedelta(days=6)).strftime("%Y-%m-%d")
    r = await client.post(
        f"{BASE}/etapas/{eid}/tarefas",
        headers=h,
        json={"titulo": "Tarefa muito atrasada", "atribuida_a_id": str(responsavel["user"].id), "prazo": prazo_atrasado},
    )
    assert r.status_code == 201
    tid = r.json()["id"]

    # Dispara a verificação (escalonamento)
    r = await client.post(f"{BASE}/admin/escalonamento/verificar", headers=h)
    assert r.status_code == 200

    # Responsável recebeu aviso de prazo vencido
    r = await client.get(f"{BASE}/notificacoes", headers=responsavel["headers"])
    assert any(n["tipo"] == "PRAZO_VENCIDO" for n in r.json())

    # Coordenador recebeu notificação de escalonamento (nível 1/2 → ASSESSOR)
    r = await client.get(f"{BASE}/notificacoes", headers=coord["headers"])
    assert any(n["tipo"] == "ATRASO_ESCALADO" for n in r.json())

    # Gestor recebeu notificação de escalonamento (nível 2/3 → GESTOR)
    r = await client.get(f"{BASE}/notificacoes", headers=gestor["headers"])
    assert any(n["tipo"] == "ATRASO_ESCALADO" for n in r.json())

    # Não duplica: rodar de novo não gera novos escalonamentos
    r = await client.post(f"{BASE}/admin/escalonamento/verificar", headers=h)
    assert r.json()["escalonadas"] == 0


async def test_config_escalonamento_atualiza(client, make_tenant):
    admin = await make_tenant("ADMIN")
    h = admin["headers"]

    r = await client.put(
        f"{BASE}/admin/escalonamento",
        headers=h,
        json={"ativo": True, "dia_responsavel": 2, "dia_coordenador": 5, "dia_gestor": 8},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["dia_responsavel"] == 2
    assert body["dia_coordenador"] == 5
    assert body["dia_gestor"] == 8


async def test_nao_admin_nao_edita_escalonamento(client, make_tenant):
    gestor = await make_tenant("GESTOR")
    r = await client.put(
        f"{BASE}/admin/escalonamento",
        headers=gestor["headers"],
        json={"ativo": True, "dia_responsavel": 1, "dia_coordenador": 3, "dia_gestor": 5},
    )
    assert r.status_code == 403
