"""Setores configuráveis e o acompanhamento por setor."""

import pytest

PEDIDO = {"titulo": "Aquisição de carro doado pelo Deputado", "tipo": "AQUISICAO"}


async def _encaminhar(cliente, pedido_id, setor="ENGENHARIA"):
    return await cliente.post(
        f"/pedidos/{pedido_id}/encaminhar",
        json={"setor": setor, "assunto": "Fazer o que precisa"},
    )


@pytest.mark.asyncio
async def test_setores_padrao_sao_semeados(como, assessor):
    async with como(assessor) as cliente:
        setores = (await cliente.get("/setores")).json()
    codigos = {s["codigo"] for s in setores}
    assert {"GABINETE", "JURIDICO", "ENGENHARIA", "EXTERNO"} <= codigos
    assert all(s["ativo"] for s in setores)


@pytest.mark.asyncio
async def test_criar_setor_e_lotar_usuario(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        criado = await cliente.post("/setores", json={"nome": "Meio Ambiente"})
        assert criado.status_code == 201, criado.text
        setor = criado.json()
        assert setor["codigo"] == "MEIO_AMBIENTE"

        resposta = await cliente.patch(
            f"/usuarios/{engenheiro.id}", json={"setor": setor["codigo"]}
        )
        assert resposta.status_code == 200
        assert resposta.json()["setor"] == "MEIO_AMBIENTE"

    async with como(engenheiro) as cliente:
        assert (await cliente.get("/eu")).json()["setor"] == "MEIO_AMBIENTE"


@pytest.mark.asyncio
async def test_setor_de_sistema_nao_pode_ser_excluido(como, assessor):
    async with como(assessor) as cliente:
        setores = (await cliente.get("/setores")).json()
        externo = next(s for s in setores if s["codigo"] == "EXTERNO")
        resposta = await cliente.delete(f"/setores/{externo['id']}")
    assert resposta.status_code == 409


@pytest.mark.asyncio
async def test_setor_em_uso_nao_pode_ser_excluido(como, assessor, juridico):
    assert juridico.setor == "JURIDICO"
    async with como(assessor) as cliente:
        setores = (await cliente.get("/setores")).json()
        juridico_setor = next(s for s in setores if s["codigo"] == "JURIDICO")
        resposta = await cliente.delete(f"/setores/{juridico_setor['id']}")
    assert resposta.status_code == 409


@pytest.mark.asyncio
async def test_lotacao_em_lote(como, assessor, juridico):
    async with como(assessor) as cliente:
        resposta = await cliente.post(
            "/usuarios/lote",
            json={"usuario_ids": [str(assessor.id), str(juridico.id)], "setor": "ENGENHARIA"},
        )
    assert resposta.status_code == 200
    assert resposta.json()["atualizados"] == 2


@pytest.mark.asyncio
async def test_meu_setor_mostra_a_fila_do_departamento(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        await _encaminhar(cliente, pedido["id"])

    async with como(engenheiro) as cliente:
        corpo = (await cliente.get("/meu-setor")).json()

    assert corpo["setor"]["codigo"] == "ENGENHARIA"
    assert corpo["contagens"]["abertas"] == 1
    assert corpo["contagens"]["sem_responsavel"] == 1
    assert [t["id"] for t in corpo["tarefas"]] == [pedido["id"]]
    assert corpo["tarefas"][0]["tarefa_atual"] == "Fazer o que precisa"


@pytest.mark.asyncio
async def test_departamento_nao_espia_outro_setor(como, juridico):
    async with como(juridico) as cliente:
        assert (await cliente.get("/meu-setor?codigo=ENGENHARIA")).status_code == 403


@pytest.mark.asyncio
async def test_assessor_ve_qualquer_setor(como, assessor):
    async with como(assessor) as cliente:
        assert (await cliente.get("/meu-setor?codigo=JURIDICO")).status_code == 200


@pytest.mark.asyncio
async def test_usuario_sem_setor_tem_tela_vazia(como, prefeito):
    async with como(prefeito) as cliente:
        corpo = (await cliente.get("/meu-setor")).json()
    assert corpo["setor"] is None
    assert corpo["contagens"]["abertas"] == 0


@pytest.mark.asyncio
async def test_painel_conta_por_setor(como, assessor):
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        await _encaminhar(cliente, pedido["id"])
        por_setor = {c["setor"]: c for c in (await cliente.get("/painel")).json()["por_setor"]}

    assert por_setor["ENGENHARIA"]["abertos"] == 1
    assert por_setor["ENGENHARIA"]["nome"] == "Engenharia"


@pytest.mark.asyncio
async def test_perfil_definido_no_modulo_vence_a_plataforma(como, assessor, prefeito, db):
    async with como(assessor) as c:
        r = await c.patch(f"/usuarios/{prefeito.id}", json={"perfil": "ASSESSOR"})
        assert r.status_code == 200, r.text
        assert r.json()["perfil"] == "ASSESSOR"
        assert r.json()["perfil_definido"] == "ASSESSOR"
        auditoria = (await c.get("/auditoria")).json()
    assert auditoria[0]["campo"] == "perfil"
    assert auditoria[0]["depois"] == "Assessor"
    async with como(prefeito) as c:
        eu = (await c.get("/eu")).json()
        assert eu["perfil"] == "ASSESSOR" and eu["pode_encaminhar"] is True
        # Agora ele encaminha, coisa que o perfil de Prefeito não permite.
        r = await c.get("/painel/assessor")
        assert r.status_code == 200


@pytest.mark.asyncio
async def test_desativar_devolve_tarefas_para_a_fila(como, assessor, juridico):
    async with como(assessor) as c:
        p = (await c.post("/pedidos", json={"titulo": "Ofício", "tipo": "OUTRO"})).json()
        p = (await c.post(f"/pedidos/{p['id']}/encaminhar", json={"setor": "JURIDICO", "assunto": "Ofício"})).json()
    async with como(juridico) as c:
        await c.post(f"/pedidos/{p['id']}/encaminhamentos/{p['encaminhamento_atual']['id']}/assumir")
    async with como(assessor) as c:
        lista = (await c.get("/usuarios")).json()
        assert next(u for u in lista if u["id"] == str(juridico.id))["tarefas_abertas"] == 1
        r = await c.patch(f"/usuarios/{juridico.id}", json={"ativo": False})
        assert r.status_code == 200, r.text
        assert r.json()["ativo"] is False
        p = (await c.get(f"/pedidos/{p['id']}")).json()
        assert p["responsavel_atual"] is None
        assert p["encaminhamento_atual"]["status"] == "AGUARDANDO"
        assert all(u["id"] != str(juridico.id) for u in (await c.get("/usuarios")).json())
        r = await c.patch(f"/usuarios/{assessor.id}", json={"ativo": False})
        assert r.status_code == 422


@pytest.mark.asyncio
async def test_prazo_e_responsavel_do_setor(como, assessor, juridico):
    async with como(assessor) as c:
        setores = (await c.get("/setores")).json()
        jur = next(s for s in setores if s["codigo"] == "JURIDICO")
        r = await c.patch(f"/setores/{jur['id']}", json={"prazo_dias": 9, "responsavel_id": str(juridico.id)})
        assert r.status_code == 200, r.text
        assert r.json()["prazo_sugerido_dias"] == 9
        p = (await c.post("/pedidos", json={"titulo": "Parecer", "tipo": "OUTRO"})).json()
        p = (await c.post(f"/pedidos/{p['id']}/encaminhar", json={"setor": "JURIDICO", "assunto": "Parecer"})).json()
        from datetime import date, timedelta
        assert p["prazo_atual"] == (date.today() + timedelta(days=9)).isoformat()
        jur = next(s for s in (await c.get("/setores")).json() if s["codigo"] == "JURIDICO")
        assert jur["pessoas"] == 1 and jur["abertos"] == 1
    async with como(juridico) as c:
        avisos = (await c.get("/notificacoes")).json()
    assert any(n["tipo"] == "TAREFA_RECEBIDA" for n in avisos["itens"])
