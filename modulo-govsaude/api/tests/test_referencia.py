"""Tabelas de referência no schema ``referencia``."""

from __future__ import annotations

from app.models.referencia import (
    Cbo,
    Cid10,
    Imunobiologico,
    Medicamento,
    MunicipioIBGE,
    SigtapProcedimento,
)


async def test_consulta_municipios(client, db, mundo, token):
    db.add(MunicipioIBGE(codigo_ibge="4106902", nome="Curitiba", uf="PR", nome_busca="curitiba"))
    db.add(MunicipioIBGE(codigo_ibge="4205407", nome="Florianópolis", uf="SC"))
    await db.commit()
    resposta = await client.get(
        "/api/govsaude/v1/referencia/municipios?uf=PR", headers=token("admin")
    )
    assert resposta.status_code == 200, resposta.text
    assert [m["codigo"] for m in resposta.json()] == ["4106902"]


async def test_consulta_cbo_cid_imunobiologico_medicamento(client, db, mundo, token):
    db.add(Cbo(codigo="225125", descricao="Médico clínico"))
    db.add(Cid10(codigo="I10", descricao="Hipertensão essencial (primária)"))
    db.add(Imunobiologico(codigo="BCG", nome="BCG"))
    db.add(Medicamento(codigo_obm="123", nome="Losartana 50 mg", renome=True))
    db.add(
        SigtapProcedimento(
            codigo="0301010030",
            competencia="202601",
            nome="Consulta médica em atenção especializada",
        )
    )
    await db.commit()

    cbo = await client.get("/api/govsaude/v1/referencia/cbo?q=225", headers=token("admin"))
    assert cbo.status_code == 200 and cbo.json()[0]["codigo"] == "225125"
    cid = await client.get("/api/govsaude/v1/referencia/cid10?q=I10", headers=token("admin"))
    assert cid.status_code == 200 and cid.json()[0]["codigo"] == "I10"
    vacina = await client.get(
        "/api/govsaude/v1/referencia/imunobiologicos?q=BCG", headers=token("admin")
    )
    assert vacina.status_code == 200 and vacina.json()[0]["codigo"] == "BCG"
    medicamento = await client.get(
        "/api/govsaude/v1/referencia/medicamentos?q=losartana", headers=token("admin")
    )
    assert medicamento.status_code == 200 and medicamento.json()[0]["renome"] is True
    sigtap = await client.get(
        "/api/govsaude/v1/referencia/sigtap?competencia=202601", headers=token("admin")
    )
    assert sigtap.status_code == 200 and sigtap.json()[0]["competencia"] == "202601"
