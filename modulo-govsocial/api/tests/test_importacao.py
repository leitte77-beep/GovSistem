"""Testes da Fase 11 — Importação CadÚnico e Integrações."""
import io
from datetime import date

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.importacao import ImportJob, ImportLog

PREFIX = "/api/govsocial/v1"

CADUNICO_CSV = (
    "nis_responsavel;nome_responsavel;cpf_responsavel;nis_pessoa;nome_pessoa;"
    "cpf_pessoa;data_nascimento;parentesco;sexo;escolaridade;logradouro;numero;"
    "complemento;bairro;cep;municipio;uf;faixa_renda;pbf;bpc\n"
    "12345678901;Maria Importada;52998224725;12345678901;Maria Importada;"
    "52998224725;1990-05-10;RESPONSAVEL;FEMININO;SUPERIOR_COMPLETO;"
    "Rua A;100;;Centro;80000000;Curitiba;PR;EXTREMA_POBREZA;S;N\n"
    "12345678901;Maria Importada;52998224725;98765432109;João Filho;"
    "11144477735;2015-03-20;FILHO;MASCULINO;FUNDAMENTAL_INCOMPLETO;"
    "Rua A;100;;Centro;80000000;Curitiba;PR;EXTREMA_POBREZA;S;N\n"
)


class TestImportacaoCadUnico:
    async def test_upload_csv_cadunico(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        resp = await client.post(
            f"{PREFIX}/import-jobs/cadunico/upload",
            files={"file": ("cadunico.csv", io.BytesIO(CADUNICO_CSV.encode("utf-8")), "text/csv")},
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["job"]["tipo"] == "CADUNICO"
        assert d["job"]["status"] == "RECONCILED"
        assert d["summary"]["novos"] >= 1

    async def test_import_cria_familia_com_pbf(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        await client.post(
            f"{PREFIX}/import-jobs/cadunico/upload",
            files={"file": ("c.csv", io.BytesIO(CADUNICO_CSV.encode("utf-8")), "text/csv")},
            headers=world["auth"]("gestor_municipal"),
        )
        # Verifica que a família foi criada com PBF = True
        fam = (
            await db_session.execute(
                select(Family).where(Family.tenant_id == world["org_a"].id)
                .order_by(Family.codigo.desc())
            )
        ).scalars().first()
        assert fam is not None
        assert fam.cadunico_atualizado_em == date.today()

    async def test_recepcao_nao_pode_importar(
        self, client: AsyncClient, world: dict
    ):
        resp = await client.post(
            f"{PREFIX}/import-jobs/cadunico/upload",
            files={"file": ("c.csv", io.BytesIO(CADUNICO_CSV.encode("utf-8")), "text/csv")},
            headers=world["auth"]("recepcao"),
        )
        assert resp.status_code == 403

    async def test_listar_importacoes(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        job = ImportJob(
            tenant_id=world["org_a"].id, tipo="CADUNICO",
            nome_arquivo="teste.csv",
        )
        db_session.add(job)
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/import-jobs",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_detalhe_importacao_com_logs(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        job = ImportJob(
            tenant_id=world["org_a"].id, tipo="CADUNICO",
            nome_arquivo="teste.csv", status="RECONCILED",
            novos=5, atualizados=2,
        )
        db_session.add(job)
        await db_session.flush()
        db_session.add(ImportLog(
            tenant_id=world["org_a"].id, import_job_id=job.id,
            linha=1, status="NOVO", nis="123", mensagem="Ok",
        ))
        await db_session.commit()

        resp = await client.get(
            f"{PREFIX}/import-jobs/{job.id}",
            headers=world["auth"]("gestor_municipal"),
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["job"]["novos"] == 5
        assert len(d["logs"]) == 1


class TestAdaptadores:
    async def test_viacep_adapter_instancia(self):
        from app.services.adapters import ViaCEPHttp
        adapter = ViaCEPHttp()
        assert adapter is not None

    async def test_messaging_provider_log(self):
        from app.services.adapters import LogMessagingProvider
        provider = LogMessagingProvider()
        result = await provider.enviar("+5511999999999", "Você tem atendimento agendado")
        assert result is True
