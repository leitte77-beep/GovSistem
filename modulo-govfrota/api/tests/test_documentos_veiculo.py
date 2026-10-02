"""Documentos do veículo com arquivo anexado: incluir, listar com dados do
arquivo, editar, isolamento entre organizações e exclusão auditada."""

from datetime import date, timedelta

import pytest

API = "/api/govfrota"


async def _pdf(client, headers, nome="crlv.pdf"):
    r = await client.post(f"{API}/uploads", files={"file": (nome, b"%PDF-1.4 teste", "application/pdf")}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_documento_com_arquivo(client, make_tenant, setup_frota):
    t = await make_tenant("ADMIN")
    frota = await setup_frota(t["org"])
    url = f"{API}/veiculos/{frota['veiculo'].id}/documentos"

    anexo = await _pdf(client, t["headers"])
    venc = (date.today() + timedelta(days=200)).isoformat()
    r = await client.post(url, json={"tipo": "CRLV", "descricao": "CRLV 2026", "vencimento": venc, "anexo_id": anexo}, headers=t["headers"])
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["arquivo_nome"] == "crlv.pdf" and doc["arquivo_mime"] == "application/pdf" and doc["arquivo_tamanho"] > 0

    lista = (await client.get(url, headers=t["headers"])).json()
    assert [d["id"] for d in lista] == [doc["id"]] and lista[0]["tipo"] == "CRLV"

    # Editar: troca o arquivo e a descrição.
    novo = await _pdf(client, t["headers"], "crlv-2027.pdf")
    r = await client.patch(f"{url}/{doc['id']}", json={"descricao": "CRLV 2027", "anexo_id": novo}, headers=t["headers"])
    assert r.status_code == 200 and r.json()["arquivo_nome"] == "crlv-2027.pdf" and r.json()["descricao"] == "CRLV 2027"

    # Arquivo de outra organização não pode ser vinculado.
    outro = await make_tenant("ADMIN")
    alheio = await _pdf(client, outro["headers"])
    r = await client.post(url, json={"tipo": "SEGURO", "descricao": "Seguro", "anexo_id": alheio}, headers=t["headers"])
    assert r.status_code == 422

    # Excluir fica na auditoria.
    assert (await client.delete(f"{url}/{doc['id']}", headers=t["headers"])).status_code == 204
    assert (await client.get(url, headers=t["headers"])).json() == []
    aud = (await client.get(f"{API}/auditoria", headers=t["headers"])).json()
    itens = aud["items"] if isinstance(aud, dict) and "items" in aud else aud
    assert any(a.get("acao") == "veiculo.documento_excluir" for a in itens)
