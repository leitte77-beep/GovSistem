"""Testes da Fase 5 — Benefícios Eventuais."""
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_text
from app.models.beneficio import ConcessaoBeneficio, EstoqueUnidade

PREFIX = "/api/govsocial/v1"


def _rh(headers):
    return {"Authorization": f"Bearer {headers}"}


class TestEstoque:
    async def test_criar_estoque(self, client: AsyncClient, world: dict, db_session: AsyncSession):
        resp = await client.post(
            f"{PREFIX}/stock",
            json={
                "unit_id": str(world["unit_a"].id),
                "benefit_type_code": "NATALIDADE",
                "quantidade_inicial": "50.00",
                "quantidade_minima": "10.00",
                "unidade_medida": "UNIDADE",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["benefit_type_code"] == "NATALIDADE"
        assert Decimal(d["quantidade_atual"]) == Decimal("50.00")

    async def test_criar_estoque_duplicado_bloqueado(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="NATALIDADE", quantidade_atual=Decimal("10"),
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/stock",
            json={
                "unit_id": str(world["unit_a"].id),
                "benefit_type_code": "NATALIDADE",
                "quantidade_inicial": "20.00",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 409

    async def test_listar_estoque(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="CESTA", quantidade_atual=Decimal("30"),
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.get(f"{PREFIX}/stock", headers=world["auth"]("tecnico_superior"))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_filtrar_por_unidade(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="NATALIDADE", quantidade_atual=Decimal("5"),
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/stock?unit_id={world['unit_a'].id}",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_movimentar_estoque_entrada(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="NATALIDADE", quantidade_atual=Decimal("10"),
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/stock/{e.id}/movement",
            json={"quantidade": "5.00", "observacao": "Reposição"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert Decimal(resp.json()["novo_saldo"]) == Decimal("15.00")

    async def test_movimentar_estoque_saida_insuficiente(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        e = EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="NATALIDADE", quantidade_atual=Decimal("3"),
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/stock/{e.id}/movement",
            json={"quantidade": "-10.00"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 422


class TestConcessaoBeneficio:
    async def test_criar_concessao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/benefit-concessions",
            json={
                "family_id": str(world["family_a"].id),
                "unit_id": str(world["unit_a"].id),
                "benefit_type_code": "NATALIDADE",
                "quantidade": "1",
                "solicitado_por_id": str(world["prof_a"].id),
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["status"] == "SOLICITADO"
        assert d["benefit_type_code"] == "NATALIDADE"

    async def test_antiduplicidade_bloqueia(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        from datetime import datetime, timezone

        c = ConcessaoBeneficio(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, benefit_type_code="NATALIDADE",
            status="ENTREGUE", data_solicitacao=datetime.now(timezone.utc),
        )
        db_session.add(c)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/benefit-concessions",
            json={
                "family_id": str(world["family_a"].id),
                "unit_id": str(world["unit_a"].id),
                "benefit_type_code": "NATALIDADE",
                "quantidade": "1",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 409

    async def test_listar_concessoes(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        from datetime import datetime, timezone

        c = ConcessaoBeneficio(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, benefit_type_code="NATALIDADE",
            data_solicitacao=datetime.now(timezone.utc),
        )
        db_session.add(c)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/benefit-concessions",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


class TestWorkflowConcessao:
    async def _criar(self, client, world, db_session):
        from datetime import datetime, timezone

        c = ConcessaoBeneficio(
            tenant_id=world["org_a"].id, family_id=world["family_a"].id,
            unit_id=world["unit_a"].id, benefit_type_code="ALIMENTACAO",
            data_solicitacao=datetime.now(timezone.utc),
        )
        db_session.add(c)
        await db_session.commit()
        return c

    async def test_workflow_completo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        c = await self._criar(client, world, db_session)
        auth = world["auth"]("tecnico_superior")

        # 1. Emitir parecer
        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/analyze",
            json={"parecer": "Família atende aos critérios"},
            headers=auth,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "EM_ANALISE"

        # 2. Aprovar
        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/approve",
            json={},
            headers=auth,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "APROVADO"

        # 3. Entregar (com estoque ok)
        EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="ALIMENTACAO", quantidade_atual=Decimal("10"),
        )
        await db_session.commit()

        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/deliver",
            json={},
            headers=auth,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ENTREGUE"
        assert d["comprovante_gerado"] is True

    async def test_parecer_criptografado(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        c = await self._criar(client, world, db_session)

        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/analyze",
            json={"parecer": "Conteúdo sigiloso do parecer técnico"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["parecer"] == "Conteúdo sigiloso do parecer técnico"

        c_db = (
            await db_session.execute(
                select(ConcessaoBeneficio).where(ConcessaoBeneficio.id == c.id)
            )
        ).scalar_one()
        assert c_db.parecer_enc is not None
        assert c_db.parecer_enc != "Conteúdo sigiloso do parecer técnico"
        assert decrypt_text(c_db.parecer_enc) == "Conteúdo sigiloso do parecer técnico"

    async def test_negar_concessao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        c = await self._criar(client, world, db_session)

        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/deny",
            json={"motivo_negacao": "Renda familiar acima do critério"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "NEGADO"
        assert d["motivo_negacao"] == "Renda familiar acima do critério"

    async def test_cancelar_concessao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        c = await self._criar(client, world, db_session)

        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/cancel",
            headers=world["auth"]("tecnico_superior"),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "CANCELADO"

    async def test_nao_pode_entregar_sem_aprovar(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        c = await self._criar(client, world, db_session)

        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/deliver",
            json={},
            headers=world["auth"]("tecnico_superior"),
        )
        assert r.status_code == 422

    async def test_entrega_sem_estoque_libera(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        """Se não há estoque cadastrado, a entrega é liberada (estoque é opcional)."""
        c = await self._criar(client, world, db_session)
        auth = world["auth"]("tecnico_superior")

        await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/approve", json={}, headers=auth,
        )
        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/deliver", json={}, headers=auth,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ENTREGUE"

    async def test_entrega_consome_estoque(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        c = await self._criar(client, world, db_session)
        auth = world["auth"]("tecnico_superior")
        estoque = EstoqueUnidade(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            benefit_type_code="ALIMENTACAO", quantidade_atual=Decimal("100"),
        )
        db_session.add(estoque)
        await db_session.commit()

        await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/approve", json={}, headers=auth,
        )
        r = await client.post(
            f"{PREFIX}/benefit-concessions/{c.id}/deliver", json={}, headers=auth,
        )
        assert r.status_code == 200

        e_db = (
            await db_session.execute(
                select(EstoqueUnidade).where(EstoqueUnidade.id == estoque.id)
            )
        ).scalar_one()
        assert e_db.quantidade_atual == Decimal("99.00")

    async def test_rbac_recepcao_nao_cria(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/benefit-concessions",
            json={
                "family_id": str(world["family_a"].id),
                "unit_id": str(world["unit_a"].id),
                "benefit_type_code": "NATALIDADE",
                "quantidade": "1",
            },
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 403
