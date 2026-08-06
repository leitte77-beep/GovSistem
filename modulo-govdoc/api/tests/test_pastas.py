"""Pastas: criação, unicidade, movimentação sem ciclos e lixeira."""

API = "/api/govdoc/v1"


async def _criar(client, headers, **payload):
    return await client.post(f"{API}/pastas", json=payload, headers=headers)


async def test_criar_pasta_raiz(client, token, mundo):
    resposta = await _criar(
        client,
        token("admin"),
        nome="Documentos Gerais",
        secretaria_id=str(mundo["saude"].id),
    )
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["nome"] == "Documentos Gerais"
    assert corpo["profundidade"] == 0
    assert "view" in corpo["permissoes"]


async def test_colaborador_nao_cria_pasta_na_raiz(client, token):
    resposta = await _criar(client, token("colaborador"), nome="Minha pasta")
    assert resposta.status_code == 403
    assert "administradores" in resposta.json()["mensagem"]


async def test_nome_duplicado_no_mesmo_nivel(client, token, pasta_saude):
    resposta = await _criar(client, token("admin"), nome="Contratos")
    assert resposta.status_code == 409
    assert "Já existe uma pasta" in resposta.json()["mensagem"]


async def test_nome_invalido_recusado(client, token):
    resposta = await _criar(client, token("admin"), nome="rela/torio")
    assert resposta.status_code == 422


async def test_subpasta_herda_escopo(client, token, pasta_saude, mundo):
    resposta = await _criar(
        client,
        token("admin"),
        nome="2026",
        pasta_superior_id=pasta_saude["id"],
    )
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["secretaria_id"] == str(mundo["saude"].id)
    assert corpo["setor_id"] == str(mundo["adm_saude"].id)
    assert corpo["profundidade"] == 1


async def test_mover_pasta_para_dentro_de_si_mesma(client, token, pasta_saude):
    resposta = await client.post(
        f"{API}/pastas/{pasta_saude['id']}/mover",
        json={"pasta_destino_id": pasta_saude["id"]},
        headers=token("admin"),
    )
    assert resposta.status_code == 422
    assert "dentro dela mesma" in resposta.json()["mensagem"]


async def test_mover_pasta_para_descendente_bloqueado(client, token, pasta_saude):
    filha = (
        await _criar(
            client, token("admin"), nome="Subpasta", pasta_superior_id=pasta_saude["id"]
        )
    ).json()
    resposta = await client.post(
        f"{API}/pastas/{pasta_saude['id']}/mover",
        json={"pasta_destino_id": filha["id"]},
        headers=token("admin"),
    )
    assert resposta.status_code == 422
    assert "subpasta dela mesma" in resposta.json()["mensagem"]


async def test_mover_pasta_atualiza_descendentes(client, token, pasta_saude, mundo):
    destino = (
        await _criar(client, token("admin"), nome="Arquivo Morto")
    ).json()
    filha = (
        await _criar(
            client, token("admin"), nome="2025", pasta_superior_id=pasta_saude["id"]
        )
    ).json()

    resposta = await client.post(
        f"{API}/pastas/{pasta_saude['id']}/mover",
        json={"pasta_destino_id": destino["id"]},
        headers=token("admin"),
    )
    assert resposta.status_code == 200

    caminho = await client.get(
        f"{API}/pastas/{filha['id']}/caminho", headers=token("admin")
    )
    nomes = [item["nome"] for item in caminho.json()]
    assert nomes == ["Arquivo Morto", "Contratos", "2025"]


async def test_arvore_de_pastas(client, token, pasta_saude):
    await _criar(client, token("admin"), nome="2026", pasta_superior_id=pasta_saude["id"])
    resposta = await client.get(f"{API}/pastas/arvore", headers=token("admin"))
    assert resposta.status_code == 200
    raizes = resposta.json()
    assert any(no["nome"] == "Contratos" and no["filhos"] for no in raizes)


async def test_lixeira_de_pasta_leva_conteudo_junto(client, token, pasta_saude):
    filha = (
        await _criar(
            client, token("admin"), nome="Anexos", pasta_superior_id=pasta_saude["id"]
        )
    ).json()

    resposta = await client.request(
        "DELETE",
        f"{API}/pastas/{pasta_saude['id']}",
        json={"motivo": "Reorganização"},
        headers=token("admin"),
    )
    assert resposta.status_code == 200

    detalhe = await client.get(f"{API}/pastas/{filha['id']}", headers=token("admin"))
    assert detalhe.status_code == 404

    restaurar = await client.post(
        f"{API}/lixeira/pastas/{pasta_saude['id']}/restaurar", headers=token("admin")
    )
    assert restaurar.status_code == 200
    assert (
        await client.get(f"{API}/pastas/{filha['id']}", headers=token("admin"))
    ).status_code == 200


async def test_usuario_de_outro_setor_nao_ve_a_pasta(client, token, pasta_saude):
    resposta = await client.get(
        f"{API}/pastas/{pasta_saude['id']}", headers=token("externo")
    )
    assert resposta.status_code == 403


async def test_favoritar_pasta(client, token, pasta_saude):
    resposta = await client.post(
        f"{API}/pastas/{pasta_saude['id']}/favorito", headers=token("gestor")
    )
    assert resposta.status_code == 200
    favoritos = await client.get(f"{API}/favoritos", headers=token("gestor"))
    assert any(item["id"] == pasta_saude["id"] for item in favoritos.json())
