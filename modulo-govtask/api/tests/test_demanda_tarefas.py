"""Tarefas da demanda: encaminhamento, aceite, devolução e dependências."""

import pytest
from sqlalchemy import select

BASE = "/api/govtask/demandas"


async def _demanda(client, headers, titulo="Aquisição de veículo"):
    resp = await client.post(BASE, json={"titulo": titulo}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _tarefa(client, headers, demanda_id, **campos):
    payload = {"titulo": "Elaborar ofício formal", "exige_aceite": True}
    payload.update(campos)
    resp = await client.post(
        f"{BASE}/{demanda_id}/tarefas", json=payload, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_tarefa_nasce_aguardando_aceite(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id))

    assert tarefa["status"] == "AGUARDANDO_ACEITE"
    assert tarefa["tipo"] == "EXECUCAO"
    assert tarefa["solicitante"]["id"] == str(t["user"].id)
    # A criação já abre a primeira movimentação do histórico.
    assert [m["tipo"] for m in tarefa["movimentacoes"]] == ["ATRIBUICAO"]


@pytest.mark.asyncio
async def test_tarefa_exige_destino(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    resp = await client.post(
        f"{BASE}/{d['id']}/tarefas", json={"titulo": "Sem destino"}, headers=t["headers"]
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ciclo_receber_iniciar_entregar_concluir(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id))
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"

    recebida = await client.post(f"{url}/receber", headers=t["headers"])
    assert recebida.json()["status"] == "RECEBIDA"
    assert recebida.json()["data_aceite"] is not None

    iniciada = await client.post(f"{url}/iniciar", headers=t["headers"])
    assert iniciada.json()["status"] == "EM_ANDAMENTO"

    entregue = await client.post(f"{url}/entregar", headers=t["headers"])
    assert entregue.json()["status"] == "ENTREGUE"

    concluida = await client.post(
        f"{url}/concluir", json={"resultado": "Ofício 015/2026 elaborado"}, headers=t["headers"]
    )
    assert concluida.json()["status"] == "CONCLUIDA"
    assert concluida.json()["resultado"] == "Ofício 015/2026 elaborado"


@pytest.mark.asyncio
async def test_tarefa_concluida_nao_conclui_a_demanda(client, make_tenant, catalogo_padrao):
    """O ponto central do §3: tarefa e demanda têm ciclos independentes."""
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id), exige_aceite=False)
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"

    await client.post(f"{url}/iniciar", headers=t["headers"])
    await client.post(f"{url}/entregar", headers=t["headers"])
    await client.post(f"{url}/concluir", json={}, headers=t["headers"])

    demanda = await client.get(f"{BASE}/{d['id']}", headers=t["headers"])
    assert demanda.json()["concluida_em"] is None
    assert demanda.json()["status"]["chave"] == "ABERTA"


@pytest.mark.asyncio
async def test_devolucao_exige_motivo_e_mantem_historico(client, make_tenant, catalogo_padrao):
    """§168 — Jurídico devolve, assessoria corrige, histórico permanece."""
    assessor = await make_tenant("ASSESSOR")
    d = await _demanda(client, assessor["headers"])
    tarefa = await _tarefa(
        client, assessor["headers"], d["id"], atribuida_a_id=str(assessor["user"].id)
    )
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"
    await client.post(f"{url}/receber", headers=assessor["headers"])
    await client.post(f"{url}/iniciar", headers=assessor["headers"])
    await client.post(f"{url}/entregar", headers=assessor["headers"])

    sem_motivo = await client.post(f"{url}/devolver", json={}, headers=assessor["headers"])
    assert sem_motivo.status_code == 422

    devolvida = await client.post(
        f"{url}/devolver",
        json={"motivo": "Documento devolvido porque falta assinatura"},
        headers=assessor["headers"],
    )
    assert devolvida.status_code == 200
    assert devolvida.json()["status"] == "DEVOLVIDA"
    assert "assinatura" in devolvida.json()["motivo_devolucao"]
    assert "DEVOLUCAO" in [m["tipo"] for m in devolvida.json()["movimentacoes"]]

    # Corrige e reenvia — o histórico da devolução continua lá.
    await client.post(f"{url}/iniciar", headers=assessor["headers"])
    reentregue = await client.post(f"{url}/entregar", headers=assessor["headers"])
    assert reentregue.json()["status"] == "ENTREGUE"
    assert "DEVOLUCAO" in [m["tipo"] for m in reentregue.json()["movimentacoes"]]


