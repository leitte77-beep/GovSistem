"""Relatório completo da demanda: conteúdo, PDF e permissão (§90, §91)."""

import pytest

BASE = "/api/govtask/demandas"


async def _demanda(client, headers, **campos):
    payload = {"titulo": "Aquisição de veículo por indicação parlamentar"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_resumo_executivo_narra_o_andamento(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(
        client,
        t["headers"],
        origem="REUNIAO",
        origem_descricao="Reunião em Curitiba com o Deputado X",
        valor_aprovado="320000.00",
    )
    await client.post(
        f"{BASE}/{demanda['id']}/protocolos",
        json={
            "sistema": "Transferegov",
            "numero": "989232",
            "data_protocolo": "2026-09-16T10:00:00Z",
        },
        headers=t["headers"],
    )
    resp = await client.post(
        f"{BASE}/{demanda['id']}/resumo-executivo", headers=t["headers"]
    )
    assert resp.status_code == 200, resp.text
    texto = resp.json()["resumo_executivo"]
    assert "Reunião em Curitiba" in texto
    assert "Transferegov" in texto and "989232" in texto

    # Gravado na demanda, não só devolvido.
    detalhe = (await client.get(f"{BASE}/{demanda['id']}", headers=t["headers"])).json()
    assert detalhe["resumo_executivo"] == texto


@pytest.mark.asyncio
async def test_relatorio_json_traz_timeline_e_documentos(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/checklists",
        json={"titulo": "Formalização", "itens": [{"descricao": "Ofício"}]},
        headers=t["headers"],
    )
    relatorio = await client.get(f"{BASE}/{demanda['id']}/relatorio", headers=t["headers"])
    assert relatorio.status_code == 200, relatorio.text
    corpo = relatorio.json()
    assert corpo["demanda"]["numero"] == demanda["numero"]
    assert corpo["timeline"]  # ao menos DEMANDA_CRIADA
    assert corpo["checklists"][0]["total"] == 1
    assert corpo["resumo_executivo"]


@pytest.mark.asyncio
async def test_pdf_e_gerado_e_auditado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    resp = await client.get(f"{BASE}/{demanda['id']}/relatorio.pdf", headers=t["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")
    assert "attachment" in resp.headers["content-disposition"]

    # Emitir o relatório deixa rastro: é conteúdo consolidado saindo do sistema.
    timeline = await client.get(f"{BASE}/{demanda['id']}/timeline", headers=t["headers"])
    assert any(
        "Relatório completo" in e["descricao"] for e in timeline.json()["items"]
    )


@pytest.mark.asyncio
async def test_relatorio_omite_financeiro_de_quem_nao_pode_ver(
    client, make_tenant, catalogo_padrao
):
    assessor = await make_tenant("ASSESSOR")
    servidor = await make_tenant("SERVIDOR", org=assessor["org"])
    demanda = await _demanda(client, assessor["headers"], valor_aprovado="320000.00")

    com_permissao = (
        await client.get(f"{BASE}/{demanda['id']}/relatorio", headers=assessor["headers"])
    ).json()
    assert com_permissao["financeiro"]["valor_aprovado"]

    sem_permissao = (
        await client.get(f"{BASE}/{demanda['id']}/relatorio", headers=servidor["headers"])
    ).json()
    assert sem_permissao["financeiro"] == {}
    assert sem_permissao["demanda"]["valor_aprovado"] is None


@pytest.mark.asyncio
async def test_relatorio_de_outro_tenant_responde_404(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    assert (
        await client.get(f"{BASE}/{demanda['id']}/relatorio", headers=b["headers"])
    ).status_code == 404
    assert (
        await client.get(f"{BASE}/{demanda['id']}/relatorio.pdf", headers=b["headers"])
    ).status_code == 404
