"""Unit tests for the independent RFC 3161 timestamp validator.

Tokens are real CMS TimeStampTokens produced by pyHanko's ``DummyTimeStamper``
over generated X.509 material, so the CMS signature, the message imprint, the
EKU, the chain of trust and the ``genTime`` checks all exercise real
cryptography.
"""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from asn1crypto import algos, keys, tsp
from asn1crypto import x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from app.core.config import settings
from app.services.publication_gate import assert_publishable
from app.services.timestamp_validation import (
    TimestampValidationResult,
    TimestampValidator,
    apply_result_to_record,
    load_trust_store,
)

POLICY_OID = "1.3.6.1.4.1.4146.2.2"  # DummyTimeStamper's policy OID
NOW = datetime.now(timezone.utc)


# ── X.509 helpers ────────────────────────────────────────────────────────────


def _new_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _asn1_key(key):
    return keys.PrivateKeyInfo.load(
        key.private_bytes(
            serialization.Encoding.DER,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )


def _asn1_cert(cert):
    return asn1_x509.Certificate.load(cert.public_bytes(serialization.Encoding.DER))


def _name(common_name):
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])


def _build_cert(
    subject,
    issuer,
    public_key,
    signing_key,
    *,
    ca,
    eku=None,
    not_before,
    not_after,
):
    subject_name = subject if isinstance(subject, x509.Name) else _name(subject)
    issuer_name = issuer if isinstance(issuer, x509.Name) else _name(issuer)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject_name)
        .issuer_name(issuer_name)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before)
        .not_valid_after(not_after)
        .add_extension(
            x509.BasicConstraints(ca=ca, path_length=None), critical=True
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(public_key), critical=False
        )
    )
    if issuer_name != subject_name:
        builder = builder.add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(
                signing_key.public_key()
            ),
            critical=False,
        )
    if eku is not None:
        builder = builder.add_extension(x509.ExtendedKeyUsage(eku), critical=True)
    return builder.sign(signing_key, hashes.SHA256())


def _self_signed_ca(name="AC Raiz ICP-Brasil", *, not_before=None, not_after=None):
    key = _new_key()
    cert = _build_cert(
        name,
        name,
        key.public_key(),
        key,
        ca=True,
        not_before=not_before or NOW - timedelta(days=1),
        not_after=not_after or NOW + timedelta(days=3650),
    )
    return cert, key


def _issue_ca(issuer_cert, issuer_key, name):
    key = _new_key()
    cert = _build_cert(
        name,
        issuer_cert.subject,
        key.public_key(),
        issuer_key,
        ca=True,
        not_before=NOW - timedelta(days=1),
        not_after=NOW + timedelta(days=1800),
    )
    return cert, key


def _issue_tsa(issuer_cert, issuer_key, name="ACT de Teste", *, not_before=None, not_after=None):
    key = _new_key()
    cert = _build_cert(
        name,
        issuer_cert.subject,
        key.public_key(),
        issuer_key,
        ca=False,
        eku=[ExtendedKeyUsageOID.TIME_STAMPING],
        not_before=not_before or NOW - timedelta(days=1),
        not_after=not_after or NOW + timedelta(days=365),
    )
    return cert, key


def _token(tsa_cert, tsa_key, payload, *, embed=None, fixed_dt=None):
    from pyhanko.sign.timestamps.dummy_client import DummyTimeStamper

    stamper = DummyTimeStamper(
        _asn1_cert(tsa_cert),
        _asn1_key(tsa_key),
        certs_to_embed=[_asn1_cert(c) for c in (embed or [])],
        fixed_dt=fixed_dt,
    )
    request = tsp.TimeStampReq(
        {
            "version": "v1",
            "message_imprint": {
                "hash_algorithm": algos.DigestAlgorithm({"algorithm": "sha256"}),
                "hashed_message": hashlib.sha256(payload).digest(),
            },
            "cert_req": True,
        }
    )
    response = stamper.request_tsa_response(request)
    return response["time_stamp_token"].dump()


