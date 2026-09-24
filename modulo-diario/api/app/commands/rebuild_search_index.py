"""Reconstrói o índice de busca (PostgreSQL FTS) das matérias publicadas.

Idempotente: pode ser executado repetidas vezes; cada matéria é reindexada a
partir do seu estado atual. Não altera o documento oficial — apenas o índice.

Uso:
    python -m app.commands.rebuild_search_index
    python -m app.commands.rebuild_search_index --org <uuid> --from 2026-01-01
    python -m app.commands.rebuild_search_index --to 2026-09-30 --limit 500
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus, MatterStatus
from app.models.matter import Matter


async def rebuild(
    *,
    organization_id: Optional[UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: Optional[int] = None,
) -> dict:
    from app.services.search_indexer import get_search_provider

    provider = get_search_provider()
    async with async_session() as db:
        try:
            dialect = db.bind.dialect.name if db.bind is not None else ""
        except Exception:  # noqa: BLE001
            dialect = ""
        if dialect != "postgresql":
            return {
                "ok": False,
                "error": f"FTS requer PostgreSQL (dialeto atual: {dialect or 'desconhecido'}).",
                "processed": 0,
                "failed": 0,
                "total": 0,
            }

        query = (
            select(Matter, Edition)
            .join(EditionItem, EditionItem.matter_id == Matter.id)
            .join(Edition, Edition.id == EditionItem.edition_id)
            .where(
                Matter.status == MatterStatus.PUBLISHED,
                Edition.status == EditionStatus.PUBLISHED,
            )
            .options(
                selectinload(Matter.act_type),
                selectinload(Matter.org_unit),
            )
        )
        if organization_id is not None:
            query = query.where(Matter.organization_id == organization_id)
        if date_from is not None:
            query = query.where(Edition.publication_date >= date_from)
        if date_to is not None:
            query = query.where(Edition.publication_date <= date_to)
        if limit is not None:
            query = query.limit(limit)

        rows = (await db.execute(query)).all()

        processed = failed = 0
        seen: set = set()
        for matter, edition in rows:
            if matter.id in seen:
                continue
            seen.add(matter.id)
            try:
                await provider.index_matter(matter, edition, db)
                processed += 1
            except Exception as exc:  # noqa: BLE001 - report and continue
                failed += 1
                print(f"FALHA matéria {matter.id}: {exc}", file=sys.stderr)
        await db.commit()
        return {"ok": True, "processed": processed, "failed": failed, "total": len(seen)}


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reconstrói o índice de busca (FTS).")
    parser.add_argument("--org", dest="org", default=None, help="UUID da organização")
    parser.add_argument("--from", dest="date_from", default=None, help="Data inicial (AAAA-MM-DD)")
    parser.add_argument("--to", dest="date_to", default=None, help="Data final (AAAA-MM-DD)")
    parser.add_argument("--limit", dest="limit", type=int, default=None)
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    result = asyncio.run(
        rebuild(
            organization_id=UUID(args.org) if args.org else None,
            date_from=date.fromisoformat(args.date_from) if args.date_from else None,
            date_to=date.fromisoformat(args.date_to) if args.date_to else None,
            limit=args.limit,
        )
    )
    if not result.get("ok"):
        print(f"ERRO: {result.get('error')}", file=sys.stderr)
        return 1
    print(
        f"Índice reconstruído: {result['processed']} processadas, "
        f"{result['failed']} falhas, {result['total']} matérias."
    )
    return 0 if result["failed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
