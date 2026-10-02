"""Nota do posto: leitura de DANFE real (layout de PDV de posto) e regra de
preço acima do contrato — sempre avisa; recusa só se o município ligar."""

from decimal import Decimal

import pytest

from app.services.danfe import interpretar
from tests.cenario_posto import _cenario
from tests.test_nfe import CHAVE, xml_nfe
from tests.test_portal_posto import API, P, _criar_acesso, _entrar

# Trecho do texto extraído de um DANFE real (dados pessoais trocados): chave
# com espaço duplo, valor longe do rótulo, emissão só no protocolo, e placa/km
# nas informações complementares.
TEXTO_DANFE = """CHAVE DE ACESSO0 - Entrada
9076719257 29.148.382/0001-87
4126  1029  1483  8200  0187  5500  2000  0185  4010  0142  5568
PROTOCOLO DE AUTORIZAÇÃO DE USO
141260398338360 - 01/10/2026 11:18:47
VALOR NOTA
R$ 758,48
MUNICIPIO DE FAROL
NOME/RAZÃO SOCIAL CNPJ/CPF DATA DA EMISSÃO
CEP DATA DE SAÍDA/ENTRADA
HORA DE SAÍDAMUNICÍPIO INSCRIÇÃO ESTADUALFONE/FAX
95.640.124/0001-48 01/10/2026
61 5656 L 102,914 7,37 758,48 0,00 0,00 0,000,00 0,000 213,89OLEO DIESEL B S10  COMUM
OP-3ILVKRD -Op:CAIXA C:1485 E:1434 -Placa:BCS2C28 -ONIBUS -km:
93864 -frota:SAUDE -media:4.81 k/l -MOTORISTA FULANO
"""


def test_le_danfe_de_pdv_de_posto():
    d = interpretar(TEXTO_DANFE)
    assert d.chave == "41261029148382000187550020000185401001425568" and d.numero == "18540"
    assert d.emitente_cnpj == "29148382000187"
    assert d.valor_total == Decimal("758.48")
    assert d.litros == Decimal("102.914") and d.preco_unitario == Decimal("7.37")
    assert d.km == 93864 and d.placas == ["BCS2C28"]
    assert d.emissao and d.emissao.strftime("%d/%m/%Y %H:%M") == "01/10/2026 11:18"
    assert "95640124000148" in d.cnpjs


@pytest.mark.asyncio
async def test_preco_acima_do_contrato_avisa_e_recusa_se_configurado(client, _db, make_tenant, setup_frota):
    admin, saude, educ, posto, itens, filtro = await _cenario(client, _db, make_tenant, setup_frota)
    h = await _entrar(client, "posto.pinhal", (await _criar_acesso(client, admin, posto))["senha_provisoria"])
    pend = (await client.get(f"{P}/abastecimentos", params={"nota": "PENDENTE"}, headers=h)).json()
    a1 = next(a for a in pend if a["litros"] == 40)
    a2 = next(a for a in pend if a["litros"] == 30)

    def nota(a, preco, chave=CHAVE):
        litros = Decimal(str(a["litros"]))
        total = (litros * Decimal(preco)).quantize(Decimal("0.01"))
        return xml_nfe(chave=chave, cnpj_emit="12345678000190", itens=(("DIESEL S10", f"{litros}", preco, f"{total}"),))

    # Padrão: aceita com aviso e notifica a Prefeitura.
    r = await client.post(f"{P}/abastecimentos/{a1['id']}/nota", files=[("arquivos", ("n.xml", nota(a1, "7.37"), "text/xml"))], headers=h)
    assert r.status_code == 201, r.text
    avisos = r.json()["avisos"]
    assert any("acima do contrato" in x and "R$ 54,80 a mais" in x for x in avisos), avisos  # 40 L × 1,37
    notifs = (await client.get(f"{API}/notificacoes", headers=admin["headers"])).json()
    assert any(n["tipo"] == "NOTA_PRECO_ACIMA_CONTRATO" for n in notifs)

    # Município liga a recusa: mesma situação é barrada com explicação.
    r = await client.patch(f"{API}/configuracoes", json={"bloquear_nota_preco_acima_contrato": True}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["bloquear_nota_preco_acima_contrato"] is True
    outra = CHAVE[:-1] + ("0" if CHAVE[-1] != "0" else "1")
    r = await client.post(f"{P}/abastecimentos/{a2['id']}/nota", files=[("arquivos", ("n.xml", nota(a2, "7.37", outra), "text/xml"))], headers=h)
    assert r.status_code == 422 and "preço do contrato" in r.json()["detail"]

    # Pelo preço do contrato passa sem aviso de preço.
    r = await client.post(f"{P}/abastecimentos/{a2['id']}/nota", files=[("arquivos", ("n.xml", nota(a2, "6.00", outra), "text/xml"))], headers=h)
    assert r.status_code == 201, r.text
    assert not any("acima do contrato" in x for x in r.json()["avisos"])
