"""Testes da Fase 10 — Dashboards e Vigilância."""
from datetime import date, datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance
from app.models.case_file import CaseFile
from app.models.family import Family

PREFIX = "/api/govsocial/v1"


class TestDashboard:
    async def _povoar(self, db, org, unit, family):
        cf = CaseFile(
            tenant_id=org, family_id=family, unit_id=unit,
            service_type_code="PAIF", aberto_em=datetime.now(timezone.utc),
        )
        db.add(cf)
        await db.flush()
        db.add(Attendance(
            tenant_id=org, case_file_id=cf.id, unit_id=unit,
            service_type_code="PAIF", tipo="INDIVIDUAL",
            data_atendimento=datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc),
        ))
        db.add(Acompanhamento(
            tenant_id=org, case_file_id=cf.id, tipo="PAIF",
            data_inicio=date(2026, 7, 1), situacao="ATIVO",
        ))
        await db.flush()

    async def test_overview(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        await self._povoar(
            db_session, world["org_a"].id, world["unit_a"].id, world["family_a"].id,
        )
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/overview",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["atendimentos_mes"] >= 1
        assert d["acompanhamentos_ativos"] >= 1
        assert d["familias_cadastradas"] >= 1

    async def test_time_series(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        await self._povoar(
            db_session, world["org_a"].id, world["unit_a"].id, world["family_a"].id,
        )
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/time-series?meses=6",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 6

    async def test_by_territory(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        await db_session.commit()
        resp = await client.get(
            f"{PREFIX}/dashboard/by-territory",
            headers=world["auth"]("vigilancia"),
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_map_agregado(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        await db_session.commit()
        resp = await client.get(
            f"{PREFIX}/dashboard/map",
            headers=world["auth"]("vigilancia"),
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_benefits_report(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        from app.models.beneficio import ConcessaoBeneficio

        db_session.add(ConcessaoBeneficio(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, benefit_type_code="NATALIDADE",
            status="ENTREGUE",
            data_solicitacao=datetime(2026, 7, 1, tzinfo=timezone.utc),
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/benefits-report?ano=2026&mes=7",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        dados = resp.json()
        assert len(dados) >= 1

    async def test_indicators(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        db_session.add(Family(
            tenant_id=world["org_a"].id, codigo=99,
            beneficiaria_pbf=True, possui_bpc=False,
            faixa_renda="EXTREMA_POBREZA",
            bairro="Centro", territorio="Centro",
            municipio="A", uf="PR",
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/indicators",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["total_familias"] >= 1
        assert d["pbf_percentual"] >= 0

    async def test_rbac_conselho_ve_agregados(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.get(
            f"{PREFIX}/dashboard/overview",
            headers=world["auth"]("conselho"),
        )
        assert resp.status_code == 403

    async def test_vigilancia_ve_dashboards(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.get(
            f"{PREFIX}/dashboard/indicators",
            headers=world["auth"]("vigilancia"),
        )
        assert resp.status_code == 200
