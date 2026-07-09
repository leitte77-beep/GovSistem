"""Testes da Fase 12 — LGPD, segurança e rate limiting."""
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person
from app.models.retention import RetentionPolicy

PREFIX = "/api/govsocial/v1"
AUTH = "gestor_municipal"


class TestLgpd:
    async def test_extrato_dados(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.get(
            f"{PREFIX}/lgpd/extract/{world['person_a'].id}",
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert "dados_cadastrais" in d
        assert d["dados_cadastrais"]["nome_civil"] == "Maria da Silva"

    async def test_corrigir_dados(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/lgpd/correct/{world['person_a'].id}",
            json={"nome_civil": "Maria Corrigida", "escolaridade": "SUPERIOR_COMPLETO"},
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        assert resp.json()["campos"] == ["nome_civil", "escolaridade"]

        p_db = (
            await db_session.execute(
                select(Person).where(Person.id == world["person_a"].id)
            )
        ).scalar_one()
        assert p_db.nome_civil == "Maria Corrigida"

    async def test_eliminar_dados_anonimiza(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/lgpd/delete/{world['person_a'].id}",
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        assert "eliminados" in resp.json()["message"].lower()

        p_db = (
            await db_session.execute(
                select(Person).where(Person.id == world["person_a"].id)
            )
        ).scalar_one()
        assert p_db.nome_civil == "[ANONIMIZADO]"
        assert p_db.cpf is None
        assert p_db.deleted_at is not None

    async def test_recepcao_nao_acessa_lgpd(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.get(
            f"{PREFIX}/lgpd/extract/{world['person_a'].id}",
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 403


class TestRetentionPolicies:
    async def test_criar_politica_retencao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/retention-policies",
            json={
                "categoria": "ATENDIMENTOS",
                "retencao_dias": 1825,
                "acao": "ANONIMIZAR",
            },
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["categoria"] == "ATENDIMENTOS"
        assert d["retencao_dias"] == 1825

    async def test_listar_politicas(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        db_session.add(RetentionPolicy(
            tenant_id=world["org_a"].id, categoria="AUDITORIA",
            retencao_dias=3650, acao="EXPURGAR",
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/retention-policies",
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1
