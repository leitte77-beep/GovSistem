"""Portal do posto — acesso criado pela frota, isolamento por fornecedor e
envio da nota fiscal de cada abastecimento (o posto não fatura)."""

import pytest

from tests.cenario_posto import _cenario
from tests.test_nfe import xml_nfe

API = "/api/govfrota"
P = f"{API}/portal-posto"


async def _criar_acesso(client, admin, posto, login="posto.pinhal"):
    r = await client.post(f"{API}/fornecedores/{posto.id}/acessos",
                          json={"nome": "Maria do Posto", "email": "maria@posto.com", "login": login}, headers=admin["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def _entrar(client, login, senha, nova="NovaSenha123"):
    r = await client.post(f"{P}/login", json={"login": login, "senha": senha})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if r.json()["deve_trocar_senha"]:
        assert (await client.get(f"{P}/painel", headers=h)).status_code == 403
        r = await client.post(f"{P}/trocar-senha", json={"senha_atual": senha, "nova_senha": nova}, headers=h)
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return h


@pytest.mark.asyncio
async def test_fluxo_completo_do_posto(client, _db, make_tenant, setup_frota):
    admin, saude, educ, posto, itens, filtro = await _cenario(client, _db, make_tenant, setup_frota)
    acesso = await _criar_acesso(client, admin, posto)
    assert len(acesso["senha_provisoria"]) == 10
    h = await _entrar(client, "posto.pinhal", acesso["senha_provisoria"])

    me = (await client.get(f"{P}/me", headers=h)).json()
    assert me["posto"] == "Posto Pinhalzinho" and me["deve_trocar_senha"] is False
    painel = (await client.get(f"{P}/painel", headers=h)).json()
    assert painel["notas"]["pendentes"] == 4  # s1, s2, antigo, e1 (não o outro posto)
    assert sum(d["litros"] for d in painel["diario"]) == painel["litros"]

    pend = (await client.get(f"{P}/abastecimentos", params={"nota": "PENDENTE"}, headers=h)).json()
    assert len(pend) == 4 and all(a["nota"] is None for a in pend)
    assert all({"marca", "modelo", "motorista"} <= a.keys() for a in pend)
    assert {s["nome"] for s in (await client.get(f"{P}/secretarias", headers=h)).json()} == {"Saúde", "Educação"}
    # Faturar não é mais do posto.
    assert (await client.post(f"{P}/faturamentos", json={}, headers=h)).status_code in (404, 405)

    alvo = next(a for a in pend if a["valor"])
    url = f"{P}/abastecimentos/{alvo['id']}/nota"
    valor = f"{alvo['valor']:.2f}"
    xml = xml_nfe(itens=(("DIESEL S10", str(alvo["litros"]), "6", valor),))
    r = await client.post(url, files=[("arquivos", ("nota.xml", xml, "text/xml")), ("arquivos", ("danfe.pdf", b"%PDF-1.4 x", "application/pdf"))], headers=h)
    assert r.status_code == 201, r.text
    nota = r.json()
    assert nota["numero"] == "1234" and nota["xml_id"] and nota["pdf_id"] and nota["avisos"] == []

    # Mesmo XML em outro abastecimento é recusado; arquivo que não é nota também.
    outro = next(a for a in pend if a["id"] != alvo["id"])
    r = await client.post(f"{P}/abastecimentos/{outro['id']}/nota", files=[("arquivos", ("n.xml", xml, "text/xml"))], headers=h)
    assert r.status_code == 409
    r = await client.post(f"{P}/abastecimentos/{outro['id']}/nota", files=[("arquivos", ("n.xml", b"<x/>", "text/xml"))], headers=h)
    assert r.status_code == 422
    # Valor diferente vira aviso (não bloqueia).
    r = await client.post(f"{P}/abastecimentos/{outro['id']}/nota",
                          files=[("arquivos", ("n.xml", xml_nfe(chave="6" * 44, total=1.0), "text/xml"))], headers=h)
    assert r.status_code == 201 and any("Valor da nota" in a for a in r.json()["avisos"])

    assert (await client.get(f"{P}/painel", headers=h)).json()["notas"]["pendentes"] == 2
    r = await client.get(f"{url}/{nota['pdf_id']}/arquivo", headers=h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")

    # Prefeitura: lista, baixa uma e baixa o ZIP do período.
    ah = admin["headers"]
    rel = (await client.get(f"{API}/notas-fiscais", params={"inicio": "2000-01-01", "situacao": "COM_NOTA"}, headers=ah)).json()
    assert rel["resumo"]["com_nota"] == 2 and len(rel["itens"]) == 2 and rel["itens"][0]["posto"]
    r = await client.get(f"{API}/notas-fiscais/{nota['xml_id']}/arquivo", headers=ah)
    assert r.status_code == 200 and b"nfeProc" in r.content
    r = await client.get(f"{API}/notas-fiscais/zip", params={"inicio": "2000-01-01"}, headers=ah)
    assert r.status_code == 200
    import io
    import zipfile
    nomes = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert len(nomes) == 3 and sum(n.endswith(".pdf") for n in nomes) == 1
    r = await client.get(f"{API}/notas-fiscais/zip", params={"inicio": "2000-01-01", "tipos": "DANFE"}, headers=ah)
    assert len(zipfile.ZipFile(io.BytesIO(r.content)).namelist()) == 1


@pytest.mark.asyncio
async def test_isolamento_entre_postos_e_areas(client, _db, make_tenant, setup_frota):
    admin, saude, educ, posto, itens, filtro = await _cenario(client, _db, make_tenant, setup_frota)
    from app.models.combustivel import Fornecedor
    outro = (await _db.execute(__import__("sqlalchemy").select(Fornecedor).where(Fornecedor.razao_social == "Outro Posto"))).scalar_one()
    a1 = await _criar_acesso(client, admin, posto, "posto.um")
    a2 = await _criar_acesso(client, admin, outro, "posto.dois")
    h1 = await _entrar(client, "posto.um", a1["senha_provisoria"])
    h2 = await _entrar(client, "posto.dois", a2["senha_provisoria"])

    meu = (await client.get(f"{P}/abastecimentos", params={"nota": "PENDENTE"}, headers=h1)).json()[0]
    assert {a["valor"] for a in (await client.get(f"{P}/abastecimentos", params={"nota": "PENDENTE"}, headers=h2)).json()} == {60.0}
    r = await client.post(f"{P}/abastecimentos/{meu['id']}/nota", files=[("arquivos", ("d.pdf", b"%PDF-1", "application/pdf"))], headers=h2)
    assert r.status_code == 404
    r = await client.post(f"{P}/abastecimentos/{meu['id']}/nota", files=[("arquivos", ("d.pdf", b"%PDF-1", "application/pdf"))], headers=h1)
    pdf = r.json()["pdf_id"]
    assert (await client.get(f"{P}/abastecimentos/{meu['id']}/nota/{pdf}/arquivo", headers=h2)).status_code == 404
    assert (await client.get(f"{API}/notas-fiscais/{pdf}/arquivo", headers=h1)).status_code in (401, 403)

    # Token do posto não abre a área da Prefeitura; token da Prefeitura não abre o portal.
    assert (await client.get(f"{API}/notas-fiscais", headers=h1)).status_code in (401, 403)
    assert (await client.get(f"{API}/abastecimentos", headers=h1)).status_code in (401, 403)
    assert (await client.get(f"{P}/painel", headers=admin["headers"])).status_code == 403


@pytest.mark.asyncio
async def test_seguranca_do_login(client, _db, make_tenant, setup_frota):
    admin, saude, educ, posto, itens, filtro = await _cenario(client, _db, make_tenant, setup_frota)
    a = await _criar_acesso(client, admin, posto)
    # Login repetido é recusado; formato inválido também.
    r = await client.post(f"{API}/fornecedores/{posto.id}/acessos", json={"nome": "Xavier", "login": "posto.pinhal"}, headers=admin["headers"])
    assert r.status_code == 409
    r = await client.post(f"{API}/fornecedores/{posto.id}/acessos", json={"nome": "Xavier", "login": "com espaço"}, headers=admin["headers"])
    assert r.status_code == 422

    # 5 erros bloqueiam temporariamente.
    for _ in range(5):
        assert (await client.post(f"{P}/login", json={"login": "posto.pinhal", "senha": "errada"})).status_code == 401
    r = await client.post(f"{P}/login", json={"login": "posto.pinhal", "senha": a["senha_provisoria"]})
    assert r.status_code == 429

    # Redefinir senha derruba sessões; bloquear impede entrar.
    r = await client.post(f"{API}/fornecedores/{posto.id}/acessos/{a['id']}/redefinir-senha", headers=admin["headers"])
    nova = r.json()["senha_provisoria"]
    h = await _entrar(client, "posto.pinhal", nova)
    assert (await client.get(f"{P}/me", headers=h)).status_code == 200
    await client.post(f"{API}/fornecedores/{posto.id}/acessos/{a['id']}/bloquear", headers=admin["headers"])
    assert (await client.get(f"{P}/me", headers=h)).status_code == 401
    r = await client.post(f"{P}/login", json={"login": "posto.pinhal", "senha": "NovaSenha123"})
    assert r.status_code == 403

    # Senha fraca recusada na troca.
    r = await client.post(f"{API}/fornecedores/{posto.id}/acessos", json={"nome": "Yara", "login": "posto.tres"}, headers=admin["headers"])
    login = await client.post(f"{P}/login", json={"login": "posto.tres", "senha": r.json()["senha_provisoria"]})
    ht = {"Authorization": f"Bearer {login.json()['access_token']}"}
    fraca = await client.post(f"{P}/trocar-senha", json={"senha_atual": r.json()["senha_provisoria"], "nova_senha": "12345678"}, headers=ht)
    assert fraca.status_code == 422
