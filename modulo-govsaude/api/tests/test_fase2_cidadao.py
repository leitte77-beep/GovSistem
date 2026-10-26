"""Fase 2 — cadastro único do cidadão, deduplicação, unificação e CADSUS."""

from __future__ import annotations

import json
import uuid

from sqlalchemy import select

from app.models.auditoria import AuditTrail

CPF = "52998224725"
CPF_OUTRO = "11144477735"
CNS = "799639810752073"


async def _criar(client, token, **extra):
    corpo = {
        "nome": "José da Silva",
        "cpf": CPF,
        "cns": CNS,
        "data_nascimento": "1990-01-01",
        "sexo": "MASCULINO",
        "nome_mae": "Maria da Silva",
    }
    corpo.update(extra)
    resposta = await client.post("/api/govsaude/v1/cidadaos", json=corpo, headers=token("admin"))
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def test_b1_001_cidadao_crud_busca_baixa_e_auditoria(client, db, mundo, token):
    criado = await _criar(client, token)
    assert criado["nome_exibicao"] == "José da Silva"
    assert criado["cpf_mascarado"] == "***.***.***-25"
    assert criado["cns_mascarado"] == "*** *** *** 2073"
    assert CPF not in json.dumps(criado)
    assert CNS not in json.dumps(criado)

    detalhe = await client.get(
        f"/api/govsaude/v1/cidadaos/{criado['id']}", headers=token("admin")
    )
    assert detalhe.status_code == 200
    assert detalhe.headers["etag"] == '"1"'

    atualizado = await client.patch(
        f"/api/govsaude/v1/cidadaos/{criado['id']}",
        json={"escolaridade": "Ensino médio"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert atualizado.status_code == 200, atualizado.text
    assert atualizado.json()["versao"] == 2

    por_cpf = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": CPF},
        headers=token("admin"),
    )
    assert por_cpf.status_code == 200, por_cpf.text
    assert por_cpf.json()["itens"][0]["id"] == criado["id"]
    assert por_cpf.json()["itens"][0]["score"] == 100
    assert por_cpf.json()["itens"][0]["motivo_match"] == "CPF"

    por_nome = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": "Jose da Silva"},
        headers=token("admin"),
    )
    assert por_nome.status_code == 200
    assert criado["id"] in [item["id"] for item in por_nome.json()["itens"]]

    baixado = await client.post(
        f"/api/govsaude/v1/cidadaos/{criado['id']}/baixar",
        json={"motivo": "Cadastro duplicado em revisão administrativa."},
        headers=token("admin"),
    )
    assert baixado.status_code == 200, baixado.text
    assert baixado.json()["ativo"] is False
    assert (
        await client.get(f"/api/govsaude/v1/cidadaos/{criado['id']}", headers=token("admin"))
    ).status_code == 404

    reativado = await client.post(
        f"/api/govsaude/v1/cidadaos/{criado['id']}/reativar",
        json={"motivo": "Revisão concluída e cadastro mantido."},
        headers=token("admin"),
    )
    assert reativado.status_code == 200, reativado.text
    assert reativado.json()["ativo"] is True

    historico = await client.get(
        f"/api/govsaude/v1/cidadaos/{criado['id']}/baixas", headers=token("admin")
    )
    assert historico.status_code == 200
    assert {item["tipo"] for item in historico.json()} == {"BAIXA", "REATIVACAO"}

    eventos = (
        await db.execute(
            select(AuditTrail).where(
                AuditTrail.recurso == "cidadao",
                AuditTrail.recurso_id == uuid.UUID(criado["id"]),
            )
        )
    ).scalars().all()
    assert {"CRIAR", "ATUALIZAR", "BAIXAR"} <= {evento.acao for evento in eventos}


async def test_b1_001_cidadao_cross_tenant_404(client, mundo, token):
    criado = await _criar(client, token)
    resposta = await client.get(
        f"/api/govsaude/v1/cidadaos/{criado['id']}", headers=token("admin_b")
    )
    assert resposta.status_code == 404
    assert resposta.headers["content-type"].startswith("application/problem+json")


async def test_b12_009_nome_social_precedencia_e_busca(client, token):
    criado = await _criar(
        client,
        token,
        nome="Maria Silva",
        nome_social="Joana Souza",
        cpf=CPF_OUTRO,
        cns=None,
        nome_mae="Antônia Silva",
    )
    assert criado["nome_exibicao"] == "Joana Souza"
    busca_social = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": "Joana Souza"},
        headers=token("admin"),
    )
    assert busca_social.status_code == 200
    assert criado["id"] in [item["id"] for item in busca_social.json()["itens"]]
    busca_civil = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": "Maria Silva"},
        headers=token("admin"),
    )
    assert criado["id"] in [item["id"] for item in busca_civil.json()["itens"]]


