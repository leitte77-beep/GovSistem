"""pyHanko <-> RFC 3161 bridge.

pyHanko's ``PdfSigner`` expects a ``TimeStamper`` object. Our
``Rfc3161TimestampProvider`` owns the HTTP transport and the token metadata
extraction. This adapter reuses that provider inside pyHanko's signing flow and
captures the exact token/gen_time actually embedded in the CMS, so the caller
can persist an auditable RFC 3161 record instead of guessing.
"""

from __future__ import annotations

import asyncio

from asn1crypto import cms
from pyhanko.sign.timestamps import TimeStamper
from pyhanko.sign.timestamps.common_utils import dummy_digest

from app.providers.timestamp.base import TimestampResult
from app.providers.timestamp.rfc3161 import Rfc3161TimestampProvider


class CapturingTimeStamper(TimeStamper):
    """Feeds pyHanko a TSA token and keeps the real one for auditing.

    pyHanko requests one dummy token first (to size the CMS placeholder) before
    the real one. Dummy requests are detected by their well-known empty digest
    and never recorded as the signature's timestamp.
    """

    def __init__(self, provider: Rfc3161TimestampProvider, policy: str = "") -> None:
        super().__init__()
        self._provider = provider
        self._policy = policy
        self.last_result: TimestampResult | None = None

    async def async_timestamp(self, message_digest, md_algorithm) -> cms.ContentInfo:
        result = await asyncio.to_thread(
            self._provider.timestamp, message_digest, self._policy
        )
        if message_digest != dummy_digest(md_algorithm):
            self.last_result = result
        return cms.ContentInfo.load(result.token)
