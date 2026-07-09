"""Testes da Fase 6 — Ações Coletivas e SCFV."""
from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acao_coletiva import AcaoColetiva, Inscricao

PREFIX = "/api/govsocial/v1"


class TestAcoesColetivas:
    async def test_criar_acao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/acoes-coletivas",
            json={
                "unit_id": str(world["unit_a"].id),
                "nome": "Grupo de Convivência Infantil",
                "tipo": "GRUPO_SCFV",
                "faixa_etaria": "CRIANCA",
                "data_inicio": "2026-08-01",
                "periodicidade": "SEMANAL",
                "dia_semana": "terca",
                "vagas_total": 20,
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["nome"] == "Grupo de Convivência Infantil"
        assert d["vagas_disponiveis"] == 20

    async def test_listar_acoes(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = AcaoColetiva(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            nome="SCFV Idosos", tipo="GRUPO_SCFV", data_inicio=date.today(),
        )
        db_session.add(a)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/acoes-coletivas",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_filtrar_por_tipo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a1 = AcaoColetiva(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            nome="SCFV", tipo="GRUPO_SCFV", data_inicio=date.today(),
        )
        a2 = AcaoColetiva(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            nome="Oficina", tipo="OFICINA", data_inicio=date.today(),
        )
        db_session.add_all([a1, a2])
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/acoes-coletivas?tipo=OFICINA",
            headers=world["auth"]("tecnico_superior"),
        )
        items = resp.json()
        assert len(items) == 1
        assert items[0]["tipo"] == "OFICINA"

    async def test_atualizar_acao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = AcaoColetiva(
            tenant_id=world["org_a"].id, unit_id=world["unit_a"].id,
            nome="SCFV", tipo="GRUPO_SCFV", data_inicio=date.today(),
        )
        db_session.add(a)
        await db_session.commit()

        resp = await client.patch(
            f"{PREFIX}/acoes-coletivas/{a.id}",
            json={"nome": "SCFV Renomeado", "status": "SUSPENSA"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["nome"] == "SCFV Renomeado"
        assert d["status"] == "SUSPENSA"


class TestInscricoes:
    async def _acao(self, db, org_a, unit_a):
        a = AcaoColetiva(
            tenant_id=org_a, unit_id=unit_a,
            nome="SCFV Teste", tipo="GRUPO_SCFV",
            data_inicio=date.today(), vagas_total=10, vagas_disponiveis=10,
        )
        db.add(a)
        await db.flush()
        return a

    async def test_inscrever_participante(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = await self._acao(db_session, world["org_a"].id, world["unit_a"].id)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/acoes-coletivas/{a.id}/enrollments",
            json={"person_id": str(world["person_a"].id)},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "ATIVA"

    async def test_inscricao_duplicada_bloqueada(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = await self._acao(db_session, world["org_a"].id, world["unit_a"].id)
        i = Inscricao(
            tenant_id=world["org_a"].id, acao_coletiva_id=a.id,
            person_id=world["person_a"].id, status="ATIVA",
        )
        db_session.add(i)
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/acoes-coletivas/{a.id}/enrollments",
            json={"person_id": str(world["person_a"].id)},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 409

    async def test_inscricao_sem_vagas_vai_espera(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = await self._acao(db_session, world["org_a"].id, world["unit_a"].id)
        a.vagas_disponiveis = 0
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/acoes-coletivas/{a.id}/enrollments",
            json={"person_id": str(world["person_a"].id)},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "LISTA_ESPERA"

    async def test_desligar_inscricao_libera_vaga(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a = await self._acao(db_session, world["org_a"].id, world["unit_a"].id)
        i = Inscricao(
            tenant_id=world["org_a"].id, acao_coletiva_id=a.id,
            person_id=world["person_a"].id, status="ATIVA",
        )
        db_session.add(i)
        a.vagas_disponiveis = 9
        await db_session.commit()

        resp = await client.patch(
            f"{PREFIX}/acoes-coletivas/{a.id}/enrollments/{i.id}",
            json={"status": "DESLIGADA", "motivo_desligamento": "Mudança de endereço"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["status"] == "DESLIGADA"
        assert d["motivo_desligamento"] == "Mudança de endereço"


class TestFrequencia:
    async def _setup(self, db, org_a, unit_a, person_id):
        a = AcaoColetiva(
            tenant_id=org_a, unit_id=unit_a,
            nome="SCFV Frequência", tipo="GRUPO_SCFV", data_inicio=date.today(),
        )
        db.add(a)
        await db.flush()
        i = Inscricao(
            tenant_id=org_a, acao_coletiva_id=a.id,
            person_id=person_id, status="ATIVA",
        )
        db.add(i)
        await db.flush()
        return a, i

    async def test_criar_encontro_com_frequencia_automatica(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a, i = await self._setup(
            db_session, world["org_a"].id, world["unit_a"].id, world["person_a"].id,
        )
        await db_session.commit()

        resp = await client.post(
            f"{PREFIX}/acoes-coletivas/{a.id}/meetings",
            json={"data_encontro": "2026-08-05", "tema": "Oficina de artes"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        d = resp.json()
        assert d["total_presentes"] == 1
        assert d["tema"] == "Oficina de artes"

    async def test_listar_encontros(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        from app.models.acao_coletiva import EncontroFrequencia

        a, i = await self._setup(
            db_session, world["org_a"].id, world["unit_a"].id, world["person_a"].id,
        )
        e = EncontroFrequencia(
            tenant_id=world["org_a"].id, acao_coletiva_id=a.id,
            data_encontro=date.today(),
        )
        db_session.add(e)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/acoes-coletivas/{a.id}/meetings",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_relatorio_participacao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        a, i = await self._setup(
            db_session, world["org_a"].id, world["unit_a"].id, world["person_a"].id,
        )
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/acoes-coletivas/{a.id}/report",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        dados = resp.json()
        assert len(dados) == 1
        assert dados[0]["person_id"] == str(world["person_a"].id)
