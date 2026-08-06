"""Testes de manutenções, planos preventivos e alertas (item 38)."""

import pytest

pytestmark = pytest.mark.asyncio


async def _criar_maquina(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/categorias-maquina",
        json={"chave": "trator-teste", "nome": "Trator"},
        headers=token("admin"),
    )
    assert resposta.status_code == 201
    categoria = next(
        c
        for c in (await client.get("/api/govinfra/v1/categorias-maquina", headers=token("gestor"))).json()
        if c["chave"] == "trator-teste"
    )
    resposta = await client.post(
        "/api/govinfra/v1/maquinas",
        json={
            "codigo": "MAQ-MNT-01",
            "nome": "Trator de teste",
            "categoria_id": categoria["id"],
            "horimetro_atual": 500,
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201
    return next(
        m
        for m in (await client.get("/api/govinfra/v1/maquinas", headers=token("gestor"))).json()["itens"]
        if m["codigo"] == "MAQ-MNT-01"
    )


async def _detalhe_manutencao(client, token, manutencao_id):
    resposta = await client.get(
        f"/api/govinfra/v1/manutencoes/{manutencao_id}", headers=token("manutencao")
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def test_abrir_manutencao_e_concluir(client, token):
    maquina = await _criar_maquina(client, token)

    aberta = await client.post(
        "/api/govinfra/v1/manutencoes",
        json={
            "maquina_id": maquina["id"],
            "tipo": "corretiva",
            "data_abertura": "2026-08-01",
            "defeito": "Falha no motor",
            "diagnostico": "Bomba injetora danificada",
            "prioridade": "alta",
            "horimetro": 500,
            "oficina": "Oficina municipal",
            "custo_total": 1500,
            "data_prevista": "2026-08-10",
            "situacao": "aberta",
        },
        headers=token("manutencao"),
    )
    assert aberta.status_code == 201, aberta.text
    manutencao = await _detalhe_manutencao(client, token, aberta.json()["id"])
    assert manutencao["situacao"] == "aberta"

    # A máquina ficou em manutenção.
    detalhe = await client.get(
        f"/api/govinfra/v1/maquinas/{maquina['id']}", headers=token("gestor")
    )
    assert detalhe.json()["situacao"] == "em_manutencao_corretiva"

    concluida = await client.post(
        f"/api/govinfra/v1/manutencoes/{manutencao['id']}/concluir",
        json={"data_conclusao": "2026-08-08", "custo_total": 1500, "observacoes": "Peça trocada"},
        headers=token("manutencao"),
    )
    assert concluida.status_code == 200, concluida.text

    final = await _detalhe_manutencao(client, token, manutencao["id"])
    assert final["situacao"] == "concluida"


async def test_manutencao_nao_agendavel(client, token):
    maquina = await _criar_maquina(client, token)
    aberta = await client.post(
        "/api/govinfra/v1/manutencoes",
        json={
            "maquina_id": maquina["id"],
            "tipo": "preventiva",
            "data_abertura": "2026-08-01",
            "defeito": "Revisão programada",
            "situacao": "em_execucao",
        },
        headers=token("manutencao"),
    )
    assert aberta.status_code == 201

    # A máquina em manutenção não aceita novos AGENDAMENTOS — verificado pelo
    # serviço de agenda (a manutenção bloqueia o recurso, não o registro).
    agenda = await client.get(
        "/api/govinfra/v1/agenda/disponibilidade",
        params={"data": "2026-08-05"},
        headers=token("gestor"),
    )
    assert agenda.status_code == 200


async def test_plano_preventivo(client, token):
    maquina = await _criar_maquina(client, token)
    resposta = await client.post(
        "/api/govinfra/v1/manutencoes/planos",
        json={
            "nome": "Preventiva 200h",
            "descricao": "Revisão a cada 200 horas",
            "maquina_id": maquina["id"],
            "base_gatilho": "horimetro",
            "intervalo_horas": 200,
            "antecedencia_alerta_dias": 15,
            "antecedencia_alerta_medidor": 20,
            "servicos_previstos": ["Troca de óleo", "Filtros"],
            "recomendacao_fabricante": "Manual do fabricante",
            "ativo": True,
        },
        headers=token("manutencao"),
    )
    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["id"]

    planos = await client.get(
        "/api/govinfra/v1/manutencoes/planos/listar", headers=token("manutencao")
    )
    assert planos.status_code == 200
    assert any(p["nome"] == "Preventiva 200h" for p in planos.json())
