"""Fase 4 — agenda, recepção, fila, classificação, painéis e falta automática."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.security import hmac_hex
from app.models.agenda import Agenda, Agendamento, FilaAtendimento
from app.models.auditoria import AuditTrail
from app.models.enums import SituacaoAgendamento
from app.models.nucleo import Estabelecimento, Setor
from app.models.rede import Prioridade
from app.services.agenda_comum import gerar_codigo
from app.services.agendamentos import marcar_faltas_automaticas

TZ = ZoneInfo("America/Sao_Paulo")


def _local(dia: date, hora: str = "08:00") -> datetime:
    return datetime.combine(dia, time.fromisoformat(hora), tzinfo=TZ)


def _dia_futuro(dias: int = 7) -> date:
    return date.today() + timedelta(days=dias)


async def _setor(db, mundo, estabelecimento="estab_a", nome="Recepção") -> Setor:
    registro = Setor(
        tenant_id=mundo["org_a"].id,
        estabelecimento_id=mundo[estabelecimento].id,
        nome=f"{nome} {uuid.uuid4().hex[:6]}",
        tipo="ATENDIMENTO",
        ativo=True,
        versao=1,
    )
    db.add(registro)
    await db.commit()
    return registro


async def _cidadao(client, token, *, nome: str, sexo: str = "NAO_INFORMADO") -> dict:
    resposta = await client.post(
        "/api/govsaude/v1/cidadaos",
        json={
            "nome": nome,
            "sexo": sexo,
            "data_nascimento": "1990-05-10",
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _agenda(
    client,
    token,
    mundo,
    *,
    setor_id,
    dia: date,
    tipo: str = "CONSULTA",
    permite_encaixe: bool = False,
    sexos_permitidos=None,
    falta_automatica: bool = True,
    procedimento_sigtap=None,
    inicio: str = "08:00",
    fim: str = "12:00",
    duracao: int = 30,
    vagas: int = 1,
) -> dict:
    corpo = {
        "estabelecimento_id": str(mundo["estab_a"].id),
        "setor_id": str(setor_id),
        "nome": f"Agenda {uuid.uuid4().hex[:6]}",
        "tipo": tipo,
        "permite_encaixe": permite_encaixe,
        "falta_automatica": falta_automatica,
        "sexos_permitidos": sexos_permitidos,
        "horarios": [
            {
                "dia_semana": dia.weekday(),
                "hora_inicio": inicio,
                "hora_fim": fim,
                "duracao_minutos": duracao,
                "vagas_por_horario": vagas,
            }
        ],
    }
    if procedimento_sigtap:
        corpo["procedimento_sigtap"] = procedimento_sigtap
    resposta = await client.post(
        "/api/govsaude/v1/agendas", json=corpo, headers=token("admin")
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def _agendamento(
    client,
    token,
    *,
    agenda_id,
    cidadao_id,
    inicio: datetime,
    idempotency: str | None = None,
    **extra,
) -> dict:
    headers = dict(token("admin"))
    if idempotency:
        headers["Idempotency-Key"] = idempotency
    resposta = await client.post(
        "/api/govsaude/v1/agendamentos",
        json={
            "agenda_id": str(agenda_id),
            "cidadao_id": str(cidadao_id),
            "inicio_em": inicio.isoformat(),
            **extra,
        },
        headers=headers,
    )
    return resposta.json() if resposta.content else {}


async def _agendamento_direto(
    db,
    mundo,
    *,
    agenda_id,
    cidadao_id,
    inicio_em: datetime,
    situacao: str = SituacaoAgendamento.AGENDADO.value,
    codigo: str | None = None,
) -> tuple[Agendamento, str]:
    identificador = uuid.uuid4()
    token = codigo or gerar_codigo("AGD", identificador)
    registro = Agendamento(
        id=identificador,
        tenant_id=mundo["org_a"].id,
        agenda_id=agenda_id,
        estabelecimento_id=mundo["estab_a"].id,
        cidadao_id=cidadao_id,
        inicio_em=inicio_em,
        fim_em=inicio_em + timedelta(minutes=30),
        situacao=situacao,
        origem="RECEPCAO",
        codigo_hash=hmac_hex(token),
        versao=1,
    )
    db.add(registro)
    await db.commit()
    return registro, token


async def _fila(
    client,
    token,
    mundo,
    *,
    setor_id,
    cidadao_id,
    prioridade_id=None,
    protocolo_id=None,
    nivel_id=None,
    estabelecimento="estab_a",
):
    corpo = {
        "estabelecimento_id": str(mundo[estabelecimento].id),
        "setor_id": str(setor_id),
        "cidadao_id": str(cidadao_id),
        "origem": "DEMANDA_ESPONTANEA",
    }
    if prioridade_id:
        corpo["prioridade_id"] = str(prioridade_id)
    if protocolo_id:
        corpo["protocolo_risco_id"] = str(protocolo_id)
    if nivel_id:
        corpo["nivel_risco_id"] = str(nivel_id)
    resposta = await client.post(
        "/api/govsaude/v1/filas", json=corpo, headers=token("admin")
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


async def test_b6_001_b3_008_agenda_disponibilidade_e_if_match(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro()
    agenda = await _agenda(
        client,
        token,
        mundo,
        setor_id=setor.id,
        dia=dia,
        tipo="ODONTOLOGIA",
        procedimento_sigtap="0301010010",
    )
    assert agenda["tipo"] == "ODONTOLOGIA"
    assert agenda["procedimento_sigtap"] == "0301010010"
    assert len(agenda["horarios"]) == 1

    disponibilidade = await client.get(
        f"/api/govsaude/v1/agendas/{agenda['id']}/disponibilidade",
        params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        headers=token("admin"),
    )
    assert disponibilidade.status_code == 200, disponibilidade.text
    slots = disponibilidade.json()["dias"][0]["slots"]
    assert len(slots) == 8
    assert all(slot["disponivel"] for slot in slots)

    sem_if_match = await client.patch(
        f"/api/govsaude/v1/agendas/{agenda['id']}",
        json={"nome": "Agenda alterada"},
        headers=token("admin"),
    )
    assert sem_if_match.status_code == 428

    conflito = await client.patch(
        f"/api/govsaude/v1/agendas/{agenda['id']}",
        json={"nome": "Agenda alterada"},
        headers={**token("admin"), "If-Match": '"99"'},
    )
    assert conflito.status_code == 409

    alterado = await client.patch(
        f"/api/govsaude/v1/agendas/{agenda['id']}",
        json={"nome": "Agenda alterada"},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert alterado.status_code == 200, alterado.text
    assert alterado.json()["versao"] == 2

    troca_horarios = await client.patch(
        f"/api/govsaude/v1/agendas/{agenda['id']}",
        json={
            "horarios": [
                {
                    "dia_semana": dia.weekday(),
                    "hora_inicio": "09:00",
                    "hora_fim": "10:00",
                    "duracao_minutos": 30,
                    "vagas_por_horario": 1,
                }
            ]
        },
        headers={**token("admin"), "If-Match": '"2"'},
    )
    assert troca_horarios.status_code == 200, troca_horarios.text
    assert len(troca_horarios.json()["horarios"]) == 1
    assert troca_horarios.json()["horarios"][0]["hora_inicio"] == "09:00:00"


async def test_b6_002_agendamento_capacidade_duplicidade_e_idempotencia(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(8)
    agenda = await _agenda(client, token, mundo, setor_id=setor.id, dia=dia)
    cidadao_a = await _cidadao(client, token, nome="Ana Souza")
    cidadao_b = await _cidadao(client, token, nome="Bruno Lima")
    inicio = _local(dia, "08:00")

    criado = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao_a["id"],
        inicio=inicio,
        idempotency="fase4-agendamento-1",
    )
    assert criado["id"]
    assert criado["codigo_acesso"].startswith("GS4-AGD-")
    assert criado["cidadao_nome_abreviado"] == "Ana S."

    repetido = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao_a["id"],
        inicio=inicio,
        idempotency="fase4-agendamento-1",
    )
    assert repetido["id"] == criado["id"]

    duplicado = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao_a["id"],
        inicio=inicio,
    )
    assert duplicado["codigo"] == "agendamento_duplicado"

    sem_vaga = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao_b["id"],
        inicio=inicio,
    )
    assert sem_vaga["codigo"] == "vaga_indisponivel"


async def test_b6_002_incompatibilidade_bloqueia_e_excecao_justificada(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(9)
    agenda = await _agenda(
        client,
        token,
        mundo,
        setor_id=setor.id,
        dia=dia,
        permite_encaixe=True,
        sexos_permitidos=["FEMININO"],
    )
    cidadao = await _cidadao(client, token, nome="Carlos Pereira", sexo="MASCULINO")
    inicio = _local(dia, "08:00")

    bloqueado = await client.post(
        "/api/govsaude/v1/agendamentos",
        json={
            "agenda_id": agenda["id"],
            "cidadao_id": cidadao["id"],
            "inicio_em": inicio.isoformat(),
        },
        headers=token("admin"),
    )
    assert bloqueado.status_code == 422
    assert bloqueado.json()["codigo"] == "agendamento_incompativel"
    assert bloqueado.json()["alertas"][0]["codigo"] == "sexo_incompativel"

    liberado = await client.post(
        "/api/govsaude/v1/agendamentos",
        json={
            "agenda_id": agenda["id"],
            "cidadao_id": cidadao["id"],
            "inicio_em": inicio.isoformat(),
            "forcar_incompatibilidade": True,
            "justificativa_excecao": (
                "Exceção autorizada pelo gestor para atendimento excepcional."
            ),
        },
        headers=token("admin"),
    )
    assert liberado.status_code == 201, liberado.text
    assert liberado.json()["excecao_justificada"] is True


async def test_b6_003_checkin_bloqueado_cancelado_e_codigo_invalido(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(10)
    agenda = await _agenda(client, token, mundo, setor_id=setor.id, dia=dia)
    cidadao = await _cidadao(client, token, nome="Dora Alves")
    hoje = datetime.now(TZ).date()
    registro, _codigo = await _agendamento_direto(
        db,
        mundo,
        agenda_id=uuid.UUID(agenda["id"]),
        cidadao_id=uuid.UUID(cidadao["id"]),
        inicio_em=_local(hoje, "12:00"),
        situacao=SituacaoAgendamento.CANCELADO.value,
    )
    codigo = gerar_codigo("AGD", registro.id)

    resposta = await client.post(
        "/api/govsaude/v1/recepcao/check-in",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "metodo": "CODIGO_BARRAS",
            "codigo": codigo,
        },
        headers=token("recepcao"),
    )
    assert resposta.status_code == 409
    assert resposta.json()["codigo"] == "agendamento_bloqueado"
    assert resposta.json()["pode_encaixe"] is False

    invalido = await client.post(
        "/api/govsaude/v1/recepcao/check-in",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "metodo": "QR_CODE",
            "codigo": "GS4-AGD-00000000-0000-0000-0000-000000000000-xxxxxxxxxxxxxxxx",
        },
        headers=token("recepcao"),
    )
    assert invalido.status_code == 404
    assert invalido.headers["content-type"].startswith("application/problem+json")


async def test_b6_005_checkin_codigo_demanda_espontanea_e_biometria_pendente(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(11)
    agenda = await _agenda(client, token, mundo, setor_id=setor.id, dia=dia)
    cidadao = await _cidadao(client, token, nome="Elisa Martins")
    hoje = datetime.now(TZ).date()
    registro, codigo = await _agendamento_direto(
        db,
        mundo,
        agenda_id=uuid.UUID(agenda["id"]),
        cidadao_id=uuid.UUID(cidadao["id"]),
        inicio_em=_local(hoje, "12:00"),
    )

    checkin = await client.post(
        "/api/govsaude/v1/recepcao/check-in",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "metodo": "CODIGO_BARRAS",
            "codigo": codigo,
        },
        headers=token("recepcao"),
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["fila_id"]
    assert checkin.json()["situacao_fila"] == "AGUARDANDO"

    repetido = await client.post(
        "/api/govsaude/v1/recepcao/check-in",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "metodo": "CODIGO_BARRAS",
            "codigo": codigo,
        },
        headers=token("recepcao"),
    )
    assert repetido.status_code == 200, repetido.text
    assert repetido.json()["fila_id"] == checkin.json()["fila_id"]

    fila = await db.scalar(
        select(FilaAtendimento).where(
            FilaAtendimento.id == uuid.UUID(checkin.json()["fila_id"])
        )
    )
    assert fila is not None
    assert fila.agendamento_id == registro.id
    agendamento = await db.get(Agendamento, registro.id)
    await db.refresh(agendamento)
    assert agendamento.situacao == SituacaoAgendamento.AGUARDANDO.value

    cidadao_b = await _cidadao(client, token, nome="Fábio Nunes")
    demanda = await client.post(
        "/api/govsaude/v1/recepcao/demanda-espontanea",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "cidadao_id": cidadao_b["id"],
        },
        headers=token("recepcao"),
    )
    assert demanda.status_code == 201, demanda.text
    assert demanda.json()["origem"] == "DEMANDA_ESPONTANEA"

    biometria = await client.post(
        "/api/govsaude/v1/recepcao/check-in",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "metodo": "BIOMETRIA",
            "biometria_token": "token-do-equipamento",
        },
        headers=token("recepcao"),
    )
    assert biometria.status_code == 422
    assert biometria.json()["codigo"] == "biometria_pendente"
    assert biometria.json()["alternativas_identificacao"] == [
        "CODIGO_BARRAS",
        "QR_CODE",
        "MANUAL",
    ]


async def test_b6_007_b6_008_fila_ordenada_regra_exposta(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(12)
    await _agenda(client, token, mundo, setor_id=setor.id, dia=dia)
    protocolo = await client.post(
        "/api/govsaude/v1/protocolos-classificacao-risco",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "nome": "Protocolo Manchester adaptado",
            "versao_protocolo": "2026.1",
            "niveis": [
                {
                    "codigo": "VERMELHO",
                    "rotulo": "Emergência",
                    "cor": "#D32F2F",
                    "ordem": 0,
                    "prioridade_legal": True,
                    "tempo_alvo_minutos": 0,
                },
                {
                    "codigo": "AZUL",
                    "rotulo": "Não urgente",
                    "cor": "#1976D2",
                    "ordem": 5,
                    "prioridade_legal": False,
                    "tempo_alvo_minutos": 120,
                },
            ],
        },
        headers=token("admin"),
    )
    assert protocolo.status_code == 201, protocolo.text
    niveis = {item["codigo"]: item for item in protocolo.json()["niveis"]}
    prioridade_legal = Prioridade(
        tenant_id=mundo["org_a"].id,
        codigo="LEGAL_FASE4",
        rotulo="Prioridade legal",
        ordem=1,
        prioridade_legal=True,
        base_legal="Norma municipal de teste",
        vigencia_inicio=date.today(),
        ativo=True,
        versao=1,
    )
    db.add(prioridade_legal)
    await db.commit()

    cidadao_a = await _cidadao(client, token, nome="Gilda Rocha")
    cidadao_b = await _cidadao(client, token, nome="Heitor Dias")
    cidadao_c = await _cidadao(client, token, nome="Iara Freitas")
    primeiro = await _fila(
        client, token, mundo, setor_id=setor.id, cidadao_id=cidadao_a["id"]
    )
    segundo = await _fila(
        client,
        token,
        mundo,
        setor_id=setor.id,
        cidadao_id=cidadao_b["id"],
        prioridade_id=prioridade_legal.id,
    )
    terceiro = await _fila(
        client,
        token,
        mundo,
        setor_id=setor.id,
        cidadao_id=cidadao_c["id"],
        protocolo_id=protocolo.json()["id"],
        nivel_id=niveis["VERMELHO"]["id"],
    )

    resposta = await client.get(
        "/api/govsaude/v1/filas",
        params={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert [item["id"] for item in corpo["itens"]] == [
        terceiro["id"],
        segundo["id"],
        primeiro["id"],
    ]
    assert [item["posicao"] for item in corpo["itens"]] == [1, 2, 3]
    assert len(corpo["regra_ordenacao"]) == 3
    assert corpo["regra_ordenacao"][0]["campo"] == "classificacao_risco"
    assert corpo["itens"][0]["ordem_ranking"][0]["campo"] == "classificacao_risco"
    assert corpo["itens"][0]["nivel_risco_rotulo"] == "Emergência"
    assert corpo["itens"][1]["prioridade_legal"] is True


async def test_b6_012_tempos_triagem_consulta_e_transicoes(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    cidadao = await _cidadao(client, token, nome="Joana Prado")
    fila = await _fila(client, token, mundo, setor_id=setor.id, cidadao_id=cidadao["id"])

    chamada = await client.post(
        f"/api/govsaude/v1/filas/{fila['id']}/chamar",
        json={"destino": "Guichê 1", "tipo": "NORMAL"},
        headers=token("recepcao"),
    )
    assert chamada.status_code == 200, chamada.text

    triagem = await client.post(
        f"/api/govsaude/v1/filas/{fila['id']}/iniciar-triagem",
        headers=token("recepcao"),
    )
    assert triagem.status_code == 200, triagem.text
    fim_triagem = await client.post(
        f"/api/govsaude/v1/filas/{fila['id']}/finalizar-triagem",
        headers=token("recepcao"),
    )
    assert fim_triagem.status_code == 200, fim_triagem.text
    inicio_atendimento = await client.post(
        f"/api/govsaude/v1/filas/{fila['id']}/iniciar-atendimento",
        headers=token("recepcao"),
    )
    assert inicio_atendimento.status_code == 200, inicio_atendimento.text
    finalizado = await client.post(
        f"/api/govsaude/v1/filas/{fila['id']}/finalizar",
        json={"observacoes": "Atendimento concluído."},
        headers=token("recepcao"),
    )
    assert finalizado.status_code == 200, finalizado.text
    assert finalizado.json()["situacao"] == "ATENDIDO"
    tempos = finalizado.json()["tempos"]
    for campo in (
        "espera_minutos",
        "triagem_minutos",
        "espera_atendimento_minutos",
        "atendimento_minutos",
        "total_minutos",
    ):
        assert campo in tempos
    assert tempos["triagem_minutos"] is not None
    assert tempos["atendimento_minutos"] is not None

    eventos = await client.get(
        f"/api/govsaude/v1/filas/{fila['id']}/eventos",
        headers=token("admin"),
    )
    assert eventos.status_code == 200, eventos.text
    assert {item["tipo"] for item in eventos.json()} >= {
        "ENTRADA",
        "CHAMADA",
        "TRIAGEM_INICIO",
        "TRIAGEM_FIM",
        "ATENDIMENTO_INICIO",
        "ATENDIMENTO_FIM",
    }


async def test_b6_045_b6_047_painel_texto_voz_e_historico(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    painel = await client.post(
        "/api/govsaude/v1/paineis-chamada",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "setor_id": str(setor.id),
            "nome": "Painel principal",
            "nome_abreviado": True,
            "voz_habilitada": True,
            "noticias": [{"titulo": "Campanha", "texto": "Vacinação disponível."}],
        },
        headers=token("admin"),
    )
    assert painel.status_code == 201, painel.text
    cidadao = await _cidadao(client, token, nome="Maria Silva")
    fila = await _fila(client, token, mundo, setor_id=setor.id, cidadao_id=cidadao["id"])
    chamada = await client.post(
        f"/api/govsaude/v1/filas/{fila['id']}/chamar",
        json={
            "destino": "Guichê 1",
            "tipo": "NORMAL",
            "painel_id": painel.json()["id"],
        },
        headers=token("recepcao"),
    )
    assert chamada.status_code == 200, chamada.text
    assert chamada.json()["nome_abreviado"] == "Maria S."
    assert "Maria S." in chamada.json()["texto_voz"]
    assert "Guichê 1" in chamada.json()["texto_voz"]

    estado = await client.get(
        f"/api/govsaude/v1/paineis-chamada/{painel.json()['id']}/estado",
        headers=token("recepcao"),
    )
    assert estado.status_code == 200, estado.text
    assert estado.json()["ultimas_chamadas"][0]["fila_id"] == fila["id"]
    assert estado.json()["painel"]["noticias"][0]["titulo"] == "Campanha"


async def test_b12_018_falta_automatica_e_reversao_auditada(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(13)
    agenda_auto = await _agenda(
        client, token, mundo, setor_id=setor.id, dia=dia, falta_automatica=True
    )
    agenda_manual = await _agenda(
        client, token, mundo, setor_id=setor.id, dia=dia, falta_automatica=False
    )
    cidadao_a = await _cidadao(client, token, nome="Lia Campos")
    cidadao_b = await _cidadao(client, token, nome="Mauro Reis")
    passado = datetime.now(timezone.utc) - timedelta(hours=3)
    auto, _ = await _agendamento_direto(
        db,
        mundo,
        agenda_id=uuid.UUID(agenda_auto["id"]),
        cidadao_id=uuid.UUID(cidadao_a["id"]),
        inicio_em=passado,
    )
    vencido, _ = await _agendamento_direto(
        db,
        mundo,
        agenda_id=uuid.UUID(agenda_manual["id"]),
        cidadao_id=uuid.UUID(cidadao_b["id"]),
        inicio_em=passado,
    )

    resultado = await marcar_faltas_automaticas(db)
    assert resultado["faltas"] >= 1
    assert resultado["vencidos"] >= 1
    auto = await db.get(Agendamento, auto.id)
    vencido = await db.get(Agendamento, vencido.id)
    await db.refresh(auto)
    await db.refresh(vencido)
    assert auto.situacao == SituacaoAgendamento.FALTOU.value
    assert auto.falta_automatica is True
    assert vencido.situacao == SituacaoAgendamento.VENCIDO.value

    reversao = await client.post(
        f"/api/govsaude/v1/agendamentos/{auto.id}/reverter-falta",
        json={
            "justificativa": (
                "O cidadão compareceu após o prazo e o atendimento foi "
                "reorganizado pela recepção."
            )
        },
        headers=token("admin"),
    )
    assert reversao.status_code == 200, reversao.text
    assert reversao.json()["situacao"] == "AGENDADO"
    assert reversao.json()["justificativa_reversao"]

    eventos = (
        await db.execute(
            select(AuditTrail).where(
                AuditTrail.recurso == "agendamento",
                AuditTrail.recurso_id == auto.id,
            )
        )
    ).scalars().all()
    assert {evento.acao for evento in eventos} >= {"ATUALIZAR"}


async def test_b6_001_b6_008_rbac_escopo_e_cross_tenant(
    client, db, mundo, token
):
    setor_b = await _setor(db, mundo, estabelecimento="estab_b", nome="Recepção B")
    cidadao = await _cidadao(client, token, nome="Nara Teixeira")
    await _fila(
        client,
        token,
        mundo,
        setor_id=setor_b.id,
        cidadao_id=cidadao["id"],
        estabelecimento="estab_b",
    )
    negado = await client.get(
        "/api/govsaude/v1/filas",
        params={
            "estabelecimento_id": str(mundo["estab_b"].id),
            "setor_id": str(setor_b.id),
        },
        headers=token("medico_escopo"),
    )
    assert negado.status_code == 403

    outra_unidade = Estabelecimento(
        tenant_id=mundo["org_b"].id,
        cnes="4444444",
        nome="UBS de outro tenant",
        tipo="UBS",
        ativo=True,
        versao=1,
    )
    db.add(outra_unidade)
    await db.commit()
    agenda_alheia = Agenda(
        tenant_id=mundo["org_b"].id,
        estabelecimento_id=outra_unidade.id,
        nome="Agenda de outro tenant",
        tipo="CONSULTA",
        modalidade="PRESENCIAL",
        permite_encaixe=False,
        falta_automatica=True,
        tolerancia_atraso_minutos=30,
        antecedencia_minima_horas=0,
        antecedencia_maxima_dias=365,
        vigencia_inicio=date.today(),
        ativo=True,
        versao=1,
    )
    db.add(agenda_alheia)
    await db.commit()
    alheio = await client.get(
        f"/api/govsaude/v1/agendas/{agenda_alheia.id}", headers=token("admin")
    )
    assert alheio.status_code == 404
    assert alheio.headers["content-type"].startswith("application/problem+json")


async def test_b6_002_confirmar_reagendar_cancelar_e_comprovante(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(14)
    agenda = await _agenda(client, token, mundo, setor_id=setor.id, dia=dia)
    cidadao = await _cidadao(client, token, nome="Olga Barros")
    criado = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao["id"],
        inicio=_local(dia, "08:00"),
    )
    confirmado = await client.post(
        f"/api/govsaude/v1/agendamentos/{criado['id']}/confirmar",
        headers=token("recepcao"),
    )
    assert confirmado.status_code == 200, confirmado.text
    assert confirmado.json()["situacao"] == "CONFIRMADO"

    comprovante = await client.post(
        f"/api/govsaude/v1/agendamentos/{criado['id']}/comprovante",
        headers=token("recepcao"),
    )
    assert comprovante.status_code == 200, comprovante.text
    assert comprovante.json()["codigo_acesso"].startswith("GS4-AGD-")

    reagendado = await client.post(
        f"/api/govsaude/v1/agendamentos/{criado['id']}/reagendar",
        json={
            "inicio_em": _local(dia, "09:00").isoformat(),
            "motivo": "Reorganização da agenda do profissional.",
        },
        headers=token("recepcao"),
    )
    assert reagendado.status_code == 200, reagendado.text
    novo = reagendado.json()
    assert novo["id"] != criado["id"]
    assert novo["reagendado_de_id"] == criado["id"]
    antigo = await client.get(
        f"/api/govsaude/v1/agendamentos/{criado['id']}",
        headers=token("recepcao"),
    )
    assert antigo.json()["situacao"] == "REAGENDADO"

    cancelado = await client.post(
        f"/api/govsaude/v1/agendamentos/{novo['id']}/cancelar",
        json={"motivo": "Cancelamento solicitado pelo cidadão."},
        headers=token("recepcao"),
    )
    assert cancelado.status_code == 200, cancelado.text
    assert cancelado.json()["situacao"] == "CANCELADO"

    lista = await client.get(
        "/api/govsaude/v1/agendamentos",
        params={"cidadao_id": cidadao["id"]},
        headers=token("recepcao"),
    )
    assert lista.status_code == 200, lista.text
    assert {item["id"] for item in lista.json()["itens"]} >= {criado["id"], novo["id"]}


async def test_b6_001_bloqueio_indisponibilidade_e_baixa_agenda(
    client, db, mundo, token
):
    setor = await _setor(db, mundo)
    dia = _dia_futuro(15)
    agenda = await _agenda(client, token, mundo, setor_id=setor.id, dia=dia)
    bloquear = await client.post(
        f"/api/govsaude/v1/agendas/{agenda['id']}/bloqueios",
        json={
            "inicio_em": _local(dia, "08:00").isoformat(),
            "fim_em": _local(dia, "09:00").isoformat(),
            "tipo": "AUSENCIA",
            "motivo": "Profissional em reunião de equipe.",
        },
        headers=token("admin"),
    )
    assert bloquear.status_code == 201, bloquear.text
    assert bloquear.json()["tipo"] == "AUSENCIA"

    disponibilidade = await client.get(
        f"/api/govsaude/v1/agendas/{agenda['id']}/disponibilidade",
        params={"data_inicio": dia.isoformat(), "data_fim": dia.isoformat()},
        headers=token("admin"),
    )
    assert disponibilidade.status_code == 200, disponibilidade.text
    slots = disponibilidade.json()["dias"][0]["slots"]
    assert slots[0]["bloqueado"] is True
    assert slots[0]["disponivel"] is False
    assert slots[2]["disponivel"] is True

    cidadao = await _cidadao(client, token, nome="Paulo Neves")
    bloqueado = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao["id"],
        inicio=_local(dia, "08:00"),
    )
    assert bloqueado["codigo"] == "horario_bloqueado"

    baixada = await client.post(
        f"/api/govsaude/v1/agendas/{agenda['id']}/baixar",
        json={"motivo": "Encerramento da agenda por mudança de unidade."},
        headers=token("admin"),
    )
    assert baixada.status_code == 200, baixada.text
    assert baixada.json()["ativo"] is False

    inativa = await _agendamento(
        client,
        token,
        agenda_id=agenda["id"],
        cidadao_id=cidadao["id"],
        inicio=_local(dia, "10:00"),
    )
    assert inativa["codigo"] == "agenda_inativa"


async def test_b6_007_protocolo_atualizacao_com_if_match(
    client, db, mundo, token
):
    await _setor(db, mundo)
    protocolo = await client.post(
        "/api/govsaude/v1/protocolos-classificacao-risco",
        json={
            "estabelecimento_id": str(mundo["estab_a"].id),
            "nome": "Protocolo configurável",
            "versao_protocolo": "1",
            "niveis": [
                {
                    "codigo": "AZUL",
                    "rotulo": "Pouco urgente",
                    "cor": "#1976D2",
                    "ordem": 1,
                }
            ],
        },
        headers=token("admin"),
    )
    assert protocolo.status_code == 201, protocolo.text
    sem_if_match = await client.patch(
        f"/api/govsaude/v1/protocolos-classificacao-risco/{protocolo.json()['id']}",
        json={"descricao": "Revisão do protocolo."},
        headers=token("admin"),
    )
    assert sem_if_match.status_code == 428
    atualizado = await client.patch(
        f"/api/govsaude/v1/protocolos-classificacao-risco/{protocolo.json()['id']}",
        json={
            "descricao": "Revisão do protocolo.",
            "niveis": [
                {
                    "codigo": "AZUL",
                    "rotulo": "Pouco urgente",
                    "cor": "#1976D2",
                    "ordem": 3,
                },
                {
                    "codigo": "VERDE",
                    "rotulo": "Não urgente",
                    "cor": "#388E3C",
                    "ordem": 4,
                },
            ],
        },
        headers={**token("admin"), "If-Match": '"1"'},
    )
    assert atualizado.status_code == 200, atualizado.text
    niveis = {item["codigo"]: item for item in atualizado.json()["niveis"]}
    assert niveis["AZUL"]["ordem"] == 3
    assert niveis["VERDE"]["ativo"] is True
