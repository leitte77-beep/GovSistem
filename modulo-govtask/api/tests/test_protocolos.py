"""Protocolos externos: cadastro, acompanhamento e isolamento (§33, §34)."""

import pytest

BASE = "/api/govtask/demandas"


async def _demanda(client, headers, **campos):
    payload = {"titulo": "Aquisição de veículo por indicação parlamentar"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _protocolo(**campos) -> dict:
    payload = {
        "sistema": "Transferegov",
        "numero": "989232",
        "orgao": "Ministério da Saúde",
        "data_protocolo": "2026-09-16T10:00:00Z",
        "proxima_verificacao": "2026-09-23",
    }
    payload.update(campos)
    return payload


@pytest.mark.asyncio
async def test_cadastro_registra_primeira_movimentacao_e_aguardo(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])

    resp = await client.post(
        f"{BASE}/{demanda['id']}/protocolos", json=_protocolo(), headers=t["headers"]
    )
    assert resp.status_code == 201, resp.text
    criado = resp.json()
    assert criado["situacao"] == "PROTOCOLADO"
    # O cadastro é a primeira movimentação: o histórico não começa no meio.
    assert len(criado["atualizacoes"]) == 1

    detalhe = await client.get(f"{BASE}/{demanda['id']}", headers=t["headers"])
    assert detalhe.json()["aguardando_terceiro"] == "Ministério da Saúde"

    timeline = await client.get(f"{BASE}/{demanda['id']}/timeline", headers=t["headers"])
    assert "PROTOCOLO_REGISTRADO" in [
        e["tipo_evento"] for e in timeline.json()["items"]
    ]


@pytest.mark.asyncio
async def test_numero_duplicado_no_mesmo_sistema_e_recusado(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/protocolos", json=_protocolo(), headers=t["headers"]
    )
    repetido = await client.post(
        f"{BASE}/{demanda['id']}/protocolos", json=_protocolo(), headers=t["headers"]
    )
    assert repetido.status_code == 409

    # Mesmo número em outro sistema é legítimo.
    outro = await client.post(
        f"{BASE}/{demanda['id']}/protocolos",
        json=_protocolo(sistema="SEI"),
        headers=t["headers"],
    )
    assert outro.status_code == 201


@pytest.mark.asyncio
async def test_atualizacoes_sao_append_only_e_encerramento_devolve_a_bola(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    protocolo = (
        await client.post(
            f"{BASE}/{demanda['id']}/protocolos", json=_protocolo(), headers=t["headers"]
        )
    ).json()
    caminho = f"{BASE}/{demanda['id']}/protocolos/{protocolo['id']}/atualizacoes"

    analise = await client.post(
        caminho,
        json={"situacao": "EM_ANALISE", "descricao": "Recebido pelo concedente"},
        headers=t["headers"],
    )
    assert analise.status_code == 201
    assert len(analise.json()["atualizacoes"]) == 2

    diligencia = await client.post(
        caminho,
        json={
            "situacao": "DOCUMENTACAO_COMPLEMENTAR",
            "descricao": "Solicitada certidão negativa",
            "proxima_verificacao": "2026-10-01",
        },
        headers=t["headers"],
    )
    assert diligencia.status_code == 201
    assert len(diligencia.json()["atualizacoes"]) == 3

    aprovado = await client.post(
        caminho,
        json={"situacao": "APROVADO", "descricao": "Proposta aprovada"},
        headers=t["headers"],
    )
    assert aprovado.status_code == 201
    assert aprovado.json()["proxima_verificacao"] is None

    # Encerrado no órgão, não recebe mais movimentação.
    depois = await client.post(
        caminho,
        json={"situacao": "EM_ANALISE", "descricao": "tentativa indevida"},
        headers=t["headers"],
    )
    assert depois.status_code == 409

    detalhe = await client.get(f"{BASE}/{demanda['id']}", headers=t["headers"])
    assert detalhe.json()["aguardando_terceiro"] is None


@pytest.mark.asyncio
async def test_protocolo_de_outro_tenant_responde_404(
    client, make_tenant, catalogo_padrao
):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    protocolo = (
        await client.post(
            f"{BASE}/{demanda['id']}/protocolos", json=_protocolo(), headers=a["headers"]
        )
    ).json()

    for resposta in (
        await client.get(f"{BASE}/{demanda['id']}/protocolos", headers=b["headers"]),
        await client.get(
            f"{BASE}/{demanda['id']}/protocolos/{protocolo['id']}", headers=b["headers"]
        ),
        await client.post(
            f"{BASE}/{demanda['id']}/protocolos/{protocolo['id']}/atualizacoes",
            json={"situacao": "EM_ANALISE", "descricao": "invasão"},
            headers=b["headers"],
        ),
    ):
        # 404, nunca 403: 403 confirmaria que a demanda existe.
        assert resposta.status_code == 404


@pytest.mark.asyncio
async def test_agenda_de_cobranca_separa_o_que_vencer(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/protocolos",
        json=_protocolo(
            proxima_verificacao="2020-01-01", prazo_resposta="2020-02-01T00:00:00Z"
        ),
        headers=t["headers"],
    )
    resp = await client.get("/api/govtask/protocolos/acompanhamento", headers=t["headers"])
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["total_abertos"] == 1
    assert len(corpo["cobrar_hoje"]) == 1
    assert len(corpo["prazo_de_resposta_vencido"]) == 1
