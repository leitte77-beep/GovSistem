"""Central de documentos: validação, versionamento, árvore e download."""

import pytest

BASE = "/api/govtask/demandas"

PDF = b"%PDF-1.4\nconteudo do oficio\n%%EOF"
PDF_V2 = b"%PDF-1.4\nconteudo do oficio corrigido\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


async def _demanda(client, headers, **campos):
    payload = {"titulo": "Aquisição de veículo"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _enviar(client, headers, demanda_id, nome="oficio.pdf", conteudo=PDF, **campos):
    resp = await client.post(
        f"{BASE}/{demanda_id}/documentos",
        files={"arquivo": (nome, conteudo, "application/pdf")},
        data={k: str(v) for k, v in campos.items()},
        headers=headers,
    )
    return resp


@pytest.mark.asyncio
async def test_envio_grava_hash_pasta_e_primeira_versao(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])

    resp = await _enviar(
        client, t["headers"], d["id"], pasta="02 Ofícios", descricao="Ofício 015/2026"
    )
    assert resp.status_code == 201, resp.text
    doc = resp.json()
    assert doc["versao"] == 1
    assert doc["versao_atual"] is True
    assert doc["pasta"] == "02 Ofícios"
    assert doc["mime_type"] == "application/pdf"
    assert len(doc["hash_sha256"]) == 64
    assert doc["enviado_por"]["id"] == str(t["user"].id)


