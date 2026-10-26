"""Fase 6 — programas, linhas de cuidado, inscrições, programação e busca ativa.

Cobre o motor genérico (B.2-001…015): elegibilidade parametrizável, formulários
versionados, geração idempotente de programação, previsto × realizado,
remarcação, perda, busca ativa, indicadores e estimativa de demanda. Inclui
negativos de tenant, RBAC, escopo de estabelecimento e validação de dados.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.models.cidadao import CidadaoCondicao
from tests.conftest import gerar_cpf


def _hoje_iso(dias: int = 0) -> str:
    return (date.today() + timedelta(days=dias)).isoformat()


async def _programa(client, token, **extra) -> dict:
    corpo = {
        "codigo": f"PROG_{uuid.uuid4().hex[:8].upper()}",
        "nome": "Programa de teste",
        "tipo": "PROGRAMA",
        "linha_cuidado": "TESTE",
        "criterios_elegibilidade": {},
        "itens": [
            {
                "tipo": "CONSULTA",
                "descricao": "Consulta programada",
                "periodicidade_dias": 30,
            }
        ],
    }
    corpo.update(extra)
    resposta = await client.post(
        "/api/govsaude/v1/programas", json=corpo, headers=token("admin")
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _cidadao(
    client,
    token,
    *,
    nome: str = "Cidadão de Teste",
    sexo: str = "NAO_INFORMADO",
    nascimento: str = "1990-05-10",
    cpf: str | None = None,
) -> dict:
    corpo = {"nome": nome, "sexo": sexo, "data_nascimento": nascimento}
    if cpf:
        corpo["cpf"] = cpf
    resposta = await client.post(
        "/api/govsaude/v1/cidadaos", json=corpo, headers=token("admin")
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _inscricao(
    client,
    token,
    *,
    programa_id,
    cidadao_id,
    estabelecimento_id,
    **extra,
) -> dict:
    resposta = await client.post(
        "/api/govsaude/v1/inscricoes-programa",
        json={
            "programa_id": str(programa_id),
            "cidadao_id": str(cidadao_id),
            "estabelecimento_id": str(estabelecimento_id),
            "data_entrada": _hoje_iso(),
            **extra,
        },
        headers=token("admin"),
    )
    return resposta


async def _ativar(client, token, programa: dict) -> dict:
    resposta = await client.patch(
        f"/api/govsaude/v1/programas/{programa['id']}",
        json={"ativo": True},
        headers={**token("admin"), "If-Match": f'"{programa["versao"]}"'},
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def test_seeds_dos_cinco_modelos_e_linhas_de_cuidado(client, token):
    resposta = await client.get(
        "/api/govsaude/v1/programas?limite=100", headers=token("admin")
    )
    assert resposta.status_code == 200, resposta.text
    itens = resposta.json()["itens"]
    codigos = {item["codigo"] for item in itens}
    assert {
        "SAUDE_MULHER",
        "SAUDE_CRIANCA",
        "HIPERTENSAO",
        "DIABETES",
        "GESTANTE",
    } <= codigos
    for item in itens:
        assert item["origem"] == "SEED_A_VALIDAR"
        assert "A_VALIDAR" in (item["descricao"] or "")
        # Regra clínica oficial não vem de memória: o seed nasce inativo e sem
        # periodicidade, faixa etária ou condição até o tenant validar.
        assert item["ativo"] is False
        assert item["periodicidade_padrao_dias"] is None
        criterios = item["criterios_elegibilidade"]
        assert criterios["idade_min_anos"] is None and criterios["idade_max_anos"] is None
        assert criterios["condicoes"] == []
        assert all(i["periodicidade_dias"] is None for i in item["itens"])
    linhas = await client.get(
        "/api/govsaude/v1/programas/linhas-cuidado", headers=token("admin")
    )
    assert linhas.status_code == 200, linhas.text
    assert linhas.json() == []
    crianca = next(i for i in itens if i["codigo"] == "SAUDE_CRIANCA")
    await _ativar(client, token, crianca)
    linhas = await client.get(
        "/api/govsaude/v1/programas/linhas-cuidado", headers=token("admin")
    )
    assert {"SAUDE_CRIANCA"} == {item["linha_cuidado"] for item in linhas.json()}
    formularios = await client.get(
        "/api/govsaude/v1/formularios", headers=token("admin")
    )
    assert formularios.status_code == 200, formularios.text
    assert "SAUDE_CRIANCA_DADOS" in {item["codigo"] for item in formularios.json()}


async def test_crud_programa_versao_if_match_e_isolamento_tenant(client, token):
    programa = await _programa(client, token)
    assert len(programa["itens"]) == 1

    duplicado = await client.post(
        "/api/govsaude/v1/programas",
        json={
            "codigo": programa["codigo"],
            "nome": "Duplicado",
            "tipo": "PROGRAMA",
        },
        headers=token("admin"),
    )
    assert duplicado.status_code == 409

    sem_if_match = await client.patch(
        f"/api/govsaude/v1/programas/{programa['id']}",
        json={"nome": "Novo nome"},
        headers=token("admin"),
    )
    assert sem_if_match.status_code == 428

    atualizado = await client.patch(
        f"/api/govsaude/v1/programas/{programa['id']}",
        json={"nome": "Novo nome"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert atualizado.status_code == 200, atualizado.text
    assert atualizado.json()["nome"] == "Novo nome"
    assert atualizado.json()["versao"] == 2

    nova = await client.post(
        f"/api/govsaude/v1/programas/{programa['id']}/nova-versao",
        json={
            "versao_programa": "2",
            "vigencia_inicio": _hoje_iso(),
            "justificativa": "Atualização do protocolo interno",
        },
        headers=token("admin"),
    )
    assert nova.status_code == 201, nova.text
    assert nova.json()["versao_programa"] == "2"
    assert nova.json()["itens"]

    outro_tenant = await client.get(
        f"/api/govsaude/v1/programas?codigo={programa['codigo']}",
        headers=token("admin_b"),
    )
    assert outro_tenant.status_code == 200
    assert outro_tenant.json()["itens"] == []

    oculto = await client.get(
        f"/api/govsaude/v1/programas/{programa['id']}", headers=token("admin_b")
    )
    assert oculto.status_code == 404


async def test_elegibilidade_excecao_duplicidade_e_encerramento(
    client, token, db, mundo
):
    programa = await _programa(
        client,
        token,
        criterios_elegibilidade={
            "sexos": ["FEMININO"],
            "idade_min_anos": 18,
            "idade_max_anos": 40,
            "condicoes": [{"tipo_codigo": "CID10", "codigo": "I10"}],
            "exigir_condicao": True,
        },
    )
    cidadao = await _cidadao(
        client, token, nome="João Teste", sexo="MASCULINO", nascimento="1990-01-01"
    )
    avaliacao = await client.get(
        f"/api/govsaude/v1/programas/{programa['id']}/elegibilidade",
        params={"cidadao_id": cidadao["id"]},
        headers=token("admin"),
    )
    assert avaliacao.status_code == 200, avaliacao.text
    assert avaliacao.json()["elegivel"] is False
    assert avaliacao.json()["motivos"]

    barrada = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
    )
    assert barrada.status_code == 422, barrada.text
    assert barrada.json()["codigo"] == "elegibilidade_nao_atendida"
    assert barrada.json()["motivos"]

    aceita = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
        justificativa_excecao="Avaliação clínica individual justifica a inclusão.",
    )
    assert aceita.status_code == 201, aceita.text
    inscricao = aceita.json()
    assert inscricao["excecao_justificada"] is True
    assert inscricao["situacao"] == "ATIVA"

    duplicada = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
        justificativa_excecao="Nova tentativa com justificativa.",
    )
    assert duplicada.status_code == 409
    assert duplicada.json()["codigo"] == "inscricao_duplicada"

    encerrada = await client.post(
        f"/api/govsaude/v1/inscricoes-programa/{inscricao['id']}/encerrar",
        json={"motivo_saida": "Alta do acompanhamento", "data_saida": _hoje_iso()},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert encerrada.status_code == 200, encerrada.text
    assert encerrada.json()["situacao"] == "ENCERRADA"
    assert encerrada.json()["motivo_saida"] == "Alta do acompanhamento"

    reingresso = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
        justificativa_excecao="Reingresso após alta, com justificativa clínica.",
    )
    assert reingresso.status_code == 201, reingresso.text


async def test_formulario_versionado_e_validacao_dados_clinicos(
    client, token, db, mundo
):
    programas = await client.get(
        "/api/govsaude/v1/programas?codigo=SAUDE_CRIANCA", headers=token("admin")
    )
    programa = programas.json()["itens"][0]
    await _ativar(client, token, programa)
    cidadao = await _cidadao(
        client,
        token,
        nome="Criança Teste",
        sexo="FEMININO",
        nascimento=_hoje_iso(-5 * 365),
    )
    invalida = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
        dados_clinicos={"peso_kg": -1},
    )
    assert invalida.status_code == 422, invalida.text
    assert invalida.json()["codigo"] == "dados_clinicos_invalidos"

    extra = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
        dados_clinicos={"campo_nao_previsto": True},
    )
    assert extra.status_code == 422, extra.text

    valida = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
        dados_clinicos={"peso_kg": 18.5, "vacinacao_em_dia": True},
    )
    assert valida.status_code == 201, valida.text
    assert valida.json()["dados_clinicos"]["peso_kg"] == 18.5

    formulario = await client.post(
        "/api/govsaude/v1/formularios",
        json={
            "codigo": "FORM_TESTE",
            "nome": "Formulário de teste",
            "schema_json": {
                "type": "object",
                "additionalProperties": False,
                "required": ["resposta"],
                "properties": {
                    "resposta": {
                        "type": "string",
                        "enum": ["SIM", "NAO"],
                        "maxLength": 3,
                    }
                },
            },
        },
        headers=token("admin"),
    )
    assert formulario.status_code == 201, formulario.text

    resposta_invalida = await client.post(
        "/api/govsaude/v1/formularios/FORM_TESTE/respostas",
        json={
            "entidade": "programa_inscricao",
            "entidade_id": valida.json()["id"],
            "resposta": {"resposta": "TALVEZ"},
        },
        headers=token("admin"),
    )
    assert resposta_invalida.status_code == 422, resposta_invalida.text

    resposta_valida = await client.post(
        "/api/govsaude/v1/formularios/FORM_TESTE/respostas",
        json={
            "entidade": "programa_inscricao",
            "entidade_id": valida.json()["id"],
            "resposta": {"resposta": "SIM"},
        },
        headers=token("admin"),
    )
    assert resposta_valida.status_code == 201, resposta_valida.text
    assert resposta_valida.json()["versao_formulario"] == 1

    respostas = await client.get(
        "/api/govsaude/v1/formularios/FORM_TESTE/respostas",
        params={
            "entidade": "programa_inscricao",
            "entidade_id": valida.json()["id"],
        },
        headers=token("admin"),
    )
    assert respostas.status_code == 200, respostas.text
    assert len(respostas.json()) == 1


async def test_geracao_idempotente_realizacao_remarcacao_e_perda(
    client, token, db, mundo
):
    programa = await _programa(client, token)
    cidadao = await _cidadao(client, token)
    inscricao = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
    )
    assert inscricao.status_code == 201, inscricao.text
    inscricao = inscricao.json()

    primeira = await client.post(
        f"/api/govsaude/v1/inscricoes-programa/{inscricao['id']}/gerar-programacoes",
        json={"horizonte_dias": 90, "data_base": _hoje_iso()},
        headers=token("admin"),
    )
    assert primeira.status_code == 200, primeira.text
    assert primeira.json()["criadas"] == 3

    segunda = await client.post(
        f"/api/govsaude/v1/inscricoes-programa/{inscricao['id']}/gerar-programacoes",
        json={"horizonte_dias": 90, "data_base": _hoje_iso()},
        headers=token("admin"),
    )
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["criadas"] == 0
    assert segunda.json()["existentes"] == 3

    listadas = await client.get(
        "/api/govsaude/v1/programacoes-programa",
        params={"inscricao_id": inscricao["id"]},
        headers=token("admin"),
    )
    assert listadas.status_code == 200, listadas.text
    programacoes = sorted(
        listadas.json()["itens"], key=lambda item: item["previsto_para"]
    )
    assert len(programacoes) == 3

    realizada = await client.post(
        f"/api/govsaude/v1/programacoes-programa/{programacoes[0]['id']}/realizar",
        json={"realizado_em": _hoje_iso()},
        headers=token("admin"),
    )
    assert realizada.status_code == 200, realizada.text
    assert realizada.json()["situacao"] == "REALIZADO"

    remarcada = await client.post(
        f"/api/govsaude/v1/programacoes-programa/{programacoes[1]['id']}/remarcar",
        json={"nova_data": _hoje_iso(45), "motivo": "Feriado municipal"},
        headers=token("admin"),
    )
    assert remarcada.status_code == 200, remarcada.text
    assert remarcada.json()["remarcado_de_id"] == programacoes[1]["id"]
    assert remarcada.json()["situacao"] == "PREVISTO"

    antigas = await client.get(
        f"/api/govsaude/v1/programacoes-programa/{programacoes[1]['id']}",
        headers=token("admin"),
    )
    assert antigas.json()["situacao"] == "REMARCADO"

    perdida = await client.post(
        f"/api/govsaude/v1/programacoes-programa/{programacoes[2]['id']}/perder",
        json={"motivo": "Cidadão não compareceu", "criar_busca_ativa": True},
        headers=token("admin"),
    )
    assert perdida.status_code == 200, perdida.text
    assert perdida.json()["situacao"] == "PERDIDO"

    buscas = await client.get(
        "/api/govsaude/v1/buscas-ativas",
        params={"inscricao_id": inscricao["id"]},
        headers=token("admin"),
    )
    assert buscas.status_code == 200, buscas.text
    assert len(buscas.json()["itens"]) == 1
    assert buscas.json()["itens"][0]["situacao"] == "PENDENTE"


async def test_busca_ativa_rbac_lista_nominal_e_pendencias(client, token, db, mundo):
    programa = await _programa(client, token)
    cidadao = await _cidadao(
        client, token, nome="Maria Busca Ativa", cpf=gerar_cpf()
    )
    inscricao = await _inscricao(
        client,
        token,
        programa_id=programa["id"],
        cidadao_id=cidadao["id"],
        estabelecimento_id=mundo["estab_a"].id,
    )
    assert inscricao.status_code == 201, inscricao.text
    inscricao = inscricao.json()
    item = programa["itens"][0]
    atrasada = await client.post(
        "/api/govsaude/v1/programacoes-programa",
        json={
            "inscricao_id": inscricao["id"],
            "item_id": item["id"],
            "previsto_para": _hoje_iso(-10),
        },
        headers=token("admin"),
    )
    assert atrasada.status_code == 201, atrasada.text

    pendencias = await client.get(
        "/api/govsaude/v1/buscas-ativas/pendencias",
        params={"programa_id": programa["id"]},
        headers=token("acs"),
    )
    assert pendencias.status_code == 200, pendencias.text
    assert len(pendencias.json()) == 1
    assert pendencias.json()[0]["atraso_dias"] >= 10
    assert pendencias.json()[0]["cpf_mascarado"].startswith("***")

    criada = await client.post(
        "/api/govsaude/v1/buscas-ativas",
        json={
            "inscricao_id": inscricao["id"],
            "programacao_id": atrasada.json()["id"],
            "motivo": "ATRASO",
            "situacao": "CONTATADO",
            "tentativa": 1,
            "desfecho": "Contato telefônico realizado",
        },
        headers=token("acs"),
    )
    assert criada.status_code == 201, criada.text

    lista = await client.get(
        "/api/govsaude/v1/buscas-ativas",
        params={"inscricao_id": inscricao["id"]},
        headers=token("acs"),
    )
    assert lista.status_code == 200, lista.text
    assert len(lista.json()["itens"]) == 1

    recepcao = await client.post(
        "/api/govsaude/v1/buscas-ativas",
        json={"inscricao_id": inscricao["id"], "motivo": "ATRASO"},
        headers=token("recepcao"),
    )
    assert recepcao.status_code == 403

    nominal = await client.get(
        f"/api/govsaude/v1/programas/{programa['id']}/lista-nominal",
        headers=token("acs"),
    )
    assert nominal.status_code == 200, nominal.text
    assert nominal.json()["itens"]
    assert nominal.json()["itens"][0]["cpf_mascarado"].startswith("***")


async def test_estimativa_demanda_resumo_e_escopo(client, token, db, mundo):
    programa = await _programa(client, token)
    for indice in range(2):
        cidadao = await _cidadao(client, token, nome=f"Pessoa {indice}")
        inscricao = await _inscricao(
            client,
            token,
            programa_id=programa["id"],
            cidadao_id=cidadao["id"],
            estabelecimento_id=mundo["estab_a"].id,
        )
        assert inscricao.status_code == 201, inscricao.text

    estimativa = await client.get(
        f"/api/govsaude/v1/programas/{programa['id']}/estimativa-demanda",
        params={"horizonte_meses": 3},
        headers=token("admin"),
    )
    assert estimativa.status_code == 200, estimativa.text
    dados = estimativa.json()
    assert dados["total_estimado"] == 6
    assert dados["itens"][0]["memoria_calculo"]["formula"]
    assert dados["itens"][0]["inscritos_ativos"] == 2

    resumo = await client.get(
        f"/api/govsaude/v1/programas/{programa['id']}/resumo",
        headers=token("admin"),
    )
    assert resumo.status_code == 200, resumo.text
    assert resumo.json()["inscricoes_ativas"] == 2
    assert resumo.json()["itens"][0]["item_id"] == programa["itens"][0]["id"]

    # Recepção tem leitura de programa, mas não gerencia.
    negado = await client.post(
        "/api/govsaude/v1/programas",
        json={"codigo": "NEGADO", "nome": "Negado", "tipo": "PROGRAMA"},
        headers=token("recepcao"),
    )
    assert negado.status_code == 403

    # Escopo: recepção lotada na UBS A não lê inscrição criada na UBS B.
    inscricao_b = await client.post(
        "/api/govsaude/v1/inscricoes-programa",
        json={
            "programa_id": programa["id"],
            "cidadao_id": (await _cidadao(client, token, nome="Pessoa B"))["id"],
            "estabelecimento_id": str(mundo["estab_b"].id),
            "data_entrada": _hoje_iso(),
        },
        headers=token("admin"),
    )
    assert inscricao_b.status_code == 201, inscricao_b.text
    fora_escopo = await client.get(
        f"/api/govsaude/v1/inscricoes-programa/{inscricao_b.json()['id']}",
        headers=token("recepcao"),
    )
    assert fora_escopo.status_code == 403


async def test_condicao_ativa_torna_elegivel(client, token, db, mundo):
    programa = await _programa(
        client,
        token,
        criterios_elegibilidade={
            "sexos": None,
            "idade_min_anos": 18,
            "condicoes": [{"tipo_codigo": "CID10", "codigo": "I10"}],
            "exigir_condicao": True,
        },
    )
    cidadao = await _cidadao(client, token, nome="Hipertenso Teste")
    db.add(
        CidadaoCondicao(
            tenant_id=mundo["org_a"].id,
            cidadao_id=uuid.UUID(cidadao["id"]),
            tipo_codigo="CID10",
            codigo="I10",
            situacao="ATIVA",
            versao=1,
        )
    )
    await db.commit()
    avaliacao = await client.get(
        f"/api/govsaude/v1/programas/{programa['id']}/elegibilidade",
        params={"cidadao_id": cidadao["id"]},
        headers=token("admin"),
    )
    assert avaliacao.status_code == 200, avaliacao.text
    assert avaliacao.json()["elegivel"] is True
