"""Isolamento multi-tenant do núcleo de demandas (§97, §165).

Município A cria uma demanda; um usuário do Município B tenta alcançá-la por
todos os caminhos. Nenhum pode vazar — nem a existência do registro.
"""

import uuid

import pytest

BASE = "/api/govtask/demandas"


@pytest.mark.asyncio
async def test_usuario_de_outro_municipio_nao_alcanca_demanda(
    client, make_tenant, catalogo_padrao
):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")  # outra organização

    criada = await client.post(
        BASE, json={"titulo": "Convênio sigiloso do Município A"}, headers=a["headers"]
    )
    demanda_id = criada.json()["id"]

    # Listagem não enxerga.
    lista_b = await client.get(BASE, headers=b["headers"])
    assert lista_b.json()["total"] == 0

    # Acesso direto por ID responde 404 — 403 confirmaria a existência.
    assert (await client.get(f"{BASE}/{demanda_id}", headers=b["headers"])).status_code == 404

    tentativas = [
        client.patch(f"{BASE}/{demanda_id}", json={"titulo": "invadido"}, headers=b["headers"]),
        client.post(f"{BASE}/{demanda_id}/status", json={"status_id": str(uuid.uuid4())}, headers=b["headers"]),
        client.post(f"{BASE}/{demanda_id}/bloquear", json={"motivo": "qualquer"}, headers=b["headers"]),
        client.post(f"{BASE}/{demanda_id}/concluir", json={"resultado": "resultado qualquer", "forcar": True}, headers=b["headers"]),
        client.post(f"{BASE}/{demanda_id}/cancelar", json={"motivo": "motivo qualquer"}, headers=b["headers"]),
        client.post(f"{BASE}/{demanda_id}/seguir", headers=b["headers"]),
        client.get(f"{BASE}/{demanda_id}/timeline", headers=b["headers"]),
        client.get(f"{BASE}/{demanda_id}/checagem-conclusao", headers=b["headers"]),
    ]
    for tentativa in tentativas:
        resposta = await tentativa
        assert resposta.status_code in (403, 404), resposta.text

    # E a demanda continua intacta para o dono.
    original = await client.get(f"{BASE}/{demanda_id}", headers=a["headers"])
    assert original.json()["titulo"] == "Convênio sigiloso do Município A"


@pytest.mark.asyncio
async def test_sem_autenticacao_nao_lista(client, catalogo_padrao):
    assert (await client.get(BASE)).status_code == 401


@pytest.mark.asyncio
async def test_demanda_confidencial_so_aparece_para_envolvidos(
    client, make_tenant, catalogo_padrao
):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("ENGENHEIRO_TECNICO", org=dono["org"])

    criada = await client.post(
        BASE,
        json={"titulo": "Sindicância interna", "confidencialidade": "CONFIDENCIAL"},
        headers=dono["headers"],
    )
    demanda_id = criada.json()["id"]

    assert (await client.get(BASE, headers=colega["headers"])).json()["total"] == 0
    assert (
        await client.get(f"{BASE}/{demanda_id}", headers=colega["headers"])
    ).status_code == 404
    assert (await client.get(BASE, headers=dono["headers"])).json()["total"] == 1


@pytest.mark.asyncio
async def test_perfil_sem_permissao_de_criar_recebe_403(client, make_tenant, catalogo_padrao):
    """GESTOR só consulta: não pode abrir demanda (§93, §94)."""
    gestor = await make_tenant("GESTOR")
    resp = await client.post(BASE, json={"titulo": "Tentativa"}, headers=gestor["headers"])
    assert resp.status_code == 403
