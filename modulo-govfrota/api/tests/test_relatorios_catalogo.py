"""Catálogo de relatórios: todos geram JSON/CSV/Excel/PDF e respeitam o escopo."""

import pytest

from tests.cenario_posto import _cenario

API = "/api/govfrota/relatorios/catalogo"
pytestmark = pytest.mark.asyncio


async def test_todos_os_relatorios_em_todos_os_formatos(client, _db, make_tenant, setup_frota):
    admin, *_ = await _cenario(client, _db, make_tenant, setup_frota)
    h = admin["headers"]
    catalogo = (await client.get(API, headers=h)).json()
    chaves = {c["chave"] for c in catalogo}
    assert {"conferencia", "contratos", "custo_veiculo", "auditoria", "comparativo_mensal", "extrato_veiculo"} <= chaves

    veiculo = (await client.get("/api/govfrota/veiculos", headers=h)).json()
    veiculo_id = (veiculo["itens"] if isinstance(veiculo, dict) else veiculo)[0]["id"]
    base = {"data_inicio": "2000-01-01"}
    for c in catalogo:
        params = {**base, **({"veiculo_id": veiculo_id} if "veiculo" in c["exige"] else {})}
        r = await client.get(f"{API}/{c['chave']}", params=params, headers=h)
        assert r.status_code == 200, (c["chave"], r.text)
        corpo = r.json()
        assert corpo["colunas"] and isinstance(corpo["linhas"], list), c["chave"]
        for formato in ("csv", "xlsx", "pdf"):
            r = await client.get(f"{API}/{c['chave']}", params={**params, "formato": formato}, headers=h)
            assert r.status_code == 200, (c["chave"], formato, r.text[:300])

    assert (await client.get(f"{API}/extrato_veiculo", params=base, headers=h)).status_code == 422
    assert (await client.get(f"{API}/nao_existe", headers=h)).status_code == 404


async def test_restrito_nao_ve_relatorios_da_organizacao(client, _db, make_tenant, setup_frota):
    admin, saude, *_ = await _cenario(client, _db, make_tenant, setup_frota)
    sec = await make_tenant("CONSULTA", org=admin["org"])
    r = await client.put(
        f"/api/govfrota/acessos/usuarios/{sec['user'].id}",
        json={"perfil": "SECRETARIO", "unidade_ids": [str(saude.id)]}, headers=admin["headers"],
    )
    assert r.status_code == 200, r.text
    h = sec["headers"]
    chaves = {c["chave"] for c in (await client.get(API, headers=h)).json()}
    assert "auditoria" not in chaves and "contratos" not in chaves
    assert (await client.get(f"{API}/auditoria", headers=h)).status_code == 403
    r = await client.get(f"{API}/conferencia", params={"data_inicio": "2000-01-01"}, headers=h)
    assert r.status_code == 200
    todos = (await client.get(f"{API}/custo_veiculo", params={"data_inicio": "2000-01-01"}, headers=admin["headers"])).json()
    meus = (await client.get(f"{API}/custo_veiculo", params={"data_inicio": "2000-01-01"}, headers=h)).json()
    assert {l["secretaria"] for l in meus["linhas"]} <= {"Saúde"}
    assert len(meus["linhas"]) <= len(todos["linhas"])