async def test_b1_004_documentos_contatos_enderecos_planos_alergias_condicoes(
    client, mundo, token
):
    cidadao = await _criar(client, token)
    base = f"/api/govsaude/v1/cidadaos/{cidadao['id']}"
    documentos = await client.post(
        f"{base}/documentos",
        json={"tipo": "RG", "numero": "1234567", "orgao_emissor": "SSP", "uf_emissor": "PR"},
        headers=token("admin"),
    )
    assert documentos.status_code == 201, documentos.text
    assert documentos.json()["numero_mascarado"] == "***4567"
    contato = await client.post(
        f"{base}/contatos",
        json={"tipo": "TELEFONE", "valor": "41999998888", "principal": True},
        headers=token("admin"),
    )
    assert contato.status_code == 201, contato.text
    assert contato.json()["valor_mascarado"] == "***8888"
    endereco = await client.post(
        f"{base}/enderecos",
        json={
            "cep": "80000000",
            "logradouro": "Rua das Flores",
            "numero": "10",
            "municipio_ibge": "4106902",
            "uf": "PR",
            "principal": True,
        },
        headers=token("admin"),
    )
    assert endereco.status_code == 201, endereco.text
    plano = await client.post(
        f"{base}/planos",
        json={
            "operadora": "Operadora Teste",
            "plano": "Plano Essencial",
            "numero_carteira": "99887766",
            "principal": True,
            "vigencia_inicio": "2026-01-01",
        },
        headers=token("admin"),
    )
    assert plano.status_code == 201, plano.text
    assert plano.json()["numero_carteira_mascarado"] == "***7766"
    alergia = await client.post(
        f"{base}/alergias",
        json={"substancia": "Dipirona", "gravidade": "ALTA", "reacao": "Urticária"},
        headers=token("admin"),
    )
    assert alergia.status_code == 201, alergia.text
    condicao = await client.post(
        f"{base}/condicoes",
        json={"tipo_codigo": "CID10", "codigo": "I10", "descricao": "Hipertensão"},
        headers=token("admin"),
    )
    assert condicao.status_code == 201, condicao.text

    for recurso in ("documentos", "contatos", "enderecos", "planos", "alergias", "condicoes"):
        resposta = await client.get(f"{base}/{recurso}", headers=token("admin"))
        assert resposta.status_code == 200, (recurso, resposta.text)
        assert len(resposta.json()) == 1

    # Recepção não lê documentos (permissão específica).
    negado = await client.get(f"{base}/documentos", headers=token("recepcao"))
    assert negado.status_code == 403

    baixado = await client.post(
        f"{base}/documentos/{documentos.json()['id']}/baixar",
        json={"motivo": "Documento substituído por versão atualizada."},
        headers=token("admin"),
    )
    assert baixado.status_code == 200
    assert baixado.json()["ativo"] is False


