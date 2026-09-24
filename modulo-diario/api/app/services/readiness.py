"""Centralized production readiness checks.

One service, three consumers with different criticality:

* ``runtime_checks``   -> ``GET /health/ready`` (can this instance serve traffic?)
* ``publication_checks`` -> ``GET /internal/publication-capability`` and the
  ``production_check`` command (is the Diário able to publish officially?)
* ``dependency_checks`` -> ``GET /internal/health/dependencies`` (full diagnosis)

External probes (TSA, signer, storage) are cached briefly so a readiness poll
never hammers them. Nothing here exposes secrets, internal paths or credentials.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field

from sqlalchemy import text

from app.core.config import settings

PASS = "pass"
WARN = "warning"
FAIL = "fail"
SKIP = "skip"

READY = "READY"
READY_WITH_WARNINGS = "READY_WITH_WARNINGS"
NOT_READY = "NOT_READY"

HEALTHCHECK_PREFIX = ".govsistem-healthcheck/"
_PROBE_CACHE: dict[str, tuple[float, "CheckResult"]] = {}
PROBE_CACHE_SECONDS = 45


@dataclass
class CheckResult:
    code: str
    label: str
    status: str = PASS
    category: str = "runtime"
    critical: bool = False
    detail: str = ""
    hint: str = ""
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        payload = asdict(self)
        return payload


async def _cached(key: str, ttl: int, factory) -> CheckResult:
    now = time.monotonic()
    hit = _PROBE_CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]
    result = await factory()
    _PROBE_CACHE[key] = (now + ttl, result)
    return result


def summarize(checks: list[CheckResult]) -> str:
    if any(c.status == FAIL for c in checks):
        return NOT_READY
    if any(c.status == WARN for c in checks):
        return READY_WITH_WARNINGS
    return READY


def exit_code(checks: list[CheckResult], *, strict: bool = False) -> int:
    status = summarize(checks)
    if status == NOT_READY:
        return 1
    if strict and status == READY_WITH_WARNINGS:
        return 1
    return 0


def _version_triplet() -> str:
    return settings.VERSION


class ReadinessService:
    """Stateless; receives the async session per call."""

    # ── process / config ─────────────────────────────────────────────────────

    async def check_process(self) -> CheckResult:
        is_prod = settings.ENVIRONMENT.strip().lower() == "production"
        status = PASS
        detail = f"environment={settings.ENVIRONMENT}"
        if is_prod and settings.DEBUG:
            status = FAIL
            detail += " (DEBUG habilitado em produção)"
        return CheckResult(
            code="PROCESS",
            label="Processo/configuração",
            status=status,
            category="runtime",
            critical=True,
            detail=detail,
            data={
                "environment": settings.ENVIRONMENT,
                "debug": bool(settings.DEBUG),
                "version": _version_triplet(),
            },
        )

    # ── database & migrations ────────────────────────────────────────────────

    async def check_database(self, db) -> CheckResult:
        try:
            await db.execute(text("SELECT 1"))
            dialect = db.bind.dialect.name if db.bind is not None else "unknown"
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="DATABASE",
                label="PostgreSQL acessível",
                status=FAIL,
                category="runtime",
                critical=True,
                detail=f"conexão falhou: {exc}",
            )
        version = ""
        try:
            if dialect == "postgresql":
                version = (await db.execute(text("SHOW server_version"))).scalar() or ""
            elif dialect == "sqlite":
                version = (await db.execute(text("SELECT sqlite_version()"))).scalar() or ""
        except Exception:  # noqa: BLE001
            version = ""
        return CheckResult(
            code="DATABASE",
            label="Banco acessível",
            status=PASS,
            category="runtime",
            critical=True,
            detail=f"dialect={dialect}",
            data={"dialect": dialect, "server_version": str(version)},
        )

    def _alembic_heads(self) -> list[str]:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        config = Config("alembic.ini")
        return list(ScriptDirectory.from_config(config).get_heads())

    async def check_migrations(self, db) -> CheckResult:
        try:
            heads = self._alembic_heads()
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="MIGRATIONS",
                label="Migrações (Alembic)",
                status=FAIL,
                category="runtime",
                critical=True,
                detail=f"não foi possível ler o head do Alembic: {exc}",
            )
        try:
            current = {
                row[0]
                for row in (await db.execute(text("SELECT version_num FROM alembic_version"))).all()
            }
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="MIGRATIONS",
                label="Migrações (Alembic)",
                status=FAIL,
                category="runtime",
                critical=True,
                detail=f"alembic_version indisponível: {exc}",
                data={"head": heads},
                hint="alembic upgrade head",
            )
        ok = current == set(heads)
        expected_env = (settings.ALEMBIC_EXPECTED_HEAD or "").strip()
        drift = bool(expected_env) and expected_env not in heads
        status = PASS if ok and not drift else FAIL
        detail = f"current={sorted(current)} head={heads}"
        hint = "" if ok else "alembic upgrade head"
        if drift:
            detail += f"; ALEMBIC_EXPECTED_HEAD={expected_env} não é um head válido"
        return CheckResult(
            code="MIGRATIONS",
            label="Migrações (Alembic)",
            status=status,
            category="runtime",
            critical=True,
            detail=detail,
            hint=hint,
            data={"current": sorted(current), "head": heads, "expected_env": expected_env},
        )

    # ── critical schema (columns / unique / trigger) ─────────────────────────

    async def check_schema(self, db) -> CheckResult:
        dialect = db.bind.dialect.name if db.bind is not None else ""
        missing: list[str] = []
        found: dict[str, bool] = {}
        try:
            if dialect == "postgresql":
                cols = {
                    r[0]
                    for r in (
                        await db.execute(
                            text(
                                "SELECT column_name FROM information_schema.columns "
                                "WHERE table_name='matters'"
                            )
                        )
                    ).all()
                }
                found["columns"] = {"slug", "slug_locked_at", "slug_locked_reason"} <= cols
                found["unique"] = bool(
                    (
                        await db.execute(
                            text(
                                "SELECT 1 FROM pg_constraint WHERE conname='uq_matters_org_slug'"
                            )
                        )
                    ).first()
                )
                found["trigger"] = bool(
                    (
                        await db.execute(
                            text(
                                "SELECT 1 FROM pg_trigger "
                                "WHERE tgname='trg_matter_slug_immutable' AND NOT tgisinternal"
                            )
                        )
                    ).first()
                )
            elif dialect == "sqlite":
                cols = {
                    r[1]
                    for r in (await db.execute(text("PRAGMA table_info(matters)"))).all()
                }
                found["columns"] = {"slug", "slug_locked_at", "slug_locked_reason"} <= cols
                unique_ok = False
                for idx in (await db.execute(text("PRAGMA index_list(matters)"))).all():
                    name, is_unique = idx[1], idx[2]
                    if not is_unique:
                        continue
                    if name == "uq_matters_org_slug":
                        unique_ok = True
                        break
                    idx_cols = [
                        info[2]
                        for info in (
                            await db.execute(text(f"PRAGMA index_info({name})"))
                        ).all()
                    ]
                    if idx_cols == ["organization_id", "slug"]:
                        unique_ok = True
                        break
                found["unique"] = unique_ok
                trigger = (
                    await db.execute(
                        text(
                            "SELECT name FROM sqlite_master WHERE type='trigger' "
                            "AND name='trg_matter_slug_immutable'"
                        )
                    )
                ).first()
                found["trigger"] = trigger is not None
            else:
                return CheckResult(
                    code="SCHEMA",
                    label="Schema crítico",
                    status=WARN,
                    category="publication",
                    detail=f"dialeto não suportado: {dialect}",
                )
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="SCHEMA",
                label="Schema crítico",
                status=FAIL,
                category="publication",
                detail=f"verificação falhou: {exc}",
            )

        if not found.get("columns"):
            missing.append("matters.slug/slug_locked_at/slug_locked_reason")
        if not found.get("unique"):
            missing.append("UNIQUE(organization_id, slug)")
        if not found.get("trigger"):
            missing.append("trg_matter_slug_immutable")
        return CheckResult(
            code="SCHEMA",
            label="Schema crítico",
            status=PASS if not missing else FAIL,
            category="publication",
            detail="ok" if not missing else "ausente: " + ", ".join(missing),
            hint="alembic upgrade head" if missing else "",
            data=found,
        )

    # ── slug integrity ───────────────────────────────────────────────────────

    async def check_slug_integrity(self, db, org: uuid.UUID | None = None) -> CheckResult:
        from app.services.matter_slug import slugify

        where_org = " AND organization_id = :org" if org else ""
        params = {"org": str(org)} if org else {}
        published = "status IN ('published','archived')"
        sum_published = f"SUM(CASE WHEN {published} THEN 1 ELSE 0 END)"
        sum_with_slug = f"SUM(CASE WHEN {published} AND slug IS NOT NULL THEN 1 ELSE 0 END)"
        sum_locked = (
            f"SUM(CASE WHEN {published} AND slug_locked_at IS NOT NULL THEN 1 ELSE 0 END)"
        )
        sum_locked_no_slug = (
            "SUM(CASE WHEN slug_locked_at IS NOT NULL AND slug IS NULL THEN 1 ELSE 0 END)"
        )
        count_sql = (
            "SELECT "
            f"COALESCE({sum_published},0), "
            f"COALESCE({sum_with_slug},0), "
            f"COALESCE({sum_locked},0), "
            f"COALESCE({sum_locked_no_slug},0) "
            f"FROM matters WHERE 1=1 {where_org}"
        )
        try:
            row = (await db.execute(text(count_sql), params)).first()
            total, with_slug, locked, locked_without_slug = (int(v or 0) for v in row)

            dup_rows = (
                await db.execute(
                    text(
                        "SELECT organization_id, slug, COUNT(*) AS c FROM matters "
                        f"WHERE slug IS NOT NULL {where_org} "
                        "GROUP BY organization_id, slug HAVING COUNT(*) > 1"
                    ),
                    params,
                )
            ).all()
            duplicates = len(dup_rows)

            slug_query = (
                f"SELECT slug FROM matters WHERE {published} "
                f"AND slug IS NOT NULL {where_org}"
            )
            slug_rows = (await db.execute(text(slug_query), params)).all()
            non_normalized = [r[0] for r in slug_rows if r[0] != slugify(r[0])]
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="SLUG_INTEGRITY",
                label="Integridade dos slugs",
                status=FAIL,
                category="publication",
                detail=f"verificação falhou: {str(exc).splitlines()[0][:200]}",
                hint="alembic upgrade head",
            )

        problems: list[str] = []
        if with_slug < total:
            problems.append(f"{total - with_slug} publicadas sem slug")
        if locked < total:
            problems.append(f"{total - locked} publicadas sem slug_locked_at")
        if locked_without_slug:
            problems.append(f"{locked_without_slug} com slug travado e slug NULL")
        if duplicates:
            problems.append(f"{duplicates} colisões (organization_id, slug)")
        if non_normalized:
            problems.append(f"{len(non_normalized)} slugs não normalizados")

        return CheckResult(
            code="SLUG_INTEGRITY",
            label="Integridade dos slugs",
            status=PASS if not problems else FAIL,
            category="publication",
            detail="; ".join(problems) if problems else f"{total} publicadas, {locked} travadas",
            data={
                "published": total,
                "with_slug": with_slug,
                "locked": locked,
                "duplicates": duplicates,
                "non_normalized": len(non_normalized),
                "samples": [str(r[0]) for r in dup_rows[:10]],
            },
        )

    # ── search / FTS ─────────────────────────────────────────────────────────

    async def check_search(self, db, org: uuid.UUID | None = None) -> CheckResult:
        dialect = db.bind.dialect.name if db.bind is not None else ""
        if dialect != "postgresql":
            return CheckResult(
                code="SEARCH",
                label="Busca (FTS)",
                status=WARN,
                category="publication",
                detail=f"FTS exige PostgreSQL (dialeto atual: {dialect or 'desconhecido'})",
                hint="python -m app.commands.rebuild_search_index",
            )
        where_org = " AND m.organization_id = :org" if org else ""
        params = {"org": str(org)} if org else {}
        try:
            gin = (
                await db.execute(
                    text(
                        "SELECT 1 FROM pg_indexes WHERE tablename='search_index' "
                        "AND indexname='ix_search_index_vector'"
                    )
                )
            ).first()
            # Only matters attached to a published edition are indexable, which
            # is exactly what rebuild_search_index indexes. Counting archived
            # matters with no edition would produce a permanent false warning.
            base_from = (
                "FROM matters m "
                "JOIN edition_items ei ON ei.matter_id = m.id "
                "JOIN editions e ON e.id = ei.edition_id "
                "WHERE e.status='published' AND m.status IN ('published','archived')"
                + where_org
            )
            published = (
                await db.execute(
                    text("SELECT COUNT(DISTINCT m.id) " + base_from), params
                )
            ).scalar() or 0
            indexed = (
                await db.execute(
                    text(
                        "SELECT COUNT(DISTINCT m.id) " + base_from
                        + " AND EXISTS (SELECT 1 FROM search_index si "
                        "WHERE si.matter_id = m.id AND si.search_vector IS NOT NULL)"
                    ),
                    params,
                )
            ).scalar() or 0
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="SEARCH",
                label="Busca (FTS)",
                status=WARN,
                category="publication",
                detail=f"verificação falhou: {exc}",
            )
        missing = max(int(published) - int(indexed), 0)
        return CheckResult(
            code="SEARCH",
            label="Busca (FTS)",
            status=PASS if (gin and missing == 0) else WARN,
            category="publication",
            detail=(
                f"published={published} indexed={indexed} missing={missing}"
                if gin
                else "índice GIN ausente"
            ),
            hint="python -m app.commands.rebuild_search_index" if missing else "",
            data={
                "gin": bool(gin),
                "published": int(published),
                "indexed": int(indexed),
                "missing": missing,
            },
        )

    # ── storage ──────────────────────────────────────────────────────────────

    async def check_storage(self) -> CheckResult:
        async def _probe() -> CheckResult:
            from app.core.storage import storage

            path = HEALTHCHECK_PREFIX + f"probe-{uuid.uuid4().hex}.bin"
            payload = b"govsistem-healthcheck"
            try:
                await storage.store(path, payload)
                exists = await storage.exists(path)
                data = await storage.read(path)
                if not exists or data != payload:
                    return CheckResult(
                        code="STORAGE",
                        label="Storage de artefatos",
                        status=FAIL,
                        category="runtime",
                        critical=True,
                        detail="write/read divergente",
                    )
                return CheckResult(
                    code="STORAGE",
                    label="Storage de artefatos",
                    status=PASS,
                    category="runtime",
                    critical=True,
                    detail="write/read/delete ok",
                    data={"backend": settings.STORAGE_BACKEND},
                )
            except Exception as exc:  # noqa: BLE001
                return CheckResult(
                    code="STORAGE",
                    label="Storage de artefatos",
                    status=FAIL,
                    category="runtime",
                    critical=True,
                    detail=f"probe falhou: {exc}",
                )
            finally:
                try:
                    await storage.delete(path)
                except Exception:  # noqa: BLE001
                    pass

        return await _cached("storage", PROBE_CACHE_SECONDS, _probe)

    # ── signer ───────────────────────────────────────────────────────────────

    async def check_signer(self, *, probe: bool = True) -> CheckResult:
        if not settings.SIGNER_URL:
            return CheckResult(
                code="SIGNER",
                label="Assinador",
                status=WARN,
                category="publication",
                detail="SIGNER_URL não configurada",
            )
        if not probe:
            return CheckResult(
                code="SIGNER",
                label="Assinador",
                status=SKIP,
                category="publication",
                detail="probe de runtime ignorado",
            )

        async def _probe() -> CheckResult:
            import httpx

            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    resp = await client.get(f"{settings.SIGNER_URL}/api/v1/health")
                ok = resp.status_code == 200 and resp.json().get("status") in ("ok", "healthy")
                return CheckResult(
                    code="SIGNER",
                    label="Assinador",
                    status=PASS if ok else WARN,
                    category="publication",
                    detail=f"HTTP {resp.status_code}",
                )
            except Exception as exc:  # noqa: BLE001
                return CheckResult(
                    code="SIGNER",
                    label="Assinador",
                    status=WARN,
                    category="publication",
                    detail=f"inalcançável: {exc}",
                )

        return await _cached("signer", PROBE_CACHE_SECONDS, _probe)

    # ── TSA / ICP-Brasil (reuses check_tsa_trust) ────────────────────────────

    async def check_tsa(self, *, probe: bool = True) -> CheckResult:
        from app.commands.check_tsa_trust import check as tsa_check

        try:
            report = await tsa_check(probe=probe)
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="TSA",
                label="TSA / ICP-Brasil",
                status=FAIL,
                category="publication",
                detail=f"check falhou: {exc}",
            )

        cfg = report.get("configuration", {})
        store = report.get("trust_store", {})
        required = bool(cfg.get("TSA_REQUIRED_FOR_PUBLICATION"))
        data = {
            "tsa_configured": bool(cfg.get("TSA_URL")),
            "policy_oid": cfg.get("TSA_POLICY_OID") or "",
            "trust_store": store,
            "required_for_publication": required,
            "result": report.get("result"),
        }
        if not cfg.get("TSA_URL"):
            return CheckResult(
                code="TSA",
                label="TSA / ICP-Brasil",
                status=FAIL if required else WARN,
                category="publication",
                detail="TSA_URL não configurada",
                data=data,
            )
        if not probe:
            return CheckResult(
                code="TSA",
                label="TSA / ICP-Brasil",
                status=SKIP,
                category="publication",
                detail="probe de runtime ignorado",
                data=data,
            )

        probe_result = report.get("probe") or {}
        validation = str(probe_result.get("validation_status") or "")
        if validation == "valid":
            status = PASS
        elif validation == "indeterminate":
            status = WARN
        else:
            status = FAIL if required else WARN
        return CheckResult(
            code="TSA",
            label="TSA / ICP-Brasil",
            status=status,
            category="publication",
            detail=f"validação={validation or report.get('result')}",
            data=data,
        )

    # ── publication gate / artifacts / timestamps ────────────────────────────

    async def check_publication_gate(self) -> CheckResult:
        try:
            from app.services import publication_gate as gate

            missing = [
                name
                for name in ("assert_publishable", "evaluate")
                if not hasattr(gate, name)
            ]
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="PUBLICATION_GATE",
                label="PublicationGate",
                status=FAIL,
                category="publication",
                detail=f"não carregou: {exc}",
            )
        return CheckResult(
            code="PUBLICATION_GATE",
            label="PublicationGate",
            status=PASS if not missing else FAIL,
            category="publication",
            detail="registrado" if not missing else f"ausente: {missing}",
            data={
                "tsa_required": bool(settings.TSA_REQUIRED_FOR_PUBLICATION),
                "slug_checks": True,
            },
        )

    async def check_artifacts(self, db, org: uuid.UUID | None = None) -> CheckResult:
        where_org = " AND organization_id = :org" if org else ""
        params = {"org": str(org)} if org else {}
        try:
            published = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM editions WHERE status='published'" + where_org
                    ),
                    params,
                )
            ).scalar() or 0
            with_artifact = (
                await db.execute(
                    text(
                        "SELECT COUNT(DISTINCT pa.snapshot_id) FROM publication_artifacts pa "
                        "JOIN edition_publication_snapshots s ON s.id = pa.snapshot_id "
                        "JOIN editions e ON e.id = s.edition_id "
                        "WHERE e.status='published' AND pa.artifact_type='signed_pdf'"
                        + (" AND e.organization_id = :org" if org else "")
                    ),
                    params,
                )
            ).scalar() or 0
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="ARTIFACTS",
                label="Artefatos de publicação",
                status=WARN,
                category="publication",
                detail=f"verificação parcial: {exc}",
            )
        legacy = max(int(published) - int(with_artifact), 0)
        return CheckResult(
            code="ARTIFACTS",
            label="Artefatos de publicação",
            status=WARN if legacy else PASS,
            category="publication",
            detail=f"{with_artifact}/{published} edições com PDF assinado"
            + (f" ({legacy} legado)" if legacy else ""),
            data={"published_editions": int(published), "with_signed_pdf": int(with_artifact)},
        )

    async def check_timestamps(self, db, org: uuid.UUID | None = None) -> CheckResult:
        where_org = " WHERE organization_id = :org" if org else ""
        params = {"org": str(org)} if org else {}
        try:
            rows = (
                await db.execute(
                    text(
                        "SELECT validation_status, COUNT(*) FROM timestamp_records"
                        + where_org
                        + " GROUP BY validation_status"
                    ),
                    params,
                )
            ).all()
        except Exception as exc:  # noqa: BLE001
            return CheckResult(
                code="TIMESTAMPS",
                label="Carimbos de tempo",
                status=WARN,
                category="publication",
                detail=f"verificação parcial: {exc}",
            )
        counts = {str(r[0]): int(r[1]) for r in rows}
        invalid = counts.get("invalid", 0)
        return CheckResult(
            code="TIMESTAMPS",
            label="Carimbos de tempo",
            status=WARN if invalid else PASS,
            category="publication",
            detail=", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "sem registros",
            data=counts,
        )

    # ── aggregated views ─────────────────────────────────────────────────────

    async def _collect(self, db, factories) -> list[CheckResult]:
        """Run checks in order, rolling back between them.

        A failed statement aborts the surrounding transaction; without the
        rollback every later check would fail with "transaction is aborted".
        """
        results: list[CheckResult] = []
        for factory in factories:
            results.append(await factory())
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass
        return results

    async def runtime_checks(self, db) -> list[CheckResult]:
        return await self._collect(
            db,
            [
                self.check_process,
                lambda: self.check_database(db),
                lambda: self.check_migrations(db),
                self.check_storage,
            ],
        )

    async def dependency_checks(self, db, *, probe: bool = True) -> list[CheckResult]:
        return await self._collect(
            db,
            [
                lambda: self.check_database(db),
                self.check_storage,
                lambda: self.check_signer(probe=probe),
                lambda: self.check_tsa(probe=probe),
                lambda: self.check_search(db),
            ],
        )

    async def publication_checks(self, db, *, probe: bool = True, org=None) -> list[CheckResult]:
        return await self._collect(
            db,
            [
                lambda: self.check_database(db),
                lambda: self.check_migrations(db),
                lambda: self.check_schema(db),
                lambda: self.check_slug_integrity(db, org),
                self.check_storage,
                lambda: self.check_signer(probe=probe),
                lambda: self.check_tsa(probe=probe),
                self.check_publication_gate,
            ],
        )

    async def full_checks(self, db, *, probe: bool = True, org=None) -> list[CheckResult]:
        checks = await self.runtime_checks(db)
        checks += await self._collect(
            db,
            [
                lambda: self.check_schema(db),
                lambda: self.check_slug_integrity(db, org),
                lambda: self.check_search(db, org),
                lambda: self.check_signer(probe=probe),
                lambda: self.check_tsa(probe=probe),
                self.check_publication_gate,
                lambda: self.check_artifacts(db, org),
                lambda: self.check_timestamps(db, org),
            ],
        )
        return checks


def publication_capability(checks: list[CheckResult]) -> dict:
    fails = [c for c in checks if c.status == FAIL]
    return {
        "can_publish": not fails,
        "reasons": [
            {"code": c.code, "message": c.detail or c.label, "hint": c.hint}
            for c in fails
        ],
    }
