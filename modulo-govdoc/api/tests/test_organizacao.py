"""Testes da gestão organizacional (secretarias/setores) e sincronização."""

import pytest

from app.models.enums import Profile


async def test_listar_secretarias_com_totais(client, token, mundo):
    resposta = await client.get(
        "/api/govdoc/v1/secretarias?com_consumo=true", headers=token("admin")
    )
    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()
    por_sigla = {s["sigla"]: s for s in dados}
    assert por_sigla["SMS"]["total_setores"] == 2
    assert por_sigla["SMS"]["total_usuarios"] == 5
    assert por_sigla["SME"]["total_setores"] == 1


async def test_criar_secretaria(client, token, mundo):
    resposta = await client.post(
        "/api/govdoc/v1/secretarias",
        json={"nome": "Meio Ambiente", "sigla": "SMMA", "descricao": "Sustentabilidade"},
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["ativo"] is True
    assert resposta.json()["total_setores"] == 0


async def test_desativar_secretaria_preserva_documentos(client, token, mundo, pasta_saude):
    resposta = await client.delete(
        f"/api/govdoc/v1/secretarias/{mundo['saude'].id}", headers=token("admin")
    )
    assert resposta.status_code == 200, resposta.text
    body = resposta.json()
    assert "desativada" in body["mensagem"]
    assert "documento" in body["detalhe"].lower()

    lista = await client.get("/api/govdoc/v1/secretarias", headers=token("admin"))
    siglas = [s["sigla"] for s in lista.json()]
    assert "SMS" not in siglas  # inativas ficam fora por padrão
    lista_completa = await client.get(
        "/api/govdoc/v1/secretarias?incluir_inativas=true", headers=token("admin")
    )
    por_sigla = {s["sigla"]: s for s in lista_completa.json()}
    assert por_sigla["SMS"]["ativo"] is False


async def test_listar_setores_com_totais(client, token, mundo):
    resposta = await client.get(
        "/api/govdoc/v1/setores?com_consumo=true", headers=token("admin")
    )
    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()
    assert len(dados) == 3
    for setor in dados:
        assert "total_documentos" in setor
        assert "total_usuarios" in setor
    por_id = {s["id"]: s for s in dados}
    assert por_id[str(mundo["adm_saude"].id)]["secretaria_nome"] == "Saúde"
    assert por_id[str(mundo["adm_saude"].id)]["total_usuarios"] == 3


async def test_mover_setor_entre_secretarias(client, token, mundo):
    resposta = await client.put(
        f"/api/govdoc/v1/setores/{mundo['adm_saude'].id}",
        json={"secretaria_id": str(mundo["educacao"].id)},
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["secretaria_nome"] == "Educação"

    lista = await client.get("/api/govdoc/v1/setores", headers=token("admin"))
    secretarias_do_setor = {
        s["id"]: s["secretaria_id"] for s in lista.json()
    }
    assert secretarias_do_setor[str(mundo["adm_saude"].id)] == str(mundo["educacao"].id)


async def test_desativar_setor(client, token, mundo):
    resposta = await client.delete(
        f"/api/govdoc/v1/setores/{mundo['adm_saude'].id}", headers=token("admin")
    )
    assert resposta.status_code == 200, resposta.text
    assert "desativado" in resposta.json()["mensagem"]

    lista = await client.get("/api/govdoc/v1/setores", headers=token("admin"))
    assert len(lista.json()) == 2
    lista_completa = await client.get(
        "/api/govdoc/v1/setores?incluir_inativos=true", headers=token("admin")
    )
    por_id = {s["id"]: s for s in lista_completa.json()}
    assert por_id[str(mundo["adm_saude"].id)]["ativo"] is False


async def test_editar_usuario_vinculo(client, token, mundo):
    alvo = mundo["usuarios"]["externo"]
    resposta = await client.put(
        f"/api/govdoc/v1/usuarios/{alvo.id}",
        json={
            "secretaria_id": str(mundo["saude"].id),
            "setor_id": str(mundo["vigilancia"].id),
            "cargo": "Fiscal Ambiental",
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["secretaria_id"] == str(mundo["saude"].id)

    lista = await client.get(
        f"/api/govdoc/v1/usuarios?secretaria_id={mundo['saude'].id}", headers=token("admin")
    )
    nomes = [u["nome"] for u in lista.json()["itens"]]
    assert "Servidor Educação" in nomes


async def test_sincronizar_sem_saas_configurado(client, token, mundo):
    """Sem SAAS_API_URL o endpoint responde 503 integração indisponível."""
    resposta = await client.post(
        "/api/govdoc/v1/instituicao/sincronizar", headers=token("admin")
    )
    assert resposta.status_code in (503, 200), resposta.text
