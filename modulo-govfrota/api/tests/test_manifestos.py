"""Manifestos de entrada (NF-e pendentes) e classificação ANP do combustível."""

from datetime import date

import pytest

API = "/api/govfrota"


@pytest.mark.asyncio
async def test_combustivel_expoe_anp_e_preco_referencia(client, make_tenant):
    t = await make_tenant("ADMIN")
    resp = await client.post(
        f"{API}/combustiveis",
        json={
            "nome": "Gasolina Comum",
            "codigo_anp": "320101001",
            "especificacao": "Tipo C (27% Anidro)",
        },
        headers=t["headers"],
    )
    assert resp.status_code == 201, resp.text
    criado = resp.json()
    assert criado["codigo_anp"] == "320101001"
    assert criado["especificacao"] == "Tipo C (27% Anidro)"
    assert criado["preco_referencia"] is None

    lista = (await client.get(f"{API}/combustiveis", headers=t["headers"])).json()
    item = next(c for c in lista if c["id"] == criado["id"])
    assert item["codigo_anp"] == "320101001"


@pytest.mark.asyncio
async def test_manifesto_manual_vincula_e_credita_estoque(client, make_tenant, setup_frota):
    t = await make_tenant("ADMIN")
    frota = await setup_frota(t["org"], capacidade="20000", estoque_inicial="1000")
    h = t["headers"]

    resp = await client.post(
        f"{API}/manifestos",
        json={
            "numero": "004892",
            "serie": "1",
            "chave_nfe": "3526" + "0" * 40,
            "emitente_nome": "Vibra Energia S/A",
            "quantidade_litros": "10000",
            "valor_total": "58000",
        },
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    manifesto = resp.json()
    assert manifesto["status"] == "PENDENTE"

    pendentes = (await client.get(f"{API}/manifestos", headers=h)).json()
    assert any(m["id"] == manifesto["id"] for m in pendentes)

    resp = await client.post(
        f"{API}/manifestos/{manifesto['id']}/vincular",
        json={"tanque_id": str(frota["tanque"].id)},
        headers=h,
    )
    assert resp.status_code == 200, resp.text
    vinculado = resp.json()
    assert vinculado["status"] == "VINCULADO"
    assert vinculado["entrada_id"]

    tanque = (await client.get(f"{API}/tanques/{frota['tanque'].id}", headers=h)).json()
    assert float(tanque["estoque_atual"]) == 11000.0

    entrada = (await client.get(f"{API}/entradas/{vinculado['entrada_id']}", headers=h)).json()
    assert entrada["numero_nota"] == "004892"
    assert float(entrada["quantidade_litros"]) == 10000.0

    # Não há mais pendentes.
    pendentes = (await client.get(f"{API}/manifestos", headers=h)).json()
    assert all(m["id"] != manifesto["id"] for m in pendentes)


@pytest.mark.asyncio
async def test_manifesto_vinculado_nao_pode_ser_processado_de_novo(client, make_tenant, setup_frota):
    t = await make_tenant("ADMIN")
    frota = await setup_frota(t["org"])
    h = t["headers"]
    manifesto = (
        await client.post(
            f"{API}/manifestos",
            json={"numero": "1", "quantidade_litros": "500"},
            headers=h,
        )
    ).json()
    await client.post(
        f"{API}/manifestos/{manifesto['id']}/vincular",
        json={"tanque_id": str(frota["tanque"].id)},
        headers=h,
    )
    resp = await client.post(
        f"{API}/manifestos/{manifesto['id']}/vincular",
        json={"tanque_id": str(frota["tanque"].id)},
        headers=h,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_manifesto_importado_de_xml_casa_combustivel_pelo_anp(client, make_tenant, setup_frota):
    t = await make_tenant("ADMIN")
    frota = await setup_frota(t["org"])
    h = t["headers"]

    # Marca o combustível com o código ANP para o casamento automático.
    await client.patch(
        f"{API}/combustiveis/{frota['combustivel'].id}",
        json={"nome": "Diesel S10", "codigo_anp": "820101034"},
        headers=h,
    )

    chave = "41260912345678000190550010000012341000012345"
    xml = f"""<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe{chave}" versao="4.00">
      <ide><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>{date.today().isoformat()}T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000190</CNPJ><xNome>POSTO PINHALZINHO LTDA</xNome></emit>
      <dest><CNPJ>76000000000100</CNPJ><xNome>MUNICIPIO</xNome></dest>
      <det nItem="1"><prod><cProd>1</cProd><xProd>OLEO DIESEL S10</xProd><uCom>L</uCom>
      <qCom>70.000</qCom><vUnCom>6.0000</vUnCom><vProd>420.00</vProd>
      <comb><cProdANP>820101034</cProdANP></comb></prod></det>
      <total><ICMSTot><vNF>420.00</vNF></ICMSTot></total></infNFe></NFe>""".encode()

    up = await client.post(
        f"{API}/uploads",
        files={"file": ("nfe.xml", xml, "application/xml")},
        headers=h,
    )
    assert up.status_code == 201, up.text
    anexo_id = up.json()["id"]

    resp = await client.post(
        f"{API}/manifestos/importar",
        json={"anexo_id": anexo_id},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    manifesto = resp.json()
    assert manifesto["numero"] == "1234"
    assert manifesto["emitente_nome"] == "POSTO PINHALZINHO LTDA"
    assert manifesto["codigo_anp"] == "820101034"
    assert manifesto["combustivel_id"] == str(frota["combustivel"].id)
    assert float(manifesto["quantidade_litros"]) == 70.0

    # Reimportar a mesma chave pendente é recusado.
    resp = await client.post(
        f"{API}/manifestos/importar",
        json={"anexo_id": anexo_id},
        headers=h,
    )
    assert resp.status_code == 409
