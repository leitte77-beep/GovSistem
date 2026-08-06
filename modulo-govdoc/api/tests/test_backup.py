"""Backup: execução real, verificação de integridade e restauração."""

import json
import os

from sqlalchemy import select

from app.models.document import Document
from tests.conftest import arquivo_pdf
from tests.test_documentos import enviar

API = "/api/govdoc/v1"


async def _agendamento(client, token, destino):
    return await client.post(
        f"{API}/backups/agendamentos",
        json={
            "nome": "Backup de teste",
            "tipo": "full",
            "destino": destino,
            "agendamento_cron": "0 2 * * *",
        },
        headers=token("admin"),
    )


async def test_backup_gera_arquivos_reais(client, token, pasta_saude, tmp_path):
    await enviar(client, token("gestor"), pasta_saude["id"])
    destino = str(tmp_path / "backups")

    job = await _agendamento(client, token, destino)
    assert job.status_code == 201

    execucao = await client.post(
        f"{API}/backups/agendamentos/{job.json()['id']}/executar",
        json={},
        headers=token("admin"),
    )
    assert execucao.status_code == 200, execucao.text
    corpo = execucao.json()["execucao"]
    assert corpo["situacao"] in {"concluido", "concluido_com_alerta"}
    assert corpo["total_arquivos"] == 1
    assert corpo["manifesto_sha256"]

    pasta = corpo["destino"]
    assert os.path.isdir(pasta)
    assert os.path.exists(os.path.join(pasta, "manifest.json"))
    assert os.path.exists(os.path.join(pasta, "metadata.json"))
    assert os.path.exists(os.path.join(pasta, "database.json"))

    with open(os.path.join(pasta, "manifest.json"), encoding="utf-8") as fh:
        manifesto = json.load(fh)
    assert manifesto["modulo"] == "govdoc"
    assert manifesto["total_arquivos"] == 1
    assert all(item["sha256"] for item in manifesto["itens"])


async def test_verificacao_confirma_integridade(client, token, pasta_saude, tmp_path):
    await enviar(client, token("gestor"), pasta_saude["id"])
    job = await _agendamento(client, token, str(tmp_path / "backups"))
    execucao = (
        await client.post(
            f"{API}/backups/agendamentos/{job.json()['id']}/executar",
            json={},
            headers=token("admin"),
        )
    ).json()["execucao"]

    verificacao = await client.post(
        f"{API}/backups/execucoes/{execucao['id']}/verificar", headers=token("admin")
    )
    assert verificacao.status_code == 200
    assert verificacao.json()["valido"] is True
    assert verificacao.json()["verificacao"]["falhas"] == 0


async def test_verificacao_detecta_arquivo_corrompido(client, token, pasta_saude, tmp_path):
    await enviar(client, token("gestor"), pasta_saude["id"])
    job = await _agendamento(client, token, str(tmp_path / "backups"))
    execucao = (
        await client.post(
            f"{API}/backups/agendamentos/{job.json()['id']}/executar",
            json={},
            headers=token("admin"),
        )
    ).json()["execucao"]

    # Corrompe um arquivo dentro do backup.
    pasta_arquivos = os.path.join(execucao["destino"], "files")
    versao = os.listdir(pasta_arquivos)[0]
    alvo = os.path.join(pasta_arquivos, versao, "conteudo.bin")
    with open(alvo, "wb") as fh:
        fh.write(b"conteudo adulterado")

    verificacao = await client.post(
        f"{API}/backups/execucoes/{execucao['id']}/verificar", headers=token("admin")
    )
    assert verificacao.json()["valido"] is False
    assert verificacao.json()["verificacao"]["falhas"] >= 1


