"""Testes de arquivos (upload/download/remoção) e validações (item 40)."""

import pytest

from tests.conftest import arquivo_pdf

pytestmark = pytest.mark.asyncio


async def test_upload_e_download(client, token, pessoa):
    resposta = await client.post(
        "/api/govinfra/v1/arquivos",
        data={
            "entidade": "pessoa",
            "entidade_id": pessoa["id"],
            "categoria": "documento",
            "observacao": "Comprovante de residência",
        },
        files={"arquivo": ("comprovante.pdf", arquivo_pdf(), "application/pdf")},
        headers=token("atendente"),
    )
    assert resposta.status_code == 201, resposta.text
    arquivo = resposta.json()
    assert arquivo["nome"] == "comprovante.pdf"
    assert arquivo["e_imagem"] is False

    lista = await client.get(
        "/api/govinfra/v1/arquivos",
        params={"entidade": "pessoa", "entidade_id": pessoa["id"]},
        headers=token("consulta"),
    )
    assert lista.status_code == 200
    assert len(lista.json()) == 1

    baixa = await client.get(
        f"/api/govinfra/v1/arquivos/{arquivo['id']}/download", headers=token("consulta")
    )
    assert baixa.status_code == 200
    assert baixa.content.startswith(b"%PDF")


async def test_upload_extensao_bloqueada(client, token, pessoa):
    resposta = await client.post(
        "/api/govinfra/v1/arquivos",
        data={"entidade": "pessoa", "entidade_id": pessoa["id"], "categoria": "documento"},
        files={"arquivo": ("virus.exe", b"MZ\x90\x00", "application/octet-stream")},
        headers=token("atendente"),
    )
    assert resposta.status_code == 422
    assert "extensao" in resposta.json()["erro"]


async def test_upload_conteudo_suspeito(client, token, pessoa):
    """Extensão inocente mas conteúdo executável é recusado pela assinatura."""
    resposta = await client.post(
        "/api/govinfra/v1/arquivos",
        data={"entidade": "pessoa", "entidade_id": pessoa["id"], "categoria": "documento"},
        files={"arquivo": ("foto.jpg", b"\x7fELFfake", "image/jpeg")},
        headers=token("atendente"),
    )
    assert resposta.status_code == 422
    assert "conteudo_suspeito" in resposta.json()["erro"]


async def test_remover_arquivo_exclusao_logica(client, token, pessoa):
    criado = await client.post(
        "/api/govinfra/v1/arquivos",
        data={"entidade": "pessoa", "entidade_id": pessoa["id"], "categoria": "documento"},
        files={"arquivo": ("doc.pdf", arquivo_pdf(), "application/pdf")},
        headers=token("atendente"),
    )
    arquivo = criado.json()

    removido = await client.delete(
        f"/api/govinfra/v1/arquivos/{arquivo['id']}",
        params={"motivo": "Enviado por engano"},
        headers=token("gestor"),
    )
    assert removido.status_code == 200

    lista = await client.get(
        "/api/govinfra/v1/arquivos",
        params={"entidade": "pessoa", "entidade_id": pessoa["id"]},
        headers=token("consulta"),
    )
    assert len(lista.json()) == 0


async def test_upload_sem_permissao(client, token, pessoa):
    resposta = await client.post(
        "/api/govinfra/v1/arquivos",
        data={"entidade": "pessoa", "entidade_id": pessoa["id"], "categoria": "documento"},
        files={"arquivo": ("doc.pdf", arquivo_pdf(), "application/pdf")},
        headers=token("consulta"),
    )
    assert resposta.status_code == 403
