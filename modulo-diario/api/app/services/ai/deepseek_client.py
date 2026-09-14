"""Centralized DeepSeek client used by every Diário Oficial AI feature.

Only DeepSeek V4 Flash (``deepseek-v4-flash``) is used. All calls go through
this one service so there is a single place for retries, timeouts, concurrency
limits, structured-output validation and sanitized error mapping. The API key
is provided at call time (from the per-organization config store) and is never
logged, never stored in memory beyond the request, and never sent to the
browser. No silent fallback to another provider/model is ever performed.

Official contract (checked during implementation): OpenAI-compatible
``POST {base}/chat/completions`` with ``Authorization: Bearer <key>``. Response
``json_object`` mode is available (requires the word ``json`` somewhere in the
messages). Only server-controlled endpoint/model values are honored.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from typing import Any, Sequence

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.services.ai.errors import (
    AiAuthError,
    AiInvalidRequestError,
    AiInvalidResponseError,
    AiProviderUnavailableError,
    AiRateLimitError,
    AiTimeoutError,
    AiTruncatedResponseError,
    DeepSeekError,
)

logger = logging.getLogger(__name__)

# Module-level concurrency gate so in-process AI traffic cannot burst past the
# configured limit regardless of which feature triggers it.
_CONCURRENCY_SEMAPHORE = asyncio.Semaphore(settings.AI_MAX_CONCURRENCY)

_TRANSIENT_HTTP = {408, 429, 500, 502, 503, 504}

_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\s*(.*?)\s*```$", re.DOTALL)


def _parse_json_object(content: str) -> dict:
    """Extrai o objeto JSON de uma resposta de IA.

    Aceita respostas embrulhadas em cercas de markdown (```json ... ```) ou com
    texto antes/depois do objeto — casos comuns que NÃO devem virar erro
    genérico. Nunca executa código; apenas recorta e valida JSON.
    """
    text = (content or "").strip()
    if not text:
        raise AiInvalidResponseError("DeepSeek returned an empty content")
    fence = _FENCE_RE.match(text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            raise AiInvalidResponseError(
                "DeepSeek did not return valid JSON that could be parsed"
            ) from None
        try:
            data = json.loads(text[start : end + 1])
        except (json.JSONDecodeError, TypeError) as exc:
            raise AiInvalidResponseError(
                "DeepSeek did not return valid JSON that could be parsed"
            ) from exc
    if not isinstance(data, dict):
        raise AiInvalidResponseError("DeepSeek JSON payload is not an object")
    return data


def _jitter_backoff(base: float, attempt: int, cap: float = 6.0) -> float:
    return min(cap, base * (2**attempt)) * (0.5 + random.random() / 2)


def _map_http_error(status: int, message: str) -> DeepSeekError:
    if status in (401, 403):
        return AiAuthError(message, status=status)
    if status == 429:
        return AiRateLimitError(message, status=status)
    if status >= 500:
        return AiProviderUnavailableError(message, status=status)
    # 400/404/422 etc.
    return AiInvalidRequestError(message, status=status)


class DeepSeekResult:
    """Normalized outcome of a DeepSeek chat call."""

    __slots__ = ("content", "usage", "latency_ms", "model", "finish_reason")

    def __init__(
        self,
        content: str,
        usage: dict | None,
        latency_ms: int,
        model: str,
        finish_reason: str | None = None,
    ):
        self.content = content
        self.usage = usage or {}
        self.latency_ms = latency_ms
        self.model = model
        self.finish_reason = finish_reason


class DeepSeekClient:
    """Thin, validated client for ``deepseek-v4-flash``.

    ``api_key``/``base_url``/``model`` are injected by the caller from trusted
    (server / config-store) sources. A ``transport`` may be supplied for tests
    (``httpx.MockTransport``) so no real key or network is needed.
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: int | None = None,
        max_retries: int | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("DeepSeekClient requires an api_key")
        self._api_key = api_key
        self._base_url = (base_url or settings.DEEPSEEK_API_BASE).rstrip("/")
        self._model = model or settings.DEEPSEEK_MODEL
        self._timeout = timeout_seconds or settings.AI_DEFAULT_TIMEOUT_SECONDS
        self._max_retries = max_retries if max_retries is not None else settings.AI_MAX_RETRIES
        self._transport = transport

    def _endpoint(self) -> str:
        return f"{self._base_url}/chat/completions"

    async def _chat(
        self,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int | None = None,
        json_mode: bool = False,
        disable_thinking: bool = False,
    ) -> DeepSeekResult:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": list(messages),
            "stream": False,
            "max_tokens": max_tokens or settings.AI_MAX_TOKENS,
        }
        if json_mode:
            # DeepSeek requires the word "json" to appear in the messages for
            # json_object mode; callers must embed it in the system prompt.
            payload["response_format"] = {"type": "json_object"}
        if disable_thinking:
            # A extração estrutural é uma tarefa determinística. Desabilitar o
            # raciocínio estendido deixa orçamento suficiente para o JSON e
            # evita que modelos V4 consumam o limite antes de responder.
            payload["thinking"] = {"type": "disabled"}

        # Transient failures only: 408/429/5xx and transport/timeout errors are
        # retried with capped exponential backoff. Auth/invalid-request are NOT.
        last_error: DeepSeekError | None = None
        attempt = 0
        while True:
            start = time.perf_counter()
            async with _CONCURRENCY_SEMAPHORE:
                try:
                    async with httpx.AsyncClient(
                        timeout=self._timeout, transport=self._transport
                    ) as client:
                        resp = await client.post(
                            self._endpoint(),
                            headers={
                                "Authorization": f"Bearer {self._api_key}",
                                "Content-Type": "application/json",
                            },
                            json=payload,
                        )
                except httpx.TimeoutException as exc:  # noqa: PERF203
                    if attempt < self._max_retries:
                        attempt += 1
                        last_error = AiTimeoutError("DeepSeek request timed out")
                        await asyncio.sleep(_jitter_backoff(1.0, attempt - 1))
                        continue
                    raise AiTimeoutError("DeepSeek request timed out") from exc
                except httpx.HTTPError as exc:  # network/connect, DNS, etc.
                    if attempt < self._max_retries:
                        attempt += 1
                        last_error = AiProviderUnavailableError(
                            "DeepSeek provider unavailable (connectivity)"
                        )
                        await asyncio.sleep(_jitter_backoff(1.0, attempt - 1))
                        continue
                    raise AiProviderUnavailableError(
                        "DeepSeek provider unavailable (connectivity)"
                    ) from exc

                latency = int((time.perf_counter() - start) * 1000)

                if resp.status_code >= 400:
                    detail = _sanitize_error_detail(resp.text)
                    if resp.status_code in _TRANSIENT_HTTP and attempt < self._max_retries:
                        attempt += 1
                        last_error = _map_http_error(resp.status_code, detail)
                        await asyncio.sleep(_jitter_backoff(1.0, attempt - 1))
                        continue
                    raise _map_http_error(resp.status_code, detail)

                try:
                    body = resp.json()
                except ValueError as exc:  # noqa: PERF203
                    raise AiInvalidResponseError("DeepSeek returned a non-JSON response") from exc

                if not body:
                    raise AiInvalidResponseError("DeepSeek returned an empty body")

                model_used = body.get("model") or self._model
                try:
                    choice = body["choices"][0]
                    message = choice["message"]
                except (KeyError, IndexError, TypeError) as exc:  # noqa: PERF203
                    raise AiInvalidResponseError(
                        "DeepSeek response is missing a content choice"
                    ) from exc
                finish_reason = choice.get("finish_reason")
                content = message.get("content")
                if content is None:
                    # Reasoning models may return only reasoning_content when the
                    # budget is exhausted; surface as empty content + reason.
                    content = ""
                if not isinstance(content, str):
                    raise AiInvalidResponseError("DeepSeek content is not a string")
                usage = body.get("usage")
                return DeepSeekResult(
                    content=content,
                    usage=_normalize_usage(usage),
                    latency_ms=latency,
                    model=model_used,
                    finish_reason=finish_reason,
                )

        raise last_error  # pragma: no cover

    async def complete_json(
        self,
        messages: Sequence[dict[str, str]],
        *,
        schema: type[BaseModel] | None = None,
        max_tokens: int | None = None,
        disable_thinking: bool = False,
    ) -> tuple[BaseModel | dict, dict]:
        """Run a chat and return validated JSON.

        Returns ``(parsed, meta)`` where ``meta`` carries ``usage``/``model``.
        ``schema`` is a Pydantic model used to reject unexpected keys, wrong
        field types and out-of-scope content before anything is consumed.
        """
        result = await self._chat(
            messages,
            max_tokens=max_tokens,
            json_mode=True,
            disable_thinking=disable_thinking,
        )
        try:
            data = _parse_json_object(result.content)
        except AiInvalidResponseError as exc:
            # Distingue "cortado por limite de tokens" de "resposta malformada":
            # modelos de raciocínio podem gastar todo o orçamento em reasoning.
            if result.finish_reason == "length":
                raise AiTruncatedResponseError(
                    "A IA atingiu o limite de tokens antes de concluir a resposta."
                ) from exc
            raise

        meta = {"usage": result.usage, "model": result.model, "latency_ms": result.latency_ms}
        if schema is not None:
            try:
                validated = schema.model_validate(data)
            except ValidationError as exc:  # noqa: PERF203
                raise AiInvalidResponseError("DeepSeek response failed schema validation") from exc
            return validated, meta
        return data, meta

    async def minimal_ping(self) -> dict:
        """A tiny call used only to test connectivity/auth. Consumes tokens."""
        result = await self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a connectivity probe. Reply only with the JSON "
                        'object: {"ok": true}. Do not add anything else.'
                    ),
                },
                {"role": "user", "content": "ping"},
            ],
            max_tokens=64,
        )
        # Validate the probe responded with parseable, non-empty JSON. A provider
        # that answers 200 with empty/non-JSON content must map to a typed error
        # (never an unhandled JSONDecodeError that surfaces as HTTP 500).
        content = result.content.strip()
        if not content:
            raise AiInvalidResponseError("DeepSeek returned an empty connectivity probe response")
        try:
            json.loads(content)
        except (json.JSONDecodeError, TypeError) as exc:
            raise AiInvalidResponseError(
                "DeepSeek did not return valid JSON for the connectivity probe"
            ) from exc
        return {
            "ok": True,
            "latency_ms": result.latency_ms,
            "usage": result.usage,
            "model": result.model,
        }


def _normalize_usage(usage: Any) -> dict:
    if not isinstance(usage, dict):
        return {}
    return {k: v for k, v in usage.items() if isinstance(v, int)}


def _sanitize_error_detail(raw: str) -> str:
    """Return a short, safe summary of an error body (never the key)."""
    if not raw:
        return "empty error response from provider"
    try:
        data = json.loads(raw)
        msg = data.get("error", {}).get("message") or data.get("error") or raw
        return str(msg)[:300]
    except (json.JSONDecodeError, AttributeError):
        return raw[:300]


__all__ = ["DeepSeekClient", "DeepSeekResult"]
