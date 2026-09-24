"""As duas perguntas do gestor: "e agora?" e "está bem?"."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.core.database import async_session
from app.models.pedido import Pedido

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


async def _encaminhar(cliente, pedido_id, **extra):
    corpo = {"setor": "ENGENHARIA", "assunto": "Projeto e orçamento", **extra}
    resposta = await cliente.post(f"/pedidos/{pedido_id}/encaminhar", json=corpo)
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def _envelhecer(pedido_id, dias: int):
    quando = datetime.now(timezone.utc) - timedelta(days=dias)
    async with async_session() as session:
        await session.execute(
            update(Pedido)
            .where(Pedido.id == uuid.UUID(str(pedido_id)))
            .values(ultima_movimentacao_em=quando)
        )
        await session.commit()


@pytest.mark.asyncio
async def test_proxima_acao_inicial_e_do_assessor(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        detalhe = (await cliente.get(f"/pedidos/{pedido['id']}")).json()

    assert detalhe["proxima_acao_detalhe"]["titulo"] == "Encaminhar a um setor ou concluir"
    assert detalhe["proxima_acao"] == "Encaminhar a um setor ou concluir"
    assert detalhe["saude"] == "NORMAL"


@pytest.mark.asyncio
async def test_proxima_acao_apos_encaminhar_e_assumir(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        await _encaminhar(cliente, pedido["id"])
        detalhe = (await cliente.get(f"/pedidos/{pedido['id']}")).json()

    acao = detalhe["proxima_acao_detalhe"]
    assert acao["titulo"] == "Assumir “Projeto e orçamento”"
    assert acao["setor"] == "ENGENHARIA"
    assert acao["prazo"] is not None
    assert detalhe["saude"] == "NORMAL"


@pytest.mark.asyncio
async def test_prazo_vencido_no_setor_deixa_a_saude_critica(como, assessor):
    ontem = (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        detalhe = await _encaminhar(cliente, pedido["id"], prazo=ontem)

    assert detalhe["saude"] == "CRITICA"
    assert "vencido" in detalhe["saude_motivo"]
    assert detalhe["dias_de_atraso"] == 2


@pytest.mark.asyncio
async def test_complemento_pendente_pede_acao_do_assessor(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
    enc_id = corpo["encaminhamento_atual"]["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        detalhe = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/complemento/solicitar",
                json={"texto": "Falta a planta."},
            )
        ).json()

    assert detalhe["saude"] == "ATENCAO"
    assert detalhe["proxima_acao"] == "Responder complemento ao setor"
    assert detalhe["proxima_acao_detalhe"]["descricao"] == "Falta a planta."


@pytest.mark.asyncio
async def test_atraso_na_espera_externa_e_atencao_e_nao_culpa_da_prefeitura(
    como, assessor, db
):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        await cliente.post(f"/pedidos/{pedido['id']}/aguardar-terceiro", json={})

    ontem = datetime.now(timezone.utc).date() - timedelta(days=1)
    async with async_session() as session:
        await session.execute(
            update(Pedido)
            .where(Pedido.id == uuid.UUID(str(pedido["id"])))
            .values(prazo_atual=ontem)
        )
        await session.commit()

    async with como(assessor) as cliente:
        detalhe = (await cliente.get(f"/pedidos/{pedido['id']}")).json()

    assert detalhe["situacao"] == "AGUARDANDO_TERCEIRO"
    assert detalhe["saude"] == "ATENCAO"
    assert "Aguardando terceiro" in detalhe["saude_motivo"]


@pytest.mark.asyncio
async def test_demanda_parada_escala_de_atencao_para_critica(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)

        await _envelhecer(pedido["id"], 8)
        parada = (await cliente.get(f"/pedidos/{pedido['id']}")).json()
        assert parada["saude"] == "ATENCAO"
        assert "Parado há 8 dias" in parada["saude_motivo"]

        await _envelhecer(pedido["id"], 16)
        critica = (await cliente.get(f"/pedidos/{pedido['id']}")).json()
        assert critica["saude"] == "CRITICA"
        assert "Sem movimentação há 16 dias" in critica["saude_motivo"]


@pytest.mark.asyncio
async def test_pedido_encerrado_nao_tem_proxima_acao(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        detalhe = (
            await cliente.post(f"/pedidos/{pedido['id']}/concluir", json={})
        ).json()

    assert detalhe["situacao"] == "CONCLUIDO"
    assert detalhe["proxima_acao_detalhe"] is None
    assert detalhe["proxima_acao"] == ""
    assert detalhe["saude"] == "NORMAL"
