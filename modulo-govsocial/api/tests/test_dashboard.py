"""Testes da Fase 10 — Dashboards e Vigilância."""
from datetime import date, datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance
from app.models.audit_trail import AuditTrail
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

    async def test_activity_ator_e_nome_do_usuario_nao_o_role(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        """FIX 2: `ator` no feed de atividade deve ser o NOME de quem agiu
        (ex.: "User a_tecnico_superior"), nunca o cargo cru ("ADMIN"/role)."""
        gestor = world["users"][("A", "gestor_municipal")]
        db_session.add(AuditTrail(
            tenant_id=world["org_a"].id,
            actor_user_id=gestor.id,
            actor_role="gestor_municipal",
            action="READ",
            entity="family",
            entity_id=str(world["family_a"].id),
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/activity",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        item = resp.json()[0]
        assert item["ator"] == gestor.name
        assert item["ator"] != "gestor_municipal"
        assert item["ator"] != "ADMIN"

    async def test_activity_entidade_e_acao_sao_codigos_crus_sem_traducao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        """FIX 2: `entidade`/`acao` devem chegar como código cru em pt-BR
        (ex.: "familia"/"consultado"), não como rótulo já traduzido
        ("Família"/"consultado" com caixa/acentuação que quebra o mapper do
        frontend) — é o frontend quem monta a frase final."""
        gestor = world["users"][("A", "gestor_municipal")]
        db_session.add(AuditTrail(
            tenant_id=world["org_a"].id,
            actor_user_id=gestor.id,
            actor_role="gestor_municipal",
            action="READ",
            entity="family",
            entity_id=str(world["family_a"].id),
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/activity",
            headers=world["auth"]("gestor_municipal"),
        )
        item = resp.json()[0]
        assert item["entidade"] == "familia"
        assert item["acao"] == "consultado"

    async def test_activity_descricao_nao_deixa_palavra_crua_pendurada(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        """FIX 2 (erro C): quando não há detalhe estruturado (sem diff, ex.
        numa consulta/READ), `descricao` deve vir vazia — nunca repetir a
        ação crua ("consultado") como se fosse um sujeito solto."""
        gestor = world["users"][("A", "gestor_municipal")]
        for entity in ["family", "person", "rma", "encaminhamento"]:
            db_session.add(AuditTrail(
                tenant_id=world["org_a"].id,
                actor_user_id=gestor.id,
                actor_role="gestor_municipal",
                action="READ",
                entity=entity,
                entity_id="x",
            ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/activity?limit=10",
            headers=world["auth"]("gestor_municipal"),
        )
        for item in resp.json():
            assert item["descricao"] != "consultado"
            assert item["descricao"].strip() != item["acao"]

    async def test_activity_sem_actor_user_id_vira_ator_nulo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        """Evento de sistema (sem actor_user_id) não deve inventar um nome
        nem vazar o role; o frontend decide mostrar "Sistema"."""
        db_session.add(AuditTrail(
            tenant_id=world["org_a"].id,
            actor_user_id=None,
            actor_role=None,
            action="SEED",
            entity="domain_national_seed",
            entity_id=None,
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/dashboard/activity",
            headers=world["auth"]("gestor_municipal"),
        )
        item = resp.json()[0]
        assert item["ator"] is None
