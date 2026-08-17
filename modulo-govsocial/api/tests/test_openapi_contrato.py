"""Contrato OpenAPI (F1.3): nenhum router real pode ficar ausente do contrato.

Falha se uma rota registrada no app não aparecer no openapi.json (ex.: router
criado e esquecido no include_router) ou se o contrato versionado divergir do
app real (arquivo desatualizado = CI regen+diff também falharia).
"""

import json
from pathlib import Path

from app.main import create_app

RAIZ_API = Path(__file__).resolve().parent.parent
OPENAPI_VERSIONADO = RAIZ_API / "openapi.json"


def test_openapi_cobre_todas_as_rotas_registradas():
    app = create_app()
    espec = app.openapi()
    paths = espec.get("paths", {})

    for rota in app.routes:
        if getattr(rota, "methods", None) is None:
            continue
        path = getattr(rota, "path", "")
        # Rotas internas do FastAPI (docs/redoc/openapi) não fazem parte do contrato de negócio.
        if path in {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc", "/api/govsocial/health"}:
            continue
        assert path in paths, f"rota registrada ausente do OpenAPI: {path}"


def test_openapi_versionado_igual_ao_app_real():
    """O openapi.json versionado deve ser igual ao gerado do app (determinístico)."""
    app = create_app()
    espec = app.openapi()
    espec["paths"] = dict(sorted(espec.get("paths", {}).items()))
    atual = json.loads(OPENAPI_VERSIONADO.read_text(encoding="utf-8"))
    assert atual == espec, (
        "openapi.json desatualizado — rode: "
        "DEBUG=true python scripts/gerar_openapi.py"
    )
