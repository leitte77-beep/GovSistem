"""Pydantic schemas for the per-organization AI configuration endpoints.

Key rule: the persisted API key is write-only. Response schemas only carry a
masked hint and booleans — never the plaintext key.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AiConfigUpdate(BaseModel):
    """Partial update of non-secret fields. ``api_key`` may be supplied to set
    a key in a single save, but blank/None always preserves the existing key.
    """

    enabled: bool | None = None
    api_key: str | None = Field(default=None, max_length=512)
    timeout_seconds: int | None = Field(default=None, ge=5, le=300)
    max_tokens: int | None = Field(default=None, ge=64, le=16384)
    max_concurrency: int | None = Field(default=None, ge=1, le=32)
    monthly_token_limit: int | None = Field(default=None, ge=0, le=2_000_000_000)


class AiKeyRequest(BaseModel):
    """Explicit "replace API key" action."""

    api_key: str = Field(min_length=8, max_length=512)


class AiTestRequest(BaseModel):
    """Optional ephemeral key to test before persisting. When absent the saved
    key is used. The value is never logged and never persisted implicitly."""

    api_key: str | None = Field(default=None, min_length=8, max_length=512)


class AiConfigOut(BaseModel):
    enabled: bool
    provider: str
    model: str
    endpoint: str
    configured: bool
    key_masked: str | None = None
    limits: dict
    usage: dict
    last_test: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AiTestResult(BaseModel):
    ok: bool
    status: str
    message: str | None = None
    latency_ms: int | None = None
    usage: dict = {}
    note: str | None = None
