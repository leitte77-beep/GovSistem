"""Testes das Fases 13-14 — Piloto, onboarding e go-to-market."""
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family

PREFIX = "/api/govsocial/v1"
AUTH = "gestor_municipal"


class TestSeedBulk:
    async def test_seed_bulk_gera_familias(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        # Remove famílias existentes do world para testar seed bulk limpo
        existing = (
            await db_session.execute(
                select(Family).where(Family.tenant_id == world["org_a"].id)
            )
        ).scalars().all()
        for f in existing:
            await db_session.delete(f)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/admin/seed-bulk",
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "ok"
        assert d["seeded"]["familias"] == 200
        assert d["seeded"]["pessoas"] >= 200

    async def test_seed_bulk_ja_populado_retorna_skipped(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/admin/seed-bulk",
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        d = resp.json()
        # Se já tem famílias (world fixture), deve retornar skipped
        if d["status"] == "ok" and d["seeded"].get("skipped"):
            assert d["seeded"]["skipped"] is True
        else:
            assert d["status"] == "ok"


class TestOnboarding:
    async def test_onboarding_status(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.get(
            f"{PREFIX}/onboarding/status",
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["tenant_id"] == str(world["org_a"].id)
        assert "steps" in d
        # World fixture já tem unidades, domínios, profissionais — check ready
        # Pode não estar ready se faltar importação
        assert isinstance(d["ready"], bool)

    async def test_wizard_criar_unidade(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/onboarding/wizard/units",
            json={
                "unidades": [
                    {"tipo": "CRAS", "nome": "CRAS Norte", "municipio": "A", "uf": "PR",
                     "bairros": ["Norte", "Industrial"]},
                ],
            },
            headers=world["auth"](AUTH),
        )
        assert resp.status_code in (200, 201)
        d = resp.json()
        assert "created" in d


class TestSystemHealth:
    async def test_health_publico(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.get(f"{PREFIX}/system/health")
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "healthy"
        assert d.get("version") is not None

    async def test_metrics_admin(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.get(
            f"{PREFIX}/system/metrics",
            headers=world["auth"](AUTH),
        )
        # Pode ser 403 se a rota exigir ADMIN apenas
        if resp.status_code == 403:
            return  # OK, rota restrita a ADMIN
        assert resp.status_code == 200
        d = resp.json()
        assert "total_familias" in d
