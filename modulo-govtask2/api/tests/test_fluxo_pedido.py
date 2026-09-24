"""O vai e vem, ponta a ponta. Cada teste é uma frase que o Assessor diria."""

import io
from decimal import Decimal

import pytest

CARRO = {
    "titulo": "Aquisição de carro doado pelo Deputado Fulano",
    "tipo": "AQUISICAO",
    "origem": "DEPUTADO",
    "origem_nome": "Deputado Fulano de Tal",
    "valor_previsto": "134000.00",
    "descricao": "Prefeito conversou com o deputado; veículo para a Saúde.",
}

OBRA = {**CARRO, "titulo": "Pavimentação do Bairro Novo", "tipo": "OBRA"}


async def _abrir(cliente, dados=None):
    resposta = await cliente.post("/pedidos", json=dados or CARRO)
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _encaminhar(cliente, pedido_id, setor="ENGENHARIA", **extra):
    corpo = {"setor": setor, "assunto": "Fazer o que precisa", **extra}
    resposta = await cliente.post(f"/pedidos/{pedido_id}/encaminhar", json=corpo)
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _enc_atual(pedido):
    return pedido["encaminhamento_atual"]


async def _anexar(cliente, pedido_id, nome="documento.pdf", **form):
    resposta = await cliente.post(
        f"/pedidos/{pedido_id}/anexos",
        files={"arquivo": (nome, io.BytesIO(b"%PDF-1.4 conteudo"), "application/pdf")},
        data=form,
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


@pytest.mark.asyncio
async def test_abertura_deixa_o_pedido_com_o_assessor(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)

    assert pedido["numero"].endswith("/000001")
    assert pedido["situacao"] == "COM_ASSESSOR"
    assert pedido["setor_atual"] is None
    assert pedido["encaminhamentos"] == []
    assert pedido["proxima_acao"] == "Encaminhar a um setor ou concluir"


@pytest.mark.asyncio
async def test_numeracao_sequencial_por_exercicio(como, assessor):
    async with como(assessor) as cliente:
        primeiro = await _abrir(cliente)
        segundo = await _abrir(cliente)
    assert primeiro["numero"] != segundo["numero"]
    assert segundo["numero"].endswith("/000002")


@pytest.mark.asyncio
async def test_editar_registra_no_historico(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        resposta = await cliente.patch(
            f"/pedidos/{pedido['id']}",
            json={
                "titulo": "Aquisição de carro — revisado",
                "valor_liberado": "100000.00",
            },
        )
        assert resposta.status_code == 200, resposta.text
        editado = resposta.json()

    assert editado["titulo"] == "Aquisição de carro — revisado"
    assert Decimal(editado["valor_liberado"]) == Decimal("100000.00")

    edicoes = [a for a in editado["andamentos"] if a["tipo"] == "EDICAO"]
    assert len(edicoes) == 1
    assert "título" in edicoes[0]["texto"]
    assert "valor liberado" in edicoes[0]["texto"]


@pytest.mark.asyncio
async def test_editar_sem_mudanca_nao_polui_historico(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        resposta = await cliente.patch(
            f"/pedidos/{pedido['id']}", json={"titulo": pedido["titulo"]}
        )
        assert resposta.status_code == 200, resposta.text
        assert [a for a in resposta.json()["andamentos"] if a["tipo"] == "EDICAO"] == []


@pytest.mark.asyncio
async def test_assessor_encaminha_para_a_engenharia(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"], assunto="Projeto e orçamento")

    assert corpo["situacao"] == "EM_SETOR"
    assert corpo["setor_atual"] == "ENGENHARIA"
    assert corpo["responsavel_atual"] is None
    enc = _enc_atual(corpo)
    assert enc["status"] == "AGUARDANDO"
    assert enc["assunto"] == "Projeto e orçamento"
    assert enc["prazo"] is not None and enc["prazo_sugerido"] is True


@pytest.mark.asyncio
async def test_encaminhar_recusa_setor_desconhecido(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        resposta = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhar",
            json={"setor": "INEXISTENTE", "assunto": "x"},
        )
    assert resposta.status_code == 422


@pytest.mark.asyncio
async def test_departamento_nao_encaminha(como, assessor, engenheiro):
    """Só o Assessor encaminha. Com o pedido na Engenharia, ninguém manda para outro setor."""
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        await _encaminhar(cliente, pedido["id"])

    async with como(engenheiro) as cliente:
        resposta = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhar",
            json={"setor": "LICITACAO", "assunto": "repassar"},
        )
    assert resposta.status_code == 403


@pytest.mark.asyncio
async def test_fase_sem_responsavel_aparece_para_todo_o_setor(como, assessor, engenheiro, engenheiro2):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        await _encaminhar(cliente, pedido["id"])

    async with como(engenheiro) as cliente:
        painel = (await cliente.get("/painel")).json()
    async with como(engenheiro2) as cliente:
        meu = (await cliente.get("/meu-setor")).json()

    assert painel["contagens"]["comigo"] == 1
    assert meu["contagens"]["abertas"] == 1
    assert meu["contagens"]["sem_responsavel"] == 1


@pytest.mark.asyncio
async def test_assumir_tira_a_tarefa_dos_demais(como, assessor, engenheiro, engenheiro2):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        assumido = (
            await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        ).json()
    assert assumido["responsavel_atual"]["email"] == "eva@teste.gov.br"
    assert _enc_atual(assumido)["status"] == "EM_EXECUCAO"

    # O outro engenheiro não vê mais: sumiu da fila.
    async with como(engenheiro2) as cliente:
        assert (await cliente.get("/meu-setor")).json()["contagens"]["abertas"] == 0

    # E o Assessor foi avisado.
    async with como(assessor) as cliente:
        avisos = (await cliente.get("/notificacoes")).json()
    assert avisos["nao_lidas"] == 1
    assert avisos["itens"][0]["tipo"] == "PEDIDO_ASSUMIDO"


@pytest.mark.asyncio
async def test_mencionar_engenheiro_ele_passa_a_ver(como, assessor, engenheiro, engenheiro2):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        mencionado = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/mencionar",
            json={"usuarios_ids": [str(engenheiro2.id)]},
        )
    assert mencionado.status_code == 200, mencionado.text

    async with como(engenheiro2) as cliente:
        assert (await cliente.get("/meu-setor")).json()["contagens"]["abertas"] == 1
        # E pode anexar e concluir, como o responsável.
        anexo = await _anexar(cliente, pedido["id"], "foto.jpg")
    assert anexo["encaminhamento_atual"]["participantes"][0]["email"] == "elias@teste.gov.br"


@pytest.mark.asyncio
async def test_transferir_dentro_do_setor_avisa_o_assessor(como, assessor, engenheiro, engenheiro2):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        transferido = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/transferir",
            json={"responsavel_id": str(engenheiro2.id), "motivo": "Vou viajar."},
        )
    assert transferido.status_code == 200, transferido.text
    corpo = transferido.json()
    assert corpo["responsavel_atual"]["email"] == "elias@teste.gov.br"
    assert _enc_atual(corpo)["transferencias"] == 1

    async with como(assessor) as cliente:
        tipos = [i["tipo"] for i in (await cliente.get("/notificacoes")).json()["itens"]]
    assert "PEDIDO_TRANSFERIDO" in tipos


@pytest.mark.asyncio
async def test_complemento_volta_para_o_assessor_e_retorna(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        pedido_corpo = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/complemento/solicitar",
                json={"texto": "Falta a planta do terreno."},
            )
        ).json()
    assert pedido_corpo["situacao"] == "COM_ASSESSOR"
    assert pedido_corpo["complemento_pendente"] is True
    assert pedido_corpo["proxima_acao"] == "Responder complemento ao setor"

    async with como(assessor) as cliente:
        retorno = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/complemento/responder",
                json={"texto": "Segue a planta em anexo."},
            )
        ).json()
    assert retorno["situacao"] == "EM_SETOR"
    assert retorno["complemento_pendente"] is False
    assert retorno["responsavel_atual"]["email"] == "eva@teste.gov.br"