def _self_signed_token(payload, *, with_eku=True, fixed_dt=None):
    key = _new_key()
    cert = _build_cert(
        "TSA de Teste",
        "TSA de Teste",
        key.public_key(),
        key,
        ca=True,
        eku=[ExtendedKeyUsageOID.TIME_STAMPING] if with_eku else None,
        not_before=NOW - timedelta(days=1),
        not_after=NOW + timedelta(days=365),
    )
    return _token(cert, key, payload, fixed_dt=fixed_dt), cert


# ── basic verdicts ───────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_absent_token_is_reported_absent():
    result = await TimestampValidator().validate_token(None)
    assert result.status == "absent"
    assert result.token_present is False
    assert result.token_parseable is False
    assert result.validation_status == "pending_validation"


@pytest.mark.anyio
async def test_malformed_token_is_invalid_not_absent():
    result = await TimestampValidator().validate_token(b"nao-e-um-cms")
    assert result.status == "present"
    assert result.token_present is True
    assert result.token_parseable is False
    assert result.validation_status == "invalid"
    assert result.errors


@pytest.mark.anyio
async def test_valid_token_with_trust_root_is_valid():
    payload = b"valor-da-assinatura-cms"
    token, tsa_cert = _self_signed_token(payload)

    result = await TimestampValidator(trust_roots=[_asn1_cert(tsa_cert)]).validate_token(
        token, imprinted_data=payload
    )

    assert result.token_parseable is True
    assert result.cms_signature_valid is True
    assert result.cms_integrity is True
    assert result.message_imprint_valid is True
    assert result.extended_key_usage_valid is True
    assert result.certificate_valid_at_gen_time is True
    assert result.chain_trusted is True
    assert result.chain["path_found"] is True
    assert result.chain["anchor"] == "CN=TSA de Teste"
    assert len(result.chain["path"]) == 1
    assert result.policy_oid == POLICY_OID
    assert result.gen_time_sane is True
    assert result.validation_status == "valid"
    assert result.is_valid is True


@pytest.mark.anyio
async def test_token_without_trust_store_is_present_but_indeterminate():
    token, _ = _self_signed_token(b"payload")

    result = await TimestampValidator().validate_token(token, imprinted_data=b"payload")

    assert result.cms_signature_valid is True
    assert result.chain_trusted is None
    assert result.validation_status == "indeterminate"


@pytest.mark.anyio
async def test_imprint_mismatch_is_invalid():
    token, tsa_cert = _self_signed_token(b"payload")

    result = await TimestampValidator(
        trust_roots=[_asn1_cert(tsa_cert)]
    ).validate_token(token, imprinted_data=b"outro-conteudo")

    assert result.message_imprint_valid is False
    assert result.validation_status == "invalid"


@pytest.mark.anyio
async def test_expected_policy_oid_is_enforced():
    token, tsa_cert = _self_signed_token(b"payload")
    roots = [_asn1_cert(tsa_cert)]

    ok = await TimestampValidator(
        trust_roots=roots, expected_policy_oid=POLICY_OID
    ).validate_token(token, imprinted_data=b"payload")
    assert ok.policy_check == "enforced"
    assert ok.policy_valid is True
    assert ok.validation_status == "valid"

    wrong = await TimestampValidator(
        trust_roots=roots, expected_policy_oid="1.2.3.4"
    ).validate_token(token, imprinted_data=b"payload")
    assert wrong.policy_valid is False
    assert wrong.validation_status == "invalid"


@pytest.mark.anyio
async def test_policy_not_enforced_never_claims_policy_valid():
    token, tsa_cert = _self_signed_token(b"payload")

    result = await TimestampValidator(
        trust_roots=[_asn1_cert(tsa_cert)]
    ).validate_token(token, imprinted_data=b"payload")

    assert result.policy_check == "not_enforced"
    assert result.policy_valid is None
    assert result.validation_status == "valid"