@pytest.mark.asyncio
async def test_encaminhar_registra_origem_e_destino(client, make_tenant, catalogo_padrao):
    assessor = await make_tenant("ASSESSOR")
    juridico = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    d = await _demanda(client, assessor["headers"])
    tarefa = await _tarefa(
        client, assessor["headers"], d["id"], atribuida_a_id=str(assessor["user"].id)
    )
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"

    encaminhada = await client.post(
        f"{url}/encaminhar",
        json={"para_user_id": str(juridico["user"].id), "motivo": "Elaborar minuta"},
        headers=assessor["headers"],
    )
    assert encaminhada.status_code == 200
    corpo = encaminhada.json()
    assert corpo["atribuida_a"]["id"] == str(juridico["user"].id)
    assert corpo["status"] == "AGUARDANDO_ACEITE"  # o novo dono precisa receber
    assert corpo["data_aceite"] is None
    assert "ENCAMINHAMENTO" in [m["tipo"] for m in corpo["movimentacoes"]]

    # A responsabilidade pela demanda continua com quem encaminhou (§24).
    demanda = await client.get(f"{BASE}/{d['id']}", headers=assessor["headers"])
    assert demanda.json()["responsavel_geral"]["id"] == str(assessor["user"].id)


@pytest.mark.asyncio
async def test_solicitar_informacao_nao_transfere_responsabilidade(
    client, make_tenant, catalogo_padrao
):
    """§23 — a Assessoria pede certidão à Contabilidade e segue responsável."""
    assessor = await make_tenant("ASSESSOR")
    contabilidade = await make_tenant("ENGENHEIRO_TECNICO", org=assessor["org"])
    d = await _demanda(client, assessor["headers"])
    tarefa = await _tarefa(
        client, assessor["headers"], d["id"], atribuida_a_id=str(assessor["user"].id)
    )

    sub = await client.post(
        f"{BASE}/{d['id']}/tarefas/{tarefa['id']}/solicitar-informacao",
        json={
            "titulo": "Providenciar certidão negativa",
            "atribuida_a_id": str(contabilidade["user"].id),
        },
        headers=assessor["headers"],
    )
    assert sub.status_code == 201
    corpo = sub.json()
    assert corpo["tipo"] == "INFORMACAO"
    assert corpo["tarefa_pai_id"] == tarefa["id"]
    assert corpo["atribuida_a"]["id"] == str(contabilidade["user"].id)
    # Quem pediu continua sendo o solicitante da subtarefa.
    assert corpo["solicitante"]["id"] == str(assessor["user"].id)
    assert "SOLICITACAO_INFORMACAO" in [m["tipo"] for m in corpo["movimentacoes"]]


@pytest.mark.asyncio
async def test_tarefa_pai_nao_conclui_com_subtarefa_aberta(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    pai = await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id), exige_aceite=False)
    await client.post(
        f"{BASE}/{d['id']}/tarefas/{pai['id']}/solicitar-informacao",
        json={"titulo": "Levantar dados técnicos", "atribuida_a_id": str(t["user"].id)},
        headers=t["headers"],
    )
    url = f"{BASE}/{d['id']}/tarefas/{pai['id']}"
    await client.post(f"{url}/iniciar", headers=t["headers"])

    entrega = await client.post(f"{url}/entregar", headers=t["headers"])
    assert entrega.status_code == 409
    assert "subtarefa" in str(entrega.json()["detail"]).lower()


