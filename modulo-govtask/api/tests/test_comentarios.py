"""Conversa da demanda: comentários, menções e histórico de edição (§42, §43)."""

import pytest

BASE = "/api/govtask/demandas"


async def _demanda(client, headers):
    resp = await client.post(BASE, json={"titulo": "Aquisição de ambulância"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_comentario_com_mencao_notifica_o_citado(client, make_tenant, catalogo_padrao):
    autor = await make_tenant("ASSESSOR", name="Maria Assessora")
    citado = await make_tenant("SERVIDOR", org=autor["org"], name="João Contador")
    demanda = await _demanda(client, autor["headers"])

    resp = await client.post(
        f"{BASE}/{demanda['id']}/comentarios",
        json={"texto": f"@{citado['user'].email} favor conferir a certidão."},
        headers=autor["headers"],
    )
    assert resp.status_code == 201, resp.text
    assert [m["user_id"] for m in resp.json()["mencoes"]] == [str(citado["user"].id)]

    minhas = await client.get("/api/govtask/minhas-mencoes", headers=citado["headers"])
    assert minhas.status_code == 200
    assert len(minhas.json()) == 1

    # A conversa gera evento de timeline, mas o evento é o fato "comentou",
    # nunca o texto editável.
    timeline = await client.get(f"{BASE}/{demanda['id']}/timeline", headers=autor["headers"])
    assert "COMENTARIO_ADICIONADO" in [e["tipo_evento"] for e in timeline.json()["items"]]


@pytest.mark.asyncio
async def test_autor_nao_e_mencionado_e_token_solto_e_ignorado(
    client, make_tenant, catalogo_padrao
):
    autor = await make_tenant("ASSESSOR", name="Maria Assessora")
    demanda = await _demanda(client, autor["headers"])
    resp = await client.post(
        f"{BASE}/{demanda['id']}/comentarios",
        json={"texto": f"@{autor['user'].email} nota para mim; conferir @prazo também"},
        headers=autor["headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["mencoes"] == []


@pytest.mark.asyncio
async def test_edicao_guarda_o_texto_anterior(client, make_tenant, catalogo_padrao):
    autor = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, autor["headers"])
    comentario = (
        await client.post(
            f"{BASE}/{demanda['id']}/comentarios",
            json={"texto": "Certidão vence em maio"},
            headers=autor["headers"],
        )
    ).json()

    editado = await client.patch(
        f"{BASE}/{demanda['id']}/comentarios/{comentario['id']}",
        json={"texto": "Certidão vence em março"},
        headers=autor["headers"],
    )
    assert editado.status_code == 200
    assert editado.json()["editado_em"] is not None

    revisoes = await client.get(
        f"{BASE}/{demanda['id']}/comentarios/{comentario['id']}/revisoes",
        headers=autor["headers"],
    )
    assert [r["texto_anterior"] for r in revisoes.json()] == ["Certidão vence em maio"]


@pytest.mark.asyncio
async def test_colega_nao_edita_nem_exclui_comentario_alheio(
    client, make_tenant, catalogo_padrao
):
    autor = await make_tenant("ASSESSOR")
    colega = await make_tenant("ASSESSOR", org=autor["org"])
    demanda = await _demanda(client, autor["headers"])
    comentario = (
        await client.post(
            f"{BASE}/{demanda['id']}/comentarios",
            json={"texto": "Documento conferido"},
            headers=autor["headers"],
        )
    ).json()
    caminho = f"{BASE}/{demanda['id']}/comentarios/{comentario['id']}"

    assert (
        await client.patch(caminho, json={"texto": "outra coisa"}, headers=colega["headers"])
    ).status_code == 403
    assert (await client.delete(caminho, headers=colega["headers"])).status_code == 403


@pytest.mark.asyncio
async def test_comentario_de_outro_tenant_responde_404(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/comentarios",
        json={"texto": "interno"},
        headers=a["headers"],
    )

    assert (
        await client.get(f"{BASE}/{demanda['id']}/comentarios", headers=b["headers"])
    ).status_code == 404
    assert (
        await client.post(
            f"{BASE}/{demanda['id']}/comentarios",
            json={"texto": "invasão"},
            headers=b["headers"],
        )
    ).status_code == 404
    # A busca de outro tenant também não alcança o comentário.
    assert (
        await client.get("/api/govtask/busca?q=interno", headers=b["headers"])
    ).json()["comentarios"] == []


@pytest.mark.asyncio
async def test_fixado_vem_primeiro(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    for texto in ("primeiro", "segundo", "terceiro"):
        await client.post(
            f"{BASE}/{demanda['id']}/comentarios",
            json={"texto": texto},
            headers=t["headers"],
        )
    comentarios = (
        await client.get(f"{BASE}/{demanda['id']}/comentarios", headers=t["headers"])
    ).json()
    alvo = comentarios[-1]["id"]
    await client.post(
        f"{BASE}/{demanda['id']}/comentarios/{alvo}/fixar", headers=t["headers"]
    )
    depois = (
        await client.get(f"{BASE}/{demanda['id']}/comentarios", headers=t["headers"])
    ).json()
    assert depois[0]["id"] == alvo
    assert depois[0]["fixado"] is True
