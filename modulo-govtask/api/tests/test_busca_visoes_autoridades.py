"""Busca global, visões salvas e cadastro de autoridades (§48, §50, §7, §148)."""

import pytest

BASE = "/api/govtask"
DEMANDAS = f"{BASE}/demandas"


async def _demanda(client, headers, **campos):
    payload = {"titulo": "Aquisição de ambulância para a Saúde"}
    payload.update(campos)
    resp = await client.post(DEMANDAS, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Busca global ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_busca_encontra_por_titulo_numero_e_protocolo(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"], objeto="Veículo tipo UTI móvel")
    await client.post(
        f"{DEMANDAS}/{demanda['id']}/protocolos",
        json={
            "sistema": "Transferegov",
            "numero": "989232",
            "data_protocolo": "2026-09-16T10:00:00Z",
        },
        headers=t["headers"],
    )

    por_titulo = (await client.get(f"{BASE}/busca?q=ambulância", headers=t["headers"])).json()
    assert [d["id"] for d in por_titulo["demandas"]] == [demanda["id"]]

    por_numero = (
        await client.get(f"{BASE}/busca?q={demanda['numero'][-6:]}", headers=t["headers"])
    ).json()
    assert len(por_numero["demandas"]) == 1

    por_protocolo = (await client.get(f"{BASE}/busca?q=989232", headers=t["headers"])).json()
    assert len(por_protocolo["protocolos"]) == 1


@pytest.mark.asyncio
async def test_busca_nao_atravessa_tenant(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    await _demanda(client, a["headers"], titulo="Ambulância do município A")

    resultado = (await client.get(f"{BASE}/busca?q=Ambulância", headers=b["headers"])).json()
    assert resultado["demandas"] == []


@pytest.mark.asyncio
async def test_busca_respeita_sigilo_da_demanda(client, make_tenant, catalogo_padrao):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("SERVIDOR", org=dono["org"])
    await _demanda(
        client,
        dono["headers"],
        titulo="Sindicância confidencial da Saúde",
        confidencialidade="CONFIDENCIAL",
    )
    visivel = (
        await client.get(f"{BASE}/busca?q=Sindicância", headers=dono["headers"])
    ).json()
    assert len(visivel["demandas"]) == 1

    oculta = (
        await client.get(f"{BASE}/busca?q=Sindicância", headers=colega["headers"])
    ).json()
    assert oculta["demandas"] == []


@pytest.mark.asyncio
async def test_sugestoes_servem_o_command_palette(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    await _demanda(client, t["headers"])
    resp = await client.get(f"{BASE}/busca/sugestoes?q=ambul", headers=t["headers"])
    assert resp.status_code == 200
    assert resp.json()[0]["titulo"].startswith("Aquisição")


# ── Visões salvas ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_visao_salva_valida_filtros_e_guarda_layout(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    criada = await client.post(
        f"{BASE}/visoes",
        json={
            "nome": "Emendas federais em andamento 2026",
            "filtros": {"esfera": "FEDERAL", "exercicio": 2026, "encerradas": False},
            "layout": "KANBAN",
            "padrao": True,
        },
        headers=t["headers"],
    )
    assert criada.status_code == 201, criada.text
    assert criada.json()["minha"] is True

    # Filtro desconhecido é recusado: a visão não injeta campo arbitrário.
    invalida = await client.post(
        f"{BASE}/visoes",
        json={"nome": "Suspeita", "filtros": {"organization_id": "outro-tenant"}},
        headers=t["headers"],
    )
    assert invalida.status_code == 422

    repetida = await client.post(
        f"{BASE}/visoes",
        json={"nome": "Emendas federais em andamento 2026", "filtros": {}},
        headers=t["headers"],
    )
    assert repetida.status_code == 409


@pytest.mark.asyncio
async def test_visao_de_outra_pessoa_nao_e_editavel_e_compartilhada_aparece(
    client, make_tenant, catalogo_padrao
):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("ASSESSOR", org=dono["org"])
    estranho = await make_tenant("ASSESSOR")

    privada = (
        await client.post(
            f"{BASE}/visoes",
            json={"nome": "Minhas urgentes", "filtros": {"prioridade": "URGENTE"}},
            headers=dono["headers"],
        )
    ).json()
    await client.post(
        f"{BASE}/visoes",
        json={"nome": "Obras do município", "filtros": {"tag": "obra"}, "compartilhada": True},
        headers=dono["headers"],
    )

    do_colega = (await client.get(f"{BASE}/visoes", headers=colega["headers"])).json()
    nomes = {v["nome"] for v in do_colega}
    assert "Obras do município" in nomes and "Minhas urgentes" not in nomes

    # Só o dono altera a própria visão; para os outros ela nem existe.
    assert (
        await client.patch(
            f"{BASE}/visoes/{privada['id']}",
            json={"nome": "roubada"},
            headers=colega["headers"],
        )
    ).status_code == 404
    # Visão compartilhada não atravessa o tenant.
    assert (await client.get(f"{BASE}/visoes", headers=estranho["headers"])).json() == []


@pytest.mark.asyncio
async def test_apenas_uma_visao_padrao_por_recurso(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    for nome in ("Primeira", "Segunda"):
        await client.post(
            f"{BASE}/visoes",
            json={"nome": nome, "filtros": {}, "padrao": True},
            headers=t["headers"],
        )
    visoes = (await client.get(f"{BASE}/visoes", headers=t["headers"])).json()
    assert sum(1 for v in visoes if v["padrao"]) == 1


@pytest.mark.asyncio
async def test_filtros_da_visao_sao_honrados_pela_listagem(client, make_tenant, catalogo_padrao):
    """Uma visão salva precisa filtrar de verdade ao ser aplicada (§49, §50).

    Sem isto, o whitelist aceitaria uma visão como "Emendas federais" e a
    listagem devolveria tudo — a visão existiria só no nome.
    """
    t = await make_tenant("ASSESSOR")
    await _demanda(client, t["headers"], titulo="Ambulância federal", esfera="FEDERAL")
    await _demanda(client, t["headers"], titulo="Material municipal", esfera="MUNICIPAL")

    visao = await client.post(
        f"{BASE}/visoes",
        json={
            "nome": "Federais do exercício",
            "filtros": {
                "busca": "Ambulância",
                "esfera": "FEDERAL",
                "minhas": True,
                "aguardando_terceiro": False,
            },
        },
        headers=t["headers"],
    )
    assert visao.status_code == 201, visao.text

    resultado = (
        await client.get(
            f"{DEMANDAS}",
            params={
                "busca": "Ambulância",
                "esfera": "FEDERAL",
                "minhas": "true",
                "aguardando_terceiro": "false",
            },
            headers=t["headers"],
        )
    ).json()
    assert resultado["total"] == 1
    assert resultado["items"][0]["titulo"] == "Ambulância federal"


# ── Autoridades ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_historico_da_autoridade_consolida_valores(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    autoridade = (
        await client.post(
            f"{BASE}/autoridades",
            json={
                "nome": "Deputado Fulano",
                "tipo": "DEPUTADO_ESTADUAL",
                "esfera": "ESTADUAL",
                "partido": "XYZ",
            },
            headers=t["headers"],
        )
    ).json()

    for valor in ("300000.00", "200000.00"):
        await _demanda(
            client,
            t["headers"],
            autoridade_id=autoridade["id"],
            valor_previsto=valor,
            valor_aprovado=valor,
        )

    historico = await client.get(
        f"{BASE}/autoridades/{autoridade['id']}/historico", headers=t["headers"]
    )
    assert historico.status_code == 200, historico.text
    corpo = historico.json()
    assert corpo["total_demandas"] == 2
    assert corpo["valor_aprovado"] == 500000.0
    assert corpo["em_andamento"] == 2


@pytest.mark.asyncio
async def test_autoridade_de_outro_tenant_responde_404(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    autoridade = (
        await client.post(
            f"{BASE}/autoridades", json={"nome": "Senador Beltrano"}, headers=a["headers"]
        )
    ).json()

    assert (
        await client.get(f"{BASE}/autoridades/{autoridade['id']}", headers=b["headers"])
    ).status_code == 404
    assert (await client.get(f"{BASE}/autoridades", headers=b["headers"])).json() == []


@pytest.mark.asyncio
async def test_historico_da_autoridade_omite_demanda_sigilosa(
    client, make_tenant, catalogo_padrao
):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("SERVIDOR", org=dono["org"])
    autoridade = (
        await client.post(
            f"{BASE}/autoridades", json={"nome": "Deputado Fulano"}, headers=dono["headers"]
        )
    ).json()
    await _demanda(
        client,
        dono["headers"],
        autoridade_id=autoridade["id"],
        confidencialidade="CONFIDENCIAL",
        valor_aprovado="500000.00",
    )

    # O total também não pode vazar: somar a demanda sigilosa revelaria por
    # aritmética o que a rota de detalhe recusa mostrar.
    do_colega = (
        await client.get(
            f"{BASE}/autoridades/{autoridade['id']}/historico", headers=colega["headers"]
        )
    ).json()
    assert do_colega["total_demandas"] == 0
    assert do_colega["valor_aprovado"] == 0