@pytest.mark.asyncio
async def test_dependencia_bloqueia_ate_ser_concluida(
    client, make_tenant, catalogo_padrao, _db
):
    """§170 — protocolo depende do ofício; enquanto faltar, não avança."""
    import uuid as _uuid

    from app.models import TarefaDependencia

    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    oficio = await _tarefa(
        client, t["headers"], d["id"], titulo="Elaborar ofício",
        atribuida_a_id=str(t["user"].id), exige_aceite=False,
    )
    protocolo = await _tarefa(
        client, t["headers"], d["id"], titulo="Protocolar proposta",
        atribuida_a_id=str(t["user"].id), exige_aceite=False,
    )
    _db.add(
        TarefaDependencia(
            tarefa_id=_uuid.UUID(protocolo["id"]),
            depende_de_id=_uuid.UUID(oficio["id"]),
        )
    )
    await _db.commit()

    url_protocolo = f"{BASE}/{d['id']}/tarefas/{protocolo['id']}"
    bloqueada = await client.post(f"{url_protocolo}/iniciar", headers=t["headers"])
    assert bloqueada.status_code == 409
    assert bloqueada.json()["detail"]["bloqueada_por"] == ["Elaborar ofício"]

    # Conclui a dependência e o protocolo destrava.
    url_oficio = f"{BASE}/{d['id']}/tarefas/{oficio['id']}"
    await client.post(f"{url_oficio}/iniciar", headers=t["headers"])
    await client.post(f"{url_oficio}/entregar", headers=t["headers"])
    await client.post(f"{url_oficio}/concluir", json={}, headers=t["headers"])

    liberada = await client.post(f"{url_protocolo}/iniciar", headers=t["headers"])
    assert liberada.status_code == 200
    assert liberada.json()["status"] == "EM_ANDAMENTO"


@pytest.mark.asyncio
async def test_exigencia_de_documento_barra_entrega(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(
        client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id),
        exige_aceite=False, exige_documento=True,
    )
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"
    await client.post(f"{url}/iniciar", headers=t["headers"])
    resp = await client.post(f"{url}/entregar", headers=t["headers"])
    assert resp.status_code == 409
    assert "documento" in str(resp.json()["detail"]).lower()


@pytest.mark.asyncio
async def test_espera_explicita_o_motivo(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id), exige_aceite=False)
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"
    await client.post(f"{url}/iniciar", headers=t["headers"])

    resp = await client.post(
        f"{url}/aguardar",
        json={"status": "AGUARDANDO_TERCEIRO", "motivo": "Aguardando retorno do Governo do Estado"},
        headers=t["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "AGUARDANDO_TERCEIRO"
    assert resp.json()["em_espera"] is True
    assert "Governo" in resp.json()["motivo_espera"]


@pytest.mark.asyncio
async def test_transicao_invalida_e_recusada(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id))
    # Recém-criada (AGUARDANDO_ACEITE) não pode ser entregue direto.
    resp = await client.post(
        f"{BASE}/{d['id']}/tarefas/{tarefa['id']}/entregar", headers=t["headers"]
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_minhas_tarefas_separa_por_urgencia(client, make_tenant, catalogo_padrao):
    from datetime import datetime, timedelta, timezone

    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    ontem = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    semana = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

    await _tarefa(client, t["headers"], d["id"], titulo="Atrasada",
                  atribuida_a_id=str(t["user"].id), prazo=ontem, exige_aceite=False)
    await _tarefa(client, t["headers"], d["id"], titulo="Desta semana",
                  atribuida_a_id=str(t["user"].id), prazo=semana)

    resp = await client.get("/api/govtask/minhas-tarefas", headers=t["headers"])
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["total"] == 2
    assert [x["titulo"] for x in corpo["atrasadas"]] == ["Atrasada"]
    assert [x["titulo"] for x in corpo["proximas"]] == ["Desta semana"]
    assert [x["titulo"] for x in corpo["a_receber"]] == ["Desta semana"]


@pytest.mark.asyncio
async def test_tarefa_de_outro_municipio_nao_e_alcancavel(
    client, make_tenant, catalogo_padrao
):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    d = await _demanda(client, a["headers"])
    tarefa = await _tarefa(client, a["headers"], d["id"], atribuida_a_id=str(a["user"].id))

    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"
    assert (await client.get(url, headers=b["headers"])).status_code == 404
    assert (await client.post(f"{url}/receber", headers=b["headers"])).status_code == 404
    assert (
        await client.post(f"{url}/concluir", json={}, headers=b["headers"])
    ).status_code == 404
    assert (
        await client.get("/api/govtask/minhas-tarefas", headers=b["headers"])
    ).json()["total"] == 0
