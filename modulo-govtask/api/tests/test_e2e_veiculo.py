"""E2E do §166: da conversa com o Deputado até a prestação de contas.

Percorre o caso concreto do prompt, passando por cada mão que a demanda troca:
gabinete → jurídico → assessoria → protocolo externo → contabilidade →
convênio → licitação → contrato → pagamento → entrega → prestação de contas.

O que este teste protege não é cada rota isolada — isso os outros arquivos já
fazem — mas a costura: a timeline precisa contar a história inteira ao final, e
nenhuma etapa pode ter apagado o rastro da anterior.
"""

import pytest

BASE = "/api/govtask/demandas"
PDF = b"%PDF-1.4\ndocumento oficial\n%%EOF"


async def _setor(_db, org_id, nome, sigla):
    from app.models.setor import Setor

    setor = Setor(organization_id=org_id, nome=nome, sigla=sigla, ativo=True)
    _db.add(setor)
    await _db.commit()
    await _db.refresh(setor)
    return setor


async def _enviar_documento(client, headers, demanda_id, nome, pasta):
    resp = await client.post(
        f"{BASE}/{demanda_id}/documentos",
        files={"arquivo": (nome, PDF, "application/pdf")},
        data={"pasta": pasta},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _concluir_tarefa(client, headers, demanda_id, tarefa_id, resultado):
    url = f"{BASE}/{demanda_id}/tarefas/{tarefa_id}"
    await client.post(f"{url}/receber", headers=headers)
    await client.post(f"{url}/iniciar", headers=headers)
    resp = await client.post(
        f"{url}/concluir", json={"resultado": resultado}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_fluxo_completo_do_veiculo(client, make_tenant, catalogo_padrao, _db):
    # ── 1. O Prefeito determina; o assessor abre a demanda ──────────────────
    prefeito = await make_tenant("PREFEITO", name="Prefeito Municipal")
    assessor = await make_tenant("ASSESSOR", org=prefeito["org"], name="Assessora do Gabinete")
    juridico = await make_tenant("SERVIDOR", org=prefeito["org"], name="Procurador")
    contabilidade = await make_tenant("SERVIDOR", org=prefeito["org"], name="Contadora")

    setor_juridico = await _setor(_db, prefeito["org"].id, "Jurídico", "JUR")
    setor_contabil = await _setor(_db, prefeito["org"].id, "Contabilidade", "CONT")

    deputado = (
        await client.post(
            "/api/govtask/autoridades",
            json={
                "nome": "Deputado Estadual Fulano",
                "tipo": "DEPUTADO_ESTADUAL",
                "esfera": "ESTADUAL",
            },
            headers=assessor["headers"],
        )
    ).json()

    demanda = (
        await client.post(
            BASE,
            json={
                "titulo": "Aquisição de veículo por indicação parlamentar",
                "objeto": "Veículo para a Secretaria Municipal de Saúde",
                "origem": "REUNIAO",
                "origem_descricao": (
                    "Durante reunião em Curitiba, o Deputado informou a destinação "
                    "de recurso para aquisição de veículo"
                ),
                "prioridade": "ALTA",
                "autoridade_id": deputado["id"],
                "solicitante_id": str(prefeito["user"].id),
                "valor_previsto": "320000.00",
                "esfera": "ESTADUAL",
                "tags": ["Veículo", "Saúde", "Emenda 2026"],
            },
            headers=assessor["headers"],
        )
    ).json()
    demanda_id = demanda["id"]
    assert demanda["numero"].endswith("/000001")

    # ── 2. Checklist de formalização (§67) ─────────────────────────────────
    checklist = (
        await client.post(
            f"{BASE}/{demanda_id}/checklists",
            json={
                "titulo": "Formalização do pedido",
                "obrigatorio": True,
                "itens": [
                    {"descricao": "Ofício assinado", "exige_documento": True},
                    {"descricao": "Certidão negativa", "exige_documento": True},
                ],
            },
            headers=assessor["headers"],
        )
    ).json()

    # ── 3. Assessoria encaminha a elaboração do ofício ao Jurídico ─────────
    tarefa_oficio = (
        await client.post(
            f"{BASE}/{demanda_id}/tarefas",
            json={
                "titulo": "Elaborar ofício formal solicitando o veículo",
                "atribuida_a_id": str(juridico["user"].id),
                "setor_destino_id": str(setor_juridico.id),
                "exige_documento": True,
                "exige_retorno": True,
            },
            headers=assessor["headers"],
        )
    ).json()
    assert tarefa_oficio["status"] == "AGUARDANDO_ACEITE"

    # ── 4/5/6. Jurídico recebe, anexa e conclui ───────────────────────────
    url_oficio = f"{BASE}/{demanda_id}/tarefas/{tarefa_oficio['id']}"
    await client.post(f"{url_oficio}/receber", headers=juridico["headers"])
    await client.post(f"{url_oficio}/iniciar", headers=juridico["headers"])
    oficio = await _enviar_documento(
        client, assessor["headers"], demanda_id, "oficio-015-2026.pdf", "02 Ofícios"
    )
    # A tarefa exige documento: sem anexo na própria tarefa, não conclui.
    anexo_tarefa = await client.post(
        f"{BASE}/{demanda_id}/documentos",
        files={"arquivo": ("oficio-assinado.pdf", PDF, "application/pdf")},
        data={"pasta": "02 Ofícios", "tarefa_id": tarefa_oficio["id"]},
        headers=juridico["headers"],
    )
    assert anexo_tarefa.status_code == 201, anexo_tarefa.text
    concluida = await client.post(
        f"{url_oficio}/concluir",
        json={"resultado": "Ofício 015/2026 elaborado e assinado"},
        headers=juridico["headers"],
    )
    assert concluida.status_code == 200, concluida.text
    assert concluida.json()["status"] == "CONCLUIDA"

    # ── 7. Item do checklist fecha com o documento produzido ──────────────
    item_oficio = next(
        i for i in checklist["itens"] if i["descricao"] == "Ofício assinado"
    )
    fechado = await client.post(
        f"{BASE}/{demanda_id}/checklists/{checklist['id']}/itens/{item_oficio['id']}/concluir",
        json={"documento_id": oficio["id"]},
        headers=assessor["headers"],
    )
    assert fechado.status_code == 200, fechado.text

    # ── 8. Assessoria protocola no sistema do Governo do Estado ───────────
    protocolo = (
        await client.post(
            f"{BASE}/{demanda_id}/protocolos",
            json={
                "sistema": "Sistema Estadual de Convênios",
                "orgao": "Secretaria de Estado da Saúde",
                "numero": "989232",
                "ano": 2026,
                "data_protocolo": "2026-09-17T10:17:00Z",
                "proxima_verificacao": "2026-09-24",
            },
            headers=assessor["headers"],
        )
    ).json()
    detalhe = (await client.get(f"{BASE}/{demanda_id}", headers=assessor["headers"])).json()
    assert detalhe["aguardando_terceiro"] == "Secretaria de Estado da Saúde"

    # ── 9. O órgão pede certidão complementar ─────────────────────────────
    caminho_atualizacoes = (
        f"{BASE}/{demanda_id}/protocolos/{protocolo['id']}/atualizacoes"
    )
    await client.post(
        caminho_atualizacoes,
        json={
            "situacao": "DOCUMENTACAO_COMPLEMENTAR",
            "descricao": "Órgão solicitou certidão negativa de débitos",
        },
        headers=assessor["headers"],
    )

    # ── 10/11. Assessoria pede a certidão à Contabilidade, sem largar a demanda ──
    solicitacao = await client.post(
        f"{url_oficio}/solicitar-informacao",
        json={
            "titulo": "Providenciar certidão negativa de débitos",
            "atribuida_a_id": str(contabilidade["user"].id),
            "setor_destino_id": str(setor_contabil.id),
        },
        headers=assessor["headers"],
    )
    assert solicitacao.status_code in (200, 201), solicitacao.text
    subtarefa = solicitacao.json()
    assert subtarefa["tipo"] == "INFORMACAO"

    certidao = await _enviar_documento(
        client, assessor["headers"], demanda_id, "certidao.pdf", "03 Certidões"
    )
    await _concluir_tarefa(
        client, contabilidade["headers"], demanda_id, subtarefa["id"], "Certidão emitida"
    )
    # A responsabilidade principal continua com a Assessoria (§23, §24).
    depois_da_certidao = (
        await client.get(f"{BASE}/{demanda_id}", headers=assessor["headers"])
    ).json()
    assert depois_da_certidao["responsavel_geral"]["id"] == str(assessor["user"].id)

    item_certidao = next(
        i for i in checklist["itens"] if i["descricao"] == "Certidão negativa"
    )
    await client.post(
        f"{BASE}/{demanda_id}/checklists/{checklist['id']}/itens/{item_certidao['id']}/concluir",
        json={"documento_id": certidao["id"]},
        headers=assessor["headers"],
    )

    # ── 12/13. Assessoria reenvia; o recurso é aprovado ───────────────────
    aprovado = await client.post(
        caminho_atualizacoes,
        json={
            "situacao": "APROVADO",
            "descricao": "Proposta aprovada; recurso liberado",
        },
        headers=assessor["headers"],
    )
    assert aprovado.status_code == 201
    assert aprovado.json()["situacao"] == "APROVADO"
    devolvida = (await client.get(f"{BASE}/{demanda_id}", headers=assessor["headers"])).json()
    assert devolvida["aguardando_terceiro"] is None

    # ── 14–19. Convênio, licitação, contrato e pagamentos ─────────────────
    for tipo, valor, documento in (
        ("APROVACAO", "320000.00", "termo-de-convenio"),
        ("LICITADO", "318000.00", "ata-de-pregao"),
        ("CONTRATADO", "318000.00", "contrato-045-2026"),
        ("EMPENHO", "318000.00", "empenho-1234"),
        ("LIQUIDACAO", "318000.00", "nota-fiscal-987"),
        ("PAGAMENTO", "318000.00", "ordem-de-pagamento"),
    ):
        comprovante = await _enviar_documento(
            client, assessor["headers"], demanda_id, f"{documento}.pdf", "09 Financeiro"
        )
        resp = await client.post(
            f"{BASE}/{demanda_id}/financeiro",
            json={
                "tipo": tipo,
                "valor": valor,
                "data_registro": "2026-11-20",
                "numero_documento": documento,
                "documento_id": comprovante["id"],
            },
            headers=assessor["headers"],
        )
        assert resp.status_code == 201, resp.text

    financeiro = (
        await client.get(f"{BASE}/{demanda_id}/financeiro", headers=assessor["headers"])
    ).json()
    assert financeiro["valor_pago"] == 318000.0
    assert financeiro["valor_aprovado"] == 320000.0
    assert financeiro["saldo"] == 2000.0

    # ── 20/21. Veículo recebido e patrimoniado ────────────────────────────
    await _enviar_documento(
        client, assessor["headers"], demanda_id, "termo-de-recebimento.pdf", "10 Entrega"
    )
    await _enviar_documento(
        client, assessor["headers"], demanda_id, "registro-patrimonio.pdf", "10 Entrega"
    )

    # ── 22/23. Prestação de contas e conclusão ────────────────────────────
    checagem = (
        await client.get(f"{BASE}/{demanda_id}/checagem-conclusao", headers=assessor["headers"])
    ).json()
    assert checagem["pode_concluir"] is True, checagem["impedimentos"]

    concluir = await client.post(
        f"{BASE}/{demanda_id}/concluir",
        json={
            "resultado": "Veículo recebido e patrimoniado pela Secretaria de Saúde",
            "valor_final": "318000.00",
            "forcar": True,
        },
        headers=assessor["headers"],
    )
    assert concluir.status_code == 200, concluir.text
    assert concluir.json()["concluida_em"] is not None
    assert concluir.json()["progresso"] == 100

    # ── A timeline conta a história inteira ───────────────────────────────
    timeline = await client.get(
        f"{BASE}/{demanda_id}/timeline?page_size=100", headers=assessor["headers"]
    )
    tipos = [e["tipo_evento"] for e in timeline.json()["items"]]
    for esperado in (
        "DEMANDA_CRIADA",
        "TAREFA_CRIADA",
        "TAREFA_CONCLUIDA",
        "CHECKLIST_CRIADO",
        "CHECKLIST_ITEM_CONCLUIDO",
        "PROTOCOLO_REGISTRADO",
        "PROTOCOLO_ATUALIZADO",
        "REGISTRO_FINANCEIRO_LANCADO",
        "DEMANDA_CONCLUIDA",
    ):
        assert esperado in tipos, f"{esperado} não apareceu na timeline: {sorted(set(tipos))}"

    # ── E o relatório final reúne tudo ────────────────────────────────────
    relatorio = (
        await client.get(f"{BASE}/{demanda_id}/relatorio", headers=assessor["headers"])
    ).json()
    assert relatorio["demanda"]["concluida_em"]
    assert len(relatorio["documentos"]) >= 8
    assert len(relatorio["protocolos"]) == 1
    assert relatorio["checklists"][0]["concluidos"] == 2
    assert "Curitiba" in relatorio["resumo_executivo"]

    pdf = await client.get(f"{BASE}/{demanda_id}/relatorio.pdf", headers=assessor["headers"])
    assert pdf.content.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_municipio_vizinho_nao_alcanca_nada_da_demanda(
    client, make_tenant, catalogo_padrao
):
    """§165 — todas as portas do município B respondem 404 para a demanda de A."""
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = (
        await client.post(BASE, json={"titulo": "Ambulância de A"}, headers=a["headers"])
    ).json()
    d = demanda["id"]

    tentativas = [
        await client.get(f"{BASE}/{d}", headers=b["headers"]),
        await client.patch(f"{BASE}/{d}", json={"titulo": "roubada"}, headers=b["headers"]),
        await client.get(f"{BASE}/{d}/timeline", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/documentos", headers=b["headers"]),
        await client.post(
            f"{BASE}/{d}/documentos",
            files={"arquivo": ("x.pdf", PDF, "application/pdf")},
            headers=b["headers"],
        ),
        await client.get(f"{BASE}/{d}/comentarios", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/protocolos", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/checklists", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/financeiro", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/relatorio", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/relatorio.pdf", headers=b["headers"]),
        await client.get(f"{BASE}/{d}/obras", headers=b["headers"]),
        await client.post(
            f"{BASE}/{d}/concluir",
            json={"resultado": "tentativa de conclusão indevida"},
            headers=b["headers"],
        ),
    ]
    for resposta in tentativas:
        assert resposta.status_code == 404, (
            f"{resposta.request.method} {resposta.request.url} devolveu "
            f"{resposta.status_code}, não 404"
        )
