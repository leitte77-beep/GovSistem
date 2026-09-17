"""E2E do §167: Unidade de Saúde, do projeto à prestação de contas.

Diferente do §166, aqui o foco é a obra como **faceta da demanda** (§54): a
mesma obra tem de ser alcançável pelo caminho da demanda, com cronograma,
diário, fotos e vistorias — e nada disso pode atravessar o município.
"""

import pytest

BASE = "/api/govtask/demandas"
PDF = b"%PDF-1.4\nprojeto\n%%EOF"


async def _documento(client, headers, demanda_id, nome, pasta):
    resp = await client.post(
        f"{BASE}/{demanda_id}/documentos",
        files={"arquivo": (nome, PDF, "application/pdf")},
        data={"pasta": pasta},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_obra_percorre_o_ciclo_pela_demanda(client, make_tenant, catalogo_padrao):
    engenharia = await make_tenant("ADMIN", name="Engenharia")
    demanda = (
        await client.post(
            BASE,
            json={
                "titulo": "Construção de Unidade Básica de Saúde",
                "objeto": "UBS no bairro Jardim das Flores",
                "valor_previsto": "1850000.00",
                "esfera": "FEDERAL",
            },
            headers=engenharia["headers"],
        )
    ).json()
    demanda_id = demanda["id"]
    obras = f"{BASE}/{demanda_id}/obras"

    # ── Obra criada pela demanda, não por um convênio ─────────────────────
    obra = await client.post(
        obras,
        json={
            "nome": "UBS Jardim das Flores",
            "endereco": "Rua das Acácias, s/n",
            "coordenadas": "-25.4284,-49.2733",
            "objeto": "Construção de unidade básica de saúde",
            "empresa": "Construtora Alfa Ltda",
            "cnpj_empresa": "12.345.678/0001-90",
            "valor_contrato": "1820000.00",
            "situacao": "EM_EXECUCAO",
        },
        headers=engenharia["headers"],
    )
    assert obra.status_code == 201, obra.text
    obra = obra.json()
    obra_url = f"{obras}/{obra['id']}"

    # ── Cronograma físico-financeiro (§56) ────────────────────────────────
    for descricao, percentual in (("Fundação", 20), ("Estrutura", 40), ("Acabamento", 40)):
        resp = await client.post(
            f"{obra_url}/cronograma",
            json={"descricao": descricao, "percentual_previsto": percentual},
            headers=engenharia["headers"],
        )
        assert resp.status_code == 200, resp.text
    assert len(resp.json()["cronograma"]) == 3

    # ── Diário de obra, fotos e vistoria (§57) ────────────────────────────
    diario = await client.post(
        f"{obra_url}/diario",
        json={
            "tipo": "DIARIO",
            "titulo": "Início da fundação",
            "descricao": "Escavação concluída",
            "clima": "Ensolarado",
            "efetivo": 12,
        },
        headers=engenharia["headers"],
    )
    assert diario.status_code == 201, diario.text

    foto = await client.post(
        f"{obra_url}/fotos",
        json={"observacao": "Fundação executada", "etapa": "Fundação"},
        headers=engenharia["headers"],
    )
    assert foto.status_code == 201, foto.text

    vistoria = await client.post(
        f"{obra_url}/vistorias",
        json={"tipo": "ROTINEIRA", "vistoriador": "Engenheiro Fiscal", "status": "REALIZADA"},
        headers=engenharia["headers"],
    )
    assert vistoria.status_code == 201, vistoria.text

    # ── Execução física e financeira avançam juntas ───────────────────────
    atualizada = await client.patch(
        obra_url,
        json={"percentual_fisico": "72.00", "percentual_financeiro": "63.00"},
        headers=engenharia["headers"],
    )
    assert atualizada.status_code == 200
    assert float(atualizada.json()["percentual_fisico"]) == 72.0

    # ── Financeiro da demanda acompanha a obra ────────────────────────────
    for tipo, valor in (
        ("APROVACAO", "1850000.00"),
        ("CONTRATADO", "1820000.00"),
        ("EMPENHO", "1820000.00"),
        ("PAGAMENTO", "1146600.00"),
    ):
        resp = await client.post(
            f"{BASE}/{demanda_id}/financeiro",
            json={"tipo": tipo, "valor": valor, "data_registro": "2026-09-17"},
            headers=engenharia["headers"],
        )
        assert resp.status_code == 201, resp.text
    financeiro = (
        await client.get(f"{BASE}/{demanda_id}/financeiro", headers=engenharia["headers"])
    ).json()
    assert financeiro["valor_pago"] == 1146600.0

    # ── Documentos da obra e prestação de contas ───────────────────────────
    for nome, pasta in (
        ("projeto-executivo.pdf", "01 Projeto"),
        ("ordem-de-servico.pdf", "06 Contrato"),
        ("medicao-01.pdf", "08 Medições"),
        ("prestacao-de-contas.pdf", "10 Prestação de contas"),
    ):
        await _documento(client, engenharia["headers"], demanda_id, nome, pasta)

    # ── A obra aparece no detalhe pelo caminho da demanda ─────────────────
    listada = await client.get(obras, headers=engenharia["headers"])
    assert listada.status_code == 200
    assert [o["id"] for o in listada.json()] == [obra["id"]]

    relatorio = (
        await client.get(f"{BASE}/{demanda_id}/relatorio", headers=engenharia["headers"])
    ).json()
    assert len(relatorio["documentos"]) == 4


@pytest.mark.asyncio
async def test_obra_da_demanda_nao_atravessa_o_municipio(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ADMIN")
    b = await make_tenant("ADMIN")
    demanda = (
        await client.post(BASE, json={"titulo": "UBS do município A"}, headers=a["headers"])
    ).json()
    obra = (
        await client.post(
            f"{BASE}/{demanda['id']}/obras",
            json={"nome": "UBS A"},
            headers=a["headers"],
        )
    ).json()
    base_b = f"{BASE}/{demanda['id']}/obras/{obra['id']}"

    for resposta in (
        await client.get(f"{BASE}/{demanda['id']}/obras", headers=b["headers"]),
        await client.get(f"{base_b}/diario", headers=b["headers"]),
        await client.get(f"{base_b}/fotos", headers=b["headers"]),
        await client.get(f"{base_b}/vistorias", headers=b["headers"]),
        await client.patch(base_b, json={"nome": "roubada"}, headers=b["headers"]),
    ):
        assert resposta.status_code == 404, (
            f"{resposta.request.url} devolveu {resposta.status_code}"
        )

    # Pelo caminho do convênio a obra também não é alcançável: ela não tem
    # convênio, e o convênio inventado não existe em nenhum dos dois tenants.
    import uuid as _uuid

    resp = await client.get(
        f"/api/govtask/convenios/{_uuid.uuid4()}/obras", headers=a["headers"]
    )
    assert resp.status_code == 404
