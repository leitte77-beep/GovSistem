"""Motor de prazos: calendário, alertas, escalonamento e demanda parada."""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

BASE = "/api/govtask/demandas"
ALERTAS = "/api/govtask/alertas"


def _dias(n: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=n)).isoformat()


async def _demanda(client, headers, **campos):
    payload = {"titulo": "Aquisição de ambulância"}
    payload.update(campos)
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _tarefa(client, headers, demanda_id, **campos):
    payload = {"titulo": "Elaborar ofício", "exige_aceite": False}
    payload.update(campos)
    resp = await client.post(
        f"{BASE}/{demanda_id}/tarefas", json=payload, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _varrer(db, org_id):
    from app.services.prazos import varrer_organizacao

    return await varrer_organizacao(db, org_id)


# ── Calendário ──────────────────────────────────────────────────────────────

def test_calendario_pula_fim_de_semana_e_feriado_nacional():
    from app.models.calendario import Feriado
    from app.models.enums import TipoFeriado
    from app.services.calendario import Calendario

    natal = Feriado(
        nome="Natal", tipo=TipoFeriado.NACIONAL, dia=25, mes=12,
        recorrente_anual=True, ativo=True,
    )
    calendario = Calendario([natal])

    # 23/12/2026 é uma quarta. +3 dias úteis: 24 (qui), 28 (seg), 29 (ter),
    # porque 25 é Natal e 26/27 é fim de semana.
    assert calendario.somar_dias_uteis(date(2026, 12, 23), 3) == date(2026, 12, 29)
    assert calendario.eh_dia_util(date(2026, 12, 25)) is False
    assert calendario.eh_dia_util(date(2026, 12, 26)) is False  # sábado


def test_calendario_reconhece_feriados_moveis():
    from app.services.calendario import Calendario, domingo_de_pascoa

    calendario = Calendario([])
    assert domingo_de_pascoa(2026) == date(2026, 4, 5)
    assert calendario.eh_dia_util(date(2026, 4, 3)) is False  # Sexta-feira Santa
    assert calendario.eh_dia_util(date(2026, 2, 17)) is False  # Carnaval
    assert calendario.eh_dia_util(date(2026, 6, 4)) is False  # Corpus Christi


def test_ponto_facultativo_pode_contar_como_util():
    from app.models.calendario import Feriado
    from app.models.enums import TipoFeriado
    from app.services.calendario import Calendario

    facultativo = Feriado(
        nome="Ponto facultativo", tipo=TipoFeriado.PONTO_FACULTATIVO,
        data=date(2026, 10, 28), ativo=True,
    )
    assert Calendario([facultativo]).eh_dia_util(date(2026, 10, 28)) is False
    assert (
        Calendario([facultativo], ponto_facultativo_e_util=True).eh_dia_util(
            date(2026, 10, 28)
        )
        is True
    )


@pytest.mark.asyncio
async def test_feriado_municipal_so_vale_no_proprio_municipio(
    client, make_tenant, catalogo_padrao, _db
):
    a = await make_tenant("ADMIN")
    b = await make_tenant("ADMIN")

    criado = await client.post(
        "/api/govtask/feriados",
        json={"nome": "Aniversário da cidade", "data": "2026-10-15", "tipo": "MUNICIPAL"},
        headers=a["headers"],
    )
    assert criado.status_code == 201

    do_a = await client.post(
        "/api/govtask/feriados/simular-prazo",
        json={"inicio": "2026-10-14", "dias": 1}, headers=a["headers"],
    )
    do_b = await client.post(
        "/api/govtask/feriados/simular-prazo",
        json={"inicio": "2026-10-14", "dias": 1}, headers=b["headers"],
    )
    # 14/10/2026 é quarta; para A, o dia 15 é feriado e o prazo cai no dia 16.
    assert do_a.json()["vencimento"] == "2026-10-16"
    assert do_b.json()["vencimento"] == "2026-10-15"


# ── Alertas ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tarefa_vencida_gera_alerta_critico(client, make_tenant, catalogo_padrao, _db):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await _tarefa(
        client, t["headers"], d["id"], titulo="Protocolar proposta",
        atribuida_a_id=str(t["user"].id), prazo=_dias(-3),
    )

    resultado = await _varrer(_db, t["org"].id)
    assert resultado["alertas_criados"] >= 1

    painel = await client.get(f"{ALERTAS}/painel", headers=t["headers"])
    assert painel.status_code == 200
    corpo = painel.json()
    atraso = [a for a in corpo["items"] if a["tipo"] == "TAREFA_ATRASADA"]
    assert len(atraso) == 1
    assert atraso[0]["severidade"] == "CRITICO"
    assert "3 dia" in atraso[0]["titulo"]
    assert atraso[0]["demanda_numero"] == d["numero"]
    assert corpo["resumo"]["criticos"] >= 1
    assert corpo["resumo"]["nao_lidos"] == corpo["resumo"]["total"]


