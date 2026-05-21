#!/usr/bin/env python3
"""Integrity verification job: checks SHA-256 hashes of published PDFs.

Usage:
    python scripts/verify_integrity.py
    python scripts/verify_integrity.py --fix  # rehash mismatches
"""

import argparse
import hashlib
import os
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "api"))

from app.core.config import settings
from app.core.storage import storage
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session


def verify(db_url: str, fix: bool = False) -> int:
    engine = create_engine(db_url)
    errors = 0

    with Session(engine) as session:
        from app.models.edition import Edition
        from app.models.enums import EditionStatus

        result = session.execute(
            select(Edition).where(
                Edition.status.in_([EditionStatus.PUBLISHED, EditionStatus.SIGNED])
            ).where(Edition.pdf_hash.isnot(None))
        )
        editions = result.scalars().all()

        print(f"Verifying {len(editions)} published editions...")

        pdf_dir = Path(settings.UPLOAD_DIR) / "pdf"

        for edition in editions:
            pdf_path = pdf_dir / edition.pdf_path
            if not pdf_path.exists():
                print(f"  MISSING: {edition.year}/{edition.number} - {edition.pdf_path}")
                errors += 1
                continue

            content = pdf_path.read_bytes()
            actual_hash = hashlib.sha256(content).hexdigest()

            if actual_hash != edition.pdf_hash:
                print(f"  HASH MISMATCH: {edition.year}/{edition.number}")
                print(f"    Stored: {edition.pdf_hash}")
                print(f"    Actual: {actual_hash}")
                errors += 1

                if fix:
                    edition.pdf_hash = actual_hash
                    session.commit()
                    print(f"    → Fixed: hash updated")

        session.close()

    print(f"\nResult: {errors} error(s) found in {len(editions)} editions")
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify PDF integrity")
    parser.add_argument("--fix", action="store_true", help="Auto-fix hash mismatches")
    args = parser.parse_args()

    db_url = (
        f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
    sys.exit(verify(db_url, fix=args.fix))
