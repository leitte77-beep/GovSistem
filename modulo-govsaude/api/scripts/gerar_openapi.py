"""Gera ``openapi.json`` versionado (contrato da API)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app  # noqa: E402


def main() -> None:
    app = create_app()
    destino = Path(__file__).resolve().parents[1] / "openapi.json"
    destino.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"OpenAPI gerado em {destino}")


if __name__ == "__main__":
    main()
