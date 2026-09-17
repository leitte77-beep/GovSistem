"""Financeiro gerencial: totais derivados e permissão própria (§59, §60, §61)."""

import pytest

BASE = "/api/govtask/demandas"


async def _demanda(client, headers):
    resp = await client.post(BASE, json={"titulo": "Aquisição de ambulância"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _lancar(client, headers, demanda_id, tipo, valor, **campos):
    payload = {"tipo": tipo, "valor": valor, "data_registro": "2026-09-16"}
    payload.update(campos)
    return await client.post(
        f"{BASE}/{demanda_id}/financeiro", json=payload, headers=headers
    )


@pytest.mark.asyncio
async def test_totais_sao_derivados_dos_lancamentos(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])

    await _lancar(client, t["headers"], demanda["id"], "APROVACAO", "300000.00")
    await _lancar(client, t["headers"], demanda["id"], "EMPENHO", "180000.00")
    await _lancar(client, t["headers"], demanda["id"], "PAGAMENTO", "100000.00")
    await _lancar(client, t["headers"], demanda["id"], "PAGAMENTO", "80000.00")

    resumo = (
        await client.get(f"{BASE}/{demanda['id']}/financeiro", headers=t["headers"])
    ).json()
    assert resumo["valor_aprovado"] == 300000.0
    assert resumo["valor_empenhado"] == 180000.0
    # Dois pagamentos somam; o total não é o último lançamento.
    assert resumo["valor_pago"] == 180000.0
    assert resumo["valor_executado"] == 180000.0
    assert resumo["saldo"] == 120000.0

    # O detalhe da demanda mostra o mesmo número que a aba financeira.
    detalhe = (await client.get(f"{BASE}/{demanda['id']}", headers=t["headers"])).json()
    assert float(detalhe["valor_pago"]) == 180000.0


@pytest.mark.asyncio
async def test_estorno_recalcula_e_exige_motivo(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    pago = (
        await _lancar(client, t["headers"], demanda["id"], "PAGAMENTO", "50000.00")
    ).json()

    sem_motivo = await client.delete(
        f"{BASE}/{demanda['id']}/financeiro/{pago['id']}?motivo=x", headers=t["headers"]
    )
    assert sem_motivo.status_code == 422

    estorno = await client.delete(
        f"{BASE}/{demanda['id']}/financeiro/{pago['id']}?motivo=lançamento em duplicidade",
        headers=t["headers"],
    )
    assert estorno.status_code == 204

    resumo = (
        await client.get(f"{BASE}/{demanda['id']}/financeiro", headers=t["headers"])
    ).json()
    # Sem lançamento, o total volta a "desconhecido" — não a zero.
    assert resumo["valor_pago"] is None
    assert resumo["registros"] == []


@pytest.mark.asyncio
async def test_servidor_sem_permissao_financeira_nao_ve_valores(
    client, make_tenant, catalogo_padrao
):
    assessor = await make_tenant("ASSESSOR")
    servidor = await make_tenant("SERVIDOR", org=assessor["org"])
    demanda = await _demanda(client, assessor["headers"])
    await _lancar(client, assessor["headers"], demanda["id"], "PAGAMENTO", "10000.00")

    assert (
        await client.get(f"{BASE}/{demanda['id']}/financeiro", headers=servidor["headers"])
    ).status_code == 403
    assert (
        await _lancar(client, servidor["headers"], demanda["id"], "PAGAMENTO", "1.00")
    ).status_code == 403


@pytest.mark.asyncio
async def test_financeiro_de_outro_tenant_responde_404(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    await _lancar(client, a["headers"], demanda["id"], "PAGAMENTO", "10000.00")

    assert (
        await client.get(f"{BASE}/{demanda['id']}/financeiro", headers=b["headers"])
    ).status_code == 404
    assert (
        await _lancar(client, b["headers"], demanda["id"], "PAGAMENTO", "1.00")
    ).status_code == 404


@pytest.mark.asyncio
async def test_comprovante_de_outra_demanda_e_recusado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    import uuid

    resp = await _lancar(
        client,
        t["headers"],
        demanda["id"],
        "NOTA_FISCAL",
        "500.00",
        documento_id=str(uuid.uuid4()),
    )
    assert resp.status_code == 404
