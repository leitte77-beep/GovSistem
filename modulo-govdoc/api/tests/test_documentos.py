"""Documentos: upload, versionamento, duplicidade, download e lixeira."""

import json

from tests.conftest import arquivo_pdf

API = "/api/govdoc/v1"


async def enviar(client, headers, pasta_id, nome="contrato.pdf", conteudo=None, **campos):
    dados = {"pasta_id": str(pasta_id)}
    dados.update({k: str(v) for k, v in campos.items()})
    return await client.post(
        f"{API}/documentos/upload",
        data=dados,
        files={"arquivo": (nome, conteudo or arquivo_pdf(), "application/pdf")},
        headers=headers,
    )


async def test_upload_cria_documento_e_versao(client, token, pasta_saude):
    resposta = await enviar(client, token("colaborador"), pasta_saude["id"])
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert corpo["documento"]["codigo"].startswith("DOC-")
    assert corpo["documento"]["versao_atual"] == 1
    assert corpo["documento"]["situacao_arquivo"] == "available"
    assert corpo["versao"]["numero"] == 1
    assert corpo["documento"]["sha256"]


async def test_upload_com_metadados(client, token, pasta_saude):
    metadados = json.dumps(
        {
            "nome_exibicao": "Contrato 2026/001",
            "numero_contrato": "001/2026",
            "ano_referencia": 2026,
            "data_validade": "2026-12-31",
            "etiquetas": ["contrato", "vigente"],
        }
    )
    resposta = await enviar(
        client, token("colaborador"), pasta_saude["id"], metadados=metadados
    )
    assert resposta.status_code == 201
    documento = resposta.json()["documento"]
    assert documento["nome_exibicao"] == "Contrato 2026/001"
    assert documento["numero_contrato"] == "001/2026"

    detalhe = await client.get(
        f"{API}/documentos/{documento['id']}", headers=token("colaborador")
    )
    assert set(detalhe.json()["etiquetas"]) == {"contrato", "vigente"}


async def test_leitor_nao_envia_documento(client, token, pasta_saude):
    resposta = await enviar(client, token("leitor"), pasta_saude["id"])
    assert resposta.status_code == 403


async def test_arquivo_invalido_recusado(client, token, pasta_saude):
    resposta = await enviar(
        client,
        token("colaborador"),
        pasta_saude["id"],
        nome="script.exe",
        conteudo=b"MZ\x90\x00",
    )
    assert resposta.status_code == 422
    assert "bloqueado" in resposta.json()["mensagem"]


async def test_duplicidade_detectada(client, token, pasta_saude):
    await enviar(client, token("colaborador"), pasta_saude["id"])
    resposta = await enviar(client, token("colaborador"), pasta_saude["id"])
    assert resposta.status_code == 201
    duplicado = resposta.json()["duplicado"]
    assert duplicado is not None
    assert duplicado["acesso_permitido"] is True
    assert duplicado["mensagem"] == "Foi localizado um arquivo idêntico no sistema."
    assert "nova_versao" in duplicado["opcoes"]


async def test_duplicidade_nao_revela_documento_sem_acesso(client, token, pasta_saude, mundo):
    """Quem não pode ver o documento original só recebe o aviso, sem dados."""
    await enviar(client, token("colaborador"), pasta_saude["id"])

    pasta_educacao = (
        await client.post(
            f"{API}/pastas",
            json={
                "nome": "Educação — Contratos",
                "secretaria_id": str(mundo["educacao"].id),
                "setor_id": str(mundo["adm_educacao"].id),
            },
            headers=token("admin"),
        )
    ).json()

    resposta = await enviar(client, token("externo"), pasta_educacao["id"])
    duplicado = resposta.json()["duplicado"]
    assert duplicado["acesso_permitido"] is False
    assert duplicado["documento_id"] is None
    assert duplicado["nome"] is None


