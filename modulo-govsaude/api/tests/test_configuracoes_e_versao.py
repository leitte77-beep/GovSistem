"""Configuração versionada, If-Match e ETag."""

from __future__ import annotations


async def test_if_match_obrigatorio_e_conflito(client, mundo, token):
    primeira = await client.get(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio", headers=token("admin")
    )
    assert primeira.status_code == 200, primeira.text
    assert primeira.headers["etag"] == '"1"'

    sem_if_match = await client.put(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio",
        json={"valor": {"valor": True}},
        headers=token("admin"),
    )
    assert sem_if_match.status_code == 428

    conflito = await client.put(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio",
        json={"valor": {"valor": True}},
        headers={**token("admin"), "If-Match": '"99"'},
    )
    assert conflito.status_code == 409

    sucesso = await client.put(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio",
        json={"valor": {"valor": True}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert sucesso.status_code == 200, sucesso.text
    assert sucesso.json()["versao"] == 2
    assert sucesso.headers["etag"] == '"2"'


async def test_configuracao_cross_tenant_nao_existe(client, mundo, token):
    # A configuração pertence ao tenant do chamador; um usuário do tenant B não
    # enxerga o valor alterado por A porque a chave é sempre escopada.
    alteracao = await client.put(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio",
        json={"valor": {"valor": True}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert alteracao.status_code == 200
    leitura_b = await client.get(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio", headers=token("admin_b")
    )
    assert leitura_b.status_code == 200
    assert leitura_b.json()["valor"]["valor"] is False


async def test_fuso_invalido_rejeitado(client, mundo, token):
    resposta = await client.put(
        "/api/govsaude/v1/configuracoes/geral.fuso_horario",
        json={"valor": {"valor": "Marte/Olympus"}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert resposta.status_code == 422
