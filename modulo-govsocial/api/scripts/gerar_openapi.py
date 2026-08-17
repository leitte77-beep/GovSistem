"""Gera o openapi.json do módulo a partir do app real (fonte da verdade).

Uso:
    PYTHONDONTWRITEBYTECODE=1 python scripts/gerar_openapi.py [caminho_de_saida]

Saída determinística para o mesmo código: todos os routers incluídos,
tags/paths ordenados e sem campos voláteis (não inclui timestamps).
"""

import json
import sys
from pathlib import Path

RAIZ_API = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ_API))

from app.main import create_app  # noqa: E402


def main() -> int:
    saida = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ_API / "openapi.json"
    app = create_app()
    spec = app.openapi()
    spec["paths"] = dict(sorted(spec.get("paths", {}).items()))
    with saida.open("w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
        f.write("\n")
    total = sum(len(m) for m in spec["paths"].values() if isinstance(m, dict))
    print(f"openapi gerado: {saida} — {len(spec['paths'])} paths / {total} operacoes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
