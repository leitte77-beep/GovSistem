"""Leitor do XML da NF-e/NFC-e."""

from datetime import date

import pytest

from app.services.nfe import NFeInvalida, ler_nfe

CHAVE = "41260912345678000190550010000012341000012345"


def xml_nfe(chave=CHAVE, cnpj_emit="12345678000190", itens=(("ÓLEO DIESEL S10", "70.000", "6.0000", "420.00"),),
            protocolo=True, total=None, anp="820101034", modelo="55"):
    dets = "".join(
        f"""<det nItem="{n}"><prod><cProd>{n}</cProd><xProd>{d}</xProd><uCom>L</uCom><qCom>{q}</qCom>
        <vUnCom>{u}</vUnCom><vProd>{v}</vProd>{f"<comb><cProdANP>{anp}</cProdANP></comb>" if anp else ""}</prod></det>"""
        for n, (d, q, u, v) in enumerate(itens, 1)
    )
    total = total or sum(float(i[3]) for i in itens)
    nfe = f"""<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe{chave}" versao="4.00">
      <ide><mod>{modelo}</mod><serie>1</serie><nNF>1234</nNF><dhEmi>{date.today().isoformat()}T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>{cnpj_emit}</CNPJ><xNome>POSTO PINHALZINHO LTDA</xNome></emit>
      <dest><CNPJ>76000000000100</CNPJ><xNome>MUNICIPIO</xNome></dest>
      {dets}<total><ICMSTot><vNF>{total:.2f}</vNF></ICMSTot></total></infNFe></NFe>"""
    if not protocolo:
        return nfe.encode()
    return f"""<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">{nfe}
      <protNFe><infProt><cStat>100</cStat><nProt>141260000000001</nProt></infProt></protNFe></nfeProc>""".encode()


def test_leitor_extrai_campos_e_recusa_lixo():
    n = ler_nfe(xml_nfe(itens=(("DIESEL S10", "70.000", "6.0000", "420.00"), ("GASOLINA", "10.5", "6.5", "68.25"))))
    assert n.chave == CHAVE and n.numero == "1234" and n.serie == "1"
    assert n.emitente_cnpj == "12345678000190" and n.autorizada and n.protocolo == "141260000000001"
    assert [i.descricao for i in n.itens] == ["DIESEL S10", "GASOLINA"]
    assert str(n.itens[1].quantidade) == "10.5" and n.itens[0].codigo_anp == "820101034"
    assert str(n.valor_total) == "488.25"
    assert ler_nfe(xml_nfe(protocolo=False)).autorizada is False

    with pytest.raises(NFeInvalida):
        ler_nfe(b"isto nao e xml")
    with pytest.raises(NFeInvalida):
        ler_nfe(b"<nota><x>1</x></nota>")
    bomba = b"""<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]>
      <NFe xmlns="http://www.portalfiscal.inf.br/nfe">&b;</NFe>"""
    with pytest.raises(NFeInvalida):
        ler_nfe(bomba)


def test_nfce_so_quando_permitido():
    with pytest.raises(NFeInvalida):
        ler_nfe(xml_nfe(modelo="65"))
    assert ler_nfe(xml_nfe(modelo="65"), aceitar_nfce=True).numero == "1234"