@pytest.mark.asyncio
async def test_devolver_ao_assessor_com_resultado(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        devolvido = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/devolver",
                json={"resultado": "Projeto pronto e protocolado."},
            )
        ).json()
    assert devolvido["situacao"] == "COM_ASSESSOR"
    assert devolvido["responsavel_atual"] is None
    enc = next(e for e in devolvido["encaminhamentos"] if e["id"] == enc_id)
    assert enc["status"] == "CONCLUIDO"
    assert enc["resultado"] == "Projeto pronto e protocolado."

    async with como(assessor) as cliente:
        tipos = [i["tipo"] for i in (await cliente.get("/notificacoes")).json()["itens"]]
    assert "PEDIDO_DEVOLVIDO" in tipos


@pytest.mark.asyncio
async def test_devolver_exige_resultado(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        resposta = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/devolver",
            json={"resultado": ""},
        )
    assert resposta.status_code == 422


@pytest.mark.asyncio
async def test_assessor_reencaminha_apos_a_devolucao(como, assessor, engenheiro):
    """O vai e vem: Engenharia devolve, o Assessor manda para a Licitação."""
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/devolver",
            json={"resultado": "Projeto pronto."},
        )

    async with como(assessor) as cliente:
        final = await _encaminhar(cliente, pedido["id"], setor="LICITACAO")
    assert final["setor_atual"] == "LICITACAO"
    assert [e["ordem"] for e in final["encaminhamentos"]] == [1, 2]


