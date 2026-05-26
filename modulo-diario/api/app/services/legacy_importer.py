"""Legacy collection importer — batch PDF import from CSV or filename patterns."""

import csv
import hashlib
import io
import re
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import storage
from app.models.act_type import ActType
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus, EditionType, MatterStatus
from app.models.matter import Matter
from app.models.org_unit import OrgUnit
from app.models.organization import Organization

FILENAME_PATTERN = re.compile(r"^(\d{4})-(\d{2})-(\d{2})__EDICAO\.pdf$", re.IGNORECASE)


class LegacyImportItem:
    filename: str
    content: bytes
    sha256: str
    edition_date: Optional[date] = None
    edition_number: Optional[int] = None
    edition_year: Optional[int] = None
    edition_type: EditionType = EditionType.NORMAL
    description: str = ""
    errors: list[str]

    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self.content = content
        self.sha256 = hashlib.sha256(content).hexdigest()
        self.errors = []


class LegacyImportResult:
    total: int = 0
    success: int = 0
    errors: list[dict] = []
    editions_created: list[str] = []


def parse_filename(filename: str) -> Optional[tuple[int, int, int]]:
    """Extract (year, month, day) from filename matching YYYY-MM-DD__EDICAO.pdf."""
    m = FILENAME_PATTERN.match(filename)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3))
    return None


async def validate_items(
    items: list[LegacyImportItem],
    org_id: uuid.UUID,
    db: AsyncSession,
) -> LegacyImportResult:
    """Validate items without saving. Returns result with errors."""
    result = LegacyImportResult()
    result.total = len(items)

    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    if not org:
        result.errors.append({"file": "system", "error": "Organization not found"})
        return result

    for item in items:
        parsed = parse_filename(item.filename)
        if parsed:
            year, month, day = parsed
            item.edition_year = year
            item.edition_date = date(year, month, day)
        else:
            item.errors.append("Filename does not match YYYY-MM-DD__EDICAO.pdf pattern")
            result.errors.append({"file": item.filename, "error": "Invalid filename pattern"})
            continue

        if item.edition_year < 1900 or item.edition_year > 2100:
            item.errors.append(f"Year {item.edition_year} out of range")

        if item.errors:
            for err in item.errors:
                result.errors.append({"file": item.filename, "error": err})

    result.success = result.total - len(result.errors)
    return result


async def import_items(
    items: list[LegacyImportItem],
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    description: str = "",
) -> LegacyImportResult:
    """Import legacy editions and matters. Creates editions marked as legacy."""
    result = await validate_items(items, org_id, db)
    if result.errors:
        return result

    org_unit_result = await db.execute(
        select(OrgUnit).where(OrgUnit.organization_id == org_id).limit(1)
    )
    org_unit = org_unit_result.scalar_one_or_none()

    act_type_result = await db.execute(select(ActType).limit(1))
    act_type = act_type_result.scalar_one_or_none()
    if not act_type:
        act_type = ActType(name="Outros", is_active=True)
        db.add(act_type)
        await db.flush()

    for item in items:
        if item.errors:
            continue
        try:
            edition_num = item.edition_number or 0

            existing = await db.execute(
                select(Edition).where(
                    Edition.year == item.edition_year,
                    Edition.number == edition_num,
                    Edition.type == EditionType.NORMAL,
                )
            )
            if existing.scalar_one_or_none():
                result.errors.append({
                    "file": item.filename,
                    "error": f"Edition {item.edition_year}/{edition_num} already exists",
                })
                continue

            path = f"legacy/{item.filename}"
            await storage.store(path, item.content)

            edition = Edition(
                organization_id=org_id,
                number=edition_num,
                year=item.edition_year,
                type=EditionType.NORMAL,
                title=f"Edição {item.edition_year}/{edition_num} — Acervo Legado",
                publication_date=item.edition_date or date(item.edition_year, 1, 1),
                status=EditionStatus.PUBLISHED,
                pdf_path=path,
                pdf_hash=item.sha256,
                created_by=user_id,
                published_at=datetime.utcnow(),
            )
            edition.generate_verification_code()
            edition.immutability_hash = edition.compute_immutability_hash()
            db.add(edition)
            await db.flush()

            matter = Matter(
                organization_id=org_id,
                org_unit_id=org_unit.id if org_unit else None,
                act_type_id=act_type.id,
                title=description or f"Matéria da Edição {item.edition_year}/{edition_num}",
                content_html=f"<p>Documento do acervo legado importado em {datetime.utcnow().strftime('%d/%m/%Y')}.</p>",
                plain_text=f"Documento do acervo legado. Arquivo: {item.filename}",
                status=MatterStatus.PUBLISHED,
                author_id=user_id,
                published_at=datetime.utcnow(),
            )
            db.add(matter)
            await db.flush()

            item_ed = EditionItem(
                edition_id=edition.id,
                matter_id=matter.id,
                position=0,
            )
            db.add(item_ed)

            result.success += 1
            result.editions_created.append(f"{item.edition_year}/{edition_num}")

        except Exception as e:
            result.errors.append({"file": item.filename, "error": str(e)})

    await db.commit()
    return result


def parse_csv(content: str) -> list[dict]:
    """Parse CSV content with columns: data, numero, ano, tipo, arquivo, descricao."""
    reader = csv.DictReader(io.StringIO(content))
    rows = []
    for row in reader:
        row = {k.strip().lower(): v.strip() for k, v in row.items()}
        rows.append(row)
    return rows
