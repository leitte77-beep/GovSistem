"""Nota só em PDF: leitura do DANFE, conferência de valor e envio em lote."""

import io

import pytest
from reportlab.pdfgen import canvas

from app.services.danfe import chave_valida, interpretar, ler_danfe
from tests.cenario_posto import _cenario
from tests.test_portal_posto import P, _criar_acesso, _entrar

pytestmark = pytest.mark.asyncio


def _chave(cnpj="12345678000190", numero=4567, serie=1) -> str:
    base = f"41" f"2609" f"{cnpj}" "55" f"{serie:03d}" f"{numero:09d}" "1" "12345678"
    for dv in range(10):
        if chave_valida(base + str(dv)):
            return base + str(dv)
    raise AssertionError


def danfe_pdf(valor="240,00", numero=4567, cnpj="12345678000190", extra="") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    chave = _chave(cnpj, numero)
    linhas = [
        "DANFE - Documento Auxiliar da Nota Fiscal Eletronica",
        "CHAVE DE ACESSO",
        " ".join(chave[i:i + 4] for i in range(0, 44, 4)),
        "DATA DA EMISSAO 30/09/2026",
        f"VALOR TOTAL DA NOTA {valor}",
        extra,
    ]
    for i, t in enumerate(linhas):
        c.drawString(40, 800 - i * 20, t)
    c.save()
    return buf.getvalue()


def test_interpreta_chave_valor_e_data():
    d = ler_danfe(danfe_pdf(valor="1.240,50", extra="Obs: AB-2026/000123 placa ABC1D23"))
    assert d.texto and d.chave and len(d.chave) == 44
    assert d.numero == "4567" and d.serie == "1" and d.emitente_cnpj == "12345678000190"
    assert str(d.valor_total) == "1240.50"
    assert d.emissao and d.emissao.day == 30
    assert (2026, 123) in d.numeros_ab and "ABC1D23" in d.placas


def test_pdf_sem_texto_nao_quebra():
    d = ler_danfe(b"%PDF-1.4 lixo")
    assert d.texto is False and d.chave is None
    assert interpretar("").chave is None


async def test_envio_le_pdf_confere_valor_e_lote_sugere(client, _db, make_tenant, setup_frota):
    admin, _s, _e, posto, itens, _f = await _cenario(client, _db, make_tenant, setup_frota)
    acesso = await _criar_acesso(client, admin, posto, "posto.pdf")
    h = await _entrar(client, "posto.pdf", acesso["senha_provisoria"])
    s1, e1 = str(itens["s1"].id), str(itens["e1"].id)

    # Lote: valor 240,00 casa com s1; 600,00 com e1; 999,99 com nada.
    arquivos = [
        ("arquivos", ("a.pdf", danfe_pdf("240,00", 1), "application/pdf")),
        ("arquivos", ("b.pdf", danfe_pdf("600,00", 2), "application/pdf")),
        ("arquivos", ("c.pdf", danfe_pdf("999,99", 3), "application/pdf")),
        ("arquivos", ("d.txt", b"oi", "text/plain")),
    ]
    r = await client.post(f"{P}/notas/analisar", files=arquivos, headers=h)
    assert r.status_code == 200, r.text
    lote = r.json()
    assert lote[0]["sugestao"] == s1 and lote[1]["sugestao"] == e1
    assert lote[2]["sugestao"] is None and lote[3]["erro"]

    # Envio: número e valor lidos do PDF; valor divergente gera aviso.
    r = await client.post(f"{P}/abastecimentos/{s1}/nota", files=[("arquivos", ("a.pdf", danfe_pdf("240,00", 1), "application/pdf"))], headers=h)
    assert r.status_code == 201, r.text
    n = r.json()
    assert n["numero"] == "1" and n["valor"] == 240.0 and n["conferida"] and n["avisos"] == []
    r = await client.post(f"{P}/abastecimentos/{e1}/nota", files=[("arquivos", ("b.pdf", danfe_pdf("590,00", 2), "application/pdf"))], headers=h)
    assert r.status_code == 201 and any("diferente" in a for a in r.json()["avisos"])

    # A mesma nota (mesma chave) não pode ir para outro abastecimento.
    s2 = str(itens["s2"].id)
    r = await client.post(f"{P}/abastecimentos/{s2}/nota", files=[("arquivos", ("a.pdf", danfe_pdf("240,00", 1), "application/pdf"))], headers=h)
    assert r.status_code == 409

    # Reanalisar a nota já enviada avisa onde ela está.
    lote = (await client.post(f"{P}/notas/analisar", files=[("arquivos", ("a.pdf", danfe_pdf("240,00", 1), "application/pdf"))], headers=h)).json()
    assert lote[0]["ja_enviada"]["id"] == s1
