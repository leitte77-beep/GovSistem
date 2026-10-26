"""Fase 1 — rede de atenção, cadastros-base, escalas, prioridades e CNES."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.models.auditoria import AuditTrail
from app.models.nucleo import Especialidade, Estabelecimento, VinculoProfissional
from app.models.rede import ImportacaoCNES, RestricaoHorarioAcesso
from app.models.referencia import SigtapProcedimento
from app.services.autenticacao import obter_usuario
from app.services.restricoes import acesso_bloqueado

CPF_A = "52998224725"
CPF_B = "11144477735"


async def _criar_profissional(
    client,
    token,
    mundo,
    cpf: str = CPF_A,
    nome: str = "Ana Silva",
    inicio: str | None = None,
    estabelecimento_id: str | None = None,
):
    corpo = {
        "nome": nome,
        "cpf": cpf,
        "cbo": "225125",
        "email": "ana@teste.local",
        "telefone": "41999990000",
        "estabelecimento_id": estabelecimento_id or str(mundo["estab_a"].id),
    }
    if inicio:
        corpo["vigencia_inicio"] = inicio
    resposta = await client.post(
        "/api/govsaude/v1/profissionais",
        json=corpo,
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _criar_vinculo(
    client,
    token,
    mundo,
    profissional_id: str,
    *,
    inicio: str,
    carga: int = 40,
    estabelecimento_id: str | None = None,
):
    resposta = await client.post(
        f"/api/govsaude/v1/profissionais/{profissional_id}/vinculos",
        json={
            "estabelecimento_id": estabelecimento_id or str(mundo["estab_a"].id),
            "cbo": "225125",
            "carga_horaria_semanal": carga,
            "vigencia_inicio": inicio,
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def test_b12_006_estabelecimento_cross_tenant_404(client, db, mundo, token):
    alheio = Estabelecimento(
        tenant_id=mundo["org_b"].id,
        cnes="3333333",
        nome="UBS de outro tenant",
        tipo="UBS",
        ativo=True,
        versao=1,
    )
    db.add(alheio)
    await db.commit()

    resposta = await client.get(
        f"/api/govsaude/v1/estabelecimentos/{alheio.id}", headers=token("admin")
    )
    assert resposta.status_code == 404
    assert resposta.headers["content-type"].startswith("application/problem+json")


async def test_b12_006_estabelecimento_crud_baixa_logica_e_auditoria(
    client, db, mundo, token
):
    criado = await client.post(
        "/api/govsaude/v1/estabelecimentos",
        json={
            "cnes": "2222222",
            "nome": "UBS Nova",
            "tipo": "UBS",
            "cnpj": "12ABC34501DE35",
            "municipio_ibge": "4106902",
            "cep": "80000000",
            "email": "ubs@teste.local",
        },
        headers=token("admin"),
    )
    assert criado.status_code == 201, criado.text
    corpo = criado.json()
    assert corpo["fuso_horario"] == "America/Sao_Paulo"
    assert corpo["cnpj_mascarado"].endswith("35")
    assert "12ABC34501DE35" not in json.dumps(corpo)
    assert criado.headers["etag"] == '"1"'

    sem_if_match = await client.patch(
        f"/api/govsaude/v1/estabelecimentos/{corpo['id']}",
        json={"nome": "UBS Nova II"},
        headers=token("admin"),
    )
    assert sem_if_match.status_code == 428

    conflito = await client.patch(
        f"/api/govsaude/v1/estabelecimentos/{corpo['id']}",
        json={"nome": "UBS Nova II"},
        headers={**token("admin"), "If-Match": '"99"'},
    )
    assert conflito.status_code == 409
    assert conflito.json()["versao_atual"] == 1

    alterado = await client.patch(
        f"/api/govsaude/v1/estabelecimentos/{corpo['id']}",
        json={"nome": "UBS Nova II"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert alterado.status_code == 200, alterado.text
    assert alterado.json()["versao"] == 2

    baixado = await client.post(
        f"/api/govsaude/v1/estabelecimentos/{corpo['id']}/baixar",
        json={"motivo": "Encerramento da unidade por reestruturação da rede."},
        headers=token("admin"),
    )
    assert baixado.status_code == 200, baixado.text
    assert baixado.json()["baixa_em"] is not None
    assert baixado.json()["ativo"] is False

    eventos = (
        await db.execute(
            select(AuditTrail).where(
                AuditTrail.recurso == "estabelecimento",
                AuditTrail.recurso_id == uuid.UUID(corpo["id"]),
            )
        )
    ).scalars().all()
    assert {evento.acao for evento in eventos} >= {"CRIAR", "ATUALIZAR", "BAIXAR"}
    assert all("12ABC34501DE35" not in json.dumps(evento.dados_depois) for evento in eventos)


async def test_b12_007_escopo_estabelecimento_rbac(client, mundo, token):
    permitido = await client.get(
        f"/api/govsaude/v1/estabelecimentos/{mundo['estab_a'].id}",
        headers=token("medico_escopo"),
    )
    assert permitido.status_code == 200, permitido.text

    negado = await client.get(
        f"/api/govsaude/v1/estabelecimentos/{mundo['estab_b'].id}",
        headers=token("medico_escopo"),
    )
    assert negado.status_code == 403

    recepcao = await client.post(
        "/api/govsaude/v1/profissionais",
        json={
            "nome": "Tentativa Recepção",
            "cpf": CPF_B,
            "cbo": "225125",
            "estabelecimento_id": str(mundo["estab_a"].id),
        },
        headers=token("recepcao"),
    )
    assert recepcao.status_code == 403


async def test_b1_011_vinculo_profissional_preserva_vigencia(client, mundo, token):
    profissional = await _criar_profissional(
        client, token, mundo, inicio="2026-01-01"
    )
    iniciais = await client.get(
        f"/api/govsaude/v1/profissionais/{profissional['id']}/vinculos",
        headers=token("admin"),
    )
    assert iniciais.status_code == 200, iniciais.text
    assert len(iniciais.json()["itens"]) == 1
    primeiro = iniciais.json()["itens"][0]
    segundo = await _criar_vinculo(
        client, token, mundo, profissional["id"], inicio="2026-07-01", carga=20
    )

    resposta = await client.get(
        f"/api/govsaude/v1/profissionais/{profissional['id']}/vinculos",
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    itens = resposta.json()["itens"]
    assert len(itens) == 2
    por_id = {item["id"]: item for item in itens}
    assert por_id[primeiro["id"]]["vigencia_fim"] == "2026-06-30"
    assert por_id[segundo["id"]]["vigencia_fim"] is None
    assert por_id[segundo["id"]]["carga_horaria_semanal"] == 20


async def test_b12_006_busca_profissional_por_nome_sem_url(client, mundo, token):
    profissional = await _criar_profissional(client, token, mundo, nome="Ana Souza")
    resposta = await client.post(
        "/api/govsaude/v1/profissionais/busca",
        json={"termo": "Ana Souza"},
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    assert [item["id"] for item in resposta.json()["itens"]] == [profissional["id"]]

    sem_termo_na_url = await client.get(
        "/api/govsaude/v1/profissionais", headers=token("admin")
    )
    assert sem_termo_na_url.status_code == 200
    assert "busca" not in sem_termo_na_url.request.url.params


async def test_b12_006_gestor_escopo_cria_e_acessa_profissional(client, mundo, token):
    criado = await client.post(
        "/api/govsaude/v1/profissionais",
        json={
            "nome": "Profissional da UBS A",
            "cpf": CPF_A,
            "cbo": "225125",
            "estabelecimento_id": str(mundo["estab_a"].id),
        },
        headers=token("gestor"),
    )
    assert criado.status_code == 201, criado.text
    profissional_id = criado.json()["id"]

    detalhe = await client.get(
        f"/api/govsaude/v1/profissionais/{profissional_id}", headers=token("gestor")
    )
    assert detalhe.status_code == 200, detalhe.text

    lista = await client.get("/api/govsaude/v1/profissionais", headers=token("gestor"))
    assert lista.status_code == 200, lista.text
    assert profissional_id in [item["id"] for item in lista.json()["itens"]]

    fora = await client.post(
        "/api/govsaude/v1/profissionais",
        json={
            "nome": "Profissional da UBS B",
            "cpf": CPF_B,
            "cbo": "225125",
            "estabelecimento_id": str(mundo["estab_b"].id),
        },
        headers=token("gestor"),
    )
    assert fora.status_code == 403


async def test_b12_007_vinculo_encerrado_nao_conta_como_escopo(client, db, mundo, token):
    profissional = await _criar_profissional(client, token, mundo)
    vinculo = await db.scalar(
        select(VinculoProfissional).where(
            VinculoProfissional.profissional_id == uuid.UUID(profissional["id"])
        )
    )
    assert vinculo is not None
    vinculo.vigencia_fim = date.today() - timedelta(days=1)
    await db.commit()

    detalhe = await client.get(
        f"/api/govsaude/v1/profissionais/{profissional['id']}", headers=token("gestor")
    )
    assert detalhe.status_code == 403
    lista = await client.get("/api/govsaude/v1/profissionais", headers=token("gestor"))
    assert lista.status_code == 200
    assert profissional["id"] not in [item["id"] for item in lista.json()["itens"]]


async def test_b12_012_escala_conflito_bloqueia(client, mundo, token):
    profissional = await _criar_profissional(client, token, mundo)
    base = {
        "estabelecimento_id": str(mundo["estab_a"].id),
        "profissional_id": profissional["id"],
        "data": "2026-11-10",
        "hora_inicio": "08:00:00",
        "hora_fim": "12:00:00",
        "tipo": "REGULAR",
    }
    primeira = await client.post(
        "/api/govsaude/v1/escalas", json=base, headers=token("admin")
    )
    assert primeira.status_code == 201, primeira.text

    sobreposta = await client.post(
        "/api/govsaude/v1/escalas",
        json={**base, "hora_inicio": "11:00:00", "hora_fim": "13:00:00"},
        headers=token("admin"),
    )
    assert sobreposta.status_code == 409
    assert sobreposta.json()["codigo"] == "conflito_turno"
    assert sobreposta.json()["conflitos"]

    forcada = await client.post(
        "/api/govsaude/v1/escalas",
        json={
            **base,
            "hora_inicio": "11:00:00",
            "hora_fim": "13:00:00",
            "forcar_conflito": True,
            "justificativa_excecao": (
                "Sobreposição autorizada para cobertura de ausência imprevista."
            ),
        },
        headers=token("admin"),
    )
    assert forcada.status_code == 201, forcada.text
    assert forcada.json()["justificativa_excecao"]
    assert forcada.json()["autorizado_por_id"]


async def test_b12_012_plantao_conflito_bloqueia(client, mundo, token):
    profissional = await _criar_profissional(client, token, mundo)
    base = {
        "estabelecimento_id": str(mundo["estab_a"].id),
        "profissional_id": profissional["id"],
        "data": "2026-11-11",
        "hora_inicio": "19:00:00",
        "hora_fim": "23:00:00",
        "tipo": "PRESENCIAL",
    }
    assert (
        await client.post("/api/govsaude/v1/plantoes", json=base, headers=token("admin"))
    ).status_code == 201
    conflito = await client.post(
        "/api/govsaude/v1/plantoes",
        json={**base, "hora_inicio": "22:00:00", "hora_fim": "23:59:00"},
        headers=token("admin"),
    )
    assert conflito.status_code == 409


async def test_b12_016_procedimento_autorizado_por_escopo(client, db, mundo, token):
    profissional = await _criar_profissional(client, token, mundo)
    especialidade = Especialidade(
        tenant_id=mundo["org_a"].id, codigo="CLINICA", nome="Clínica médica", ativo=True
    )
    db.add(especialidade)
    await db.commit()

    sem_oficial = await client.post(
        "/api/govsaude/v1/procedimentos-autorizados",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "profissional_id": profissional["id"],
            "especialidade_id": str(especialidade.id),
            "codigo_sigtap": "0301010030",
            "competencia": "202601",
        },
        headers=token("admin"),
    )
    assert sem_oficial.status_code == 201, sem_oficial.text
    assert sem_oficial.json()["validado_referencia"] is False
    assert "SIGTAP" in sem_oficial.json()["aviso_referencia"]

    invalido = await client.post(
        "/api/govsaude/v1/procedimentos-autorizados",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "codigo_sigtap": "123",
        },
        headers=token("admin"),
    )
    assert invalido.status_code == 422

    db.add(
        SigtapProcedimento(
            codigo="0301010030",
            competencia="202601",
            nome="[FICTICIO] Procedimento de teste",
        )
    )
    await db.commit()
    validado = await client.post(
        "/api/govsaude/v1/procedimentos-autorizados",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "codigo_sigtap": "0301010030",
            "competencia": "202601",
        },
        headers=token("admin"),
    )
    assert validado.status_code == 201, validado.text
    assert validado.json()["validado_referencia"] is True

    inexistente = await client.post(
        "/api/govsaude/v1/procedimentos-autorizados",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "codigo_sigtap": "9999999999",
            "competencia": "202601",
        },
        headers=token("admin"),
    )
    assert inexistente.status_code == 422

    fora_escopo = await client.get(
        f"/api/govsaude/v1/procedimentos-autorizados?estabelecimento_id={mundo['estab_b'].id}",
        headers=token("medico_escopo"),
    )
    assert fora_escopo.status_code == 403


async def test_b12_031_prioridade_configuravel(client, mundo, token):
    seed = await client.get("/api/govsaude/v1/prioridades", headers=token("admin"))
    assert seed.status_code == 200, seed.text
    codigos = {item["codigo"] for item in seed.json()["itens"]}
    assert {"ELETIVA", "PRIORITARIA"} <= codigos

    sem_base = await client.post(
        "/api/govsaude/v1/prioridades",
        json={
            "codigo": "LEGAL_SEM_BASE",
            "rotulo": "Prioridade legal sem base",
            "ordem": 1,
            "prioridade_legal": True,
        },
        headers=token("admin"),
    )
    assert sem_base.status_code == 422

    criada = await client.post(
        "/api/govsaude/v1/prioridades",
        json={
            "codigo": "GESTANTE",
            "rotulo": "Gestante (prioridade legal)",
            "ordem": 1,
            "prioridade_legal": True,
            "base_legal": "Lei municipal de priorização (validar com o gestor)",
        },
        headers=token("admin"),
    )
    assert criada.status_code == 201, criada.text
    assert criada.json()["prioridade_legal"] is True
    assert criada.json()["ordem"] == 1

    alterada = await client.patch(
        f"/api/govsaude/v1/prioridades/{criada.json()['id']}",
        json={"ordem": 0, "rotulo": "Gestante — prioridade legal"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert alterada.status_code == 200, alterada.text
    assert alterada.json()["ordem"] == 0


async def test_b12_012_restricao_horario_dias_fora_da_janela_bloqueiam(
    client, db, mundo, token
):
    gestor = await obter_usuario(db, mundo["usuarios"]["gestor"].id)
    assert gestor is not None
    dia_bloqueado = (date.today().weekday() + 3) % 7
    criada = await client.post(
        "/api/govsaude/v1/restricoes-horario",
        json={
            "usuario_id": str(gestor.id),
            "estabelecimento_id": str(mundo["estab_a"].id),
            "dias_semana": [dia_bloqueado],
            "hora_inicio": "07:00:00",
            "hora_fim": "19:00:00",
            "motivo": "Janela de acesso da unidade.",
        },
        headers=token("admin"),
    )
    assert criada.status_code == 201, criada.text

    negado = await client.get(
        f"/api/govsaude/v1/estabelecimentos/{mundo['estab_a'].id}",
        headers=token("gestor"),
    )
    assert negado.status_code == 403

    segunda = datetime(2026, 11, 2, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
    terca = datetime(2026, 11, 3, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
    noite = datetime(2026, 11, 2, 20, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
    restricao = await db.scalar(select(RestricaoHorarioAcesso))
    restricao.dias_semana = [0]
    await db.commit()
    assert await acesso_bloqueado(db, gestor, estabelecimento_id=mundo["estab_a"].id, momento=segunda) is None
    assert await acesso_bloqueado(db, gestor, estabelecimento_id=mundo["estab_a"].id, momento=terca) is not None
    assert await acesso_bloqueado(db, gestor, estabelecimento_id=mundo["estab_a"].id, momento=noite) is not None


async def test_b12_012_conflito_nao_vaza_turno_de_outra_unidade(client, mundo, token):
    profissional = await _criar_profissional(client, token, mundo)
    base = {
        "profissional_id": profissional["id"],
        "data": "2026-11-12",
        "hora_inicio": "08:00:00",
        "hora_fim": "12:00:00",
        "tipo": "REGULAR",
    }
    fora = await client.post(
        "/api/govsaude/v1/escalas",
        json={**base, "estabelecimento_id": str(mundo["estab_b"].id)},
        headers=token("admin"),
    )
    assert fora.status_code == 201, fora.text

    conflito = await client.post(
        "/api/govsaude/v1/escalas",
        json={**base, "estabelecimento_id": str(mundo["estab_a"].id)},
        headers=token("gestor"),
    )
    assert conflito.status_code == 409
    assert conflito.json()["conflitos"] == []
    assert conflito.json()["conflito_fora_escopo"] is True


async def test_b12_012_justificativa_antiga_nao_sobrevive_sem_conflito(
    client, mundo, token
):
    profissional = await _criar_profissional(client, token, mundo)
    base = {
        "estabelecimento_id": str(mundo["estab_a"].id),
        "profissional_id": profissional["id"],
        "data": "2026-11-13",
        "hora_inicio": "08:00:00",
        "hora_fim": "12:00:00",
        "tipo": "REGULAR",
    }
    assert (
        await client.post("/api/govsaude/v1/escalas", json=base, headers=token("admin"))
    ).status_code == 201
    forcada = await client.post(
        "/api/govsaude/v1/escalas",
        json={
            **base,
            "hora_inicio": "11:00:00",
            "hora_fim": "13:00:00",
            "forcar_conflito": True,
            "justificativa_excecao": "Cobertura excepcional de ausência.",
        },
        headers=token("admin"),
    )
    assert forcada.status_code == 201, forcada.text
    alterada = await client.patch(
        f"/api/govsaude/v1/escalas/{forcada.json()['id']}",
        json={"hora_inicio": "14:00:00", "hora_fim": "16:00:00"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert alterada.status_code == 200, alterada.text
    assert alterada.json()["justificativa_excecao"] is None
    assert alterada.json()["autorizado_por_id"] is None
    assert alterada.json()["autorizado_em"] is None


async def test_b12_012_restricao_horario_por_grupo(client, db, mundo, token):
    recepcao = await obter_usuario(db, mundo["usuarios"]["recepcao"].id)
    assert recepcao is not None
    resposta = await client.post(
        "/api/govsaude/v1/restricoes-horario",
        json={
            "usuario_id": str(recepcao.id),
            "dias_semana": [0, 1, 2, 3, 4, 5, 6],
            "hora_inicio": "08:00:00",
            "hora_fim": "18:00:00",
            "motivo": "Jornada da recepção.",
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text

    bloqueio = await acesso_bloqueado(
        db,
        recepcao,
        momento=datetime(2026, 11, 3, 20, 0, tzinfo=ZoneInfo("America/Sao_Paulo")),
    )
    assert bloqueio is not None
    permitido = await acesso_bloqueado(
        db,
        recepcao,
        momento=datetime(2026, 11, 3, 10, 0, tzinfo=ZoneInfo("America/Sao_Paulo")),
    )
    assert permitido is None


def _montar_layout_cnes(tmp_path):
    especificacoes = tmp_path / "especificacoes"
    dados = tmp_path / "dados"
    (especificacoes / "teste-1").mkdir(parents=True)
    dados.mkdir()
    (especificacoes / "teste-1" / "manifest.json").write_text(
        json.dumps(
            {
                "versao_layout": "TESTE-1",
                "entidade": "estabelecimentos",
                "arquivo": "cnes.csv",
                "delimitador": ";",
                "competencia": "202601",
                "mapeamento": {
                    "cnes": "CO_CNES",
                    "nome": "NO_FANTASIA",
                    "tipo": "TP_UNIDADE",
                    "cnpj": "NU_CNPJ",
                },
            }
        ),
        encoding="utf-8",
    )
    (dados / "cnes.csv").write_text(
        "CO_CNES;NO_FANTASIA;TP_UNIDADE;NU_CNPJ\n"
        "8888888;UBS Importada;UBS;11222333000181\n"
        "123456;UBS Inválida;UBS;\n"
        "7777777;;UBS;\n",
        encoding="utf-8",
    )
    return especificacoes, dados


async def test_b1_010_importacao_cnes_relatorio_inconsistencias(
    client, db, mundo, token, monkeypatch, tmp_path
):
    from app.integracoes.cnes import adaptador_manifesto

    especificacoes, dados = _montar_layout_cnes(tmp_path)
    monkeypatch.setattr(adaptador_manifesto, "DIRETORIO_ESPECIFICACOES", especificacoes)
    monkeypatch.setattr(adaptador_manifesto, "DIRETORIO_DADOS", dados)

    resposta = await client.post(
        "/api/govsaude/v1/importacoes/cnes",
        json={"competencia": "202601"},
        headers=token("admin"),
    )
    assert resposta.status_code == 202, resposta.text
    corpo = resposta.json()
    assert corpo["status"] == "CONCLUIDA"
    assert corpo["total_linhas"] == 3
    assert corpo["total_validos"] == 1
    assert corpo["total_rejeitados"] == 2
    assert corpo["total_criados"] == 1
    assert corpo["conferencia_ok"] is True
    inconsistencias = corpo["relatorio"]["inconsistencias"]
    assert len(inconsistencias) == 2
    assert {item["campo"] for item in inconsistencias} == {"cnes", "nome"}
    assert all(item["motivo"] and item["acao_sugerida"] for item in inconsistencias)

    importado = await db.scalar(
        select(Estabelecimento).where(
            Estabelecimento.tenant_id == mundo["org_a"].id,
            Estabelecimento.cnes == "8888888",
        )
    )
    assert importado is not None

    repetida = await client.post(
        "/api/govsaude/v1/importacoes/cnes",
        json={"competencia": "202601"},
        headers=token("admin"),
    )
    assert repetida.status_code == 202
    assert repetida.json()["id"] == corpo["id"]
    total = await db.scalar(
        select(ImportacaoCNES).where(ImportacaoCNES.tenant_id == mundo["org_a"].id)
    )
    assert total is not None

    relatorio = await client.get(
        f"/api/govsaude/v1/importacoes/cnes/{corpo['job_id']}", headers=token("admin")
    )
    assert relatorio.status_code == 200, relatorio.text
    assert relatorio.json()["id"] == corpo["id"]

    job = await client.get(
        f"/api/govsaude/v1/jobs/{corpo['job_id']}", headers=token("admin")
    )
    assert job.status_code == 200
    assert job.json()["status"] == "CONCLUIDO"


async def test_b1_010_importacao_cnes_pendente_sem_layout(
    client, token, monkeypatch, tmp_path
):
    from app.integracoes.cnes import adaptador_manifesto

    monkeypatch.setattr(
        adaptador_manifesto, "DIRETORIO_ESPECIFICACOES", tmp_path / "vazio"
    )
    monkeypatch.setattr(adaptador_manifesto, "DIRETORIO_DADOS", tmp_path / "vazio-dados")
    resposta = await client.post(
        "/api/govsaude/v1/importacoes/cnes", json={}, headers=token("admin")
    )
    assert resposta.status_code == 202, resposta.text
    corpo = resposta.json()
    assert corpo["status"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
    assert corpo["relatorio"]["resumo"]["status"] == "PENDENTE_ESPECIFICACAO_OFICIAL"


@pytest.mark.xfail(
    reason=(
        "Layout oficial CNES ainda não está no repositório; o contrato do "
        "adaptador só pode ser validado quando o artefato oficial for fornecido."
    ),
    strict=False,
)
def test_b1_010_contrato_layout_cnes_oficial_pendente():
    from app.integracoes.cnes.adaptador_manifesto import _manifestos

    assert _manifestos(), "Nenhum manifesto/layout oficial CNES encontrado."


async def test_b12_006_equipe_ine_e_horario_validacoes(client, mundo, token):
    invalida = await client.post(
        "/api/govsaude/v1/equipes",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "ine": "123",
            "nome": "Equipe inválida",
            "tipo": "ESF",
        },
        headers=token("admin"),
    )
    assert invalida.status_code == 422

    equipe = await client.post(
        "/api/govsaude/v1/equipes",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "ine": "1234567890",
            "nome": "Equipe Saúde da Família",
            "tipo": "ESF",
            "vigencia_inicio": "2026-01-01",
        },
        headers=token("admin"),
    )
    assert equipe.status_code == 201, equipe.text
    assert equipe.json()["ine"] == "1234567890"

    horario = await client.post(
        f"/api/govsaude/v1/estabelecimentos/{mundo['estab_a'].id}/horarios",
        json={
            "dia_semana": 0,
            "hora_inicio": "08:00:00",
            "hora_fim": "17:00:00",
        },
        headers=token("admin"),
    )
    assert horario.status_code == 201, horario.text

    invalido = await client.post(
        f"/api/govsaude/v1/estabelecimentos/{mundo['estab_a'].id}/horarios",
        json={
            "dia_semana": 0,
            "hora_inicio": "18:00:00",
            "hora_fim": "08:00:00",
        },
        headers=token("admin"),
    )
    assert invalido.status_code == 422


async def test_b12_006_consorcio_entes_crud(client, mundo, token):
    criado = await client.post(
        "/api/govsaude/v1/consorcios/entes",
        json={
            "municipio_ibge": "4106902",
            "nome": "Município Consorciado",
            "cnpj": "11222333000181",
            "situacao": "ATIVO",
        },
        headers={**token("admin"), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert criado.status_code == 201, criado.text
    assert criado.json()["cnpj_mascarado"].endswith("81")

    lista = await client.get("/api/govsaude/v1/consorcios/entes", headers=token("admin"))
    assert lista.status_code == 200
    assert lista.json()["total_estimado"] == 1

    encerrado = await client.post(
        f"/api/govsaude/v1/consorcios/entes/{criado.json()['id']}/encerrar",
        json={"motivo": "Encerramento do acordo de consórcio."},
        headers=token("admin"),
    )
    assert encerrado.status_code == 200
    assert encerrado.json()["situacao"] == "INATIVO"
