"""Contrato OpenAPI: falha se o arquivo versionado ficar desatualizado."""

from __future__ import annotations

import json
from pathlib import Path

from app.main import create_app

RAIZ = Path(__file__).resolve().parents[1]


def test_openapi_versionado_igual_ao_gerado():
    arquivo = json.loads((RAIZ / "openapi.json").read_text(encoding="utf-8"))
    atual = create_app().openapi()
    assert arquivo == atual, (
        "openapi.json desatualizado. Rode: python scripts/gerar_openapi.py"
    )


def test_openapi_tem_seguranca_e_prefixo():
    spec = json.loads((RAIZ / "openapi.json").read_text(encoding="utf-8"))
    assert "/api/govsaude/v1/auth/login" in spec["paths"]
    assert "/api/govsaude/health" in spec["paths"]
    assert spec["info"]["version"]
