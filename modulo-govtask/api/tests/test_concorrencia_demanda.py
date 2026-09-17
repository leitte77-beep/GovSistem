"""Concorrência otimista na edição da demanda (§120).

Duas edições simultâneas não podem se sobrescrever em silêncio: quem salvar com
uma versão desatualizada recebe 409 e recarrega, em vez de apagar o que a outra
pessoa registrou.
"""

import pytest

BASE = "/api/govtask/demandas"


async def _criar(client, headers, **campos):
    payload = {"titulo": "Aquisição de veículo por indicação parlamentar"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_demanda_nasce_na_versao_1(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])
    assert demanda["versao"] == 1

    listagem = await client.get(BASE, headers=t["headers"])
    assert listagem.json()["items"][0]["versao"] == 1


@pytest.mark.asyncio
async def test_patch_com_versao_correta_avanca_a_versao(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])

    resp = await client.patch(
        f"{BASE}/{demanda['id']}",
        json={"objeto": "Veículo para a Secretaria de Saúde", "versao_esperada": 1},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["versao"] == 2
    assert resp.json()["objeto"] == "Veículo para a Secretaria de Saúde"


@pytest.mark.asyncio
async def test_edicao_concorrente_nao_sobrescreve(client, make_tenant, catalogo_padrao):
    """Quem salvou primeiro prevalece; o segundo recebe 409 e nada muda."""
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])

    primeira = await client.patch(
        f"{BASE}/{demanda['id']}",
        json={"assunto": "Alteração de Maria", "versao_esperada": 1},
        headers=t["headers"],
    )
    assert primeira.status_code == 200

    # João abriu a demanda antes da alteração de Maria e ainda insiste com a v1.
    segunda = await client.patch(
        f"{BASE}/{demanda['id']}",
        json={"assunto": "Alteração de João", "versao_esperada": 1},
        headers=t["headers"],
    )
    assert segunda.status_code == 409, segunda.text
    assert segunda.json()["detail"]["versao_atual"] == 2

    atual = await client.get(f"{BASE}/{demanda['id']}", headers=t["headers"])
    assert atual.json()["assunto"] == "Alteração de Maria"


@pytest.mark.asyncio
async def test_patch_sem_versao_esperada_segue_sem_bloqueio(client, make_tenant, catalogo_padrao):
    """Compatibilidade: integrações antigas que não enviam a versão continuam."""
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])

    resp = await client.patch(
        f"{BASE}/{demanda['id']}",
        json={"objeto": "Ajuste administrativo"},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["versao"] == 2


@pytest.mark.asyncio
async def test_arquivamento_tambem_avanca_a_versao(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"])
    await client.post(
        f"{BASE}/{demanda['id']}/concluir",
        json={"resultado": "Objeto entregue"},
        headers=t["headers"],
    )
    arquivada = await client.post(f"{BASE}/{demanda['id']}/arquivar", headers=t["headers"])
    assert arquivada.status_code == 200, arquivada.text
    # concluir avança a versão e arquivar avança de novo.
    assert arquivada.json()["versao"] >= 3
