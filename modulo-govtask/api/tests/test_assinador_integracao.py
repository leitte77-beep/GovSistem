"""Acionamento do assinador digital (§78).

O GovTask chama o serviço de assinatura e recebe o PDF assinado. Aqui o
assinador é substituído por um dublê — o que se testa é o contrato: sem
configuração responde 503, documento não-PDF é recusado, e o sucesso cria uma
nova versão do grupo com a evidência registrada.
"""

import base64
import hashlib

import pytest

from app.services import assinador

BASE = "/api/govtask/demandas"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PDF_ASSINADO = b"%PDF-1.4\n% assinado digitalmente\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


async def _criar_demanda(client, headers):
    resp = await client.post(BASE, json={"titulo": "Ofício para assinatura"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _upload(client, headers, demanda_id, nome, conteudo, mime):
    resp = await client.post(
        f"{BASE}/{demanda_id}/documentos",
        data={"tipo_documento": "OFICIO", "categoria": "OUTROS", "classificacao": "INTERNO"},
        files={"arquivo": (nome, conteudo, mime)},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _solicitar(client, headers, demanda_id, grupo_id):
    resp = await client.post(
        f"{BASE}/{demanda_id}/documentos/{grupo_id}/assinatura/solicitar",
        json={},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_assinatura_desconfigurada_responde_503(
    client, make_tenant, catalogo_padrao, monkeypatch
):
    monkeypatch.setattr(assinador.settings, "SIGNER_ENABLED", False)
    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    doc = await _upload(client, t["headers"], demanda["id"], "oficio.pdf", PDF, "application/pdf")
    await _solicitar(client, t["headers"], demanda["id"], doc["documento_grupo_id"])

    resp = await client.post(
        f"{BASE}/{demanda['id']}/documentos/{doc['documento_grupo_id']}/assinatura/assinar",
        headers=t["headers"],
    )
    assert resp.status_code == 503, resp.text
    assert "não configurada" in resp.text.lower() or "não configurada" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_assinar_exige_pdf(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    doc = await _upload(client, t["headers"], demanda["id"], "imagem.png", PNG, "image/png")
    await _solicitar(client, t["headers"], demanda["id"], doc["documento_grupo_id"])

    resp = await client.post(
        f"{BASE}/{demanda['id']}/documentos/{doc['documento_grupo_id']}/assinatura/assinar",
        headers=t["headers"],
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_assinar_cria_nova_versao_e_registra_evidencia(
    client, make_tenant, catalogo_padrao, monkeypatch
):
    async def falso_assinador(pdf_bytes, *, referencia, reason=None, location="", visible=False):
        assert pdf_bytes == PDF
        assert referencia.startswith("govtask:")
        return {
            "signed_pdf_base64": base64.b64encode(PDF_ASSINADO).decode("ascii"),
            "sha256_signed": hashlib.sha256(PDF_ASSINADO).hexdigest(),
            "sha256_original": hashlib.sha256(PDF).hexdigest(),
            "certificate_subject": "CN=Prefeitura Teste",
            "certificate_serial": "ABC123",
            "verification_code": "VERIF-001",
        }

    monkeypatch.setattr(assinador, "assinar_pdf", falso_assinador)

    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    doc = await _upload(client, t["headers"], demanda["id"], "oficio.pdf", PDF, "application/pdf")
    grupo = doc["documento_grupo_id"]
    await _solicitar(client, t["headers"], demanda["id"], grupo)

    resp = await client.post(
        f"{BASE}/{demanda['id']}/documentos/{grupo}/assinatura/assinar",
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["status"] == "ASSINADO"
    assert corpo["hash_assinado"] == hashlib.sha256(PDF_ASSINADO).hexdigest()
    assert corpo["referencia_externa"] == "VERIF-001"
    assert corpo["provedor"] == "icp-brasil-a1"

    versoes = await client.get(
        f"{BASE}/{demanda['id']}/documentos/{grupo}/versoes", headers=t["headers"]
    )
    assert versoes.status_code == 200, versoes.text
    assert len(versoes.json()) == 2  # original + assinada


@pytest.mark.asyncio
async def test_sem_solicitacao_nao_assina(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    doc = await _upload(client, t["headers"], demanda["id"], "oficio.pdf", PDF, "application/pdf")

    resp = await client.post(
        f"{BASE}/{demanda['id']}/documentos/{doc['documento_grupo_id']}/assinatura/assinar",
        headers=t["headers"],
    )
    assert resp.status_code == 409, resp.text
