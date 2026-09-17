"""IA avançada: geração de ofício, extração de documento e semelhança (§92)."""

import io

import docx
import pytest

from app.services import ia

BASE = "/api/govtask/demandas"


def _docx_bytes(texto: str) -> bytes:
    documento = docx.Document()
    documento.add_paragraph(texto)
    buffer = io.BytesIO()
    documento.save(buffer)
    return buffer.getvalue()


def test_extracao_le_docx():
    from app.services import extracao

    conteudo = _docx_bytes("Ofício nº 15/2026 destinado à Secretaria de Saúde")
    texto = extracao.texto_de("oficio.docx", "application/zip", conteudo)
    assert "Ofício nº 15/2026" in texto


def test_extracao_recusa_formato_sem_extrator():
    from app.services import extracao

    with pytest.raises(extracao.ExtracaoNaoSuportada):
        extracao.texto_de("imagem.png", "image/png", b"\x89PNG\r\n\x1a\n")


async def _criar(client, headers, titulo):
    resp = await client.post(BASE, json={"titulo": titulo}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_gerar_oficio_devolve_sugestao_sem_gravar(
    client, make_tenant, catalogo_padrao, monkeypatch
):
    async def falso(demanda):
        return "Ofício — objeto sugerido pela IA"

    monkeypatch.setattr(ia, "gerar_oficio", falso)
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"], "Aquisição de ambulância")

    resp = await client.post(f"{BASE}/{demanda['id']}/ia/gerar-oficio", headers=t["headers"])
    assert resp.status_code == 200, resp.text
    assert "IA" in resp.json()["sugestao"]

    detalhe = await client.get(f"{BASE}/{demanda['id']}", headers=t["headers"])
    assert detalhe.json()["objeto"] is None  # a sugestão não foi gravada


@pytest.mark.asyncio
async def test_extrair_documento_le_texto_e_sugere_campos(
    client, make_tenant, catalogo_padrao, monkeypatch
):
    async def falso(nome, texto):
        assert "Ofício nº 15/2026" in texto
        return {"numero_documento": "15/2026", "orgao": "Secretaria de Saúde"}

    monkeypatch.setattr(ia, "extrair_dados_documento", falso)
    t = await make_tenant("ASSESSOR")
    demanda = await _criar(client, t["headers"], "Pedido de veículo")
    upload = await client.post(
        f"{BASE}/{demanda['id']}/documentos",
        data={"tipo_documento": "OFICIO", "categoria": "OUTROS", "classificacao": "INTERNO"},
        files={"arquivo": ("oficio.docx", _docx_bytes("Ofício nº 15/2026 à Saúde"), "application/zip")},
        headers=t["headers"],
    )
    assert upload.status_code == 201, upload.text

    resp = await client.post(
        f"{BASE}/{demanda['id']}/ia/extrair-documento",
        json={"documento_id": upload.json()["id"]},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["campos"]["numero_documento"] == "15/2026"


@pytest.mark.asyncio
async def test_semelhantes_sem_ia_cai_no_textual(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    alvo = await _criar(client, t["headers"], "Pavimentação da Rua das Flores")
    await _criar(client, t["headers"], "Pavimentação asfáltica do Bairro Central")
    await _criar(client, t["headers"], "Compra de material de escritório")

    resp = await client.get(f"{BASE}/{alvo['id']}/ia/semelhantes", headers=t["headers"])
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["ranqueada_por_ia"] is False
    assert corpo["items"], "a recuperação textual deve encontrar candidatas"
    assert all(item["id"] != alvo["id"] for item in corpo["items"])