@pytest.mark.asyncio
async def test_marco_de_prazo_proximo_respeita_configuracao(
    client, make_tenant, catalogo_padrao, _db
):
    t = await make_tenant("ADMIN")
    d = await _demanda(client, t["headers"])
    # 5 dias está nos marcos padrão; 4 não está.
    await _tarefa(client, t["headers"], d["id"], titulo="Vence em 5",
                  atribuida_a_id=str(t["user"].id), prazo=_dias(5))
    await _tarefa(client, t["headers"], d["id"], titulo="Vence em 4",
                  atribuida_a_id=str(t["user"].id), prazo=_dias(4))

    await _varrer(_db, t["org"].id)
    painel = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    proximos = [a for a in painel["items"] if a["tipo"] == "PRAZO_PROXIMO"]
    assert [a["titulo"].split(" vence")[0] for a in proximos] == ["Vence em 5"]


@pytest.mark.asyncio
async def test_varredura_e_idempotente(client, make_tenant, catalogo_padrao, _db):
    """Rodar duas vezes não duplica alerta — é o que permite repetir sem medo."""
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id),
                  prazo=_dias(-1))

    primeira = await _varrer(_db, t["org"].id)
    segunda = await _varrer(_db, t["org"].id)
    assert primeira["alertas_criados"] >= 1
    assert segunda["alertas_criados"] == 0
    assert segunda["alertas_resolvidos"] == 0


@pytest.mark.asyncio
async def test_alerta_fecha_sozinho_quando_a_situacao_some(
    client, make_tenant, catalogo_padrao, _db
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    tarefa = await _tarefa(client, t["headers"], d["id"],
                           atribuida_a_id=str(t["user"].id), prazo=_dias(-2))
    await _varrer(_db, t["org"].id)

    url = f"{BASE}/{d['id']}/tarefas/{tarefa['id']}"
    await client.post(f"{url}/iniciar", headers=t["headers"])
    await client.post(f"{url}/entregar", headers=t["headers"])
    await client.post(f"{url}/concluir", json={}, headers=t["headers"])

    resultado = await _varrer(_db, t["org"].id)
    assert resultado["alertas_resolvidos"] >= 1

    painel = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    assert [a for a in painel["items"] if a["tipo"] == "TAREFA_ATRASADA"] == []


@pytest.mark.asyncio
async def test_escalonamento_sobe_degrau_a_degrau(client, make_tenant, catalogo_padrao, _db):
    """§38 — atraso de 5 dias aciona responsável, chefia e responsável geral."""
    from app.models import Setor

    servidor = await make_tenant("ENGENHEIRO_TECNICO")
    chefe = await make_tenant("GESTOR", org=servidor["org"])
    assessor = await make_tenant("ASSESSOR", org=servidor["org"])

    setor = Setor(
        organization_id=servidor["org"].id, nome="Engenharia",
        responsavel_id=chefe["user"].id,
    )
    _db.add(setor)
    await _db.commit()

    d = await _demanda(client, assessor["headers"])
    await _tarefa(
        client, assessor["headers"], d["id"], titulo="Projeto arquitetônico",
        atribuida_a_id=str(servidor["user"].id), setor_destino_id=str(setor.id),
        prazo=_dias(-5),
    )

    resultado = await _varrer(_db, servidor["org"].id)
    assert resultado["escalonamentos"] >= 3

    from app.models import Alerta

    escalonamentos = (
        await _db.execute(
            select(Alerta).where(Alerta.tipo == "ESCALONAMENTO")
        )
    ).scalars().all()
    alvos = {a.metadados["nivel"] for a in escalonamentos}
    assert alvos == {"RESPONSAVEL", "CHEFE_SETOR", "RESPONSAVEL_GERAL"}
    destinatarios = {a.responsavel_id for a in escalonamentos}
    assert servidor["user"].id in destinatarios
    assert chefe["user"].id in destinatarios
    assert assessor["user"].id in destinatarios

    # Repetir a varredura não cobra ninguém de novo.
    repetida = await _varrer(_db, servidor["org"].id)
    assert repetida["escalonamentos"] == 0


@pytest.mark.asyncio
async def test_demanda_parada_dispara_alerta(client, make_tenant, catalogo_padrao, _db):
    """§39 — o alerta que evita a demanda esquecida entre departamentos."""
    from app.models import Demanda

    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])

    demanda = await _db.get(Demanda, __import__("uuid").UUID(d["id"]))
    demanda.ultima_movimentacao_em = datetime.now(timezone.utc) - timedelta(days=11)
    await _db.commit()

    await _varrer(_db, t["org"].id)
    painel = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    paradas = [a for a in painel["items"] if a["tipo"] == "DEMANDA_PARADA"]
    assert len(paradas) == 1
    assert "parada há 11 dias" in paradas[0]["titulo"]
    assert paradas[0]["metadados"]["marco"] == 7


