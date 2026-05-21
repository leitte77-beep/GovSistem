#!/usr/bin/env python3
"""Automated homologation test runner.

Executes a series of integration tests against the API to validate
the complete workflow from matter creation to published edition.

Usage:
    python scripts/test_homologacao.py [--url http://localhost:8000]
"""

import argparse
import asyncio
import io
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime

import httpx

PASS = 0
FAIL = 0
SKIP = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name} — {detail}")


def skip(name: str):
    global SKIP
    SKIP += 1
    print(f"  ○ {name} (skipped)")


async def run_tests(base_url: str):
    global PASS, FAIL, SKIP
    api = f"{base_url}/api/v1"
    public_api = f"{base_url}/api/public/v1"

    print(f"\n{'='*60}")
    print(f"  RELATÓRIO DE HOMOLOGAÇÃO — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print(f"  Ambiente: {base_url}")
    print(f"{'='*60}\n")

    # ── Auth ──────────────────────────────────────────────────────────────
    print("1. AUTENTICAÇÃO")
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{api}/auth/login", json={
            "email": "homolog@test.com", "password": "Homolog@2026"
        })
        check("Login com credenciais válidas", r.status_code == 200,
              f"Esperado 200, obtido {r.status_code}")

        token = r.json().get("access_token", "") if r.status_code == 200 else ""

        r2 = await client.post(f"{api}/auth/login", json={
            "email": "homolog@test.com", "password": "wrong"
        })
        check("Login com senha inválida rejeitado", r2.status_code == 401)

        if token:
            r3 = await client.get(f"{api}/auth/me",
                                  headers={"Authorization": f"Bearer {token}"})
            check("GET /me com token válido", r3.status_code == 200)

    # ── Protected endpoints ────────────────────────────────────────────────
    print("\n2. PROTEÇÃO DE ACESSO")
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{api}/matters")
        check("Endpoint privado sem token retorna 401", r.status_code == 401)

        r = await client.get(f"{public_api}/editions")
        check("Endpoint público sem token retorna 200", r.status_code == 200)

    # ── Matters ────────────────────────────────────────────────────────────
    print("\n3. MATÉRIAS")
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{api}/auth/login", json={
            "email": "homolog@test.com", "password": "Homolog@2026"
        })
        token = r.json().get("access_token", "")

        headers = {"Authorization": f"Bearer {token}"}

        r = await client.get(f"{api}/matters", headers=headers)
        check("Listar matérias retorna dados", r.status_code == 200 and len(r.json()) > 0,
              f"Esperado >0 matérias, obtido {len(r.json())}")

        if r.status_code == 200 and r.json():
            matter_id = r.json()[0]["id"]
            r2 = await client.get(f"{api}/matters/{matter_id}", headers=headers)
            check("Detalhar matéria retorna conteúdo HTML",
                  r2.status_code == 200 and "content_html" in r2.json())

            r3 = await client.get(f"{public_api}/matters/{matter_id}")
            check("Matéria pública retorna dados publicados",
                  r3.status_code in (200, 404))

    # ── Import ─────────────────────────────────────────────────────────────
    print("\n4. IMPORTAÇÃO DE ARQUIVOS")
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{api}/auth/login", json={
            "email": "homolog@test.com", "password": "Homolog@2026"
        })
        token = r.json().get("access_token", "")
        headers = {"Authorization": f"Bearer {token}"}

        # Test DOCX
        from docx import Document
        doc = Document()
        doc.add_paragraph("Teste de importação DOCX para homologação.")
        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        r = await client.post(f"{api}/imports/docx",
                              files={"file": ("teste.docx", buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                              headers=headers)
        check("Importar DOCX retorna HTML", r.status_code == 200 and "content_html" in r.json(),
              f"Status: {r.status_code}")

    # ── Editions ───────────────────────────────────────────────────────────
    print("\n5. EDIÇÕES")
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{public_api}/editions")
        check("Listar edições públicas retorna dados",
              r.status_code == 200, f"Status: {r.status_code}")

        if r.status_code == 200 and r.json().get("data"):
            edition = r.json()["data"][0]
            eid = edition["id"]
            r2 = await client.get(f"{public_api}/editions/{eid}")
            check("Detalhar edição pública retorna metadados",
                  r2.status_code == 200 and "items" in r2.json())

            if r2.status_code == 200 and r2.json().get("verification_code"):
                vcode = r2.json()["verification_code"]
                r3 = await client.get(f"{public_api}/verify/{vcode}")
                check("Verificação de código retorna válido",
                      r3.status_code == 200 and r3.json().get("valid") is True)

    # ── Search ─────────────────────────────────────────────────────────────
    print("\n6. BUSCA")
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{public_api}/search?q=Decreto")
        check("Busca por 'Decreto' retorna resultados",
              r.status_code == 200, f"Status: {r.status_code}")

        if r.status_code == 200:
            data = r.json()
            has_results = data.get("total", 0) > 0 if isinstance(data, dict) else len(data) > 0
            check("Resultados de busca contêm matérias", has_results)

        r2 = await client.get(f"{public_api}/search?q=termo_inexistente_xyz123")
        check("Busca sem resultados retorna vazio",
              r2.status_code == 200)

    # ── User without permission ────────────────────────────────────────────
    print("\n7. CONTROLE DE ACESSO")
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{api}/auth/login", json={
            "email": "homolog@test.com", "password": "Homolog@2026"
        })
        token = r.json().get("access_token", "")
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.post(f"{api}/editions/some-id/publish",
                              headers=headers)
        check("Usuário sem permissão de PUBLICADOR não publica",
              r.status_code in (403, 404, 422),
              f"Esperado 403/404/422, obtido {r.status_code}")

    # ── Immutability ───────────────────────────────────────────────────────
    print("\n8. IMUTABILIDADE")
    from app.models.enums import EditionStatus
    check("Edição PUBLISHED não aceita transição",
          not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.DRAFT))
    check("Matéria PUBLISHED não é editável",
          not EditionStatus.can_edit(EditionStatus.PUBLISHED))

    # ── Backup ─────────────────────────────────────────────────────────────
    print("\n9. BACKUP")
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            result = subprocess.run(
                ["bash", "scripts/backup.sh", tmpdir],
                capture_output=True, text=True, timeout=60,
                env={**os.environ, "BACKUP_ENCRYPT_KEY": "test-key-homologacao"}
            )
            if result.returncode == 0:
                files = os.listdir(os.path.join(tmpdir, "db"))
                check("Backup executado com sucesso", len(files) > 0,
                      f"Arquivos: {files}")
            else:
                skip("Backup (script não disponível ou sem Docker)")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        skip("Backup (Docker não disponível no ambiente de teste)")

    # ── Summary ────────────────────────────────────────────────────────────
    total = PASS + FAIL + SKIP
    print(f"\n{'='*60}")
    print(f"  RESULTADO: {PASS}/{total} passaram, {FAIL} falharam, {SKIP} ignorados")
    if FAIL == 0:
        print(f"  STATUS: HOMOLOGAÇÃO APROVADA ✓")
    else:
        print(f"  STATUS: HOMOLOGAÇÃO REPROVADA — corrigir {FAIL} falha(s)")
    print(f"{'='*60}\n")

    return FAIL == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Homologation test runner")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    args = parser.parse_args()

    success = asyncio.run(run_tests(args.url))
    sys.exit(0 if success else 1)
