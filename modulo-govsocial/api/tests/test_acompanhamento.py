"""Testes da Fase 4 — Acompanhamentos, Planos, PIA e Alertas."""

import uuid
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_text
from app.models.acompanhamento import Acompanhamento
from app.models.case_file import CaseFile
from app.models.pia import Pia
from app.models.plano_acompanhamento import (
    AcaoPlano,
    AvaliacaoPlano,
    PlanoAcompanhamento,
)


def _url(cf_id: uuid.UUID, suffix: str = "") -> str:
    base = f"/api/govsocial/v1/case-files/{cf_id}"
    return f"{base}{suffix}"


async def _criar_case_file(db: AsyncSession, tenant_id, family_id, unit_id) -> CaseFile:
    from datetime import datetime, timezone

    cf = CaseFile(
        tenant_id=tenant_id,
        family_id=family_id,
        unit_id=unit_id,
        service_type_code="PAIF",
        aberto_em=datetime.now(timezone.utc),
    )
    db.add(cf)
    await db.flush()
    return cf


# ═══════════════════════════════════════════════════════════════════════
# Acompanhamentos
# ═══════════════════════════════════════════════════════════════════════

class TestAcompanhamento:
    async def test_criar_acompanhamento_paif(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, "/accompaniments"),
            json={
                "tipo": "PAIF",
                "data_inicio": "2026-07-01",
                "profissional_responsavel_id": str(world["prof_a"].id),
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["tipo"] == "PAIF"
        assert data["situacao"] == "ATIVO"
        assert data["case_file_id"] == str(cf.id)

    async def test_criar_acompanhamento_mse(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, "/accompaniments"),
            json={"tipo": "MSE-LA", "data_inicio": "2026-07-01"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        assert resp.json()["tipo"] == "MSE-LA"

    async def test_recepcao_bloqueado_criar_acompanhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, "/accompaniments"),
            json={"tipo": "PAIF", "data_inicio": "2026-07-01"},
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 403

    async def test_listar_acompanhamentos(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAIF", data_inicio=date.today(),
        )
        db_session.add(ac)
        await db_session.commit()

        resp = await client.get(
            _url(cf.id, "/accompaniments"),
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["tipo"] == "PAIF"

    async def test_filtrar_por_situacao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac1 = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAIF", data_inicio=date.today(), situacao="ATIVO",
        )
        ac2 = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAEFI", data_inicio=date.today(), situacao="ENCERRADO",
            data_fim=date.today(),
        )
        db_session.add_all([ac1, ac2])
        await db_session.commit()

        resp = await client.get(
            _url(cf.id, "/accompaniments?situacao=ATIVO"),
            headers=world["auth"]("tecnico_superior"),
        )
        items = resp.json()
        assert len(items) == 1
        assert items[0]["situacao"] == "ATIVO"

    async def test_encerrar_acompanhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAIF", data_inicio=date.today(),
        )
        db_session.add(ac)
        await db_session.commit()

        resp = await client.patch(
            _url(cf.id, f"/accompaniments/{ac.id}"),
            json={
                "situacao": "ENCERRADO",
                "data_fim": "2026-07-15",
                "motivo_desligamento": "OBJETIVOS_ALCANCADOS",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["situacao"] == "ENCERRADO"
        assert data["motivo_desligamento"] == "OBJETIVOS_ALCANCADOS"

    async def test_isolamento_tenant_acompanhamento(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAIF", data_inicio=date.today(),
        )
        db_session.add(ac)
        await db_session.commit()

        resp = await client.get(
            _url(cf.id, f"/accompaniments/{ac.id}"),
            headers=world["auth"]("tecnico_superior", "B"),
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# Plano de Acompanhamento
# ═══════════════════════════════════════════════════════════════════════

class TestPlanoAcompanhamento:
    async def _criar_acompanhamento(self, db, org_a, cf_id) -> Acompanhamento:
        ac = Acompanhamento(
            tenant_id=org_a, case_file_id=cf_id,
            tipo="PAIF", data_inicio=date.today(),
        )
        db.add(ac)
        await db.flush()
        return ac

    async def test_criar_plano(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = await self._criar_acompanhamento(db_session, world["org_a"].id, cf.id)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/accompaniments/{ac.id}/plan"),
            json={
                "diagnostico": "Família em situação de vulnerabilidade",
                "vulnerabilidades": "Desemprego, baixa escolaridade",
                "potencialidades": "Rede de apoio familiar presente",
                "objetivos": "Inserção em programas de transferência de renda",
                "data_proxima_avaliacao": "2026-10-01",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["diagnostico"] == "Família em situação de vulnerabilidade"
        assert data["vulnerabilidades"] == "Desemprego, baixa escolaridade"

    async def test_plano_duplicado_bloqueado(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = await self._criar_acompanhamento(db_session, world["org_a"].id, cf.id)
        plano = PlanoAcompanhamento(
            tenant_id=world["org_a"].id,
            acompanhamento_id=ac.id,
            case_file_id=cf.id,
        )
        db_session.add(plano)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/accompaniments/{ac.id}/plan"),
            json={"diagnostico": "Outro"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 409

    async def test_atualizar_plano(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = await self._criar_acompanhamento(db_session, world["org_a"].id, cf.id)
        plano = PlanoAcompanhamento(
            tenant_id=world["org_a"].id,
            acompanhamento_id=ac.id, case_file_id=cf.id,
            diagnostico="Inicial",
        )
        db_session.add(plano)
        await db_session.commit()

        resp = await client.patch(
            _url(cf.id, f"/accompaniments/{ac.id}/plan"),
            json={"diagnostico": "Atualizado", "objetivos": "Novo objetivo"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["diagnostico"] == "Atualizado"
        assert data["objetivos"] == "Novo objetivo"


# ═══════════════════════════════════════════════════════════════════════
# Ações do Plano
# ═══════════════════════════════════════════════════════════════════════

class TestAcoesPlano:
    async def _setup(self, db, org_a, cf):
        ac = Acompanhamento(tenant_id=org_a, case_file_id=cf.id, tipo="PAIF", data_inicio=date.today())
        db.add(ac)
        await db.flush()
        plano = PlanoAcompanhamento(tenant_id=org_a, acompanhamento_id=ac.id, case_file_id=cf.id)
        db.add(plano)
        await db.flush()
        return ac, plano

    async def test_criar_acao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/actions"),
            json={
                "descricao": "Encaminhar para CadÚnico",
                "responsavel_id": str(world["prof_a"].id),
                "prazo": "2026-08-01",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["descricao"] == "Encaminhar para CadÚnico"
        assert data["status"] == "PENDENTE"

    async def test_listar_acoes(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        db_session.add(AcaoPlano(tenant_id=world["org_a"].id, plano_id=plano.id, descricao="Ação 1"))
        db_session.add(AcaoPlano(tenant_id=world["org_a"].id, plano_id=plano.id, descricao="Ação 2"))
        await db_session.commit()

        resp = await client.get(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/actions"),
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_concluir_acao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        acao = AcaoPlano(tenant_id=world["org_a"].id, plano_id=plano.id, descricao="Ação")
        db_session.add(acao)
        await db_session.commit()

        resp = await client.patch(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/actions/{acao.id}"),
            json={"status": "CONCLUIDA"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "CONCLUIDA"
        assert data["data_conclusao"] is not None

    async def test_excluir_acao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        acao = AcaoPlano(tenant_id=world["org_a"].id, plano_id=plano.id, descricao="Removível")
        db_session.add(acao)
        await db_session.commit()

        resp = await client.delete(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/actions/{acao.id}"),
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 204


# ═══════════════════════════════════════════════════════════════════════
# Avaliações do Plano
# ═══════════════════════════════════════════════════════════════════════

class TestAvaliacoesPlano:
    async def _setup(self, db, org_a, cf):
        ac = Acompanhamento(tenant_id=org_a, case_file_id=cf.id, tipo="PAIF", data_inicio=date.today())
        db.add(ac)
        await db.flush()
        plano = PlanoAcompanhamento(tenant_id=org_a, acompanhamento_id=ac.id, case_file_id=cf.id)
        db.add(plano)
        await db.flush()
        return ac, plano

    async def test_criar_avaliacao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/evaluations"),
            json={
                "data_avaliacao": "2026-09-01",
                "resultado": "POSITIVO",
                "evolucao": "Família demonstrou avanços significativos",
                "avaliador_id": str(world["prof_a"].id),
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["resultado"] == "POSITIVO"
        assert data["evolucao"] == "Família demonstrou avanços significativos"

    async def test_avaliacao_atualiza_proxima_data_plano(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        await db_session.commit()

        await client.post(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/evaluations"),
            json={
                "data_avaliacao": "2026-09-01",
                "resultado": "PARCIAL",
                "nova_data_avaliacao": "2026-12-01",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        await db_session.refresh(plano)
        assert plano.data_proxima_avaliacao == date(2026, 12, 1)

    async def test_evolucao_criptografada(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac, plano = await self._setup(db_session, world["org_a"].id, cf)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/accompaniments/{ac.id}/plan/evaluations"),
            json={
                "data_avaliacao": "2026-09-01",
                "evolucao": "Conteúdo sensível de avaliação",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["evolucao"] == "Conteúdo sensível de avaliação"

        av_db = (await db_session.execute(
            select(AvaliacaoPlano).where(AvaliacaoPlano.plano_id == plano.id)
        )).scalar_one()
        assert av_db.evolucao_enc is not None
        assert av_db.evolucao_enc != "Conteúdo sensível de avaliação"
        assert decrypt_text(av_db.evolucao_enc) == "Conteúdo sensível de avaliação"


# ═══════════════════════════════════════════════════════════════════════
# PIA
# ═══════════════════════════════════════════════════════════════════════

class TestPia:
    async def test_criar_pia(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = Acompanhamento(tenant_id=world["org_a"].id, case_file_id=cf.id,
                            tipo="MSE-LA", data_inicio=date.today())
        db_session.add(ac)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, "/pia"),
            json={
                "acompanhamento_id": str(ac.id),
                "numero_processo": "0001234-56.2026.8.16.0000",
                "vara": "Vara da Infância e Juventude",
                "comarca": "Comarca A",
                "medida_socioeducativa": "LA",
                "prazo_medida": 6,
                "data_inicio_medida": "2026-07-01",
                "data_fim_medida": "2027-01-01",
                "frequencia_cumprimento": "SEMANAL",
                "dias_cumprimento": ["segunda", "quarta", "sexta"],
                "objetivos": "Responsabilização e integração social",
                "acoes": [{"descricao": "Matrícula escolar", "prazo": "2026-08-01"}],
                "proximo_relatorio_judiciario": "2026-10-01",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["medida_socioeducativa"] == "LA"
        assert data["numero_processo"] == "0001234-56.2026.8.16.0000"
        assert data["dias_cumprimento"] == ["segunda", "quarta", "sexta"]
        assert len(data["acoes"]) == 1

    async def test_listar_pias(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia1 = Pia(tenant_id=world["org_a"].id, case_file_id=cf.id,
                   numero_processo="001", medida_socioeducativa="LA")
        pia2 = Pia(tenant_id=world["org_a"].id, case_file_id=cf.id,
                   numero_processo="002", medida_socioeducativa="PSC")
        db_session.add_all([pia1, pia2])
        await db_session.commit()

        resp = await client.get(
            _url(cf.id, "/pia"),
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_atualizar_pia(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = Pia(tenant_id=world["org_a"].id, case_file_id=cf.id,
                  numero_processo="001", medida_socioeducativa="LA",
                  prazo_medida=6)
        db_session.add(pia)
        await db_session.commit()

        resp = await client.patch(
            _url(cf.id, f"/pia/{pia.id}"),
            json={"prazo_medida": 12, "frequencia_cumprimento": "QUINZENAL"},
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["prazo_medida"] == 12
        assert data["frequencia_cumprimento"] == "QUINZENAL"


# ═══════════════════════════════════════════════════════════════════════
# Relatórios PIA
# ═══════════════════════════════════════════════════════════════════════

class TestRelatoriosPia:
    async def _setup(self, db, org_a, cf):
        pia = Pia(tenant_id=org_a, case_file_id=cf.id,
                  numero_processo="001", medida_socioeducativa="LA")
        db.add(pia)
        await db.flush()
        return pia

    async def test_criar_relatorio(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = await self._setup(db_session, world["org_a"].id, cf)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/pia/{pia.id}/reports"),
            json={
                "data_relatorio": "2026-09-01",
                "tipo": "ACOMPANHAMENTO",
                "elaborado_por_id": str(world["prof_a"].id),
                "texto": "Relatório de acompanhamento da medida",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["tipo"] == "ACOMPANHAMENTO"
        assert data["texto"] == "Relatório de acompanhamento da medida"

    async def test_listar_relatorios(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = await self._setup(db_session, world["org_a"].id, cf)
        from app.models.pia import RelatorioPia
        db_session.add(RelatorioPia(
            tenant_id=world["org_a"].id, pia_id=pia.id,
            data_relatorio=date.today(), tipo="INICIAL",
        ))
        await db_session.commit()

        resp = await client.get(
            _url(cf.id, f"/pia/{pia.id}/reports"),
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_relatorio_texto_criptografado(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = await self._setup(db_session, world["org_a"].id, cf)
        await db_session.commit()

        resp = await client.post(
            _url(cf.id, f"/pia/{pia.id}/reports"),
            json={
                "data_relatorio": "2026-09-01",
                "tipo": "FINAL",
                "texto": "Conteúdo sigiloso do relatório judicial",
            },
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["texto"] == "Conteúdo sigiloso do relatório judicial"

        from app.models.pia import RelatorioPia
        r_db = (await db_session.execute(
            select(RelatorioPia).where(RelatorioPia.pia_id == pia.id)
        )).scalar_one()
        assert r_db.texto_enc is not None
        assert r_db.texto_enc != "Conteúdo sigiloso do relatório judicial"
        assert decrypt_text(r_db.texto_enc) == "Conteúdo sigiloso do relatório judicial"


# ═══════════════════════════════════════════════════════════════════════
# Alertas
# ═══════════════════════════════════════════════════════════════════════

class TestAlertas:
    async def test_alertas_acompanhamento_sem_evolucao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAIF", data_inicio=date.today() - timedelta(days=60),
            situacao="ATIVO",
        )
        db_session.add(ac)
        await db_session.commit()

        resp = await client.get(
            "/api/govsocial/v1/alerts",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        tipos = [a["tipo"] for a in resp.json()]
        assert "ACOMPANHAMENTO_SEM_EVOLUCAO" in tipos

    async def test_alertas_medida_vencendo(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = Pia(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            numero_processo="001", medida_socioeducativa="LA",
            data_fim_medida=date.today() + timedelta(days=15),
        )
        db_session.add(pia)
        await db_session.commit()

        resp = await client.get(
            "/api/govsocial/v1/alerts",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        tipos = [a["tipo"] for a in resp.json()]
        assert "MEDIDA_VENCENDO" in tipos

    async def test_alertas_medida_vencida(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = Pia(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            numero_processo="001", medida_socioeducativa="LA",
            data_fim_medida=date.today() - timedelta(days=5),
        )
        db_session.add(pia)
        await db_session.commit()

        resp = await client.get(
            "/api/govsocial/v1/alerts",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        tipos = [a["tipo"] for a in resp.json()]
        assert "MEDIDA_VENCIDA" in tipos

    async def test_alertas_relatorio_judiciario_pendente(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        pia = Pia(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            numero_processo="001", medida_socioeducativa="LA",
            proximo_relatorio_judiciario=date.today() - timedelta(days=3),
        )
        db_session.add(pia)
        await db_session.commit()

        resp = await client.get(
            "/api/govsocial/v1/alerts",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        tipos = [a["tipo"] for a in resp.json()]
        assert "RELATORIO_JUDICIARIO_PENDENTE" in tipos

    async def test_alertas_plano_sem_avaliacao(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        cf = await _criar_case_file(
            db_session, world["org_a"].id, world["family_a"].id, world["unit_a"].id
        )
        ac = Acompanhamento(
            tenant_id=world["org_a"].id, case_file_id=cf.id,
            tipo="PAIF", data_inicio=date.today() - timedelta(days=90),
            situacao="ATIVO",
        )
        db_session.add(ac)
        await db_session.flush()
        plano = PlanoAcompanhamento(
            tenant_id=world["org_a"].id,
            acompanhamento_id=ac.id, case_file_id=cf.id,
            data_proxima_avaliacao=date.today() - timedelta(days=10),
        )
        db_session.add(plano)
        await db_session.commit()

        resp = await client.get(
            "/api/govsocial/v1/alerts",
            headers=world["auth"]("tecnico_superior"),
        )
        assert resp.status_code == 200
        tipos = [a["tipo"] for a in resp.json()]
        assert "PLANO_SEM_AVALIACAO" in tipos