@pytest.mark.asyncio
async def test_bloqueio_e_espera_de_terceiro_viram_alerta(
    client, make_tenant, catalogo_padrao, _db
):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await client.post(
        f"{BASE}/{d['id']}/bloquear",
        json={
            "motivo": "Aguardando autorização do órgão concedente",
            "aguardando_terceiro": "Governo do Estado",
        },
        headers=t["headers"],
    )

    await _varrer(_db, t["org"].id)
    painel = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    tipos = {a["tipo"] for a in painel["items"]}
    assert "DEMANDA_BLOQUEADA" in tipos
    assert "AGUARDANDO_TERCEIRO" in tipos


@pytest.mark.asyncio
async def test_marcar_lido_nao_resolve_o_alerta(client, make_tenant, catalogo_padrao, _db):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id),
                  prazo=_dias(-1))
    await _varrer(_db, t["org"].id)

    painel = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    alerta = painel["items"][0]

    lido = await client.post(f"{ALERTAS}/{alerta['id']}/lido", headers=t["headers"])
    assert lido.status_code == 200
    assert lido.json()["lido_em"] is not None
    assert lido.json()["resolvido_em"] is None

    depois = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    assert depois["resumo"]["nao_lidos"] == depois["resumo"]["total"] - 1


@pytest.mark.asyncio
async def test_dispensar_exige_motivo_e_fecha(client, make_tenant, catalogo_padrao, _db):
    t = await make_tenant("ASSESSOR")
    d = await _demanda(client, t["headers"])
    await _tarefa(client, t["headers"], d["id"], atribuida_a_id=str(t["user"].id),
                  prazo=_dias(-1))
    await _varrer(_db, t["org"].id)
    alerta = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()["items"][0]

    sem_motivo = await client.post(
        f"{ALERTAS}/{alerta['id']}/dispensar", json={}, headers=t["headers"]
    )
    assert sem_motivo.status_code == 422

    dispensado = await client.post(
        f"{ALERTAS}/{alerta['id']}/dispensar",
        json={"motivo": "Prazo prorrogado pelo órgão"},
        headers=t["headers"],
    )
    assert dispensado.status_code == 200
    assert dispensado.json()["resolvido_em"] is not None


@pytest.mark.asyncio
async def test_configuracao_de_marcos_altera_o_disparo(
    client, make_tenant, catalogo_padrao, _db
):
    t = await make_tenant("ADMIN")
    ajuste = await client.patch(
        f"{ALERTAS}/config",
        json={"marcos_prazo": [2], "inatividade_dias": [60]},
        headers=t["headers"],
    )
    assert ajuste.status_code == 200
    assert ajuste.json()["marcos_prazo"] == [2]

    d = await _demanda(client, t["headers"])
    await _tarefa(client, t["headers"], d["id"], titulo="Vence em 2",
                  atribuida_a_id=str(t["user"].id), prazo=_dias(2))
    await _tarefa(client, t["headers"], d["id"], titulo="Vence em 7",
                  atribuida_a_id=str(t["user"].id), prazo=_dias(7))

    await _varrer(_db, t["org"].id)
    painel = (await client.get(f"{ALERTAS}/painel", headers=t["headers"])).json()
    proximos = [a for a in painel["items"] if a["tipo"] == "PRAZO_PROXIMO"]
    assert len(proximos) == 1
    assert "Vence em 2" in proximos[0]["titulo"]


@pytest.mark.asyncio
async def test_escalonamento_invalido_e_recusado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ADMIN")
    resp = await client.patch(
        f"{ALERTAS}/config",
        json={"escalonamento": [{"dias": 1, "alvo": "PREFEITO_DIRETO"}]},
        headers=t["headers"],
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_alertas_nao_vazam_entre_municipios(client, make_tenant, catalogo_padrao, _db):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    d = await _demanda(client, a["headers"])
    await _tarefa(client, a["headers"], d["id"], atribuida_a_id=str(a["user"].id),
                  prazo=_dias(-4))
    await _varrer(_db, a["org"].id)

    painel_b = (await client.get(f"{ALERTAS}/painel", headers=b["headers"])).json()
    assert painel_b["total"] == 0
    assert painel_b["resumo"]["total"] == 0


@pytest.mark.asyncio
async def test_alerta_de_demanda_confidencial_nao_aparece_para_terceiros(
    client, make_tenant, catalogo_padrao, _db
):
    dono = await make_tenant("ASSESSOR")
    colega = await make_tenant("ENGENHEIRO_TECNICO", org=dono["org"])
    d = await _demanda(client, dono["headers"], confidencialidade="CONFIDENCIAL")
    await _tarefa(client, dono["headers"], d["id"], atribuida_a_id=str(dono["user"].id),
                  prazo=_dias(-2))
    await _varrer(_db, dono["org"].id)

    assert (await client.get(f"{ALERTAS}/painel", headers=colega["headers"])).json()["total"] == 0
    assert (await client.get(f"{ALERTAS}/painel", headers=dono["headers"])).json()["total"] >= 1