async def test_restauracao_recria_documento_excluido(
    client, token, pasta_saude, tmp_path, db
):
    documento = (await enviar(client, token("gestor"), pasta_saude["id"])).json()[
        "documento"
    ]
    job = await _agendamento(client, token, str(tmp_path / "backups"))
    execucao = (
        await client.post(
            f"{API}/backups/agendamentos/{job.json()['id']}/executar",
            json={},
            headers=token("admin"),
        )
    ).json()["execucao"]

    # Exclusão definitiva do documento.
    await client.request(
        "DELETE", f"{API}/documentos/{documento['id']}", json={}, headers=token("admin")
    )
    await client.delete(
        f"{API}/lixeira/documentos/{documento['id']}?confirmar=true", headers=token("admin")
    )
    assert (
        await client.get(f"{API}/documentos/{documento['id']}", headers=token("admin"))
    ).status_code == 404

    plano = await client.post(
        f"{API}/backups/execucoes/{execucao['id']}/plano-restauracao",
        json={"escopo": "completo", "estrategia_conflito": "nova_versao"},
        headers=token("admin"),
    )
    assert plano.status_code == 200
    assert plano.json()["plano"]["novos"] == 1

    restauracao = await client.post(
        f"{API}/backups/execucoes/{execucao['id']}/restaurar",
        json={
            "escopo": "completo",
            "estrategia_conflito": "nova_versao",
            "confirmar": True,
            "gerar_ponto_seguranca": False,
        },
        headers=token("admin"),
    )
    assert restauracao.status_code == 200
    assert restauracao.json()["situacao"] == "concluido"
    assert restauracao.json()["total_restaurado"] == 1

    restaurado = await client.get(
        f"{API}/documentos/{documento['id']}", headers=token("admin")
    )
    assert restaurado.status_code == 200

    conteudo = await client.get(
        f"{API}/documentos/{documento['id']}/download", headers=token("admin")
    )
    assert conteudo.content == arquivo_pdf()


async def test_restauracao_exige_confirmacao(client, token, pasta_saude, tmp_path):
    job = await _agendamento(client, token, str(tmp_path / "backups"))
    execucao = (
        await client.post(
            f"{API}/backups/agendamentos/{job.json()['id']}/executar",
            json={},
            headers=token("admin"),
        )
    ).json()["execucao"]

    resposta = await client.post(
        f"{API}/backups/execucoes/{execucao['id']}/restaurar",
        json={"escopo": "completo", "confirmar": False},
        headers=token("admin"),
    )
    assert resposta.status_code == 400


async def test_backup_sem_destino_avisa(client, token):
    resposta = await client.post(
        f"{API}/backups/agendamentos",
        json={"nome": "Sem destino", "destino": " ", "tipo": "full"},
        headers=token("admin"),
    )
    job_id = resposta.json()["id"]
    execucao = await client.post(
        f"{API}/backups/agendamentos/{job_id}/executar", json={}, headers=token("admin")
    )
    corpo = execucao.json()["execucao"]
    # Sem destino válido a execução falha com mensagem clara, não em silêncio.
    assert corpo["situacao"] in {"falhou", "concluido_com_alerta"}


async def test_painel_de_backup(client, token, pasta_saude, tmp_path):
    job = await _agendamento(client, token, str(tmp_path / "backups"))
    await client.post(
        f"{API}/backups/agendamentos/{job.json()['id']}/executar",
        json={},
        headers=token("admin"),
    )
    painel = await client.get(f"{API}/backups/painel", headers=token("admin"))
    assert painel.status_code == 200
    corpo = painel.json()
    assert corpo["indicador"] in {"verde", "amarelo"}
    assert corpo["ultimo_backup"] is not None
    assert len(corpo["agendamentos"]) == 1


async def test_apenas_admin_geral_acessa_backup(client, token):
    resposta = await client.get(f"{API}/backups/painel", headers=token("gestor"))
    assert resposta.status_code == 403


async def test_tarefas_automaticas_sao_idempotentes(client, token, pasta_saude):
    primeira = await client.post(
        f"{API}/backups/tarefas/executar?tarefa=alertas_vencimento", headers=token("admin")
    )
    assert primeira.status_code == 200
    segunda = await client.post(
        f"{API}/backups/tarefas/executar?tarefa=alertas_vencimento", headers=token("admin")
    )
    assert segunda.status_code == 200