@pytest.mark.asyncio
async def test_arquivo_disfarcado_e_recusado(client, make_tenant, catalogo_padrao):
    """§103 — o tipo é conferido pelos bytes, não pela extensão."""
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])

    resp = await _enviar(
        client, t["headers"], d["id"], nome="relatorio.pdf", conteudo=b"MZ\x90\x00 executavel"
    )
    assert resp.status_code == 422
    assert "não corresponde à extensão" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_extensao_perigosa_e_recusada(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    resp = await _enviar(
        client, t["headers"], d["id"], nome="payload.sh", conteudo=b"#!/bin/sh\nrm -rf /"
    )
    assert resp.status_code == 422
    assert "não permitida" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_nome_com_travessia_de_caminho_e_neutralizado(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    resp = await _enviar(
        client, t["headers"], d["id"], nome="../../../etc/cron.d/backdoor.pdf"
    )
    assert resp.status_code == 201
    assert "/" not in resp.json()["nome_arquivo"]
    assert ".." not in resp.json()["nome_arquivo"]


@pytest.mark.asyncio
async def test_arquivo_vazio_e_recusado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    resp = await _enviar(client, t["headers"], d["id"], conteudo=b"")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_nova_versao_nao_substitui_a_anterior(client, make_tenant, catalogo_padrao):
    """§31 — v1 continua consultável depois da v2."""
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    v1 = (await _enviar(client, t["headers"], d["id"], pasta="02 Ofícios")).json()

    v2 = await _enviar(
        client, t["headers"], d["id"], nome="oficio-assinado.pdf", conteudo=PDF_V2,
        substituir_grupo_id=v1["documento_grupo_id"], motivo_versao="Versão assinada",
    )
    assert v2.status_code == 201
    corpo = v2.json()
    assert corpo["versao"] == 2
    assert corpo["versao_atual"] is True
    assert corpo["documento_grupo_id"] == v1["documento_grupo_id"]
    assert corpo["motivo_versao"] == "Versão assinada"
    # Metadados seguem o documento, não o arquivo.
    assert corpo["pasta"] == "02 Ofícios"

    versoes = await client.get(
        f"{BASE}/{d['id']}/documentos/{v1['documento_grupo_id']}/versoes",
        headers=t["headers"],
    )
    assert [v["versao"] for v in versoes.json()] == [1, 2]
    assert [v["versao_atual"] for v in versoes.json()] == [False, True]
    assert versoes.json()[0]["hash_sha256"] != versoes.json()[1]["hash_sha256"]


@pytest.mark.asyncio
async def test_reenviar_arquivo_identico_e_recusado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    v1 = (await _enviar(client, t["headers"], d["id"])).json()

    repetido = await _enviar(
        client, t["headers"], d["id"], substituir_grupo_id=v1["documento_grupo_id"]
    )
    assert repetido.status_code == 409
    assert "idêntico" in repetido.json()["detail"]


@pytest.mark.asyncio
async def test_arvore_agrupa_por_pasta_e_oculta_versoes_antigas(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    v1 = (await _enviar(client, t["headers"], d["id"], pasta="02 Ofícios")).json()
    await _enviar(
        client, t["headers"], d["id"], conteudo=PDF_V2,
        substituir_grupo_id=v1["documento_grupo_id"],
    )
    await _enviar(
        client, t["headers"], d["id"], nome="certidao.pdf",
        conteudo=b"%PDF-1.4 certidao", pasta="03 Certidões",
    )

    arvore = (await client.get(f"{BASE}/{d['id']}/documentos", headers=t["headers"])).json()
    assert arvore["total"] == 2  # só as versões vigentes
    por_pasta = {p["pasta"]: p["quantidade"] for p in arvore["pastas"]}
    assert por_pasta["02 Ofícios"] == 1
    assert por_pasta["03 Certidões"] == 1
    assert por_pasta["01 Formalização"] == 0  # pasta padrão aparece vazia
    assert "10 Prestação de contas" in arvore["pastas_sugeridas"]

    completa = (
        await client.get(
            f"{BASE}/{d['id']}/documentos?incluir_versoes=true", headers=t["headers"]
        )
    ).json()
    assert completa["total"] == 3


@pytest.mark.asyncio
async def test_download_entrega_o_arquivo_e_audita(client, make_tenant, catalogo_padrao, _db):
    from sqlalchemy import select

    from app.models import Auditoria

    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    doc = (await _enviar(client, t["headers"], d["id"], nome="Ofício 015/2026.pdf")).json()

    resp = await client.get(
        f"{BASE}/{d['id']}/documentos/{doc['id']}/download", headers=t["headers"]
    )
    assert resp.status_code == 200
    assert resp.content == PDF
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.headers["cache-control"] == "private, no-store"

    registros = (
        await _db.execute(select(Auditoria).where(Auditoria.acao == "DOWNLOAD"))
    ).scalars().all()
    assert len(registros) == 1
    assert registros[0].entidade == "anexo"


@pytest.mark.asyncio
async def test_documento_sigiloso_nao_aparece_para_quem_nao_responde(
    client, make_tenant, catalogo_padrao
):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("ENGENHEIRO_TECNICO", org=dono["org"])
    d = await _demanda(client, dono["headers"])
    doc = (
        await _enviar(client, dono["headers"], d["id"], classificacao="SIGILOSO")
    ).json()

    arvore = (
        await client.get(f"{BASE}/{d['id']}/documentos", headers=colega["headers"])
    ).json()
    assert arvore["total"] == 0
    baixar = await client.get(
        f"{BASE}/{d['id']}/documentos/{doc['id']}/download", headers=colega["headers"]
    )
    assert baixar.status_code == 404

    # Para o responsável pela demanda, continua visível.
    assert (
        await client.get(f"{BASE}/{d['id']}/documentos", headers=dono["headers"])
    ).json()["total"] == 1


@pytest.mark.asyncio
async def test_remocao_e_logica_e_devolve_a_versao_anterior(
    client, make_tenant, catalogo_padrao
):
    """§105 — remover a v2 faz a v1 voltar a valer; nada é apagado de fato."""
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    v1 = (await _enviar(client, t["headers"], d["id"])).json()
    v2 = (
        await _enviar(
            client, t["headers"], d["id"], conteudo=PDF_V2,
            substituir_grupo_id=v1["documento_grupo_id"],
        )
    ).json()

    resp = await client.request(
        "DELETE",
        f"{BASE}/{d['id']}/documentos/{v2['id']}",
        json={"motivo": "Versão enviada por engano"},
        headers=t["headers"],
    )
    assert resp.status_code == 204

    versoes = (
        await client.get(
            f"{BASE}/{d['id']}/documentos/{v1['documento_grupo_id']}/versoes",
            headers=t["headers"],
        )
    ).json()
    assert [v["versao"] for v in versoes] == [1]
    assert versoes[0]["versao_atual"] is True

    timeline = (
        await client.get(f"{BASE}/{d['id']}/timeline", headers=t["headers"])
    ).json()["items"]
    assert any("removido" in e["descricao"] for e in timeline)
    assert any(e["tipo_evento"] == "DOCUMENTO_VERSIONADO" for e in timeline)


@pytest.mark.asyncio
async def test_documento_satisfaz_exigencia_da_etapa(client, make_tenant, workflows_padrao):
    """§32 — a etapa destrava quando os documentos exigidos chegam."""
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    etapas = (
        await client.post(
            f"{BASE}/{d['id']}/aplicar-fluxo",
            json={"workflow_id": str(workflows_padrao["EMENDA_PARLAMENTAR"].id)},
            headers=t["headers"],
        )
    ).json()
    documental = next(e for e in etapas if e["nome"] == "Documentação")
    assert documental["documentos_faltantes"] == ["Plano de trabalho", "Certidões"]

    await _enviar(client, t["headers"], d["id"], nome="pt.pdf", descricao="Plano de trabalho")
    await _enviar(
        client, t["headers"], d["id"], nome="cnd.pdf",
        conteudo=b"%PDF-1.4 cnd", pasta="03 Certidões",
    )

    etapas = (await client.get(f"{BASE}/{d['id']}/etapas", headers=t["headers"])).json()
    documental = next(e for e in etapas if e["nome"] == "Documentação")
    assert documental["documentos_faltantes"] == []


@pytest.mark.asyncio
async def test_documento_de_outro_municipio_e_inalcancavel(
    client, make_tenant, catalogo_padrao
):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    d = await _demanda(client, a["headers"])
    doc = (await _enviar(client, a["headers"], d["id"])).json()

    assert (
        await client.get(f"{BASE}/{d['id']}/documentos", headers=b["headers"])
    ).status_code == 404
    assert (
        await client.get(
            f"{BASE}/{d['id']}/documentos/{doc['id']}/download", headers=b["headers"]
        )
    ).status_code == 404
    enviado = await _enviar(client, b["headers"], d["id"])
    assert enviado.status_code == 404


@pytest.mark.asyncio
async def test_demanda_concluida_nao_recebe_documento(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{d['id']}/concluir",
        json={"resultado": "Veículo recebido", "forcar": True},
        headers=t["headers"],
    )
    resp = await _enviar(client, t["headers"], d["id"])
    assert resp.status_code == 409
