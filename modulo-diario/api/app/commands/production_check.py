"""Production readiness check (Fase 4.2).

Diagnóstico — nunca executa migration nem altera dados. Exit code:

    0 = READY ou READY_WITH_WARNINGS
    1 = NOT_READY (ou qualquer warning com --strict)

Uso:
    python -m app.commands.production_check
    python -m app.commands.production_check --strict
    python -m app.commands.production_check --no-probe
    python -m app.commands.production_check --json
    python -m app.commands.production_check --org <uuid>
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Optional
from uuid import UUID

from app.services.readiness import (
    FAIL,
    PASS,
    SKIP,
    WARN,
    ReadinessService,
    exit_code,
    summarize,
)


async def run(*, probe: bool = True, org: Optional[UUID] = None) -> dict:
    from app.core.database import async_session

    async with async_session() as db:
        checks = await ReadinessService().full_checks(db, probe=probe, org=org)

    status = summarize(checks)
    warnings = [c for c in checks if c.status == WARN]
    failures = [c for c in checks if c.status == FAIL]
    return {
        "status": status,
        "exit_code": exit_code(checks, strict=False),
        "checks": {
            c.code.lower(): {
                "status": c.status,
                "detail": c.detail,
                **({"data": c.data} if c.data else {}),
            }
            for c in checks
        },
        "warnings": [
            {"code": c.code, "detail": c.detail, "hint": c.hint} for c in warnings
        ],
        "failures": [
            {"code": c.code, "detail": c.detail, "hint": c.hint} for c in failures
        ],
        "suggested_actions": sorted({c.hint for c in checks if c.hint}),
    }


_MARKS = {PASS: "✓", WARN: "⚠", FAIL: "✗", SKIP: "○"}


def print_report(report: dict) -> None:
    print("\nGovSistem Diário Oficial")
    print("Production Readiness Check")
    print("─" * 40)
    for code, info in report["checks"].items():
        mark = _MARKS.get(info["status"], "•")
        line = f"{mark} {code}: {info['detail']}"
        print(line)
    print("\nResult")
    print("─" * 40)
    print(report["status"].replace("_", " "))
    if report["warnings"]:
        print("\nWarnings:")
        for w in report["warnings"]:
            print(f"- {w['code']}: {w['detail']}")
    if report["failures"]:
        print("\nFailures:")
        for f in report["failures"]:
            print(f"- {f['code']}: {f['detail']}")
    if report["suggested_actions"]:
        print("\nSuggested action(s):")
        for action in report["suggested_actions"]:
            print(f"  {action}")
    print()


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Production readiness check.")
    parser.add_argument("--strict", action="store_true", help="Warnings retornam 1.")
    parser.add_argument("--no-probe", action="store_true", help="Não chamar TSA/signer.")
    parser.add_argument("--json", action="store_true", help="Saída JSON.")
    parser.add_argument("--org", default=None, help="UUID da organização")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    report = asyncio.run(run(probe=not args.no_probe, org=UUID(args.org) if args.org else None))

    if args.json:
        print(json.dumps(report, indent=2, default=str))
    else:
        print_report(report)

    code = report["exit_code"]
    if args.strict and code == 0 and report["status"] != "READY":
        code = 1
    return code


if __name__ == "__main__":
    raise SystemExit(main())
