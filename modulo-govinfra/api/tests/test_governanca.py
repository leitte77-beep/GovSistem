"""Testes de relatórios, exportação, busca global, auditoria e permissões."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_catalogo_relatorios(client, token):
    resposta = await client.get("/api/govinfra/v1/relatorios", headers=token("gestor"))
    assert resposta.status_code == 200
    assert isinstance(resposta.json(), list)
    assert any("chave" in r for r in resposta.json())


async def test_relatorio_tela(client, token, pessoa):
    resposta = await client.get(
        "/api/govinfra/v1/relatorios/cacambas-inventario", headers=token("gestor")
    )
    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()
    assert "colunas" in dados or isinstance(dados, list)


async def test_relatorio_csv(client, token, pessoa):
    resposta = await client.get(
        "/api/govinfra/v1/relatorios/cacambas-inventario?formato=csv", headers=token("gestor")
    )
    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("text/csv")


async def test_relatorio_sem_permissao_exportar(client, token, pessoa):
    """Consulta não exporta: exige govinfra.relatorios.exportar."""
    resposta = await client.get(
        "/api/govinfra/v1/relatorios/cacambas-inventario?formato=csv", headers=token("consulta")
    )
    assert resposta.status_code == 403


async def test_busca_global(client, token, pessoa):
    resposta = await client.get(
        "/api/govinfra/v1/busca", params={"termo": "Cidadão"}, headers=token("gestor")
    )
    assert resposta.status_code == 200
    assert resposta.json()["termo"] == "Cidadão"
    assert "total" in resposta.json()
    assert "categorias" in resposta.json()


async def test_busca_por_protocolo(client, token, pessoa):
    resposta = await client.get(
        "/api/govinfra/v1/busca", params={"termo": "999999"}, headers=token("gestor")
    )
    assert resposta.status_code == 200


async def test_auditoria_lista(client, token, pessoa):
    resposta = await client.get("/api/govinfra/v1/auditoria", headers=token("gestor"))
    assert resposta.status_code == 200
    assert resposta.json()["total"] >= 1
    assert resposta.json()["itens"][0]["acao"] == "criar"


async def test_auditoria_sem_permissao(client, token, pessoa):
    resposta = await client.get("/api/govinfra/v1/auditoria", headers=token("atendente"))
    assert resposta.status_code == 403


async def test_notificacoes_fluxo(client, token, pessoa):
    resposta = await client.get("/api/govinfra/v1/notificacoes/nao-lidas", headers=token("gestor"))
    assert resposta.status_code == 200
    assert "total" in resposta.json()

    lista = await client.get("/api/govinfra/v1/notificacoes", headers=token("gestor"))
    assert lista.status_code == 200
    total = lista.json()["total"]

    marcadas = await client.post(
        "/api/govinfra/v1/notificacoes/marcar-lidas", json=[], headers=token("gestor")
    )
    assert marcadas.status_code == 200
    assert marcadas.json()["marcadas"] == total

    restantes = await client.get("/api/govinfra/v1/notificacoes/nao-lidas", headers=token("gestor"))
    assert restantes.json()["total"] == 0


async def test_configuracoes_lista_e_edicao(client, token):
    resposta = await client.get("/api/govinfra/v1/configuracoes", headers=token("gestor"))
    assert resposta.status_code == 200
    areas = resposta.json()["areas"]
    assert any(a["area"] == "cacambas" for a in areas)

    cacambas = next(a for a in areas if a["area"] == "cacambas")
    chave = cacambas["configuracoes"][0]["chave"]

    editada = await client.put(
        f"/api/govinfra/v1/configuracoes/{chave}",
        json={"valor": 5, "justificativa": "Ajuste de teste"},
        headers=token("admin"),
    )
    assert editada.status_code == 200, editada.text
    assert editada.json()["valor"] == 5

    sem_perm = await client.put(
        f"/api/govinfra/v1/configuracoes/{chave}", json={"valor": 9}, headers=token("consulta")
    )
    assert sem_perm.status_code == 403


async def test_consulta_ordem_publica_token_invalido(client):
    resposta = await client.get("/api/govinfra/v1/consulta/token-que-nao-existe")
    assert resposta.status_code == 404


async def test_health(client):
    resposta = await client.get("/api/govinfra/health/live")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


async def test_catalogo_permissoes(client, token):
    resposta = await client.get("/api/govinfra/v1/auth/permissoes/catalogo", headers=token("gestor"))
    assert resposta.status_code == 200
    assert "perfis" in resposta.json()
    assert "areas" in resposta.json()
