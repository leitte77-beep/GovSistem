"""Testes de caçambas, situações, movimentações e baixa (itens 11)."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_criar_cacamba(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/cacambas",
        json={
            "codigo": "CB-001",
            "capacidade_m3": 4,
            "modelo": "4 m³",
            "estado_conservacao": "bom",
            "localizacao_padrao": "Pátio Central",
            "proxima_vistoria_em": "2026-12-31",
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201, resposta.text
    criada = resposta.json()
    assert criada["qr_code"]
    detalhe = await client.get(f"/api/govinfra/v1/cacambas/{criada['id']}", headers=token("consulta"))
    assert detalhe.status_code == 200
    dados = detalhe.json()
    assert dados["codigo"] == "CB-001"
    assert dados["situacao"] == "disponivel"


async def test_cacamba_codigo_duplicado(client, token, cacamba):
    resposta = await client.post(
        "/api/govinfra/v1/cacambas",
        json={"codigo": "CB-TESTE-001", "capacidade_m3": 4},
        headers=token("gestor"),
    )
    assert resposta.status_code == 409


async def test_listar_cacambas(client, token, cacamba):
    resposta = await client.get(
        "/api/govinfra/v1/cacambas", params={"situacao": "disponivel"}, headers=token("consulta")
    )
    assert resposta.status_code == 200
    assert resposta.json()["total"] == 1


async def test_alterar_situacao_gera_movimentacao(client, token, cacamba):
    resposta = await client.post(
        f"/api/govinfra/v1/cacambas/{cacamba['id']}/situacao",
        json={"situacao": "em_limpeza", "motivo": "Retorno com resíduo", "localizacao": "Lavagem"},
        headers=token("gestor"),
    )
    assert resposta.status_code == 200, resposta.text

    detalhe = await client.get(f"/api/govinfra/v1/cacambas/{cacamba['id']}", headers=token("consulta"))
    assert detalhe.json()["situacao"] == "em_limpeza"

    movimentacoes = await client.get(
        f"/api/govinfra/v1/cacambas/{cacamba['id']}/movimentacoes", headers=token("consulta")
    )
    assert movimentacoes.status_code == 200
    assert movimentacoes.json()["total"] >= 1
    primeira = movimentacoes.json()["itens"][0]
    assert primeira["situacao_anterior"] == "disponivel"
    assert primeira["situacao_nova"] == "em_limpeza"


async def test_situacao_invalida_rejeitada(client, token, cacamba):
    resposta = await client.post(
        f"/api/govinfra/v1/cacambas/{cacamba['id']}/situacao",
        json={"situacao": "situacao_que_nao_existe"},
        headers=token("gestor"),
    )
    assert resposta.status_code == 422


async def test_dar_baixa(client, token, cacamba):
    resposta = await client.post(
        f"/api/govinfra/v1/cacambas/{cacamba['id']}/baixa",
        json={"data_baixa": "2026-08-01", "motivo": "Fim de vida útil do equipamento"},
        headers=token("gestor"),
    )
    assert resposta.status_code == 200, resposta.text
    detalhe = await client.get(f"/api/govinfra/v1/cacambas/{cacamba['id']}", headers=token("consulta"))
    assert detalhe.json()["situacao"] == "baixada"


async def test_movimentar_sem_permissao(client, token, cacamba):
    resposta = await client.post(
        f"/api/govinfra/v1/cacambas/{cacamba['id']}/situacao",
        json={"situacao": "em_limpeza"},
        headers=token("consulta"),
    )
    assert resposta.status_code == 403


async def test_tipos_residuo(client, token):
    resposta = await client.get("/api/govinfra/v1/tipos-residuo", headers=token("consulta"))
    assert resposta.status_code == 200
    assert isinstance(resposta.json(), list)
