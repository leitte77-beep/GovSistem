"""Testes da Fase 8 — Agenda, recepção e visitas."""
from datetime import date, datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agenda import Appointment, VisitaDomiciliar

PREFIX = "/api/govsocial/v1"


def _ts(d):
    return datetime(d.year, d.month, d.day, 9, 0, tzinfo=timezone.utc)



class TestAppointments:
    async def test_criar_agendamento_com_senha(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/appointments",
            json={
                "unit_id": str(world["unit_a"].id),
                "professional_id": str(world["prof_a"].id),
                "person_id": str(world["person_a"].id),
                "tipo": "ATENDIMENTO",
                "data_hora_inicio": _ts(date.today()).isoformat(),
                "opt_in_lembrete": True,
            },
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["senha"] == "A"
        assert d["opt_in_lembrete"] is True
        assert d["status"] == "AGENDADO"

    async def test_senhas_sequenciais(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        for i in range(3):
            await client.post(
                f"{PREFIX}/appointments",
                json={
                    "unit_id": str(world["unit_a"].id),
                    "data_hora_inicio": _ts(date.today()).isoformat(),
                },
                headers=world["auth"]("recepcao"),
            )
        resp = await client.get(
            f"{PREFIX}/appointments/daily-queue?unit_id={world['unit_a'].id}",
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 3
        senhas = [i["senha"] for i in items]
        assert "A" in senhas
        assert "B" in senhas
        assert "C" in senhas

    async def test_listar_por_data(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        hoje = _ts(date.today())
        amanha = _ts(date.today() + timedelta(days=1))
        db_session.add(Appointment(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            data_hora_inicio=hoje, tipo="ATENDIMENTO",
        ))
        db_session.add(Appointment(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            data_hora_inicio=amanha, tipo="ATENDIMENTO",
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/appointments?data={date.today().isoformat()}",
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_chamar_proximo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = Appointment(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            data_hora_inicio=_ts(date.today()), tipo="ATENDIMENTO",
            senha="A01",
        )
        db_session.add(a)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/appointments/{a.id}/call",
            json={"professional_id": str(world["prof_a"].id)},
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "EM_ATENDIMENTO"
        assert resp.json()["professional_id"] == str(world["prof_a"].id)

    async def test_fila_do_dia(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        hoje = _ts(date.today())
        db_session.add(Appointment(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            data_hora_inicio=hoje, senha="A", status="AGENDADO",
            tipo="ATENDIMENTO",
        ))
        db_session.add(Appointment(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            data_hora_inicio=hoje, senha="B", status="AGUARDANDO",
            tipo="ATENDIMENTO",
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/appointments/daily-queue?unit_id={world['unit_a'].id}",
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2


class TestVisitasDomiciliares:
    async def test_planejar_visita(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/home-visits",
            json={
                "family_id": str(world["family_a"].id),
                "unit_id": str(world["unit_a"].id),
                "professional_id": str(world["prof_a"].id),
                "data_planejada": _ts(date.today() + timedelta(days=7)).isoformat(),
                "observacoes": "Visita de rotina",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["status"] == "PLANEJADA"
        assert d["observacoes"] == "Visita de rotina"

    async def test_realizar_visita(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        v = VisitaDomiciliar(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id,
            data_planejada=_ts(date.today()),
            status="PLANEJADA",
        )
        db_session.add(v)
        await db_session.commit()

        resp = await client.patch(
            f"{PREFIX}/home-visits/{v.id}",
            json={
                "status": "REALIZADA",
                "endereco_confirmado": "Rua das Flores, 123",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "REALIZADA"
        assert d["data_realizada"] is not None

    async def test_listar_visitas_por_familia(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        v = VisitaDomiciliar(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id,
            data_planejada=_ts(date.today()),
        )
        db_session.add(v)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/home-visits?family_id={world['family_a'].id}",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_recepcao_pode_agendar(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.post(
            f"{PREFIX}/appointments",
            json={
                "unit_id": str(world["unit_a"].id),
                "data_hora_inicio": _ts(date.today()).isoformat(),
            },
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 201
