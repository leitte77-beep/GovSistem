"""Celery tasks — geocode, export, PDF, notifications, LGPD cleanup."""

import io
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete as sa_delete, func, select

from app.celery_app import celery_app
from app.core.database import async_session
from app.models.family import Family
from app.models.notificacao import Notificacao
from app.models.person import Person
from app.services.report_engine import exportar_csv, exportar_excel, exportar_pdf, gerar_html

logger = logging.getLogger("govsocial.tasks")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def _build_address(fam: Family) -> str:
    parts = []
    if fam.logradouro:
        parts.append(fam.logradouro)
        if fam.numero:
            parts.append(fam.numero)
    if fam.bairro:
        parts.append(fam.bairro)
    if fam.municipio:
        parts.append(fam.municipio)
    if fam.uf:
        parts.append(fam.uf)
    return ", ".join(parts)


# ── Geocode ───────────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(httpx.HTTPError,),
    name="app.tasks.geocode_family",
)
def geocode_family(self, tenant_id: str, family_id: str) -> dict | None:
    """Geocodifica uma família via Nominatim (OpenStreetMap)."""
    import asyncio

    async def _run():
        async with async_session() as db:
            fam = await db.get(Family, uuid.UUID(family_id))
            if not fam:
                return None

            fam.geocode_status = "PROCESSANDO"
            await db.commit()

            endereco = _build_address(fam)
            if not endereco:
                fam.geocode_status = "SEM_ENDERECO"
                await db.commit()
                return {"status": "SEM_ENDERECO"}

            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(
                        NOMINATIM_URL,
                        params={
                            "q": endereco,
                            "format": "json",
                            "limit": 1,
                            "countrycodes": "br",
                        },
                        headers={"User-Agent": "GovSocial/1.0"},
                    )
                    resp.raise_for_status()
                    results = resp.json()
            except httpx.HTTPError as exc:
                raise self.retry(exc=exc)

            if results:
                fam.latitude = float(results[0]["lat"])
                fam.longitude = float(results[0]["lon"])
                fam.geocode_status = "OK"
                logger.info("Geocode OK family=%s => %s, %s", family_id, fam.latitude, fam.longitude)
            else:
                fam.geocode_status = "FALHOU"

            await db.commit()
            return {"status": fam.geocode_status}

    return asyncio.get_event_loop().run_until_complete(_run())


# ── Exportar Dados ────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    name="app.tasks.exportar_dados",
)
def exportar_dados(
    self,
    tenant_id: str,
    relatorio_config: dict,
    filtros: dict | None = None,
    formato: str = "excel",
) -> dict:
    """Executa relatório em background e armazena resultado para download."""
    import asyncio

    async def _run():
        async with async_session() as db:
            from app.services.report_engine import executar_relatorio

            try:
                dados = await executar_relatorio(db, relatorio_config, filtros or {})
            except Exception as exc:
                raise self.retry(exc=exc)

            colunas = relatorio_config.get("colunas", [])
            nome = relatorio_config.get("nome", "export")

            if formato == "csv":
                content = exportar_csv(dados, colunas)
                content_type = "text/csv"
                ext = "csv"
            elif formato == "pdf":
                config = {"layout": relatorio_config.get("layout", {})}
                content = exportar_pdf(dados, colunas, config, nome)
                content_type = "application/pdf"
                ext = "pdf"
            elif formato == "html":
                config = {"layout": relatorio_config.get("layout", {})}
                content = gerar_html(dados, colunas, config, nome).encode("utf-8")
                content_type = "text/html"
                ext = "html"
            else:
                content = exportar_excel(dados, colunas, nome)
                content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ext = "xlsx"

            from app.core.storage import storage

            filename = f"exports/{tenant_id}/{uuid.uuid4().hex[:12]}_{nome}.{ext}"
            await storage.store(filename, content)

            logger.info("Export generated: %s (%d rows)", filename, len(dados))
            return {"filename": filename, "path": filename, "rows": len(dados), "formato": formato}

    return asyncio.get_event_loop().run_until_complete(_run())


