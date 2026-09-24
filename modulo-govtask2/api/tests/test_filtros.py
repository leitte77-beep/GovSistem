"""Filtros da lista: prioridade, origem, inatividade, janela de prazo e a
busca global que atravessa documento e comentário.
"""

import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.core.database import async_session
from app.models.pedido import Pedido

BASE = {
    "titulo": "Aquisição de ambulância",
    "tipo": "AQUISICAO",
    "origem": "DEPUTADO",
    "origem_nome": "Deputado Fulano",
}


async def _abrir(cliente, **extra):
    resposta = await cliente.post("/pedidos", json={**BASE, **extra})
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _encaminhar(cliente, pedido_id, **extra):
    corpo = {"setor": "ENGENHARIA", "assunto": "Fazer o que precisa", **extra}
    resposta = await cliente.post(f"/pedidos/{pedido_id}/encaminhar", json=corpo)
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def _anexar(cliente, pedido_id, nome):
    resposta = await cliente.post(
        f"/pedidos/{pedido_id}/anexos",
        files={"arquivo": (nome, io.BytesIO(b"%PDF-1.4 conteudo"), "application/pdf")},
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _envelhecer(pedido_id, dias: int):
    quando = datetime.now(timezone.utc) - timedelta(days=dias)
    async with async_session() as session:
        await session.execute(
            update(Pedido)
            .where(Pedido.id == uuid.UUID(str(pedido_id)))
            .values(ultima_movimentacao_em=quando, situacao_desde=quando)
        )
        await session.commit()


@pytest.mark.asyncio
async def test_filtro_de_prioridade_e_origem(como, assessor):
    async with como(assessor) as cliente:
        await _abrir(cliente, prioridade="URGENTE", origem="PREFEITO")
        await _abrir(cliente, titulo="Outro pedido", prioridade="NORMAL")

        urgentes = (await cliente.get("/pedidos?prioridade=URGENTE")).json()
        do_prefeito = (await cliente.get("/pedidos?origem=PREFEITO")).json()

    assert urgentes["total"] == 1
    assert urgentes["itens"][0]["prioridade"] == "URGENTE"
    assert do_prefeito["total"] == 1


@pytest.mark.asyncio
async def test_filtro_de_demanda_parada(como, assessor):
    async with como(assessor) as cliente:
        parado = await _abrir(cliente, titulo="Parado")
        await _abrir(cliente, titulo="Movimentado")
        await _envelhecer(parado["id"], 20)

        resposta = (await cliente.get("/pedidos?parados_dias=15")).json()

    assert resposta["total"] == 1
    assert resposta["itens"][0]["titulo"] == "Parado"


@pytest.mark.asyncio
async def test_parados_nao_inclui_pedido_encerrado(como, assessor):
    """Encerrado não está parado: terminou. Não pode poluir o filtro."""
    async with como(assessor) as cliente:
        cancelado = await _abrir(cliente, titulo="Cancelado")
        await cliente.post(
            f"/pedidos/{cancelado['id']}/cancelar", json={"motivo": "sem objeto"}
        )

        concluido = await _abrir(cliente, titulo="Concluído", tipo="OUTRO")
        await cliente.post(f"/pedidos/{concluido['id']}/concluir", json={})

        await _envelhecer(cancelado["id"], 30)
        await _envelhecer(concluido["id"], 30)

        resposta = (await cliente.get("/pedidos?parados_dias=15")).json()

    ids = {i["id"] for i in resposta["itens"]}
    assert cancelado["id"] not in ids
    assert concluido["id"] not in ids


@pytest.mark.asyncio
async def test_busca_global_alcanca_anexo_e_comentario(como, assessor):
    async with como(assessor) as cliente:
        com_anexo = await _abrir(cliente, titulo="Pedido com plano")
        await _anexar(cliente, com_anexo["id"], "plano-de-trabalho.pdf")

        com_comentario = await _abrir(cliente, titulo="Pedido comentado")
        await cliente.post(
            f"/pedidos/{com_comentario['id']}/comentarios",
            json={"texto": "Falta a certidão negativa de débitos."},
        )

        por_anexo = (await cliente.get("/pedidos?q=plano-de-trabalho")).json()
        por_comentario = (await cliente.get("/pedidos?q=certidão")).json()

    assert por_anexo["total"] == 1
    assert por_anexo["itens"][0]["id"] == com_anexo["id"]
    assert por_comentario["total"] == 1
    assert por_comentario["itens"][0]["id"] == com_comentario["id"]


@pytest.mark.asyncio
async def test_filtro_de_janela_de_prazo(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        com_prazo = await _encaminhar(cliente, pedido["id"])
        prazo = com_prazo["prazo_atual"]

        dentro = (
            await cliente.get(f"/pedidos?prazo_de={prazo}&prazo_ate={prazo}")
        ).json()
        fora = (
            await cliente.get("/pedidos?prazo_de=2000-01-01&prazo_ate=2000-01-02")
        ).json()

    assert dentro["total"] == 1
    assert dentro["itens"][0]["id"] == pedido["id"]
    assert fora["total"] == 0


@pytest.mark.asyncio
async def test_filtro_abertos_inclui_com_assessor_e_aguardando_terceiro(como, assessor):
    async with como(assessor) as cliente:
        com_assessor = await _abrir(cliente, titulo="Na mesa do Assessor")
        terceiro = await _abrir(cliente, titulo="Com terceiro")
        await cliente.post(f"/pedidos/{terceiro['id']}/aguardar-terceiro", json={})
        concluido = await _abrir(cliente, titulo="Concluído")
        await cliente.post(f"/pedidos/{concluido['id']}/concluir", json={})

        abertos = (await cliente.get("/pedidos?abertos=true")).json()

    ids = {i["id"] for i in abertos["itens"]}
    assert com_assessor["id"] in ids
    assert terceiro["id"] in ids
    assert concluido["id"] not in ids
