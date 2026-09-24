"""Timestamp provider abstractions (TSA / RFC 3161).

The application must not couple to a specific ACT. ``TimestampProvider``
exposes ``timestamp(document_digest, policy)`` and ``validate(token)`` so the
rest of the system only handles the abstract concept of time-stamping.

The concrete ``Rfc3161TimestampProvider`` talks to a TSA/ACT over HTTP(S)
using RFC 3161, records the returned token and its metadata, and provides a
validation path using the reply's certificate (or an optional trust chain).
"""

from __future__ import annotations

import abc
import hashlib
from dataclasses import dataclass, field


@dataclass
class TimestampResult:
    """Result of a successful RFC 3161 time-stamping request."""

    token: bytes
    tsa_name: str
    tsa_url: str
    serial_number: str
    policy_oid: str
    message_imprint_algorithm: str
    message_imprint: str
    gen_time: str
    status: str = "VALID"
    validation_status: str = "PENDING_VALIDATION"


@dataclass
class TimestampValidation:
    """Structured validation of a timestamp token."""

    status: str
    valid: bool = False
    policy: str = ""
    gen_time: str = ""
    errors: list[str] = field(default_factory=list)


class TimestampProvider(abc.ABC):
    """Abstract time-stamping provider."""

    @abc.abstractmethod
    def timestamp(self, document_digest: bytes, policy: str = "") -> TimestampResult:
        """Request a timestamp token for ``document_digest`` using ``policy``."""

    @abc.abstractmethod
    def validate(self, token: bytes) -> TimestampValidation:
        """Validate a timestamp token and return a structured report."""

    @abc.abstractmethod
    def digest(self, data: bytes) -> bytes:
        """Return the message imprint (hash) used for the request."""


def sha256_digest(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()