# ── PDF em Lote ───────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    name="app.tasks.gerar_pdf_lote",
)
def gerar_pdf_lote(self, tenant_id: str, case_file_ids: list[str]) -> dict:
    """Gera PDFs de prontuários em lote e compacta."""
    import asyncio
    import zipfile

    async def _run():
        async with async_session() as db:
            from app.models.case_file import CaseFile
            from app.models.user import User
            from app.services.prontuario_pdf import generate_case_file_pdf

            user_result = await db.execute(
                select(User).where(User.tenant_id == uuid.UUID(tenant_id)).limit(1)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                return {"error": "No user found for tenant"}

            pdfs = {}
            for cf_id in case_file_ids:
                try:
                    pdf_bytes = await generate_case_file_pdf(
                        db, uuid.UUID(tenant_id), user, uuid.UUID(cf_id)
                    )
                    pdfs[cf_id] = pdf_bytes
                except Exception as exc:
                    logger.error("PDF generation failed for case_file=%s: %s", cf_id, exc)
                    pdfs[cf_id] = None

            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for cf_id, content in pdfs.items():
                    if content:
                        zf.writestr(f"prontuario_{cf_id}.pdf", content)

            from app.core.storage import storage

            zip_filename = f"exports/{tenant_id}/lote_prontuarios_{uuid.uuid4().hex[:12]}.zip"
            zip_buf.seek(0)
            await storage.store(zip_filename, zip_buf.read())

            success = sum(1 for v in pdfs.values() if v is not None)
            failed = len(pdfs) - success
            logger.info("Lote PDF: %d success, %d failed => %s", success, failed, zip_filename)
            return {"total": len(case_file_ids), "success": success, "failed": failed, "path": zip_filename}

    return asyncio.get_event_loop().run_until_complete(_run())


# ── Enviar Notificação ────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    name="app.tasks.enviar_notificacao",
)
def enviar_notificacao(
    self,
    tenant_id: str,
    user_id: str | None,
    channel: str,
    event: str,
    context: dict,
    destination: str | None = None,
) -> dict:
    """Envia notificação por canal externo em background."""
    import asyncio

    async def _run():
        try:
            async with async_session() as db:
                from app.services.notification_dispatcher import NotificationDispatcher

                dispatcher = NotificationDispatcher(db)
                result = await dispatcher.dispatch(
                    uuid.UUID(tenant_id),
                    uuid.UUID(user_id) if user_id else None,
                    channel,
                    event,
                    context,
                    destination,
                )
                return result
        except Exception as exc:
            logger.error("Notification failed: %s", exc)
            raise self.retry(exc=exc)

    return asyncio.get_event_loop().run_until_complete(_run())


# ── Limpar Dados Expirados (LGPD) ─────────────────────────────────────────


@celery_app.task(
    bind=True,
    max_retries=1,
    name="app.tasks.limpar_dados_expirados",
)
def limpar_dados_expirados(self) -> dict:
    """Tarefa diária: limpa dados de pessoas anonimizadas após período de retenção."""
    import asyncio

    async def _run():
        async with async_session() as db:
            retention_days = 30
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

            anonimizados = (
                await db.execute(
                    select(Person).where(
                        Person.deleted_at.isnot(None),
                        Person.deleted_at < cutoff,
                        Person.nome_civil == "[ANONIMIZADO]",
                    )
                )
            ).scalars().all()

            count = 0
            for person in anonimizados:
                try:
                    await db.delete(person)
                    count += 1
                except Exception as exc:
                    logger.error("Failed to delete expired person %s: %s", person.id, exc)

            await db.commit()

            notifications_deleted = (
                await db.execute(
                    sa_delete(Notificacao).where(Notificacao.created_at < cutoff)
                )
            ).rowcount

            logger.info("daily cleanup: %d expired persons deleted, %d notifications marked", count, notifications_deleted)
            return {
                "expired_persons_deleted": count,
                "notifications_cleaned": notifications_deleted,
            }

    return asyncio.get_event_loop().run_until_complete(_run())
