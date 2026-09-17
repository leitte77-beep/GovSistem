"""O ciclo assessor → departamento → devolução → protocolo.

Testa os endpoints que sustentam as telas de trabalho: a mesa do assessor,
a caixa do departamento e o encaminhamento direto de uma demanda.
"""

import uuid

from sqlalchemy import select

from app.models import Setor
from app.models.tarefa import Tarefa

BASE = "/api/govtask"


async def _processo(client, dono, titulo="Construção de CMEI"):
    r = await client.post(
        f"{BASE}/convenios", headers=dono["headers"], json={"titulo": titulo, "tipo": "OBRA"}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _setor(db, org, nome="Engenharia"):
    setor = Setor(nome=nome, sigla=nome[:3].upper(), organization_id=org.id)
    db.add(setor)
    await db.commit()
    return setor


# ── Encaminhamento ──────────────────────────────────────────────────────────

async def test_encaminhar_cria_etapa_quando_processo_nao_tem_nenhuma(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    setor = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={
            "setor_destino_id": str(setor.id),
            "titulo": "Elaborar projeto executivo",
            "descricao": "Plantas, orçamento e cronograma",
            "prazo": "2026-09-30T00:00:00Z",
            "prazo_interno": "2026-09-25T00:00:00Z",
        },
    )
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert corpo["setor"] == "Engenharia"
    assert corpo["etapa_id"]

    tarefa = await _db.scalar(select(Tarefa).where(Tarefa.id == uuid.UUID(corpo["id"])))
    assert tarefa.setor_destino_id == setor.id
    assert tarefa.prazo_interno is not None


async def test_encaminhar_usa_etapa_em_andamento(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    setor = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    e1 = (await client.post(
        f"{BASE}/convenios/{processo['id']}/etapas", headers=assessor["headers"],
        json={"nome": "Protocolo", "natureza": "GOVERNO", "ordem": 1},
    )).json()
    e2 = (await client.post(
        f"{BASE}/convenios/{processo['id']}/etapas", headers=assessor["headers"],
        json={"nome": "Projeto", "natureza": "INTERNA", "ordem": 2},
    )).json()
    await client.patch(
        f"{BASE}/etapas/{e2['id']}", headers=assessor["headers"], json={"status": "EM_ANDAMENTO"}
    )

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={"setor_destino_id": str(setor.id), "titulo": "Projeto arquitetônico"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["etapa_id"] == e2["id"]
    assert r.json()["etapa_id"] != e1["id"]


async def test_engenharia_nao_encaminha_demanda(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    setor = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    r = await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=engenheiro["headers"],
        json={"setor_destino_id": str(setor.id), "titulo": "Não autorizado"},
    )
    assert r.status_code == 403


async def test_encaminhar_respeita_o_tenant(client, make_tenant, _db):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    setor_b = await _setor(_db, b["org"], nome="Engenharia B")
    processo_a = await _processo(client, a)

    # Processo de outro tenant.
    r = await client.post(
        f"{BASE}/convenios/{processo_a['id']}/encaminhar",
        headers=b["headers"],
        json={"setor_destino_id": str(setor_b.id), "titulo": "Invasão"},
    )
    assert r.status_code == 404

    # Departamento de outro tenant no próprio processo.
    r = await client.post(
        f"{BASE}/convenios/{processo_a['id']}/encaminhar",
        headers=a["headers"],
        json={"setor_destino_id": str(setor_b.id), "titulo": "Setor alheio"},
    )
    assert r.status_code == 422


# ── Mesa do assessor ────────────────────────────────────────────────────────

async def test_mesa_agrupa_demandas_por_departamento(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    engenharia = await _setor(_db, assessor["org"], "Engenharia")
    juridico = await _setor(_db, assessor["org"], "Jurídico")
    processo = await _processo(client, assessor)

    for setor, titulo in [(engenharia, "Projeto"), (engenharia, "Orçamento"), (juridico, "Parecer")]:
        r = await client.post(
            f"{BASE}/convenios/{processo['id']}/encaminhar",
            headers=assessor["headers"],
            json={"setor_destino_id": str(setor.id), "titulo": titulo},
        )
        assert r.status_code == 201

    r = await client.get(f"{BASE}/mesa", headers=assessor["headers"])
    assert r.status_code == 200, r.text
    mesa = r.json()

    por_setor = {s["setor"]: s["total"] for s in mesa["nos_setores"]}
    assert por_setor == {"Engenharia": 2, "Jurídico": 1}
    assert mesa["nos_setores"][0]["setor"] == "Engenharia"  # maior volume primeiro
    assert mesa["para_analisar"] == []
    # Processo sem protocolo aparece como pendente de protocolo no governo.
    assert [p["titulo"] for p in mesa["para_protocolar"]] == ["Construção de CMEI"]


async def test_mesa_mostra_entrega_para_analise(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    engenharia = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    criada = (await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={
            "setor_destino_id": str(engenharia.id),
            "titulo": "Projeto executivo",
            "atribuida_a_id": str(engenheiro["user"].id),
        },
    )).json()

    await client.post(f"{BASE}/tarefas/{criada['id']}/aceitar", headers=engenheiro["headers"])
    r = await client.post(
        f"{BASE}/tarefas/{criada['id']}/entregar",
        headers=engenheiro["headers"],
        json={"observacao": "Projeto concluído"},
    )
    assert r.status_code == 200, r.text

    mesa = (await client.get(f"{BASE}/mesa", headers=assessor["headers"])).json()
    assert [d["titulo"] for d in mesa["para_analisar"]] == ["Projeto executivo"]
    assert mesa["nos_setores"] == []


async def test_mesa_exige_permissao_de_coordenacao(client, make_tenant):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])

    r = await client.get(f"{BASE}/mesa", headers=engenheiro["headers"])
    assert r.status_code == 403


async def test_mesa_nao_vaza_entre_tenants(client, make_tenant, _db):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    setor_a = await _setor(_db, a["org"])
    processo_a = await _processo(client, a, titulo="Processo do tenant A")
    await client.post(
        f"{BASE}/convenios/{processo_a['id']}/encaminhar",
        headers=a["headers"],
        json={"setor_destino_id": str(setor_a.id), "titulo": "Demanda A"},
    )

    mesa_b = (await client.get(f"{BASE}/mesa", headers=b["headers"])).json()
    assert mesa_b["nos_setores"] == []
    assert mesa_b["para_protocolar"] == []


# ── Caixa do departamento ───────────────────────────────────────────────────

async def test_caixa_do_departamento_separa_por_estado(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    engenharia = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    nova = (await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={
            "setor_destino_id": str(engenharia.id),
            "titulo": "Levantamento topográfico",
            "atribuida_a_id": str(engenheiro["user"].id),
        },
    )).json()
    andamento = (await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={
            "setor_destino_id": str(engenharia.id),
            "titulo": "Memorial descritivo",
            "atribuida_a_id": str(engenheiro["user"].id),
        },
    )).json()
    await client.post(f"{BASE}/tarefas/{andamento['id']}/aceitar", headers=engenheiro["headers"])

    caixa = (await client.get(f"{BASE}/minhas-demandas", headers=engenheiro["headers"])).json()
    assert [d["titulo"] for d in caixa["novas"]] == ["Levantamento topográfico"]
    assert [d["titulo"] for d in caixa["em_andamento"]] == ["Memorial descritivo"]
    assert caixa["devolvidas"] == []
    assert nova["id"]


async def test_caixa_mostra_demanda_devolvida_para_correcao(client, make_tenant, _db):
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    engenharia = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    demanda = (await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={
            "setor_destino_id": str(engenharia.id),
            "titulo": "Orçamento",
            "atribuida_a_id": str(engenheiro["user"].id),
        },
    )).json()
    await client.post(f"{BASE}/tarefas/{demanda['id']}/aceitar", headers=engenheiro["headers"])
    await client.post(
        f"{BASE}/tarefas/{demanda['id']}/entregar",
        headers=engenheiro["headers"],
        json={"observacao": "Segue orçamento"},
    )
    r = await client.post(
        f"{BASE}/tarefas/{demanda['id']}/devolver",
        headers=assessor["headers"],
        json={"texto": "Falta assinatura do responsável técnico"},
    )
    assert r.status_code == 200, r.text

    caixa = (await client.get(f"{BASE}/minhas-demandas", headers=engenheiro["headers"])).json()
    assert [d["titulo"] for d in caixa["devolvidas"]] == ["Orçamento"]

    mesa = (await client.get(f"{BASE}/mesa", headers=assessor["headers"])).json()
    assert [d["titulo"] for d in mesa["devolvidas"]] == ["Orçamento"]


