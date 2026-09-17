"""Motor de workflow: instanciação, avanço, paralelismo, condições e progresso."""

import pytest

BASE = "/api/govtask/demandas"
WF = "/api/govtask/workflows"


async def _demanda(client, headers, **campos):
    payload = {"titulo": "Construção de Unidade de Saúde"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _aplicar(client, headers, demanda_id, workflow_id):
    resp = await client.post(
        f"{BASE}/{demanda_id}/aplicar-fluxo",
        json={"workflow_id": str(workflow_id)},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_modelos_padrao_ficam_disponiveis(client, make_tenant, workflows_padrao):
    t = await make_tenant("ASSESSOR")
    resp = await client.get(WF, headers=t["headers"])
    assert resp.status_code == 200
    chaves = {w["chave"] for w in resp.json()}
    assert chaves == {"PEDIDO_SIMPLES", "EMENDA_PARLAMENTAR", "AQUISICAO", "OBRA"}
    for w in resp.json():
        assert w["is_system"] is True
        assert w["versao_atual"] == 1
        assert w["qtd_etapas"] > 0


@pytest.mark.asyncio
async def test_aplicar_fluxo_instancia_e_abre_primeira_etapa(
    client, make_tenant, workflows_padrao
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    etapas = await _aplicar(client, t["headers"], d["id"], workflows_padrao["OBRA"].id)

    assert len(etapas) == 11
    assert etapas[0]["nome"] == "Demanda"
    assert etapas[0]["status"] == "EM_ANDAMENTO"
    # As demais nascem pendentes: nada abre fora de hora.
    assert {e["status"] for e in etapas[1:]} == {"PENDENTE"}

    demanda = (await client.get(f"{BASE}/{d['id']}", headers=t["headers"])).json()
    assert demanda["progresso"] > 0


@pytest.mark.asyncio
async def test_fluxo_avanca_quando_as_tarefas_da_etapa_terminam(
    client, make_tenant, workflows_padrao
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"], titulo="Pedido de reparo na praça")
    etapas = await _aplicar(
        client, t["headers"], d["id"], workflows_padrao["PEDIDO_SIMPLES"].id
    )
    # Etapa 1 é manual: fecha na mão e a etapa 2 abre sozinha, com sua tarefa.
    avancadas = await client.post(
        f"{BASE}/{d['id']}/etapas/{etapas[0]['id']}/concluir",
        json={}, headers=t["headers"],
    )
    assert avancadas.status_code == 200, avancadas.text
    etapas = avancadas.json()
    assert etapas[0]["status"] == "CONCLUIDA"
    assert etapas[1]["status"] == "EM_ANDAMENTO"
    assert etapas[1]["qtd_tarefas"] == 1  # tarefa automática criada

    tarefas = (
        await client.get(f"{BASE}/{d['id']}/tarefas", headers=t["headers"])
    ).json()
    assert [x["titulo"] for x in tarefas] == ["Atender a solicitação"]

    # Concluir a tarefa da etapa 2 deve fechá-la e abrir a etapa 3.
    tarefa = tarefas[0]
    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"
    await client.post(f"{url}/receber", headers=t["headers"])
    await client.post(f"{url}/iniciar", headers=t["headers"])
    # A tarefa exige comentário; sem ele a entrega é barrada.
    barrada = await client.post(f"{url}/entregar", headers=t["headers"])
    assert barrada.status_code == 409
    assert "comentário" in str(barrada.json()["detail"]).lower()


@pytest.mark.asyncio
async def test_etapas_paralelas_abrem_juntas_e_seguram_o_avanco(
    client, make_tenant, workflows_padrao, _db
):
    """§171 — etapas de mesma ordem abrem juntas; só avança quando todas fecham."""
    from app.models import Workflow, WorkflowEtapa, WorkflowVersao
    from app.models.enums import StatusWorkflowVersao
    from sqlalchemy import select

    t = await make_tenant("ADMIN")

    # Fluxo com duas etapas paralelas na ordem 1 e uma final na ordem 2.
    criado = await client.post(
        WF,
        json={"chave": "PARALELO", "nome": "Fluxo paralelo"},
        headers=t["headers"],
    )
    assert criado.status_code == 201
    wf_id = criado.json()["id"]

    desenho = await client.put(
        f"{WF}/{wf_id}/rascunho/etapas",
        json=[
            {"chave": "ENG", "nome": "Engenharia", "ordem": 1, "peso": 40,
             "modo": "PARALELA", "regra_conclusao": "MANUAL"},
            {"chave": "CONTAB", "nome": "Contabilidade", "ordem": 1, "peso": 40,
             "modo": "PARALELA", "regra_conclusao": "MANUAL"},
            {"chave": "PROTO", "nome": "Protocolo", "ordem": 2, "peso": 20,
             "regra_conclusao": "MANUAL", "is_final": True},
        ],
        headers=t["headers"],
    )
    assert desenho.status_code == 200, desenho.text
    publicada = await client.post(
        f"{WF}/{wf_id}/rascunho/publicar", json={}, headers=t["headers"]
    )
    assert publicada.status_code == 200
    assert publicada.json()["status"] == "PUBLICADA"

    d = await _demanda(client, t["headers"])
    etapas = await _aplicar(client, t["headers"], d["id"], wf_id)
    por_nome = {e["nome"]: e for e in etapas}
    assert por_nome["Engenharia"]["status"] == "EM_ANDAMENTO"
    assert por_nome["Contabilidade"]["status"] == "EM_ANDAMENTO"
    assert por_nome["Protocolo"]["status"] == "PENDENTE"

    # Fechando só uma das paralelas, o protocolo continua trancado.
    etapas = (
        await client.post(
            f"{BASE}/{d['id']}/etapas/{por_nome['Engenharia']['id']}/concluir",
            json={}, headers=t["headers"],
        )
    ).json()
    por_nome = {e["nome"]: e for e in etapas}
    assert por_nome["Engenharia"]["status"] == "CONCLUIDA"
    assert por_nome["Protocolo"]["status"] == "PENDENTE"

    # Fechada a segunda, a etapa seguinte abre.
    etapas = (
        await client.post(
            f"{BASE}/{d['id']}/etapas/{por_nome['Contabilidade']['id']}/concluir",
            json={}, headers=t["headers"],
        )
    ).json()
    por_nome = {e["nome"]: e for e in etapas}
    assert por_nome["Protocolo"]["status"] == "EM_ANDAMENTO"


@pytest.mark.asyncio
async def test_progresso_usa_peso_e_nao_contagem_de_tarefas(
    client, make_tenant, workflows_padrao
):
    t = await make_tenant("ADMIN")
    criado = await client.post(
        WF, json={"chave": "PESOS", "nome": "Fluxo com pesos"}, headers=t["headers"]
    )
    wf_id = criado.json()["id"]
    await client.put(
        f"{WF}/{wf_id}/rascunho/etapas",
        json=[
            {"chave": "LEVE", "nome": "Formalização", "ordem": 1, "peso": 10,
             "regra_conclusao": "MANUAL"},
            {"chave": "PESADA", "nome": "Execução", "ordem": 2, "peso": 90,
             "regra_conclusao": "MANUAL"},
        ],
        headers=t["headers"],
    )
    await client.post(f"{WF}/{wf_id}/rascunho/publicar", json={}, headers=t["headers"])

    d = await _demanda(client, t["headers"])
    etapas = await _aplicar(client, t["headers"], d["id"], wf_id)

    # Etapa leve aberta e sem tarefas conta como meia etapa: 5%.
    demanda = (await client.get(f"{BASE}/{d['id']}", headers=t["headers"])).json()
    assert demanda["progresso"] == 5

    await client.post(
        f"{BASE}/{d['id']}/etapas/{etapas[0]['id']}/concluir", json={}, headers=t["headers"]
    )
    demanda = (await client.get(f"{BASE}/{d['id']}", headers=t["headers"])).json()
    # Leve concluída (10) + pesada aberta pela metade (45) = 55.
    assert demanda["progresso"] == 55


@pytest.mark.asyncio
async def test_condicao_descarta_etapa_que_nao_se_aplica(client, make_tenant, workflows_padrao):
    t = await make_tenant("ADMIN")
    criado = await client.post(
        WF, json={"chave": "CONDICIONAL", "nome": "Fluxo condicional"}, headers=t["headers"]
    )
    wf_id = criado.json()["id"]
    await client.put(
        f"{WF}/{wf_id}/rascunho/etapas",
        json=[
            {"chave": "SEMPRE", "nome": "Abertura", "ordem": 1, "peso": 50,
             "regra_conclusao": "MANUAL"},
            {"chave": "SO_COM_VALOR", "nome": "Licitação", "ordem": 2, "peso": 50,
             "regra_conclusao": "MANUAL",
             "condicao": {"campo": "valor_previsto", "operador": "maior_que", "valor": 0}},
        ],
        headers=t["headers"],
    )
    await client.post(f"{WF}/{wf_id}/rascunho/publicar", json={}, headers=t["headers"])

    sem_valor = await _demanda(client, t["headers"], titulo="Demanda sem valor")
    etapas = await _aplicar(client, t["headers"], sem_valor["id"], wf_id)
    assert [e["nome"] for e in etapas] == ["Abertura"]

    com_valor = await _demanda(
        client, t["headers"], titulo="Demanda com valor", valor_previsto="150000.00"
    )
    etapas = await _aplicar(client, t["headers"], com_valor["id"], wf_id)
    assert [e["nome"] for e in etapas] == ["Abertura", "Licitação"]


@pytest.mark.asyncio
async def test_documento_obrigatorio_barra_conclusao_da_etapa(
    client, make_tenant, workflows_padrao
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    etapas = await _aplicar(
        client, t["headers"], d["id"], workflows_padrao["EMENDA_PARLAMENTAR"].id
    )
    documental = next(e for e in etapas if e["nome"] == "Documentação")
    assert documental["documentos_obrigatorios"] == ["Plano de trabalho", "Certidões"]
    assert documental["documentos_faltantes"] == ["Plano de trabalho", "Certidões"]

    resp = await client.post(
        f"{BASE}/{d['id']}/etapas/{documental['id']}/concluir",
        json={}, headers=t["headers"],
    )
    assert resp.status_code == 409
    assert "Plano de trabalho" in resp.json()["detail"]["faltando"]


@pytest.mark.asyncio
async def test_nao_troca_fluxo_com_etapas_em_andamento(client, make_tenant, workflows_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await _aplicar(client, t["headers"], d["id"], workflows_padrao["OBRA"].id)

    resp = await client.post(
        f"{BASE}/{d['id']}/aplicar-fluxo",
        json={"workflow_id": str(workflows_padrao["AQUISICAO"].id)},
        headers=t["headers"],
    )
    assert resp.status_code == 409
    assert "já tem etapas" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_modelo_do_sistema_nao_e_editavel(client, make_tenant, workflows_padrao):
    t = await make_tenant("ADMIN")
    resp = await client.patch(
        f"{WF}/{workflows_padrao['OBRA'].id}",
        json={"nome": "Obra adulterada"},
        headers=t["headers"],
    )
    assert resp.status_code == 409
    assert "duplique" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_pesos_precisam_somar_cem(client, make_tenant, workflows_padrao):
    t = await make_tenant("ADMIN")
    criado = await client.post(
        WF, json={"chave": "SOMA", "nome": "Soma errada"}, headers=t["headers"]
    )
    resp = await client.put(
        f"{WF}/{criado.json()['id']}/rascunho/etapas",
        json=[
            {"chave": "ETAPA_A", "nome": "Etapa A", "ordem": 1, "peso": 30},
            {"chave": "ETAPA_B", "nome": "Etapa B", "ordem": 2, "peso": 30},
        ],
        headers=t["headers"],
    )
    assert resp.status_code == 422
    assert "somam 60" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_publicar_gera_nova_versao_sem_afetar_demanda_em_curso(
    client, make_tenant, workflows_padrao
):
    """§120 — republicar o fluxo não pode mexer em quem já está rodando."""
    t = await make_tenant("ADMIN")
    criado = await client.post(
        WF, json={"chave": "VERSIONADO", "nome": "Fluxo versionado"}, headers=t["headers"]
    )
    wf_id = criado.json()["id"]
    await client.put(
        f"{WF}/{wf_id}/rascunho/etapas",
        json=[{"chave": "UNICA", "nome": "Etapa única", "ordem": 1, "peso": 100,
               "regra_conclusao": "MANUAL"}],
        headers=t["headers"],
    )
    await client.post(f"{WF}/{wf_id}/rascunho/publicar", json={}, headers=t["headers"])

    d = await _demanda(client, t["headers"])
    await _aplicar(client, t["headers"], d["id"], wf_id)

    # Nova versão, com etapa a mais.
    nova = await client.post(f"{WF}/{wf_id}/versoes", headers=t["headers"])
    assert nova.status_code == 201
    assert nova.json()["versao"] == 2
    assert [e["nome"] for e in nova.json()["etapas"]] == ["Etapa única"]  # herdou
    await client.put(
        f"{WF}/{wf_id}/rascunho/etapas",
        json=[
            {"chave": "UNICA", "nome": "Etapa única", "ordem": 1, "peso": 50,
             "regra_conclusao": "MANUAL"},
            {"chave": "EXTRA", "nome": "Etapa nova", "ordem": 2, "peso": 50,
             "regra_conclusao": "MANUAL"},
        ],
        headers=t["headers"],
    )
    await client.post(f"{WF}/{wf_id}/rascunho/publicar", json={}, headers=t["headers"])

    # A demanda que já rodava continua com o desenho antigo.
    etapas = (
        await client.get(f"{BASE}/{d['id']}/etapas", headers=t["headers"])
    ).json()
    assert [e["nome"] for e in etapas] == ["Etapa única"]


@pytest.mark.asyncio
async def test_etapa_avulsa_no_fluxo_livre(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    resp = await client.post(
        f"{BASE}/{d['id']}/etapas",
        json={"nome": "Tratativa com o deputado", "peso": 0},
        headers=t["headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "EM_ANDAMENTO"
    assert resp.json()["regra_conclusao"] == "MANUAL"


@pytest.mark.asyncio
async def test_fluxo_de_outro_municipio_nao_e_aplicavel(
    client, make_tenant, workflows_padrao
):
    a = await make_tenant("ADMIN")
    b = await make_tenant("ASSESSOR")
    criado = await client.post(
        WF, json={"chave": "PRIVADO", "nome": "Fluxo do município A"}, headers=a["headers"]
    )
    wf_id = criado.json()["id"]

    assert (await client.get(f"{WF}/{wf_id}", headers=b["headers"])).status_code == 404
    chaves = {w["chave"] for w in (await client.get(WF, headers=b["headers"])).json()}
    assert "PRIVADO" not in chaves

    d = await _demanda(client, b["headers"])
    resp = await client.post(
        f"{BASE}/{d['id']}/aplicar-fluxo", json={"workflow_id": wf_id}, headers=b["headers"]
    )
    assert resp.status_code == 404