@pytest.mark.anyio
async def test_missing_time_stamping_eku_is_invalid():
    token, tsa_cert = _self_signed_token(b"payload", with_eku=False)

    result = await TimestampValidator(
        trust_roots=[_asn1_cert(tsa_cert)]
    ).validate_token(token, imprinted_data=b"payload")

    assert result.extended_key_usage_valid is False
    assert result.validation_status == "invalid"


# ── trust anchors vs intermediates ───────────────────────────────────────────


@pytest.mark.anyio
async def test_intermediates_are_not_promoted_to_trust_anchors():
    root, root_key = _self_signed_ca()
    inter, inter_key = _issue_ca(root, root_key, "AC Intermediaria")
    tsa_cert, tsa_key = _issue_tsa(inter, inter_key)
    payload = b"cadeia-com-intermediaria"
    token = _token(tsa_cert, tsa_key, payload, embed=[inter])

    # Intermediates alone (no root configured) must never yield a trusted chain.
    without_root = await TimestampValidator(
        intermediates=[_asn1_cert(inter)]
    ).validate_token(token, imprinted_data=payload)
    assert without_root.chain_trusted is None
    assert without_root.validation_status == "indeterminate"

    # With the official root as anchor + the intermediate as auxiliary: valid.
    with_root = await TimestampValidator(
        trust_roots=[_asn1_cert(root)],
        intermediates=[_asn1_cert(inter)],
    ).validate_token(token, imprinted_data=payload)
    assert with_root.chain_trusted is True
    assert [step["subject"] for step in with_root.chain["path"]] == [
        "CN=ACT de Teste",
        "CN=AC Intermediaria",
        "CN=AC Raiz ICP-Brasil",
    ]
    assert with_root.validation_status == "valid"


@pytest.mark.anyio
async def test_unknown_root_is_invalid():
    root, root_key = _self_signed_ca()
    inter, inter_key = _issue_ca(root, root_key, "AC Intermediaria")
    tsa_cert, tsa_key = _issue_tsa(inter, inter_key)
    payload = b"raiz-desconhecida"
    token = _token(tsa_cert, tsa_key, payload, embed=[inter])

    other_root, _ = _self_signed_ca("AC Raiz Nao Confiavel")
    result = await TimestampValidator(
        trust_roots=[_asn1_cert(other_root)],
        intermediates=[_asn1_cert(inter)],
    ).validate_token(token, imprinted_data=payload)

    assert result.chain_trusted is False
    assert result.validation_status == "invalid"


@pytest.mark.anyio
async def test_missing_intermediate_breaks_the_chain():
    root, root_key = _self_signed_ca()
    inter, inter_key = _issue_ca(root, root_key, "AC Intermediaria")
    tsa_cert, tsa_key = _issue_tsa(inter, inter_key)
    payload = b"intermediaria-ausente"
    token = _token(tsa_cert, tsa_key, payload, embed=[])  # no intermediate

    result = await TimestampValidator(
        trust_roots=[_asn1_cert(root)]
    ).validate_token(token, imprinted_data=payload)

    assert result.chain_trusted is False
    assert result.validation_status == "invalid"


# ── genTime semantics ────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_certificate_expired_today_but_valid_at_gen_time_is_valid():
    gen_time = NOW - timedelta(days=400)
    tsa_cert, tsa_key = _issue_tsa(
        *_self_signed_ca()[0:2],
        not_before=gen_time - timedelta(days=1),
        not_after=gen_time + timedelta(days=30),
    )
    # The certificate is long expired relative to now.
    assert tsa_cert.not_valid_after_utc < NOW

    payload = b"assinado-no-passado"
    token = _token(tsa_cert, tsa_key, payload, fixed_dt=gen_time)

    result = await TimestampValidator(
        trust_roots=[_asn1_cert(tsa_cert)]
    ).validate_token(token, imprinted_data=payload)

    assert result.certificate_valid_at_gen_time is True
    assert result.validation_status == "valid"


# ── revocation ───────────────────────────────────────────────────────────────