# ── Regressão: detalhe do processo com demandas encaminhadas ────────────────

async def test_detalhe_do_processo_serializa_demandas(client, make_tenant, _db):
    """O GET do processo carregava a tarefa sem seus vínculos e estourava 500.

    Reproduz o MissingGreenlet: a lista `tarefas` do detalhe expõe setor,
    responsável e etapa, que precisam vir carregados da mesma consulta.
    """
    assessor = await make_tenant("ASSESSOR")
    engenheiro = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    setor = await _setor(_db, assessor["org"])
    processo = await _processo(client, assessor)

    await client.post(
        f"{BASE}/convenios/{processo['id']}/encaminhar",
        headers=assessor["headers"],
        json={
            "setor_destino_id": str(setor.id),
            "titulo": "Tarefa teste 1",
            "atribuida_a_id": str(engenheiro["user"].id),
        },
    )

    r = await client.get(f"{BASE}/convenios/{processo['id']}", headers=assessor["headers"])
    assert r.status_code == 200, r.text
    tarefas = r.json()["tarefas"]
    assert len(tarefas) == 1
    assert tarefas[0]["setor_destino"]["nome"] == "Engenharia"
    assert tarefas[0]["atribuida_a"]["name"] == engenheiro["user"].name
    assert tarefas[0]["etapa"]["nome"]