async def test_nova_versao_preserva_anterior(client, token, pasta_saude):
    documento = (await enviar(client, token("colaborador"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.post(
        f"{API}/documentos/{documento['id']}/versoes",
        data={"descricao": "Correção da cláusula 5"},
        files={
            "arquivo": ("contrato-v2.pdf", arquivo_pdf("Versão dois"), "application/pdf")
        },
        headers=token("colaborador"),
    )
    assert resposta.status_code == 201
    assert resposta.json()["documento"]["versao_atual"] == 2

    versoes = await client.get(
        f"{API}/documentos/{documento['id']}/versoes", headers=token("colaborador")
    )
    numeros = [v["numero"] for v in versoes.json()]
    assert numeros == [2, 1]

    antiga = await client.get(
        f"{API}/documentos/{documento['id']}/versoes/1/download",
        headers=token("colaborador"),
    )
    assert antiga.status_code == 200
    assert antiga.content == arquivo_pdf()


async def test_nova_versao_de_documento_aprovado_volta_para_aprovacao(
    client, token, pasta_saude
):
    documento = (await enviar(client, token("colaborador"), pasta_saude["id"])).json()[
        "documento"
    ]
    assert documento["situacao"] == "aprovado"
    resposta = await client.post(
        f"{API}/documentos/{documento['id']}/versoes",
        files={"arquivo": ("v2.pdf", arquivo_pdf("dois"), "application/pdf")},
        headers=token("colaborador"),
    )
    assert resposta.json()["documento"]["situacao"] == "aguardando_aprovacao"


async def test_restaurar_versao_cria_nova_versao(client, token, pasta_saude):
    documento = (await enviar(client, token("colaborador"), pasta_saude["id"])).json()[
        "documento"
    ]
    await client.post(
        f"{API}/documentos/{documento['id']}/versoes",
        files={"arquivo": ("v2.pdf", arquivo_pdf("segunda"), "application/pdf")},
        headers=token("colaborador"),
    )
    resposta = await client.post(
        f"{API}/documentos/{documento['id']}/versoes/restaurar",
        json={"numero": 1},
        headers=token("colaborador"),
    )
    assert resposta.status_code == 200
    assert resposta.json()["versao"]["numero"] == 3
    assert resposta.json()["versao"]["restaurada_de"] == 1

    versoes = (
        await client.get(
            f"{API}/documentos/{documento['id']}/versoes", headers=token("colaborador")
        )
    ).json()
    assert len(versoes) == 3  # a versão 2 continua disponível


async def test_download_registra_auditoria(client, token, pasta_saude):
    documento = (await enviar(client, token("colaborador"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.get(
        f"{API}/documentos/{documento['id']}/download", headers=token("colaborador")
    )
    assert resposta.status_code == 200
    assert resposta.content == arquivo_pdf()

    historico = await client.get(
        f"{API}/documentos/{documento['id']}/historico", headers=token("gestor")
    )
    acoes = [item["acao"] for item in historico.json()["itens"]]
    assert "document_download" in acoes
    assert "document_upload" in acoes


async def test_usuario_sem_permissao_nao_baixa(client, token, pasta_saude):
    documento = (await enviar(client, token("colaborador"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.get(
        f"{API}/documentos/{documento['id']}/download", headers=token("externo")
    )
    assert resposta.status_code == 403
    assert "permissão" in resposta.json()["mensagem"]


async def test_lixeira_e_restauracao(client, token, pasta_saude):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.request(
        "DELETE",
        f"{API}/documentos/{documento['id']}",
        json={"motivo": "Enviado por engano"},
        headers=token("gestor"),
    )
    assert resposta.status_code == 200

    assert (
        await client.get(
            f"{API}/documentos/{documento['id']}", headers=token("gestor")
        )
    ).status_code == 404

    lixeira = await client.get(f"{API}/lixeira", headers=token("gestor"))
    assert any(item["id"] == documento["id"] for item in lixeira.json()["itens"])

    restaurar = await client.post(
        f"{API}/lixeira/documentos/{documento['id']}/restaurar",
        json={},
        headers=token("gestor"),
    )
    assert restaurar.status_code == 200
    assert (
        await client.get(f"{API}/documentos/{documento['id']}", headers=token("gestor"))
    ).status_code == 200


async def test_exclusao_definitiva_exige_confirmacao_e_perfil(client, token, pasta_saude):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    await client.request(
        "DELETE",
        f"{API}/documentos/{documento['id']}",
        json={},
        headers=token("gestor"),
    )

    sem_confirmacao = await client.delete(
        f"{API}/lixeira/documentos/{documento['id']}", headers=token("admin")
    )
    assert sem_confirmacao.status_code == 400

    negado = await client.delete(
        f"{API}/lixeira/documentos/{documento['id']}?confirmar=true",
        headers=token("colaborador"),
    )
    assert negado.status_code == 403

    ok = await client.delete(
        f"{API}/lixeira/documentos/{documento['id']}?confirmar=true",
        headers=token("admin"),
    )
    assert ok.status_code == 200


async def test_bloqueio_legal_impede_exclusao(client, token, pasta_saude):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    await client.put(
        f"{API}/documentos/{documento['id']}",
        json={"bloqueio_legal": True},
        headers=token("gestor"),
    )
    resposta = await client.request(
        "DELETE",
        f"{API}/documentos/{documento['id']}",
        json={},
        headers=token("gestor"),
    )
    assert resposta.status_code == 409
    assert "bloqueio legal" in resposta.json()["mensagem"]


async def test_controle_de_concorrencia(client, token, pasta_saude):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.put(
        f"{API}/documentos/{documento['id']}",
        json={"descricao": "nova", "versao_controle": 99},
        headers=token("gestor"),
    )
    assert resposta.status_code == 409
    assert "alterado por outro usuário" in resposta.json()["mensagem"]


async def test_bloqueio_de_edicao_por_outro_usuario(client, token, pasta_saude):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    bloqueio = await client.post(
        f"{API}/documentos/{documento['id']}/bloqueio",
        json={"motivo": "Revisão"},
        headers=token("gestor"),
    )
    assert bloqueio.status_code == 200

    resposta = await client.put(
        f"{API}/documentos/{documento['id']}",
        json={"descricao": "tentativa"},
        headers=token("colaborador"),
    )
    assert resposta.status_code == 409
    assert "está sendo editado" in resposta.json()["mensagem"]


async def test_pesquisa_respeita_permissao(client, token, pasta_saude, mundo):
    await enviar(
        client,
        token("colaborador"),
        pasta_saude["id"],
        metadados=json.dumps({"nome_exibicao": "Contrato sigiloso da Saúde"}),
    )
    visivel = await client.get(
        f"{API}/documentos?termo=Contrato", headers=token("colaborador")
    )
    assert visivel.json()["total"] == 1

    invisivel = await client.get(
        f"{API}/documentos?termo=Contrato", headers=token("externo")
    )
    assert invisivel.json()["total"] == 0

    auditor = await client.get(f"{API}/documentos?termo=Contrato", headers=token("auditor"))
    assert auditor.json()["total"] == 1


async def test_mover_e_copiar_documento(client, token, pasta_saude, mundo):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    destino = (
        await client.post(
            f"{API}/pastas",
            json={
                "nome": "Arquivados",
                "secretaria_id": str(mundo["saude"].id),
                "setor_id": str(mundo["adm_saude"].id),
            },
            headers=token("admin"),
        )
    ).json()

    copia = await client.post(
        f"{API}/documentos/{documento['id']}/copiar",
        json={"pasta_destino_id": destino["id"]},
        headers=token("gestor"),
    )
    assert copia.status_code == 200
    assert copia.json()["pasta_id"] == destino["id"]
    assert copia.json()["codigo"] != documento["codigo"]

    mover = await client.post(
        f"{API}/documentos/{documento['id']}/mover",
        json={"pasta_destino_id": destino["id"]},
        headers=token("gestor"),
    )
    assert mover.status_code == 200
    assert mover.json()["pasta_id"] == destino["id"]


async def test_integridade_do_arquivo(client, token, pasta_saude):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.get(
        f"{API}/documentos/{documento['id']}/integridade", headers=token("gestor")
    )
    assert resposta.status_code == 200
    assert resposta.json()["integro"] is True


async def test_comentario_e_notificacao(client, token, pasta_saude, mundo):
    documento = (await enviar(client, token("colaborador"), pasta_saude["id"])).json()[
        "documento"
    ]
    resposta = await client.post(
        f"{API}/documentos/{documento['id']}/comentarios",
        json={
            "texto": "Favor conferir a cláusula 3.",
            "mencionados": [str(mundo["usuarios"]["gestor"].id)],
        },
        headers=token("colaborador"),
    )
    assert resposta.status_code == 201

    notificacoes = await client.get(f"{API}/notificacoes", headers=token("gestor"))
    assert notificacoes.json()["nao_lidas"] >= 1
