"""Central publication gate for an edition (Fase 4 / P0).

Instead of scattering "can this be published?" checks across endpoints, there is
one place that evaluates every requirement and returns a structured checklist.

``evaluate`` is async (it reads the DB). ``assert_publishable`` is the cheap,
pure-attribute guard used by the publish endpoint: it only reads the already
loaded edition, so it never adds hidden queries to the critical path.
"""

from __future__ import annotations

from sqlalchemy import select

from app.core.config import settings
from app.models.edition_publication_snapshot import EditionPublicationSnapshot
from app.models.enums import EditionStatus
from app.models.publication_artifact import PublicationArtifact

STATUS_OK = "ok"
STATUS_WARNING = "warning"
STATUS_ERROR = "error"


def _check(code: str, label: str, status: str, detail: str = "") -> dict:
    return {"code": code, "label": label, "status": status, "detail": detail}


def _timestamp_requirements(edition) -> list[str]:
    """Enforce a validated RFC 3161 timestamp when the deployment requires it.

    A token that is merely present (or whose chain was not independently
    trusted) must not let an edition be published as officially time-stamped.
    """
    if not getattr(settings, "TSA_REQUIRED_FOR_PUBLICATION", False):
        return []

    records: list = []
    for signature in edition.signatures or []:
        related = getattr(signature, "timestamp_records", None)
        if isinstance(related, (list, tuple)):
            records.extend(related)

    if not records:
        return [
            "TSA obrigatória para publicação, mas nenhum carimbo de tempo foi "
            "encontrado."
        ]
    if not any(getattr(r, "validation_status", None) == "valid" for r in records):
        return [
            "TSA obrigatória para publicação, mas nenhum carimbo de tempo foi "
            "validado contra uma cadeia confiável (validation_status != valid)."
        ]
    return []


def _slug_requirements(edition) -> list[str]:
    """Early detection of slug inconsistencies (DB constraint/trigger is the backstop).

    A matter without a slug is fine: it will be generated and locked on
    publication. A *locked* matter must already carry a normalized slug, and a
    present slug must be canonical.
    """
    from app.services.matter_slug import is_normalized_slug

    problems: list[str] = []
    for item in edition.items or []:
        matter = getattr(item, "matter", None)
        if matter is None:
            continue
        slug = getattr(matter, "slug", None)
        locked = getattr(matter, "slug_locked_at", None)
        if isinstance(slug, str) and slug and not is_normalized_slug(slug):
            problems.append(f"Slug público não normalizado: {slug!r}.")
        if locked is not None and not (isinstance(slug, str) and slug):
            problems.append(
                f"Matéria {getattr(matter, 'id', '?')} com slug travado, "
                "mas sem slug público."
            )
    return problems


def assert_publishable(edition) -> list[str]:
    """Return a list of blocking problems for publishing the loaded edition.

    Empty list means the edition passes the structural gate. Pure attribute
    access: safe to call on a mocked/loaded instance.
    """
    problems: list[str] = []

    try:
        status = EditionStatus(edition.status)
    except (ValueError, TypeError):
        status = EditionStatus.DRAFT

    if status != EditionStatus.SIGNED:
        problems.append(
            "A edição precisa estar assinada (SIGNED); "
            f"status atual: {getattr(edition.status, 'value', edition.status)}."
        )
        # Cannot check the rest meaningfully without a signed artifact.
        return problems

    if not edition.signatures:
        problems.append("A edição não possui assinaturas.")
    if not edition.signed_pdf_path or not edition.signed_pdf_hash:
        problems.append("Artefato PDF assinado imutável ausente.")
    if edition.signature_validation_status != "valid":
        problems.append("A assinatura digital ainda não foi validada.")

    problems.extend(_timestamp_requirements(edition))
    problems.extend(_slug_requirements(edition))

    missing_pages = [
        str(item.matter_id)
        for item in (edition.items or [])
        if item.matter is not None and getattr(item, "page_number", None) is None
    ]
    if missing_pages:
        problems.append(
            "Matérias sem página resolvida (inspetor de PDF): "
            + ", ".join(missing_pages[:10])
        )
    return problems


async def evaluate(db, edition) -> dict:
    """Full async gate: content validation + snapshot + artifacts + signature."""
    from app.services.edition_validation import validate_edition

    checks: list[dict] = []

    validation = await validate_edition(db, edition)
    checks.extend(validation["checks"])

    # Frozen snapshot + required artifacts.
    snapshot = (await db.execute(
        select(EditionPublicationSnapshot).where(
            EditionPublicationSnapshot.edition_id == edition.id,
            EditionPublicationSnapshot.is_valid.is_(True),
        ).order_by(EditionPublicationSnapshot.frozen_at.desc()).limit(1)
    )).scalar_one_or_none()
    if snapshot is None:
        checks.append(_check(
            "snapshot", "Snapshot canônico congelado", STATUS_ERROR, "Snapshot ausente."
        ))
        artifacts: list = []
    else:
        checks.append(_check("snapshot", "Snapshot canônico congelado", STATUS_OK))
        artifacts = list((await db.execute(
            select(PublicationArtifact).where(PublicationArtifact.snapshot_id == snapshot.id)
        )).scalars().all())

    present = {a.artifact_type for a in artifacts}
    for required, label in (
        ("source_pdf", "PDF oficial (source) preservado"),
        ("signed_pdf", "PDF assinado preservado"),
        ("validation_report", "Relatório de inspeção preservado"),
        ("manifest", "Manifesto de composição preservado"),
    ):
        if required in present:
            checks.append(_check(f"artifact_{required}", label, STATUS_OK))
        else:
            checks.append(_check(
                f"artifact_{required}", label, STATUS_WARNING, "Artefato ainda não registrado."
            ))

    # Structural publish-time requirements.
    problems = assert_publishable(edition)
    if problems:
        checks.append(_check(
            "publish_requirements", "Requisitos de publicação",
            STATUS_ERROR, "; ".join(problems),
        ))
    else:
        checks.append(_check("publish_requirements", "Requisitos de publicação", STATUS_OK))

    return {
        "ok": all(c["status"] != STATUS_ERROR for c in checks),
        "checks": checks,
        "edition_id": str(edition.id),
        "status": getattr(edition.status, "value", str(edition.status)),
    }