def test_revocation_details_map_to_revoked():
    validator = TimestampValidator()
    status = SimpleNamespace(
        trusted=True,
        trust_problem_indic=None,
        revocation_details=SimpleNamespace(
            ca_revoked=False,
            revocation_date=NOW,
            revocation_reason=SimpleNamespace(name="key_compromise"),
        ),
    )
    revocation = validator._revocation_from_status(status)

    assert revocation["checked"] is True
    assert revocation["status"] == "revoked"
    assert revocation["reason"] == "key_compromise"


def test_revoked_token_finalizes_as_invalid():
    result = TimestampValidationResult(
        status="present",
        token_parseable=True,
        cms_signature_valid=True,
        cms_integrity=True,
        extended_key_usage_valid=True,
        certificate_valid_at_gen_time=True,
        chain_trusted=True,
        revocation={"status": "revoked"},
    )
    TimestampValidator._finalize(result)
    assert result.validation_status == "invalid"


def test_required_revocation_without_sources_is_indeterminate():
    validator = TimestampValidator(revocation_mode="require")
    status = SimpleNamespace(
        trusted=True, trust_problem_indic=None, revocation_details=None
    )
    revocation = validator._revocation_from_status(status)
    assert revocation["status"] == "unavailable"

    result = TimestampValidationResult(
        status="present",
        token_parseable=True,
        cms_signature_valid=True,
        cms_integrity=True,
        extended_key_usage_valid=True,
        certificate_valid_at_gen_time=True,
        chain_trusted=True,
        revocation=revocation,
    )
    TimestampValidator._finalize(result)
    assert result.validation_status == "indeterminate"


def test_soft_fail_without_crls_is_not_checked_but_allowed():
    validator = TimestampValidator(revocation_mode="soft-fail")
    status = SimpleNamespace(
        trusted=True, trust_problem_indic=None, revocation_details=None
    )
    assert validator._revocation_from_status(status)["status"] == "not_checked"


@pytest.mark.anyio
async def test_revoked_certificate_via_real_crl_is_invalid():
    from asn1crypto import crl as asn1_crl

    root, root_key = _self_signed_ca()
    tsa_cert, tsa_key = _issue_tsa(root, root_key)
    gen_time = NOW - timedelta(days=1)
    payload = b"carimbo-de-tsa-revogada"
    token = _token(tsa_cert, tsa_key, payload, fixed_dt=gen_time)

    revoked = (
        x509.RevokedCertificateBuilder()
        .serial_number(tsa_cert.serial_number)
        .revocation_date(gen_time - timedelta(hours=1))
        .add_extension(
            x509.CRLReason(x509.ReasonFlags.key_compromise), critical=False
        )
        .build()
    )
    crl = (
        x509.CertificateRevocationListBuilder()
        .issuer_name(root.subject)
        .last_update(gen_time - timedelta(hours=1))
        .next_update(gen_time + timedelta(days=2))
        .add_extension(x509.CRLNumber(1), critical=False)
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(
                root_key.public_key()
            ),
            critical=False,
        )
        .add_revoked_certificate(revoked)
        .sign(root_key, hashes.SHA256())
    )
    crls = [
        asn1_crl.CertificateList.load(
            crl.public_bytes(serialization.Encoding.DER)
        )
    ]

    result = await TimestampValidator(
        trust_roots=[_asn1_cert(root)], crls=crls
    ).validate_token(token, imprinted_data=payload)

    assert result.revocation["status"] == "revoked"
    assert result.validation_status == "invalid"


# ── trust store metadata ─────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_trust_store_is_versioned_and_reported(tmp_path):
    payload = b"carimbo-com-versao"
    token, tsa_cert = _self_signed_token(payload)

    roots_dir = tmp_path / "roots"
    roots_dir.mkdir()
    (roots_dir / "icp-brasil-root-v10.pem").write_bytes(
        tsa_cert.public_bytes(serialization.Encoding.PEM)
    )
    (roots_dir / "manifest.json").write_text(
        json.dumps({"name": "ICP-Brasil", "version": "2026-08-26"}),
        encoding="utf-8",
    )

    store = load_trust_store(str(roots_dir), None)
    assert store.name == "ICP-Brasil"
    assert store.version == "2026-08-26"
    assert store.root_count == 1
    assert len(store.bundle_sha256) == 64
    assert len(store.root_fingerprints) == 1

    result = await TimestampValidator(
        trust_roots=store.roots, trust_store=store
    ).validate_token(token, imprinted_data=payload)

    assert result.validation_status == "valid"
    assert result.trust_store["version"] == "2026-08-26"
    assert result.trust_store["bundle_sha256"] == store.bundle_sha256
    assert result.trust_store["root_count"] == 1


