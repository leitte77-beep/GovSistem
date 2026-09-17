"""Núcleo de demandas: criação, numeração, ciclo de vida e timeline."""

import asyncio

import pytest

BASE = "/api/govtask/demandas"


async def _criar(client, headers, **campos):
    payload = {"titulo": "Aquisição de veículo por indicação parlamentar"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_criar_demanda_numera_e_abre_timeline(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"], descricao="Veículo para a Saúde")

    assert demanda["numero"].endswith("/000001")
    assert demanda["sequencial"] == 1
    assert demanda["status"]["chave"] == "ABERTA"
    assert demanda["responsavel_geral"]["id"] == str(t["user"].id)

    timeline = await client.get(f"{BASE}/{demanda['id']}/timeline", headers=t["headers"])
    assert timeline.status_code == 200
    eventos = timeline.json()["items"]
    assert [e["tipo_evento"] for e in eventos] == ["DEMANDA_CRIADA"]


@pytest.mark.asyncio
async def test_numeracao_nao_repete_no_mesmo_tenant(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    numeros = set()
    for _ in range(5):
        demanda = await _criar(client, t["headers"])
        numeros.add(demanda["numero"])
    assert len(numeros) == 5


@pytest.mark.asyncio
async def test_numeracao_e_independente_por_tenant(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    da = await _criar(client, a["headers"])
    db_ = await _criar(client, b["headers"])
    assert da["numero"] == db_["numero"]  # cada município tem sua própria série
    assert da["id"] != db_["id"]


@pytest.mark.asyncio
async def test_rascunho_fica_fora_da_lista_dos_outros(client, make_tenant, catalogo_padrao):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("ASSESSOR", org=dono["org"])
    await _criar(client, dono["headers"], rascunho=True, titulo="Ideia ainda crua")

    do_dono = await client.get(BASE, headers=dono["headers"])
    do_colega = await client.get(BASE, headers=colega["headers"])
    assert do_dono.json()["total"] == 1
    assert do_colega.json()["total"] == 0


@pytest.mark.asyncio
async def test_publicar_rascunho_move_para_aberta(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"], rascunho=True)
    assert demanda["status"]["chave"] == "RASCUNHO"

    resp = await client.post(f"{BASE}/{demanda['id']}/publicar", headers=t["headers"])
    assert resp.status_code == 200
    assert resp.json()["status"]["chave"] == "ABERTA"
    assert resp.json()["is_rascunho"] is False


@pytest.mark.asyncio
async def test_conclusao_exige_confirmacao_quando_ha_pendencia(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"], valor_aprovado="320000.00")

    checagem = await client.get(
        f"{BASE}/{demanda['id']}/checagem-conclusao", headers=t["headers"]
    )
    assert checagem.json()["pode_concluir"] is True
    assert checagem.json()["alertas"]  # valor aprovado sem execução

    sem_forcar = await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "Veículo recebido"},
        headers=t["headers"],
    )
    assert sem_forcar.status_code == 409

    forcado = await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "Veículo recebido", "forcar": True},
        headers=t["headers"],
    )
    assert forcado.status_code == 200
    assert forcado.json()["concluida_em"] is not None
    assert forcado.json()["progresso"] == 100


@pytest.mark.asyncio
async def test_demanda_bloqueada_nao_conclui(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/bloquear",
        json={"motivo": "Aguardando autorização do órgão concedente"},
        headers=t["headers"],
    )
    resp = await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "qualquer", "forcar": True},
        headers=t["headers"],
    )
    assert resp.status_code == 409
    assert "bloqueada" in str(resp.json()["detail"]).lower()


@pytest.mark.asyncio
async def test_demanda_concluida_nao_aceita_edicao(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "Entregue", "forcar": True},
        headers=t["headers"],
    )
    resp = await client.patch(
        f"{BASE}/{demanda['id']}", json={"titulo": "Outro título"}, headers=t["headers"]
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_timeline_registra_historico_sem_apagar(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])
    await client.patch(
        f"{BASE}/{demanda['id']}", json={"titulo": "Título corrigido"}, headers=t["headers"]
    )
    await client.post(
        f"{BASE}/{demanda['id']}/bloquear",
        json={"motivo": "Falta certidão"},
        headers=t["headers"],
    )
    await client.post(f"{BASE}/{demanda['id']}/desbloquear", headers=t["headers"])

    eventos = (
        await client.get(f"{BASE}/{demanda['id']}/timeline", headers=t["headers"])
    ).json()["items"]
    tipos = [e["tipo_evento"] for e in eventos]
    assert tipos == [
        "DEMANDA_DESBLOQUEADA",
        "DEMANDA_BLOQUEADA",
        "DEMANDA_ATUALIZADA",
        "DEMANDA_CRIADA",
    ]


@pytest.mark.asyncio
async def test_busca_e_filtros(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    await _criar(client, t["headers"], titulo="Construção da UBS Central")
    await _criar(client, t["headers"], titulo="Compra de ambulância", prioridade="URGENTE")

    busca = await client.get(f"{BASE}?q=ambul", headers=t["headers"])
    assert busca.json()["total"] == 1

    urgentes = await client.get(f"{BASE}?prioridade=URGENTE", headers=t["headers"])
    assert urgentes.json()["total"] == 1

    pagina = await client.get(f"{BASE}?page_size=1", headers=t["headers"])
    assert pagina.json()["pages"] == 2
    assert len(pagina.json()["items"]) == 1


@pytest.mark.asyncio
async def test_tags_sao_criadas_e_filtram(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"], tags=["Saúde", "Deputado X"])
    assert sorted(demanda["tags"]) == ["Deputado X", "Saúde"]

    filtrada = await client.get(f"{BASE}?tag=deputado-x", headers=t["headers"])
    assert filtrada.json()["total"] == 1
