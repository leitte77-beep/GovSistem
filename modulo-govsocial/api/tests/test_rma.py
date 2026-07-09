"""Testes da Fase 9 — RMA (Registro Mensal de Atendimentos)."""
from datetime import date, datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance
from app.models.case_file import CaseFile
from app.models.rma import RmaFechamento

PREFIX = "/api/govsocial/v1"


class TestRmaCalculo:
    async def _setup_cras(self, db, org, unit, family, prof_id):
        """Cria prontuário com atendimentos e acompanhamento PAIF ativo."""
        cf = CaseFile(
            tenant_id=org, family_id=family, unit_id=unit,
            service_type_code="PAIF",
            aberto_em=datetime.now(timezone.utc),
        )
        db.add(cf)
        await db.flush()

        # Atendimento (conta no Bloco C)
        att = Attendance(
            tenant_id=org, case_file_id=cf.id, unit_id=unit,
            service_type_code="PAIF",
            data_atendimento=datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc),
            tipo="INDIVIDUAL",
        )
        db.add(att)

        # Acompanhamento PAIF ativo (conta no Bloco A)
        ac = Acompanhamento(
            tenant_id=org, case_file_id=cf.id, tipo="PAIF",
            data_inicio=date(2026, 6, 1), situacao="ATIVO",
        )
        db.add(ac)
        await db.flush()
        return cf

    async def test_calcular_rma_cras_com_dados(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        await self._setup_cras(
            db_session, world["org_a"].id, world["unit_a"].id,
            world["family_a"].id, world["prof_a"].id,
        )
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/rma/calculate?unit_id={world['unit_a'].id}&ano=2026&mes=7",
            headers=world["auth"]("coordenador_unidade"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "ABERTO"
        assert d["ano"] == 2026 and d["mes"] == 7
        dados = d["dados_calculados"]
        assert "CRAS_A" in dados
        assert "CRAS_C" in dados
        assert dados["CRAS_A"]["A1_familias_acompanhamento"] >= 1
        assert dados["CRAS_C"]["C1_total_familias_atendidas"] >= 1

    async def test_recalculo_idempotente(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp1 = await client.post(
            f"{PREFIX}/rma/calculate?unit_id={world['unit_a'].id}&ano=2026&mes=8",
            headers=world["auth"]("coordenador_unidade"),
        )
        resp2 = await client.post(
            f"{PREFIX}/rma/calculate?unit_id={world['unit_a'].id}&ano=2026&mes=8",
            headers=world["auth"]("coordenador_unidade"),
        )
        assert resp1.json()["id"] == resp2.json()["id"]

    async def test_recepcao_nao_ve_rma(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.post(
            f"{PREFIX}/rma/calculate?unit_id={world['unit_a'].id}&ano=2026&mes=9",
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 403


class TestRmaFechamento:
    async def _fechamento(self, db, org, unit):
        f = RmaFechamento(
            tenant_id=org, unit_id=unit, ano=2026, mes=7,
            dados_calculados={"CRAS_A": {"A1_familias_acompanhamento": 42}},
            calculado_em=datetime.now(timezone.utc),
        )
        db.add(f)
        await db.commit()
        return f

    async def test_fechar_rma(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        resp = await client.post(
            f"{PREFIX}/rma/{f.id}/close",
            headers=world["auth"]("coordenador_unidade"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "FECHADO"
        assert resp.json()["fechado_em"] is not None

    async def test_nao_pode_fechar_ja_fechado(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        f.status = "FECHADO"
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/rma/{f.id}/close",
            headers=world["auth"]("coordenador_unidade"),
        )
        assert resp.status_code == 422

    async def test_reabrir_rma(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        f.status = "FECHADO"
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/rma/{f.id}/reopen",
            json={"motivo_reabertura": "Erro na contagem de visitas"},
            headers=world["auth"]("coordenador_unidade"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "REABERTO"
        assert "Erro na contagem" in d["motivo_reabertura"]

    async def test_ajustar_valor_rma(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        resp = await client.post(
            f"{PREFIX}/rma/{f.id}/adjust",
            json={
                "bloco": "CRAS_A",
                "campo": "A1_familias_acompanhamento",
                "valor_calculado": 42,
                "valor_ajustado": 45,
                "justificativa": "3 famílias identificadas em busca ativa pós-fechamento",
            },
            headers=world["auth"]("coordenador_unidade"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["valor_ajustado"] == 45
        assert d["justificativa"] == "3 famílias identificadas em busca ativa pós-fechamento"

    async def test_exportar_csv(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        resp = await client.get(
            f"{PREFIX}/rma/{f.id}/export",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
        assert "CRAS_A" in resp.text

    async def test_gestor_tambem_ve_rma(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        resp = await client.get(
            f"{PREFIX}/rma/{f.id}",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200

    async def test_isolamento_tenant_rma(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        f = await self._fechamento(
            db_session, world["org_a"].id, world["unit_a"].id,
        )
        resp = await client.get(
            f"{PREFIX}/rma/{f.id}",
            headers=world["auth"]("gestor_municipal", "B"),
        )
        assert resp.status_code == 404


class TestRegrasContagem:
    """Valida regras de negócio do RMA conforme manuais do MDS."""

    async def test_familia_contada_uma_vez_no_mes(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = CaseFile(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, service_type_code="PAIF",
            aberto_em=datetime.now(timezone.utc),
        )
        db_session.add(cf)
        await db_session.flush()

        # 3 atendimentos para a mesma família no mês
        for dia in [5, 10, 15]:
            db_session.add(Attendance(
                tenant_id=world["org_a"].id, case_file_id=cf.id,
                unit_id=world["unit_a"].id, service_type_code="PAIF",
                data_atendimento=datetime(2026, 7, dia, 10, 0, tzinfo=timezone.utc),
                tipo="INDIVIDUAL",
            ))
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/rma/calculate?unit_id={world['unit_a'].id}&ano=2026&mes=7",
            headers=world["auth"]("coordenador_unidade"),
        )
        dados = resp.json()["dados_calculados"]
        # Família contada 1×, não 3×
        assert dados["CRAS_C"]["C1_total_familias_atendidas"] == 1

    async def test_acompanhamento_iniciado_encerrado_mesmo_mes_conta_novo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = CaseFile(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, service_type_code="PAIF",
            aberto_em=datetime.now(timezone.utc),
        )
        db_session.add(cf)
        await db_session.flush()
        db_session.add(Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id, tipo="PAIF",
            data_inicio=date(2026, 7, 5), situacao="ATIVO",
        ))
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/rma/calculate?unit_id={world['unit_a'].id}&ano=2026&mes=7",
            headers=world["auth"]("coordenador_unidade"),
        )
        dados = resp.json()["dados_calculados"]
        # Iniciado em julho → conta como novo (A2 ≥ 1)
        assert dados["CRAS_A"]["A2_familias_novas_mes"] >= 1