# ── record projection ────────────────────────────────────────────────────────


def test_apply_result_to_record_projects_structured_details():
    record = SimpleNamespace(
        token=None,
        status="absent",
        validation_status="pending_validation",
        validation_details=None,
        validated_at=None,
        gen_time=None,
        message_imprint=None,
        message_imprint_algorithm=None,
        policy_oid=None,
    )
    result = TimestampValidationResult(
        status="present",
        validation_status="valid",
        token_present=True,
        token_parseable=True,
        cms_signature_valid=True,
        message_imprint_valid=True,
        message_imprint_algorithm="sha256",
        message_imprint="ab" * 32,
        policy_oid=POLICY_OID,
        gen_time="2026-09-22T12:00:00+00:00",
    )

    apply_result_to_record(record, result)

    assert record.status == "present"
    assert record.validation_status == "valid"
    assert record.validation_details["cms_signature_valid"] is True
    assert record.policy_oid == POLICY_OID
    assert record.message_imprint_algorithm == "sha256"
    assert record.gen_time == datetime.fromisoformat("2026-09-22T12:00:00+00:00")
    assert record.validated_at is not None


# ── publication gate ─────────────────────────────────────────────────────────


def _signed_edition(records):
    from app.models.enums import EditionStatus

    signature = SimpleNamespace(timestamp_records=records)
    edition = SimpleNamespace(
        status=EditionStatus.SIGNED,
        signatures=[signature],
        signed_pdf_path="signed.pdf",
        signed_pdf_hash="abc",
        signature_validation_status="valid",
        items=[],
    )
    return edition


def test_publication_gate_requires_valid_timestamp_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "TSA_REQUIRED_FOR_PUBLICATION", True)

    pending = _signed_edition([SimpleNamespace(validation_status="present")])
    problems = assert_publishable(pending)
    assert any("TSA" in p for p in problems)

    valid = _signed_edition([SimpleNamespace(validation_status="valid")])
    assert assert_publishable(valid) == []

    missing = _signed_edition([])
    assert any("TSA" in p for p in assert_publishable(missing))


def test_publication_gate_ignores_tsa_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "TSA_REQUIRED_FOR_PUBLICATION", False)
    pending = _signed_edition([SimpleNamespace(validation_status="present")])
    assert assert_publishable(pending) == []


# ── check_tsa_trust command ──────────────────────────────────────────────────


@pytest.mark.anyio
async def test_check_tsa_trust_without_url_reports_no_tsa(monkeypatch, tmp_path):
    from app.commands.check_tsa_trust import check

    roots_dir = tmp_path / "roots"
    roots_dir.mkdir()
    _, tsa_cert = _self_signed_token(b"irrelevante")
    (roots_dir / "root.pem").write_bytes(
        tsa_cert.public_bytes(serialization.Encoding.PEM)
    )

    monkeypatch.setattr(settings, "TSA_URL", "")
    monkeypatch.setattr(settings, "TSA_TRUST_ROOTS_PATH", str(roots_dir))
    monkeypatch.setattr(settings, "TSA_INTERMEDIATES_PATH", "")
    monkeypatch.setattr(settings, "TSA_CRL_PATH", "")
    monkeypatch.setattr(settings, "TSA_POLICY_OID", POLICY_OID)
    monkeypatch.setattr(settings, "TSA_REQUIRED_FOR_PUBLICATION", False)

    report = await check(probe=False)
    assert report["result"] == "NO_TSA"
    assert report["ok"] is True
    assert report["trust_store"]["root_count"] == 1
    assert report["trust_store"]["version"]

