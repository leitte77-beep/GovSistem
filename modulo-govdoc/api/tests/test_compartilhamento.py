"""Compartilhamento interno, links externos e recebimento externo."""

from datetime import datetime, timedelta, timezone

from tests.conftest import arquivo_pdf
from tests.test_documentos import enviar

API = "/api/govdoc/v1"


def _token_da_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


async def _documento(client, token, pasta_saude):
    return (await enviar(client, token("gestor"), pasta_saude["id"])).json()["documento"]


# ── Compartilhamento interno ─────────────────────────────────────────────────


async def test_compartilhar_documento_com_usuario(client, token, pasta_saude, mundo):
    documento = await _documento(client, token, pasta_saude)
    alvo = mundo["usuarios"]["externo"]

    antes = await client.get(f"{API}/documentos/{documento['id']}", headers=token("externo"))
    assert antes.status_code == 403

    resposta = await client.post(
        f"{API}/compartilhamentos",
        json={
            "recurso_tipo": "document",
            "recurso_id": documento["id"],
            "destino_tipo": "user",
            "destino_id": str(alvo.id),
            "permissoes": ["view", "view_metadata", "download"],
            "motivo": "Apoio à Educação",
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201

    depois = await client.get(f"{API}/documentos/{documento['id']}", headers=token("externo"))
    assert depois.status_code == 200

    baixar = await client.get(
        f"{API}/documentos/{documento['id']}/download", headers=token("externo")
    )
    assert baixar.status_code == 200


async def test_compartilhamento_expirado_nao_da_acesso(client, token, pasta_saude, mundo):
    documento = await _documento(client, token, pasta_saude)
    passado = datetime.now(timezone.utc) - timedelta(days=1)
    await client.post(
        f"{API}/compartilhamentos",
        json={
            "recurso_tipo": "document",
            "recurso_id": documento["id"],
            "destino_tipo": "user",
            "destino_id": str(mundo["usuarios"]["externo"].id),
            "permissoes": ["view"],
            "fim": passado.isoformat(),
        },
        headers=token("gestor"),
    )
    resposta = await client.get(
        f"{API}/documentos/{documento['id']}", headers=token("externo")
    )
    assert resposta.status_code == 403


async def test_revogar_compartilhamento(client, token, pasta_saude, mundo):
    documento = await _documento(client, token, pasta_saude)
    criado = await client.post(
        f"{API}/compartilhamentos",
        json={
            "recurso_tipo": "document",
            "recurso_id": documento["id"],
            "destino_tipo": "user",
            "destino_id": str(mundo["usuarios"]["externo"].id),
            "permissoes": ["view"],
        },
        headers=token("gestor"),
    )
    share_id = criado.json()["id"]

    comigo = await client.get(f"{API}/compartilhamentos/comigo", headers=token("externo"))
    assert len(comigo.json()) == 1
    assert comigo.json()[0]["recurso_nome"] == documento["nome_exibicao"]

    await client.delete(f"{API}/compartilhamentos/{share_id}", headers=token("gestor"))
    assert (
        await client.get(f"{API}/documentos/{documento['id']}", headers=token("externo"))
    ).status_code == 403


# ── Links externos ───────────────────────────────────────────────────────────


async def _criar_link(client, token, documento, **extras):
    payload = {
        "nome": "Documentos para a empresa",
        "itens": [{"tipo": "document", "id": documento["id"]}],
    }
    payload.update(extras)
    return await client.post(f"{API}/links-externos", json=payload, headers=token("gestor"))


async def test_link_externo_permite_download_publico(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    criado = await _criar_link(client, token, documento)
    assert criado.status_code == 201
    url = criado.json()["url"]
    assert "/acesso-externo/" in url
    token_publico = _token_da_url(url)

    info = await client.get(f"{API}/publico/acesso/{token_publico}")
    assert info.status_code == 200
    assert info.json()["exige_senha"] is False

    abrir = await client.post(f"{API}/publico/acesso/{token_publico}", json={})
    assert abrir.status_code == 200
    corpo = abrir.json()
    assert len(corpo["documentos"]) == 1
    sessao = corpo["sessao"]

    baixar = await client.get(
        f"{API}/publico/acesso/documentos/{documento['id']}/download?sessao={sessao}"
    )
    assert baixar.status_code == 200
    assert baixar.content == arquivo_pdf()


async def test_link_com_senha_incorreta_e_registrado(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    criado = await _criar_link(client, token, documento, senha="segredo123")
    token_publico = _token_da_url(criado.json()["url"])

    errado = await client.post(
        f"{API}/publico/acesso/{token_publico}", json={"senha": "errada"}
    )
    assert errado.status_code == 401
    assert "Senha incorreta" in errado.json()["mensagem"]

    certo = await client.post(
        f"{API}/publico/acesso/{token_publico}", json={"senha": "segredo123"}
    )
    assert certo.status_code == 200

    link_id = criado.json()["id"]
    acessos = await client.get(f"{API}/links-externos/{link_id}/acessos", headers=token("gestor"))
    resultados = [item["resultado"] for item in acessos.json()["itens"]]
    assert "negado" in resultados and "sucesso" in resultados


async def test_link_expirado_para_de_funcionar(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    passado = datetime.now(timezone.utc) - timedelta(hours=2)
    criado = await _criar_link(client, token, documento, expira_em=passado.isoformat())
    token_publico = _token_da_url(criado.json()["url"])

    resposta = await client.post(f"{API}/publico/acesso/{token_publico}", json={})
    assert resposta.status_code == 410
    assert "expirou em" in resposta.json()["mensagem"]


async def test_link_revogado_para_de_funcionar(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    criado = await _criar_link(client, token, documento)
    token_publico = _token_da_url(criado.json()["url"])

    assert (await client.post(f"{API}/publico/acesso/{token_publico}", json={})).status_code == 200

    await client.delete(f"{API}/links-externos/{criado.json()['id']}", headers=token("gestor"))

    resposta = await client.post(f"{API}/publico/acesso/{token_publico}", json={})
    assert resposta.status_code == 410
    assert "revogado" in resposta.json()["mensagem"]


async def test_limite_de_downloads_do_link(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    criado = await _criar_link(client, token, documento, max_downloads=1)
    token_publico = _token_da_url(criado.json()["url"])
    sessao = (
        await client.post(f"{API}/publico/acesso/{token_publico}", json={})
    ).json()["sessao"]

    url = f"{API}/publico/acesso/documentos/{documento['id']}/download?sessao={sessao}"
    assert (await client.get(url)).status_code == 200
    segunda = await client.get(url)
    assert segunda.status_code == 410
    assert "máximo de downloads" in segunda.json()["mensagem"]


async def test_link_somente_visualizacao_bloqueia_download(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    criado = await _criar_link(client, token, documento, permitir_download=False)
    token_publico = _token_da_url(criado.json()["url"])
    sessao = (
        await client.post(f"{API}/publico/acesso/{token_publico}", json={})
    ).json()["sessao"]

    resposta = await client.get(
        f"{API}/publico/acesso/documentos/{documento['id']}/download?sessao={sessao}"
    )
    assert resposta.status_code == 403
    assert "apenas a visualização" in resposta.json()["mensagem"]


async def test_documento_sigiloso_nao_gera_link(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    await client.put(
        f"{API}/documentos/{documento['id']}",
        json={"classificacao": "sigiloso"},
        headers=token("admin"),
    )
    resposta = await _criar_link(client, token, documento)
    assert resposta.status_code == 403


async def test_identificacao_obrigatoria_no_link(client, token, pasta_saude):
    documento = await _documento(client, token, pasta_saude)
    criado = await _criar_link(client, token, documento, exigir_nome=True, exigir_email=True)
    token_publico = _token_da_url(criado.json()["url"])

    sem_dados = await client.post(f"{API}/publico/acesso/{token_publico}", json={})
    assert sem_dados.status_code == 422

    com_dados = await client.post(
        f"{API}/publico/acesso/{token_publico}",
        json={"nome": "João Fornecedor", "email": "joao@empresa.com.br"},
    )
    assert com_dados.status_code == 200


# ── Recebimento externo ──────────────────────────────────────────────────────


async def test_solicitacao_externa_recebe_e_aprova(client, token, pasta_saude):
    criada = await client.post(
        f"{API}/solicitacoes-externas",
        json={
            "titulo": "Envio de notas fiscais",
            "pasta_destino_id": pasta_saude["id"],
            "tamanho_maximo_mb": 10,
            "quantidade_maxima": 5,
        },
        headers=token("gestor"),
    )
    assert criada.status_code == 201
    token_publico = _token_da_url(criada.json()["url"])

    info = await client.get(f"{API}/publico/envio/{token_publico}")
    assert info.status_code == 200
    assert info.json()["titulo"] == "Envio de notas fiscais"

    envio = await client.post(
        f"{API}/publico/envio/{token_publico}",
        data={"nome": "Empresa X", "email": "fiscal@empresax.com.br"},
        files={"arquivo": ("nota.pdf", arquivo_pdf("Nota fiscal"), "application/pdf")},
    )
    assert envio.status_code == 201
    assert "conferência" in envio.json()["mensagem"]

    recebidos = await client.get(f"{API}/recebimentos", headers=token("gestor"))
    assert len(recebidos.json()) == 1
    recebido = recebidos.json()[0]
    assert recebido["situacao"] == "recebido"
    assert recebido["situacao_arquivo"] == "quarantine"

    aprovacao = await client.post(
        f"{API}/recebimentos/{recebido['id']}/analisar",
        json={"acao": "aprovar", "observacao": "Conferido"},
        headers=token("gestor"),
    )
    assert aprovacao.status_code == 200
    assert aprovacao.json()["codigo"].startswith("DOC-")


async def test_envio_externo_recusa_arquivo_perigoso(client, token, pasta_saude):
    criada = await client.post(
        f"{API}/solicitacoes-externas",
        json={"titulo": "Documentos", "pasta_destino_id": pasta_saude["id"]},
        headers=token("gestor"),
    )
    token_publico = _token_da_url(criada.json()["url"])

    # Extensão bloqueada é barrada já na validação, antes mesmo do antivírus.
    envio = await client.post(
        f"{API}/publico/envio/{token_publico}",
        data={"nome": "Anônimo", "email": "a@b.com"},
        files={"arquivo": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")},
    )
    assert envio.status_code == 422
    assert "bloqueado" in envio.json()["mensagem"]

    # Conteúdo malicioso com extensão permitida é barrado pelo antivírus.
    eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    envio_av = await client.post(
        f"{API}/publico/envio/{token_publico}",
        data={"nome": "Anônimo", "email": "a@b.com"},
        files={"arquivo": ("nota.txt", eicar, "text/plain")},
    )
    assert envio_av.status_code == 422
    assert "verificação de segurança" in envio_av.json()["mensagem"]


async def test_envio_externo_apos_prazo(client, token, pasta_saude):
    passado = datetime.now(timezone.utc) - timedelta(days=1)
    criada = await client.post(
        f"{API}/solicitacoes-externas",
        json={
            "titulo": "Prestação de contas",
            "pasta_destino_id": pasta_saude["id"],
            "prazo": passado.isoformat(),
        },
        headers=token("gestor"),
    )
    token_publico = _token_da_url(criada.json()["url"])
    resposta = await client.get(f"{API}/publico/envio/{token_publico}")
    assert resposta.status_code == 410
    assert "prazo" in resposta.json()["mensagem"].lower()