@pytest.mark.asyncio
async def test_medicao_so_em_obra(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = await _encaminhar(cliente, pedido["id"])
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        recusa = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/medicoes", json={}
        )
    assert recusa.status_code == 422


@pytest.mark.asyncio
async def test_medicao_de_obra_com_foto(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente, OBRA)
        corpo = await _encaminhar(cliente, pedido["id"], assunto="Execução")
        enc_id = _enc_atual(corpo)["id"]

    async with como(engenheiro) as cliente:
        await cliente.post(f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir")
        medicao = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/medicoes",
                json={
                    "periodo_inicio": "2026-09-01",
                    "periodo_fim": "2026-09-30",
                    "valor": "50000.00",
                    "percentual_executado": "40.00",
                    "observacao": "Primeira etapa concluída.",
                },
            )
        ).json()
        med_id = medicao["medicoes"][0]["id"]
        com_foto = await _anexar(
            cliente, pedido["id"], "obra.jpg", medicao_id=str(med_id)
        )

    cadastrada = com_foto["medicoes"][0]
    assert cadastrada["numero"] == 1
    assert cadastrada["percentual_executado"] == "40.00"
    assert [f["nome_original"] for f in cadastrada["fotos"]] == ["obra.jpg"]


@pytest.mark.asyncio
async def test_aguardar_terceiro_fica_com_o_assessor(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        parado = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/aguardar-terceiro",
                json={"texto": "Protocolado no Estado."},
            )
        ).json()
        assert parado["situacao"] == "AGUARDANDO_TERCEIRO"
        retomado = (
            await cliente.post(f"/pedidos/{pedido['id']}/retomar", json={})
        ).json()
    assert retomado["situacao"] == "COM_ASSESSOR"


@pytest.mark.asyncio
async def test_concluir_e_cancelar(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        concluido = (
            await cliente.post(f"/pedidos/{pedido['id']}/concluir", json={})
        ).json()
        assert concluido["situacao"] == "CONCLUIDO"
        assert concluido["concluido_em"] is not None

        outro = await _abrir(cliente)
        cancelado = (
            await cliente.post(
                f"/pedidos/{outro['id']}/cancelar",
                json={"motivo": "Deputado desistiu da emenda."},
            )
        ).json()
    assert cancelado["situacao"] == "CANCELADO"
    assert cancelado["motivo_cancelamento"] == "Deputado desistiu da emenda."


@pytest.mark.asyncio
async def test_timeline_guarda_o_nome_de_quem_agiu(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        corpo = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/comentarios",
                json={"texto": "Prefeito pediu urgência."},
            )
        ).json()
    comentario = [a for a in corpo["andamentos"] if a["tipo"] == "COMENTARIO"][0]
    assert comentario["autor_nome"] == "Ana Assessora"
    assert comentario["texto"] == "Prefeito pediu urgência."


@pytest.mark.asyncio
async def test_anexo_entra_no_encaminhamento_aberto(como, assessor):
    async with como(assessor) as cliente:
        pedido = await _abrir(cliente)
        await _encaminhar(cliente, pedido["id"])
        atualizado = await _anexar(cliente, pedido["id"], "oficio.pdf")

    enc = _enc_atual(atualizado)
    assert [a["nome_original"] for a in enc["anexos"]] == ["oficio.pdf"]
