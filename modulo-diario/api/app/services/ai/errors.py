"""Typed errors for the centralized DeepSeek integration.

Business handlers translate these into stable Portuguese error codes; raw
internals/traces must never reach the client or logs verbatim.
"""

from __future__ import annotations


class DeepSeekError(Exception):
    """Base error carrying a stable, machine-readable code."""

    code = "ai_provider_error"

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code

    def as_dict(self) -> dict:
        return {"code": self.code, "message": str(self)}


class AiNotConfiguredError(DeepSeekError):
    """No usable API key is configured for the organization."""

    code = "api_not_configured"


class AiDisabledError(DeepSeekError):
    """AI features are disabled for the organization."""

    code = "ai_disabled"


class AiProviderError(DeepSeekError):
    """The provider returned a non-success response."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message, code)
        self.status = status


class AiAuthError(AiProviderError):
    """401/403 — invalid or insufficient key."""

    code = "authentication"


class AiRateLimitError(AiProviderError):
    """429 — rate limited or quota exceeded."""

    code = "rate_limited"


class AiProviderUnavailableError(AiProviderError):
    """5xx or connectivity — transient provider outage."""

    code = "provider_unavailable"


class AiInvalidRequestError(AiProviderError):
    """4xx other than auth/rate — malformed request or unknown model."""

    code = "invalid_request"


class AiTimeoutError(DeepSeekError):
    code = "timeout"


class AiInvalidResponseError(DeepSeekError):
    """Response could not be parsed/validated against the expected schema."""

    code = "invalid_response"


class AiUsageLimitExceededError(DeepSeekError):
    """Organization monthly token cap reached."""

    code = "usage_limit_exceeded"


class AiTruncatedResponseError(DeepSeekError):
    """The model hit the token ceiling before finishing the response.

    Comum em modelos de raciocínio: o orçamento é consumido em ``reasoning`` e
    a resposta é cortada. Diferente de uma resposta malformada — o usuário deve
    tentar de novo (ou com documento menor).
    """

    code = "truncated"


__all__ = [
    "DeepSeekError",
    "AiNotConfiguredError",
    "AiDisabledError",
    "AiProviderError",
    "AiAuthError",
    "AiRateLimitError",
    "AiProviderUnavailableError",
    "AiInvalidRequestError",
    "AiTimeoutError",
    "AiInvalidResponseError",
    "AiUsageLimitExceededError",
    "AiTruncatedResponseError",
]
