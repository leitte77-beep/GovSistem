"""Protocolo estruturado, financeiro gerencial e versões de documento."""

import io
from decimal import Decimal

import pytest

CARRO = {
    "titulo": "Aquisição de carro doado pelo Deputado Fulano",
    "tipo": "AQUISICAO",
    "origem": "DEPUTADO",
    "origem_nome": "Deputado Fulano de Tal",
    "valor_previsto": "134000.00",
}


async def _abrir(cliente, dados=None):
    resposta = await cliente.post("/pedidos", json=dados or CARRO)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _encaminhar(cliente, pedido_id):
    resposta = await cliente.post(
        f"/pedidos/{pedido_id}/encaminhar",
        json={"setor": "ENGENHARIA", "assunto": "Projeto e orçamento"},
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def _anexar(cliente, pedido_id, nome, descricao=None):
    resposta = await cliente.post(
        f"/pedidos/{pedido_id}/anexos",
        files={"arquivo": (nome, io.BytesIO(b"%PDF-1.4 conteudo"), "application/pdf")},
        data={"descricao": descricao} if descricao is not None else None,
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


@pytest.mark.asyncio
async def test_protocolo_e_valores_sao_editaveis(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corrigido = (
            await cliente.patch(
                f"/pedidos/{pedido['id']}",
                json={
                    "protocolo_externo": "TG-2026-55512",
                    "protocolo_sistema": "Transferegov",
                    "protocolo_orgao": "Ministério da Saúde",
                    "protocolo_data": "2026-09-20",
                    "valor_liberado": "250000.00",
                    "valor_pago": "248000.00",
                },
            )
        ).json()

    assert corrigido["protocolo_externo"] == "TG-2026-55512"
    assert corrigido["protocolo_sistema"] == "Transferegov"
    assert corrigido["protocolo_orgao"] == "Ministério da Saúde"
    assert corrigido["protocolo_data"] == "2026-09-20"
    assert Decimal(corrigido["valor_liberado"]) == Decimal("250000.00")
    assert Decimal(corrigido["valor_pago"]) == Decimal("248000.00")


@pytest.mark.asyncio
async def test_upload_repetido_do_mesmo_documento_gera_versoes(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        await _encaminhar(cliente, pedido["id"])

        await _anexar(cliente, pedido["id"], "oficio.pdf", descricao="Ofício")
        detalhe = await _anexar(
            cliente, pedido["id"], "oficio-corrigido.pdf", descricao="Ofício"
        )
        # Documento diferente não é versão do ofício: começa em v1.
        detalhe = await _anexar(
            cliente, pedido["id"], "justificativa.pdf", descricao="Justificativa técnica"
        )

    enc = detalhe["encaminhamento_atual"]
    versoes = {a["nome_original"]: a["versao"] for a in enc["anexos"]}
    assert versoes["oficio.pdf"] == 1
    assert versoes["oficio-corrigido.pdf"] == 2
    assert versoes["justificativa.pdf"] == 1
