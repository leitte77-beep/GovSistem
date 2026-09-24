"""Render an edition snapshot without mutating its publication record.

Intended for visual/structural regression in homologation.  The production
renderer is exercised, but every ORM commit is suppressed and rolled back.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import select

from app.core.database import get_sync_db
from app.models.edition import Edition
from app.services import edition_pdf


class RollbackSession:
    def __init__(self, session):
        self._session = session

    def __getattr__(self, name):
        return getattr(self._session, name)

    def commit(self):
        self._session.flush()

    def close(self):
        self._session.rollback()
        self._session.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--number", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    lookup = get_sync_db()
    try:
        edition = lookup.execute(
            select(Edition).where(Edition.year == args.year, Edition.number == args.number)
        ).scalar_one()
        edition_id = str(edition.id)
        layout = edition.organization.pdf_layout
        organization_name = edition.organization.name
    finally:
        lookup.close()

    original_factory = edition_pdf.get_sync_db
    original_save = edition_pdf._save_to_storage
    rendered_path: Path | None = None

    def session_factory():
        return RollbackSession(original_factory())

    def capture(filename: str, content: bytes) -> str:
        nonlocal rendered_path
        rendered_path = args.output
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(content)
        return filename

    edition_pdf.get_sync_db = session_factory
    edition_pdf._save_to_storage = capture
    try:
        result = edition_pdf.generate_edition_pdf_sync(
            edition_id,
            organ_name=organization_name,
            verification_base_url="https://farol.govsistem.com.br/verificar",
            layout=layout,
        )
    finally:
        edition_pdf.get_sync_db = original_factory
        edition_pdf._save_to_storage = original_save

    if rendered_path is None:
        raise RuntimeError("renderer produced no artifact")
    print(f"{rendered_path} {result['sha256']} {result['size_bytes']}")


if __name__ == "__main__":
    main()
