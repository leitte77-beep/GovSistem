"""Checklists: progresso, exigência de documento e trava de conclusão (§32, §67, §145)."""

import pytest

BASE = "/api/govtask/demandas"


async def _demanda(client, headers):
    resp = await client.post(BASE, json={"titulo": "Formalização de emenda"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _payload(**campos) -> dict:
    base = {
        "titulo": "Formalização de emenda",
        "obrigatorio": True,
        "itens": [
            {"descricao": "Ofício assinado", "exige_documento": True},
            {"descricao": "Plano de Trabalho"},
            {"descricao": "Certidão"},
            {"descricao": "Projeto", "obrigatorio": False},
        ],
    }
    base.update(campos)
    return base


@pytest.mark.asyncio
async def test_progresso_conta_itens_vivos(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    checklist = (
        await client.post(
            f"{BASE}/{demanda['id']}/checklists", json=_payload(), headers=t["headers"]
        )
    ).json()
    assert (checklist["total"], checklist["concluidos"]) == (4, 0)

    caminho = f"{BASE}/{demanda['id']}/checklists/{checklist['id']}/itens"
    plano = next(i for i in checklist["itens"] if i["descricao"] == "Plano de Trabalho")
    feito = await client.post(
        f"{caminho}/{plano['id']}/concluir", json={}, headers=t["headers"]
    )
    assert feito.status_code == 200
    assert feito.json()["concluidos"] == 1

    # Concluir duas vezes não conta duas vezes.
    repetido = await client.post(
        f"{caminho}/{plano['id']}/concluir", json={}, headers=t["headers"]
    )
    assert repetido.status_code == 409


@pytest.mark.asyncio
async def test_item_que_exige_documento_nao_fecha_sem_ele(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    checklist = (
        await client.post(
            f"{BASE}/{demanda['id']}/checklists", json=_payload(), headers=t["headers"]
        )
    ).json()
    oficio = next(i for i in checklist["itens"] if i["exige_documento"])
    resp = await client.post(
        f"{BASE}/{demanda['id']}/checklists/{checklist['id']}/itens/{oficio['id']}/concluir",
        json={},
        headers=t["headers"],
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_checklist_obrigatorio_impede_conclusao_da_demanda(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/checklists",
        json={"titulo": "Documentos exigidos", "obrigatorio": True,
              "itens": [{"descricao": "Certidão negativa"}]},
        headers=t["headers"],
    )

    checagem = await client.get(
        f"{BASE}/{demanda['id']}/checagem-conclusao", headers=t["headers"]
    )
    assert checagem.json()["pode_concluir"] is False
    assert any("Certidão negativa" in i for i in checagem.json()["impedimentos"])

    # Impedimento não se contorna com `forcar` — só alerta se contorna.
    bloqueada = await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "entregue", "forcar": True},
        headers=t["headers"],
    )
    assert bloqueada.status_code == 409


@pytest.mark.asyncio
async def test_checklist_nao_obrigatorio_apenas_alerta(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/checklists",
        json={"titulo": "Boas práticas", "obrigatorio": False,
              "itens": [{"descricao": "Registro fotográfico"}]},
        headers=t["headers"],
    )
    checagem = await client.get(
        f"{BASE}/{demanda['id']}/checagem-conclusao", headers=t["headers"]
    )
    assert checagem.json()["pode_concluir"] is True
    assert any("Registro fotográfico" in a for a in checagem.json()["alertas"])

    sem_forcar = await client.post(
        f"{BASE}/{demanda['id']}/concluir", json={"resultado": "entregue"}, headers=t["headers"]
    )
    assert sem_forcar.status_code == 409
    com_forcar = await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "entregue", "forcar": True},
        headers=t["headers"],
    )
    assert com_forcar.status_code == 200


@pytest.mark.asyncio
async def test_reabrir_exige_motivo_e_deixa_rastro(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    checklist = (
        await client.post(
            f"{BASE}/{demanda['id']}/checklists",
            json={"titulo": "Etapa", "itens": [{"descricao": "Certidão"}]},
            headers=t["headers"],
        )
    ).json()
    item = checklist["itens"][0]
    caminho = f"{BASE}/{demanda['id']}/checklists/{checklist['id']}/itens/{item['id']}"
    await client.post(f"{caminho}/concluir", json={}, headers=t["headers"])

    assert (
        await client.post(f"{caminho}/reabrir?motivo=oi", headers=t["headers"])
    ).status_code == 422
    ok = await client.post(
        f"{caminho}/reabrir?motivo=certidão vencida antes do protocolo",
        headers=t["headers"],
    )
    assert ok.status_code == 200
    assert ok.json()["concluidos"] == 0

    timeline = await client.get(f"{BASE}/{demanda['id']}/timeline", headers=t["headers"])
    tipos = [e["tipo_evento"] for e in timeline.json()["items"]]
    assert "CHECKLIST_ITEM_CONCLUIDO" in tipos and "CHECKLIST_ITEM_REABERTO" in tipos


@pytest.mark.asyncio
async def test_checklist_de_outro_tenant_responde_404(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    checklist = (
        await client.post(
            f"{BASE}/{demanda['id']}/checklists", json=_payload(), headers=a["headers"]
        )
    ).json()

    assert (
        await client.get(f"{BASE}/{demanda['id']}/checklists", headers=b["headers"])
    ).status_code == 404
    assert (
        await client.post(
            f"{BASE}/{demanda['id']}/checklists/{checklist['id']}/itens",
            json={"descricao": "invasão"},
            headers=b["headers"],
        )
    ).status_code == 404
