"""Pre-publication validation checklist for an edition.

Runs deterministic editorial checks before the edition is closed/signed so a
problem blocks publication instead of reaching the citizen. Each check returns
``ok`` | ``warning`` | ``error``; any ``error`` means the edition is not ready.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models.enums import EditionStatus, MatterStatus
from app.models.matter import Matter

STATUS_OK = "ok"
STATUS_WARNING = "warning"
STATUS_ERROR = "error"

_FINAL_STATUSES = {
    EditionStatus.CLOSED,
    EditionStatus.PDF_GENERATED,
    EditionStatus.SIGNED,
    EditionStatus.PUBLISHED,
}

# Statuses where a PDF must already exist and page numbers must be resolved.
_GENERATED_STATUSES = {
    EditionStatus.PDF_GENERATED,
    EditionStatus.SIGNED,
    EditionStatus.PUBLISHED,
}


def _matter_status(matter) -> MatterStatus:
    try:
        return MatterStatus(matter.status)
    except (ValueError, TypeError):
        return MatterStatus.DRAFT


async def validate_edition(db, edition) -> dict:
    items = list(edition.items or [])
    checks: list[dict] = []

    def add(code: str, label: str, status: str, detail: str = "") -> None:
        checks.append({"code": code, "label": label, "status": status, "detail": detail})

    # 1. Non-empty edition
    if not items:
        add("has_items", "Edição possui matérias", STATUS_ERROR, "Nenhuma matéria inserida.")
    else:
        add("has_items", "Edição possui matérias", STATUS_OK, f"{len(items)} matéria(s).")

    matters = [it.matter for it in items if it.matter is not None]

    # 2. Every matter is approved (or already published)
    not_approved = [
        m.title for m in matters
        if _matter_status(m) not in (MatterStatus.APPROVED, MatterStatus.PUBLISHED)
    ]
    if not_approved:
        add(
            "all_approved", "Todas as matérias aprovadas", STATUS_ERROR,
            "Não aprovadas: " + "; ".join(not_approved[:10]),
        )
    else:
        add("all_approved", "Todas as matérias aprovadas", STATUS_OK)

    # 3. No empty matters
    empty = [
        m.title for m in matters
        if not (
            (getattr(m, "content_html", "") or "").strip()
            or getattr(m, "semantic_content", None)
            or (getattr(m, "plain_text", "") or "").strip()
        )
    ]
    if empty:
        add("no_empty", "Nenhuma matéria vazia", STATUS_ERROR, "; ".join(empty[:10]))
    else:
        add("no_empty", "Nenhuma matéria vazia", STATUS_OK)

    # 4. No duplicated act numbers inside the edition
    seen: dict[tuple, list[str]] = {}
    for m in matters:
        number = (getattr(m, "act_number", None) or "").strip()
        if not number:
            continue
        key = (str(getattr(m, "act_type_id", "")), number, getattr(m, "act_year", None))
        seen.setdefault(key, []).append(m.title)
    duplicates = [titles for titles in seen.values() if len(titles) > 1]
    if duplicates:
        add(
            "no_duplicate_number", "Numeração sem duplicidade", STATUS_ERROR,
            "; ".join(" / ".join(t[:3]) for t in duplicates),
        )
    else:
        add("no_duplicate_number", "Numeração sem duplicidade", STATUS_OK)

    # 5. Signers present
    missing_signer = [
        m.title for m in matters
        if not (getattr(m, "responsible_name", None) or getattr(m, "responsible_id", None))
    ]
    if missing_signer:
        add(
            "signers_present", "Signatários presentes", STATUS_WARNING,
            "Sem responsável: " + "; ".join(missing_signer[:10]),
        )
    else:
        add("signers_present", "Signatários presentes", STATUS_OK)

    # 6. Edition numbering
    if not edition.number or edition.number < 1:
        add("numbering", "Numeração da edição", STATUS_ERROR, "Número inválido.")
    else:
        add("numbering", "Numeração da edição", STATUS_OK, f"Edição nº {edition.number}.")

    # 7. Frozen snapshot (only required once closed)
    try:
        status = EditionStatus(edition.status)
    except (ValueError, TypeError):
        status = EditionStatus.DRAFT
    if status in _FINAL_STATUSES:
        from app.models.edition_publication_snapshot import EditionPublicationSnapshot

        snap = await db.scalar(
            select(EditionPublicationSnapshot.id).where(
                EditionPublicationSnapshot.edition_id == edition.id,
                EditionPublicationSnapshot.is_valid.is_(True),
            )
        )
        if snap is None:
            add("snapshot", "Snapshot canônico congelado", STATUS_ERROR, "Snapshot ausente.")
        else:
            add("snapshot", "Snapshot canônico congelado", STATUS_OK)
    else:
        add(
            "snapshot", "Snapshot canônico congelado", STATUS_WARNING,
            "Será congelado no fechamento da edição.",
        )

    # 8. Generated PDF
    if edition.pdf_path:
        add("pdf", "PDF gerado", STATUS_OK)
    else:
        add("pdf", "PDF gerado", STATUS_WARNING, "PDF ainda não gerado.")

    # 10. Every matter resolved to a real page (PDF inspector promise)
    if status in (_GENERATED_STATUSES):
        missing_pages = [
            m.title for it in items
            if it.matter is not None and getattr(it, "page_number", None) is None
        ]
        if missing_pages:
            add(
                "page_numbers", "Páginas das matérias resolvidas", STATUS_ERROR,
                "Sem página: " + "; ".join(missing_pages[:10]),
            )
        else:
            add("page_numbers", "Páginas das matérias resolvidas", STATUS_OK)
    else:
        add(
            "page_numbers", "Páginas das matérias resolvidas", STATUS_WARNING,
            "Serão resolvidas na geração do PDF.",
        )

    # 9. Act number already published elsewhere (advisory, single query)
    numbers = [
        (str(m.act_number).strip(), getattr(m, "act_year", None))
        for m in matters
        if (getattr(m, "act_number", None) or "").strip()
    ]
    if numbers:
        published = await db.execute(
            select(Matter.act_number, Matter.act_year, Matter.title).where(
                Matter.organization_id == edition.organization_id,
                Matter.status == MatterStatus.PUBLISHED,
                Matter.act_number.in_([n for n, _ in numbers]),
            )
        )
        already = [
            f"{row[0]}/{row[1]} ({row[2]})" for row in published.all()
        ]
        if already:
            add(
                "published_duplicate", "Número já publicado em outra edição",
                STATUS_WARNING, "; ".join(already[:10]),
            )
        else:
            add("published_duplicate", "Número já publicado em outra edição", STATUS_OK)

    return {
        "ok": all(c["status"] != STATUS_ERROR for c in checks),
        "checks": checks,
    }
