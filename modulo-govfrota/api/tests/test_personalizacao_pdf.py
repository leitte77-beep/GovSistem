"""Personalização do PDF dos relatórios: logo, textos do cabeçalho, cores e rodapé."""

import io

import pytest
from PIL import Image

API = "/api/govfrota"


def _png(cor=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (120, 120), cor).save(buf, "PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_personaliza_cabecalho_e_rodape(client, make_tenant):
    admin = await make_tenant("ADMIN")
    h = admin["headers"]
    r = await client.patch(f"{API}/configuracoes", headers=h, json={
        "pdf_titulo": "GESTÃO DE FROTAS", "pdf_subtitulo": "Prefeitura de Farol",
        "pdf_linha_extra": "CNPJ 00.000.000/0001-00 · Rua Central, 100", "pdf_rodape": "Prefeitura de Farol · (44) 3333-0000",
        "pdf_cor_primaria": "#1E40AF", "pdf_cor_secundaria": "#F59E0B",
    })
    assert r.status_code == 200 and r.json()["pdf_titulo"] == "GESTÃO DE FROTAS" and not r.json()["pdf_tem_logo"]
    assert (await client.patch(f"{API}/configuracoes", headers=h, json={"pdf_cor_primaria": "azul"})).status_code == 422

    r = await client.put(f"{API}/configuracoes/pdf-logo", headers=h, files={"arquivo": ("logo.png", _png(), "image/png")})
    assert r.status_code == 200 and r.json()["pdf_tem_logo"]
    assert (await client.get(f"{API}/configuracoes/pdf-logo", headers=h)).content.startswith(b"\x89PNG")
    r = await client.put(f"{API}/configuracoes/pdf-logo", headers=h, files={"arquivo": ("x.txt", b"oi", "text/plain")})
    assert r.status_code == 422

    pdf = await client.get(f"{API}/configuracoes/pdf-exemplo", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    open("/out/exemplo.pdf", "wb").write(pdf.content) if __import__("os").path.isdir("/out") else None

    # Texto vazio volta ao padrão; remover o logo também.
    r = await client.patch(f"{API}/configuracoes", headers=h, json={"pdf_titulo": "", "pdf_rodape": ""})
    assert r.json()["pdf_titulo"] is None and r.json()["pdf_rodape"] is None
    r = await client.delete(f"{API}/configuracoes/pdf-logo", headers=h)
    assert not r.json()["pdf_tem_logo"]
    assert (await client.get(f"{API}/configuracoes/pdf-exemplo", headers=h)).status_code == 200