async def test_b1_002_e_b12_011_foto_politica_e_magic_number(client, token):
    cidadao = await _criar(client, token)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
    upload = await client.post(
        f"/api/govsaude/v1/cidadaos/{cidadao['id']}/fotos",
        files={"arquivo": ("foto.png", png, "image/png")},
        data={"principal": "true"},
        headers=token("admin"),
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["principal"] is True
    assert upload.json()["status_antivirus"] == "NAO_APLICAVEL"
    foto_id = upload.json()["id"]

    conteudo = await client.get(
        f"/api/govsaude/v1/cidadaos/{cidadao['id']}/fotos/{foto_id}/conteudo",
        headers=token("admin"),
    )
    assert conteudo.status_code == 200
    assert conteudo.content == png

    invalida = await client.post(
        f"/api/govsaude/v1/cidadaos/{cidadao['id']}/fotos",
        files={"arquivo": ("falsa.png", b"\xff\xd8\xff\xe0" + b"\x00" * 20, "image/png")},
        headers=token("admin"),
    )
    assert invalida.status_code == 422

    desabilitado = await client.put(
        "/api/govsaude/v1/configuracoes/cidadao.uso_foto",
        json={"valor": {"valor": {"permitir": False, "obrigatoria": False}}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert desabilitado.status_code == 200, desabilitado.text
    bloqueada = await client.post(
        f"/api/govsaude/v1/cidadaos/{cidadao['id']}/fotos",
        files={"arquivo": ("foto.png", png, "image/png")},
        headers=token("admin"),
    )
    assert bloqueada.status_code == 403


async def test_b1_008_plano_saude_vinculo_basico(client, token):
    cidadao = await _criar(client, token)
    plano = await client.post(
        f"/api/govsaude/v1/cidadaos/{cidadao['id']}/planos",
        json={
            "operadora": "Operadora Teste",
            "numero_carteira": "123456789",
            "tipo": "SAUDE_SUPLEMENTAR",
            "vigencia_inicio": "2026-01-01",
        },
        headers=token("admin"),
    )
    assert plano.status_code == 201, plano.text
    assert plano.json()["numero_carteira_mascarado"] == "***6789"


async def test_b1_009_recem_nascido_a_partir_da_mae(client, token):
    mae = await _criar(
        client,
        token,
        nome="Ana Paula Souza",
        nome_social=None,
        cpf=CPF_OUTRO,
        cns=None,
        nome_mae="Rosa Souza",
    )
    bebe = await client.post(
        f"/api/govsaude/v1/cidadaos/{mae['id']}/recem-nascido",
        json={
            "nome": "Bebê de Ana",
            "data_nascimento": "2026-10-20",
            "sexo": "NAO_INFORMADO",
        },
        headers=token("admin"),
    )
    assert bebe.status_code == 201, bebe.text
    assert bebe.json()["mae_id"] == mae["id"]
    assert bebe.json()["nome_mae"] == "Ana Paula Souza"


async def test_b12_001_deduplicacao_configuravel_e_b12_002_decisao_humana(
    client, token
):
    primeiro = await _criar(
        client,
        token,
        nome="João Souza",
        cpf=None,
        cns=None,
        nome_mae="Maria Souza",
    )
    segundo = await _criar(
        client,
        token,
        nome="Joao Sousa",
        cpf=None,
        cns=None,
        nome_mae="Maria Sousa",
    )
    duplicidades = await client.get(
        f"/api/govsaude/v1/cidadaos/{primeiro['id']}/duplicidades",
        headers=token("admin"),
    )
    assert duplicidades.status_code == 200, duplicidades.text
    assert duplicidades.json(), "Deveria detectar duplicidade"
    item = duplicidades.json()[0]
    assert item["pontuacao"] >= 60
    assert item["candidato"]["id"] == segundo["id"]

    decisao = await client.post(
        f"/api/govsaude/v1/cidadaos/duplicidades/{item['id']}/decidir",
        json={
            "decisao": "MESMO",
            "justificativa": "Confirmado pelo cadastro com documentos conferidos.",
        },
        headers=token("admin"),
    )
    assert decisao.status_code == 200, decisao.text
    assert decisao.json()["status"] == "MESMO"

    # Limiar configurável: com 101, um novo par semelhante não é sugerido.
    alterado = await client.put(
        "/api/govsaude/v1/configuracoes/cidadao.duplicidade_limiar",
        json={"valor": {"valor": 101}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert alterado.status_code == 200, alterado.text
    terceiro = await _criar(
        client,
        token,
        nome="Joao Sousa",
        cpf=None,
        cns=None,
        nome_mae="Maria Sousa",
    )
    sem_sugestao = await client.get(
        f"/api/govsaude/v1/cidadaos/{terceiro['id']}/duplicidades",
        headers=token("admin"),
    )
    assert sem_sugestao.status_code == 200
    assert sem_sugestao.json() == []


async def test_b1_007_e_b12_003_unificacao_e_reversao_preservam_historico(
    client, db, token
):
    origem = await _criar(
        client,
        token,
        nome="Carlos Pereira",
        cpf=None,
        cns=None,
        nome_mae="Helena Pereira",
    )
    destino = await _criar(
        client,
        token,
        nome="Carlos Pereyra",
        cpf=None,
        cns=None,
        nome_mae="Helena Pereyra",
    )
    unificado = await client.post(
        f"/api/govsaude/v1/cidadaos/{origem['id']}/unificar",
        json={
            "destino_id": destino["id"],
            "campos": {"nome": "ORIGEM"},
            "justificativa": "Unificação aprovada após conferência de documentos.",
        },
        headers=token("admin"),
    )
    assert unificado.status_code == 200, unificado.text
    unificacao = unificado.json()
    assert unificacao["status"] == "ATIVA"

    origem_pos = await client.get(
        f"/api/govsaude/v1/cidadaos/{origem['id']}", headers=token("admin")
    )
    assert origem_pos.json()["unificado_para_id"] == destino["id"]
    destino_pos = await client.get(
        f"/api/govsaude/v1/cidadaos/{destino['id']}", headers=token("admin")
    )
    assert destino_pos.json()["nome"] == "Carlos Pereira"

    revertida = await client.post(
        f"/api/govsaude/v1/cidadaos/unificacoes/{unificacao['id']}/reverter",
        json={"justificativa": "Reversão solicitada pelo gestor após nova conferência."},
        headers=token("admin"),
    )
    assert revertida.status_code == 200, revertida.text
    assert revertida.json()["status"] == "REVERTIDA"

    origem_depois = await client.get(
        f"/api/govsaude/v1/cidadaos/{origem['id']}", headers=token("admin")
    )
    assert origem_depois.json()["unificado_para_id"] is None
    destino_depois = await client.get(
        f"/api/govsaude/v1/cidadaos/{destino['id']}", headers=token("admin")
    )
    assert destino_depois.json()["nome"] == "Carlos Pereyra"

    eventos = (
        await db.execute(
            select(AuditTrail).where(AuditTrail.recurso == "cidadao_unificacao")
        )
    ).scalars().all()
    assert eventos


async def test_b12_004_e_b12_010_cadsus_pendente_e_compatibilizacao_local(client, token):
    cidadao = await _criar(client, token)
    resposta = await client.post(
        "/api/govsaude/v1/cidadaos/consulta-cadsus",
        json={"cpf": CPF},
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["status"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
    assert corpo["encontrado_local"] is True
    assert corpo["cidadao_id"] == cidadao["id"]
    assert corpo["cpf_mascarado"].endswith("25")

    sem_documento = await client.post(
        "/api/govsaude/v1/cidadaos/consulta-cadsus", json={}, headers=token("admin")
    )
    assert sem_documento.status_code == 422


async def test_b12_005_busca_fonetica_e_compatibilizacao_cpf_cns(client, token):
    criado = await _criar(
        client,
        token,
        nome="Luiz Sousa",
        cpf=CPF,
        cns=CNS,
        nome_mae="Tereza Sousa",
    )
    fonetica = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": "Luis Souza"},
        headers=token("admin"),
    )
    assert fonetica.status_code == 200
    assert criado["id"] in [item["id"] for item in fonetica.json()["itens"]]

    por_cns = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": CNS},
        headers=token("admin"),
    )
    assert por_cns.json()["itens"][0]["motivo_match"] == "CNS"

    duplicado = await client.post(
        "/api/govsaude/v1/cidadaos",
        json={
            "nome": "Outro Cidadão",
            "cpf": CPF,
            "data_nascimento": "1980-01-01",
            "sexo": "MASCULINO",
        },
        headers=token("admin"),
    )
    assert duplicado.status_code == 409
    assert duplicado.json()["codigo"] == "cpf_duplicado"


async def test_b12_010_conflito_cpf_cns_entre_cidadaos(client, token):
    primeiro = await _criar(client, token)
    segundo = await _criar(
        client,
        token,
        nome="Outra Pessoa",
        cpf=CPF_OUTRO,
        cns="129542537630793",
        nome_mae="Outra Mãe",
    )
    resposta = await client.post(
        "/api/govsaude/v1/cidadaos/consulta-cadsus",
        json={"cpf": CPF, "cns": "129542537630793"},
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["status"] == "CONFLITO_CPF_CNS"
    assert resposta.json()["encontrado_local"] is False
    assert resposta.json()["cidadao_id"] is None
    assert primeiro["id"] != segundo["id"]


async def test_b1_006_compatibilizacao_cpf_cns(client, token):
    criado = await _criar(client, token)
    por_cpf = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": CPF},
        headers=token("admin"),
    )
    por_cns = await client.post(
        "/api/govsaude/v1/cidadaos/busca",
        json={"termo": CNS},
        headers=token("admin"),
    )
    assert por_cpf.json()["itens"][0]["id"] == criado["id"]
    assert por_cns.json()["itens"][0]["id"] == criado["id"]
    assert por_cns.json()["itens"][0]["motivo_match"] == "CNS"


async def test_b12_008_documentos_protegidos_e_rbac(client, token):
    criado = await _criar(client, token)
    documento = await client.post(
        f"/api/govsaude/v1/cidadaos/{criado['id']}/documentos",
        json={"tipo": "CPF", "numero": CPF},
        headers=token("admin"),
    )
    assert documento.status_code == 201, documento.text
    assert documento.json()["numero_mascarado"] == "***.***.***-25"
    assert CPF not in json.dumps(documento.json())
    negado = await client.get(
        f"/api/govsaude/v1/cidadaos/{criado['id']}/documentos", headers=token("recepcao")
    )
    assert negado.status_code == 403
    negado_criar = await client.post(
        f"/api/govsaude/v1/cidadaos/{criado['id']}/documentos",
        json={"tipo": "RG", "numero": "7654321"},
        headers=token("recepcao"),
    )
    assert negado_criar.status_code == 403


async def test_consulta_cep_pendente_sem_base_oficial(client, token):
    resposta = await client.post(
        "/api/govsaude/v1/cidadaos/consulta-cep",
        json={"cep": "80000000"},
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["status"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
