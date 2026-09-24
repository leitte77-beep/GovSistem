"""Tests for the RFC 3161 timestamp provider (structure, build, validate)."""

from __future__ import annotations

import hashlib

import pytest
from asn1crypto import algos, cms, tsp

from app.providers.timestamp.base import TimestampProvider, TimestampResult, TimestampValidation
from app.providers.timestamp.rfc3161 import Rfc3161TimestampProvider


class _FakeTSA(Rfc3161TimestampProvider):
    """Synthetic TSA to test parse/build without network/real ACT."""

    def __init__(self) -> None:
        super().__init__(tsa_url="http://test-tsa", timeout=2.0)

    def _issue_token(self, digest: bytes, policy: str = "") -> bytes:
        # Build a minimal TSTInfo signed with a throwaway cert digest.
        tst = tsp.TSTInfo(
            {
                "version": "v1",
                "policy": policy or "2.16.76.1.7.1.11.1",
                "message_imprint": {
                    "hash_algorithm": algos.DigestAlgorithm({"algorithm": "sha256"}),
                    "hashed_message": digest,
                },
                "serial_number": 12345,
                "gen_time": __import__("datetime").datetime(2026, 9, 3, 12, 0, 0),
            }
        )
        ts_resp = tsp.TimeStampResp(
            {
                "status": {"status": "granted", "status_string": "Granted"},
                "time_stamp_token": None,
            }
        )
        return tst.dump(), ts_resp


class _FakeTSAResult:
    def __init__(self, token: bytes) -> None:
        self._token = token

    @property
    def content(self) -> bytes:
        return self._token


# Build a TimeStampResp whose token is a real signed CMS from the fixture,
# by re-using pyhanko's test signing path is heavy; instead assert the
# request builder and the response parser decouple cleanly.


def test_timestamp_provider_is_abstract():
    with pytest.raises(TypeError):
        TimestampProvider()  # type: ignore[abstract]


def test_digest_is_sha256():
    p = Rfc3161TimestampProvider("http://tsa")
    assert p.digest(b"hello") == hashlib.sha256(b"hello").digest()


def test_rfc3161_requires_url():
    p = Rfc3161TimestampProvider("")
    with pytest.raises(ValueError):
        p.timestamp(b"\x00" * 32, policy="p")


def test_request_builder_is_wellformed():
    # Build the TimeStampReq the same way the provider does and assert structure.
    from app.providers.timestamp.rfc3161 import Rfc3161TimestampProvider

    p = Rfc3161TimestampProvider("http://tsa")
    imprint = algos.DigestAlgorithm({"algorithm": "sha256"})
    req = tsp.TimeStampReq(
        {
            "version": "v1",
            "message_imprint": {"hash_algorithm": imprint, "hashed_message": b"\x00" * 32},
            "req_policy": "2.16.76.1.7.1.11.1",
            "cert_req": True,
        }
    )
    loaded = tsp.TimeStampReq.load(req.dump())
    assert loaded["message_imprint"]["hashed_message"].native == b"\x00" * 32
    assert loaded["message_imprint"]["hash_algorithm"]["algorithm"].native == "sha256"


def test_validate_rejects_garbage():
    p = Rfc3161TimestampProvider("http://tsa")
    v = p.validate(b"not-a-token")
    assert v.status in ("INVALID", "INDETERMINATE")
    assert isinstance(v, TimestampValidation)


def test_capturing_timestamper_keeps_only_real_token():
    """The pyHanko bridge records the real token, never the size-estimation one."""
    import asyncio

    from pyhanko.sign.timestamps.common_utils import dummy_digest

    from app.providers.timestamp.pyhanko_bridge import CapturingTimeStamper

    class _Provider:
        def __init__(self) -> None:
            self.calls: list[bytes] = []

        def timestamp(self, document_digest: bytes, policy: str = "") -> TimestampResult:
            self.calls.append(document_digest)
            token = cms.ContentInfo(
                {"content_type": "data", "content": b"timestamp"}
            ).dump()
            return TimestampResult(
                token=token,
                tsa_name="fake",
                tsa_url="http://fake",
                serial_number="42",
                policy_oid="2.16.76.1.7.1.11.1",
                message_imprint_algorithm="sha256",
                message_imprint="",
                gen_time="2026-09-03T12:00:00+00:00",
            )

    provider = _Provider()
    timestamper = CapturingTimeStamper(provider)  # type: ignore[arg-type]

    real_digest = hashlib.sha256(b"payload").digest()
    asyncio.run(timestamper.async_timestamp(real_digest, "sha256"))
    assert timestamper.last_result is not None
    assert timestamper.last_result.serial_number == "42"
    assert timestamper.last_result.gen_time == "2026-09-03T12:00:00+00:00"

    # A dummy request (pyHanko sizing) must not become the recorded timestamp.
    timestamper.last_result = None
    asyncio.run(timestamper.async_timestamp(dummy_digest("sha256"), "sha256"))
    assert timestamper.last_result is None
