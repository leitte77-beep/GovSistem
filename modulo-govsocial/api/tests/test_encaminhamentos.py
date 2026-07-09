"""Testes da Fase 7 — Encaminhamentos e rede."""
from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_text
from app.models.encaminhamento import Encaminhamento

PREFIX = "/api/govsocial/v1"


class TestEncaminhamento:
    async def test_criar_encaminhamento_interno(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        from app.models.case_file import CaseFile

        cf = CaseFile(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, service_type_code="PAIF",
            aberto_em=datetime.now(timezone.utc),
        )
        db_session.add(cf)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/encaminhamentos",
            json={
                "case_file_id": str(cf.id),
                "unit_id": str(world["unit_a"].id),
                "tipo": "INTERNO",
                "unidade_destino_id": str(world["unit_b"].id),
                "motivo": "Necessita acompanhamento especializado",
                "profissional_origem_id": str(world["prof_a"].id),
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["tipo"] == "INTERNO"
        assert d["status"] == "PENDENTE"
        assert d["unidade_destino_id"] == str(world["unit_b"].id)

    async def test_criar_encaminhamento_externo_com_oficio(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/encaminhamentos",
            json={
                "unit_id": str(world["unit_a"].id),
                "tipo": "EXTERNO",
                "referral_code": "SAUDE",
                "instituicao_destino": "UBS Central",
                "motivo": "Encaminhamento para avaliação médica",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["tipo"] == "EXTERNO"
        assert d["referral_code"] == "SAUDE"
        assert d["instituicao_destino"] == "UBS Central"
        assert d["numero_oficio"] == 1

    async def test_numero_oficio_sequencial(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        for _ in range(3):
            await client.post(
                f"{PREFIX}/encaminhamentos",
                json={
                    "unit_id": str(world["unit_a"].id),
                    "tipo": "EXTERNO",
                    "referral_code": "SAUDE",
                    "instituicao_destino": "UBS",
                },
                headers=world["auth"]("tecnico_superior"),
            )
        resp = await client.get(
            f"{PREFIX}/encaminhamentos?tipo=EXTERNO",
            headers=world["auth"]("tecnico_superior"),
        )
        items = resp.json()
        assert len(items) == 3
        assert items[0]["numero_oficio"] == 3

    async def test_interno_sem_destino_bloqueado(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.post(
            f"{PREFIX}/encaminhamentos",
            json={
                "unit_id": str(world["unit_a"].id),
                "tipo": "INTERNO",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 422

    async def test_externo_sem_referral_bloqueado(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.post(
            f"{PREFIX}/encaminhamentos",
            json={
                "unit_id": str(world["unit_a"].id),
                "tipo": "EXTERNO",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 422


class TestWorkflowEncaminhamento:
    async def _criar_interno(self, db, org_a, unit_a, unit_b):
        e = Encaminhamento(
            tenant_id=org_a, unit_id=unit_a,
            tipo="INTERNO", unidade_destino_id=unit_b,
            data_encaminhamento=datetime.now(timezone.utc),
            status="PENDENTE",
        )
        db.add(e)
        await db.commit()
        return e

    async def test_aceitar_encaminhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = await self._criar_interno(
            db_session, world["org_a"].id, world["unit_a"].id, world["unit_b"].id,
        )
        resp = await client.post(
            f"{PREFIX}/encaminhamentos/{e.id}/accept",
            json={"profissional_destino_id": str(world["prof_a"].id)},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "ACEITO"
        assert d["data_aceite"] is not None

    async def test_devolver_encaminhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = await self._criar_interno(
            db_session, world["org_a"].id, world["unit_a"].id, world["unit_b"].id,
        )
        e.status = "ACEITO"
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/encaminhamentos/{e.id}/return",
            json={"devolutiva": "Paciente atendido e contra-referenciado"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "DEVOLVIDO"
        assert d["data_devolutiva"] is not None
        assert d["devolutiva"] == "Paciente atendido e contra-referenciado"

    async def test_devolutiva_criptografada(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = await self._criar_interno(
            db_session, world["org_a"].id, world["unit_a"].id, world["unit_b"].id,
        )
        e.status = "ACEITO"
        await db_session.commit()

        await client.post(
            f"{PREFIX}/encaminhamentos/{e.id}/return",
            json={"devolutiva": "Conteúdo sigiloso da contrarreferência"},
            headers=world["auth"]("tecnico_superior"),
        )
        e_db = (
            await db_session.execute(
                select(Encaminhamento).where(Encaminhamento.id == e.id)
            )
        ).scalar_one()
        assert e_db.devolutiva_enc is not None
        assert e_db.devolutiva_enc != "Conteúdo sigiloso da contrarreferência"
        assert decrypt_text(e_db.devolutiva_enc) == "Conteúdo sigiloso da contrarreferência"

    async def test_recusar_encaminhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = await self._criar_interno(
            db_session, world["org_a"].id, world["unit_a"].id, world["unit_b"].id,
        )
        resp = await client.post(
            f"{PREFIX}/encaminhamentos/{e.id}/reject",
            json={"motivo_recusa": "Unidade sem capacidade no momento"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "RECUSADO"
        assert d["motivo_recusa"] == "Unidade sem capacidade no momento"

    async def test_gerar_oficio_externo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = Encaminhamento(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            tipo="EXTERNO", referral_code="SAUDE",
            data_encaminhamento=datetime.now(timezone.utc),
            numero_oficio=42,
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/encaminhamentos/{e.id}/generate-office",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["numero_oficio"] == 42
        assert data["status"] == "OFICIO_GERADO"

    async def test_cancelar_encaminhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = await self._criar_interno(
            db_session, world["org_a"].id, world["unit_a"].id, world["unit_b"].id,
        )
        resp = await client.post(
            f"{PREFIX}/encaminhamentos/{e.id}/cancel",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "CANCELADO"


class TestPainelPendentes:
    async def test_painel_pendentes_por_unidade_destino(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = Encaminhamento(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            tipo="INTERNO", unidade_destino_id=world["unit_b"].id,
            data_encaminhamento=datetime.now(timezone.utc),
            status="PENDENTE",
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/encaminhamentos-pendentes?unit_id={world['unit_b'].id}",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["status"] == "PENDENTE"

    async def test_painel_sem_pendentes_retorna_vazio(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.get(
            f"{PREFIX}/encaminhamentos-pendentes?unit_id={world['unit_a'].id}",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert resp.json() == []
