"""Conversa na tarefa, rascunho/checklist, documentos e ficha completa."""

import io

import pytest

pytestmark = pytest.mark.asyncio


async def _pedido_no_juridico(como, assessor, checklist=None):
    async with como(assessor) as c:
        r = await c.post("/pedidos", json={"titulo": "Carro doado", "tipo": "AQUISICAO"})
        p = r.json()
        r = await c.post(
            f"/pedidos/{p['id']}/encaminhar",
            json={"setor": "JURIDICO", "assunto": "Elaborar ofício", "checklist": checklist or []},
        )
        assert r.status_code == 200, r.text
        return r.json()


async def test_conversa_na_tarefa_com_mencao(como, assessor, juridico):
    p = await _pedido_no_juridico(como, assessor)
    enc = p["encaminhamento_atual"]["id"]
    async with como(juridico) as c:
        await c.post(f"/pedidos/{p['id']}/encaminhamentos/{enc}/assumir")
        r = await c.post(
            f"/pedidos/{p['id']}/comentarios",
            json={
                "texto": "Falta o CNPJ da associação",
                "encaminhamento_id": enc,
                "mencionados_ids": [str(assessor.id)],
                "aguardando_resposta": True,
            },
        )
        assert r.status_code == 200, r.text
        ultimo = r.json()["andamentos"][-1]
        assert ultimo["encaminhamento_id"] == enc
        assert ultimo["dados"]["aguardando_resposta"] is True
        assert ultimo["dados"]["mencionados"][0]["nome"] == assessor.name
    async with como(assessor) as c:
        avisos = (await c.get("/notificacoes")).json()
    assert any("mencionou você" in n["texto"] for n in avisos["itens"])


async def test_rascunho_checklist_e_devolucao_pelo_rascunho(como, assessor, juridico):
    p = await _pedido_no_juridico(como, assessor, ["CND federal", "CND estadual"])
    enc = p["encaminhamento_atual"]
    assert [i["item"] for i in enc["checklist"]] == ["CND federal", "CND estadual"]
    async with como(juridico) as c:
        await c.post(f"/pedidos/{p['id']}/encaminhamentos/{enc['id']}/assumir")
        r = await c.put(
            f"/pedidos/{p['id']}/encaminhamentos/{enc['id']}/rascunho",
            json={
                "texto": "Ofício 123 anexado",
                "checklist": [
                    {"item": "CND federal", "feito": True},
                    {"item": "CND estadual", "feito": False},
                    {"item": "Item inventado", "feito": True},
                ],
            },
        )
        assert r.status_code == 200, r.text
        atual = r.json()["encaminhamento_atual"]
        assert atual["rascunho"] == "Ofício 123 anexado"
        assert [i["item"] for i in atual["checklist"]] == ["CND federal", "CND estadual"]
        r = await c.post(
            f"/pedidos/{p['id']}/encaminhamentos/{enc['id']}/devolver", json={"resultado": ""}
        )
        assert r.status_code == 200, r.text
        devolvido = r.json()["encaminhamentos"][0]
        assert devolvido["resultado"] == "Ofício 123 anexado"
        assert devolvido["rascunho"] is None


async def test_edicao_registra_antes_e_depois(como, assessor):
    async with como(assessor) as c:
        p = (await c.post("/pedidos", json={"titulo": "Obra X", "tipo": "OBRA", "valor_previsto": "100"})).json()
        r = await c.patch(
            f"/pedidos/{p['id']}",
            json={"valor_previsto": "250000.00", "endereco": "Rua A, 10", "valor_empenhado": "1000"},
        )
        p = r.json()
    assert p["endereco"] == "Rua A, 10"
    mudancas = p["andamentos"][-1]["dados"]["mudancas"]
    assert mudancas["valor previsto"] == ["R$ 100,00", "R$ 250.000,00"]
    assert mudancas["endereço"] == [None, "Rua A, 10"]
    assert p["indicadores"]["idas_e_vindas"] == 0


async def test_documento_tipado_visualizar_zip_e_remocao_com_motivo(como, assessor):
    p = await _pedido_no_juridico(como, assessor)
    async with como(assessor) as c:
        r = await c.post(
            f"/pedidos/{p['id']}/anexos",
            files={"arquivo": ("oficio.pdf", io.BytesIO(b"%PDF-1.4 x"), "application/pdf")},
            data={"tipo_documento": "OFICIO"},
        )
        assert r.status_code == 201, r.text
        anexo = r.json()["anexos"][0]
        assert anexo["tipo_documento"] == "OFICIO"
        assert r.json()["andamentos"][-1]["dados"]["anexo_id"] == anexo["id"]

        r = await c.get(f"/pedidos/{p['id']}/anexos/{anexo['id']}/visualizar")
        assert r.status_code == 200
        assert r.headers["content-disposition"].startswith("inline")

        r = await c.get(f"/pedidos/{p['id']}/documentos.zip")
        assert r.status_code == 200 and r.content[:2] == b"PK"

        r = await c.delete(f"/pedidos/{p['id']}/anexos/{anexo['id']}")
        assert r.status_code == 422
        r = await c.delete(
            f"/pedidos/{p['id']}/anexos/{anexo['id']}", params={"motivo": "Enviado errado"}
        )
        assert r.status_code == 200
        assert "Enviado errado" in r.json()["andamentos"][-1]["texto"]
