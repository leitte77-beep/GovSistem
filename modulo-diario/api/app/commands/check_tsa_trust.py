"""Diagnóstico do trust store TSA/ICP-Brasil.

Verifica a configuração, carrega o trust store (raízes e intermediárias
separadas), opcionalmente faz uma requisição RFC 3161 real à TSA e valida o
token com o ``TimestampValidator``. Pensado para rodar antes do deploy.

Uso:
    python -m app.commands.check_tsa_trust
    python -m app.commands.check_tsa_trust --no-probe
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import sys
from typing import Optional

from app.core.config import settings
from app.services.timestamp_validation import (
    TimestampValidator,
    load_crls,
    load_trust_store,
)

PROBE_PAYLOAD = b"govsistem-tsa-trust-check"


def _config_report() -> dict:
    return {
        "TSA_URL": bool(settings.TSA_URL),
        "TSA_POLICY_OID": settings.TSA_POLICY_OID or "",
        "TSA_TRUST_ROOTS_PATH": settings.TSA_TRUST_ROOTS_PATH or "",
        "TSA_INTERMEDIATES_PATH": settings.TSA_INTERMEDIATES_PATH or "",
        "TSA_CRL_PATH": settings.TSA_CRL_PATH or "",
        "TSA_REVOCATION_MODE": settings.TSA_REVOCATION_MODE,
        "TSA_ALLOW_FETCHING": settings.TSA_ALLOW_FETCHING,
        "TSA_REQUIRED_FOR_PUBLICATION": settings.TSA_REQUIRED_FOR_PUBLICATION,
    }


async def _probe_tsa(validator: TimestampValidator, tsa_url: str) -> dict:
    """Send a real RFC 3161 request and validate the returned token."""
    import httpx
    from asn1crypto import algos, tsp

    imprint = hashlib.sha256(PROBE_PAYLOAD).digest()
    request = tsp.TimeStampReq(
        {
            "version": "v1",
            "message_imprint": {
                "hash_algorithm": algos.DigestAlgorithm({"algorithm": "sha256"}),
                "hashed_message": imprint,
            },
            "req_policy": settings.TSA_POLICY_OID or None,
            "cert_req": True,
        }
    )
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            tsa_url,
            content=request.dump(),
            headers={"Content-Type": "application/timestamp-query"},
        )
        response.raise_for_status()
    ts_response = tsp.TimeStampResp.load(response.content)
    status = ts_response["status"]["status"]
    status_name = getattr(status, "native", status)
    if str(status_name) not in ("0", "granted", "granted_with_mods"):
        raise ValueError(f"TSA refused the request: {status_name}")
    token = ts_response["time_stamp_token"].dump()
    result = await validator.validate_token(token, imprinted_data=PROBE_PAYLOAD)
    return result.to_dict()


async def check(probe: bool = True) -> dict:
    config = _config_report()
    store = load_trust_store(
        config["TSA_TRUST_ROOTS_PATH"],
        config["TSA_INTERMEDIATES_PATH"],
    )
    crls = load_crls(config["TSA_CRL_PATH"])
    validator = TimestampValidator(
        trust_roots=store.roots,
        intermediates=store.intermediates,
        crls=crls,
        revocation_mode=config["TSA_REVOCATION_MODE"],
        allow_fetching=config["TSA_ALLOW_FETCHING"],
        expected_policy_oid=config["TSA_POLICY_OID"],
        trust_store=store,
    )

    report: dict = {
        "configuration": config,
        "trust_store": store.to_dict(),
        "crl_count": len(crls),
        "probe": None,
        "result": "NO_TSA",
        "ok": True,
    }

    if not config["TSA_URL"]:
        report["result"] = "NO_TSA"
        report["ok"] = not settings.TSA_REQUIRED_FOR_PUBLICATION
        return report

    if not probe:
        report["result"] = "NOT_PROBED"
        report["ok"] = True
        return report

    try:
        report["probe"] = await _probe_tsa(validator, settings.TSA_URL)
    except Exception as exc:  # noqa: BLE001 - diagnostic must not crash
        report["result"] = "ERROR"
        report["error"] = str(exc)
        report["ok"] = False
        return report

    report["result"] = str(report["probe"].get("validation_status", "")).upper()
    report["ok"] = report["probe"].get("validation_status") == "valid"
    return report


def _line(ok: bool | None, label: str, detail: str = "") -> str:
    mark = "✓" if ok else ("✗" if ok is False else "•")
    return f"  {mark} {label}" + (f" — {detail}" if detail else "")


def _print_report(report: dict) -> None:
    cfg = report["configuration"]
    store = report["trust_store"]
    print("\nGovSistem — TSA Trust Check\n")

    print("Configuration")
    print(_line(cfg["TSA_URL"], "TSA_URL configurada"))
    for label, value in (
        ("TSA_POLICY_OID", cfg["TSA_POLICY_OID"]),
        ("TSA_TRUST_ROOTS_PATH", cfg["TSA_TRUST_ROOTS_PATH"]),
        ("TSA_INTERMEDIATES_PATH", cfg["TSA_INTERMEDIATES_PATH"]),
    ):
        print(_line(bool(value), f"{label} configurado", value or "não definido"))
    print(_line(None, "Revocation mode", cfg["TSA_REVOCATION_MODE"]))
    print(_line(None, "Fetching online", str(cfg["TSA_ALLOW_FETCHING"])))

    print("\nTrust store")
    print(f"  {store['name']} versão {store['version']}")
    print(f"  bundle_sha256: {store['bundle_sha256']}")
    roots_label = f"{store['root_count']} certificado(s) raiz confiável(is)"
    print(_line(store["root_count"] > 0, roots_label))
    print(_line(True, f"{store['intermediate_count']} certificado(s) intermediário(s)"))
    print(_line(True, f"{report['crl_count']} CRL(s) carregada(s)"))

    probe = report.get("probe")
    if probe:
        print("\nTimestamp test")
        print(_line(probe.get("token_parseable"), "RFC3161 token parseado"))
        print(_line(probe.get("cms_signature_valid"), "Assinatura CMS válida"))
        print(_line(probe.get("message_imprint_valid"), "Message imprint válido"))
        print(_line(probe.get("extended_key_usage_valid"), "EKU timeStamping"))
        print(_line(probe.get("certificate_valid_at_gen_time"), "Certificado válido no genTime"))
        print(_line(probe.get("policy_valid"), "Policy OID", probe.get("policy_check", "")))
        chain = probe.get("chain") or {}
        print(_line(chain.get("trusted"), "Cadeia confiável"))
        for step in chain.get("path") or []:
            print(f"      → {step['subject']}")
        revo = probe.get("revocation") or {}
        print(_line(revo.get("status") == "good", "Revogação", str(revo.get("status"))))

    print(f"\nRESULT: {report['result']}")
    if report.get("error"):
        print(f"  erro: {report['error']}")
    print()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Diagnóstico do trust store TSA.")
    parser.add_argument("--no-probe", action="store_true", help="Não chamar a TSA.")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    report = asyncio.run(check(probe=not args.no_probe))
    _print_report(report)
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
