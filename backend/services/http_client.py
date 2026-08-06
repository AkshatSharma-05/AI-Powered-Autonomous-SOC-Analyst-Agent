"""
backend/services/http_client.py
─────────────────────────────────────────────────────────────────────────────
Resilient async HTTP client — Spec R10.

Wraps httpx.AsyncClient with:
  • Configurable exponential backoff (1 s → 60 s cap, 25 % jitter)
  • Up to 5 retry attempts (configurable via settings)
  • Structured logging on every retry attempt
  • Single shared client instance created during FastAPI lifespan

All external API calls in A1 / A3 use `get_http_client()` so rate-limit and
connection-pool settings are centralised here.

Usage:
    from backend.services.http_client import get_http_client

    client = get_http_client()
    resp = await client.get_with_retry("https://api.example.com/data")
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

import httpx
import structlog

from backend.config import get_settings

log = structlog.get_logger(__name__)

# ── Module-level singleton ────────────────────────────────────────────────────
_http_client: "ResilientHTTPClient | None" = None


class ResilientHTTPClient:
    """
    Thin wrapper around httpx.AsyncClient that adds exponential-backoff retries.

    Retry policy (from config):
        max_attempts : 5 (default)
        base_delay   : 1.0 s
        max_delay    : 60.0 s
        jitter       : ±25 % of computed delay

    HTTP status codes that trigger a retry:
        429 (rate-limited), 500, 502, 503, 504

    Status codes that are treated as permanent failures (not retried):
        400, 401, 403, 404, 422
    """

    RETRY_STATUS_CODES = {429, 500, 502, 503, 504}

    def __init__(self) -> None:
        settings = get_settings()
        self._max_attempts = settings.max_retry_attempts
        self._base_delay = settings.retry_base_delay_seconds
        self._max_delay = settings.retry_max_delay_seconds
        self._jitter_factor = settings.retry_jitter_factor
        self._timeout = settings.http_timeout_seconds

        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self._timeout),
            follow_redirects=True,
            headers={"User-Agent": "SOC-Agent/1.0 (security research tool)"},
        )

    async def get_with_retry(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """
        Perform a GET request with automatic exponential-backoff retries.

        Raises:
            httpx.HTTPStatusError  — on permanent failure after all attempts
            httpx.RequestError     — on network-level failure after all attempts
        """
        last_exc: Exception | None = None

        for attempt in range(1, self._max_attempts + 1):
            try:
                resp = await self._client.get(url, headers=headers, params=params)

                if resp.status_code not in self.RETRY_STATUS_CODES:
                    # 2xx, 3xx, or a permanent 4xx — return immediately
                    return resp

                # Transient server-side error → retry
                log.warning(
                    "http_client.retryable_status",
                    url=url,
                    status_code=resp.status_code,
                    attempt=attempt,
                    max_attempts=self._max_attempts,
                )
                last_exc = httpx.HTTPStatusError(
                    f"HTTP {resp.status_code}", request=resp.request, response=resp
                )

            except httpx.RequestError as exc:
                log.warning(
                    "http_client.request_error",
                    url=url,
                    error=str(exc),
                    attempt=attempt,
                    max_attempts=self._max_attempts,
                )
                last_exc = exc

            if attempt < self._max_attempts:
                delay = self._compute_delay(attempt)
                log.info(
                    "http_client.backing_off",
                    url=url,
                    delay_seconds=round(delay, 2),
                    next_attempt=attempt + 1,
                )
                await asyncio.sleep(delay)

        # All attempts exhausted
        log.error(
            "http_client.all_attempts_exhausted",
            url=url,
            max_attempts=self._max_attempts,
        )
        raise last_exc  # type: ignore[misc]

    async def post_with_retry(
        self,
        url: str,
        *,
        json: Any = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """
        Perform a POST request with automatic exponential-backoff retries.
        Same retry policy as get_with_retry.
        """
        last_exc: Exception | None = None

        for attempt in range(1, self._max_attempts + 1):
            try:
                resp = await self._client.post(url, json=json, headers=headers)

                if resp.status_code not in self.RETRY_STATUS_CODES:
                    return resp

                log.warning(
                    "http_client.retryable_status",
                    url=url,
                    status_code=resp.status_code,
                    attempt=attempt,
                    max_attempts=self._max_attempts,
                )
                last_exc = httpx.HTTPStatusError(
                    f"HTTP {resp.status_code}", request=resp.request, response=resp
                )

            except httpx.RequestError as exc:
                log.warning(
                    "http_client.request_error",
                    url=url,
                    error=str(exc),
                    attempt=attempt,
                    max_attempts=self._max_attempts,
                )
                last_exc = exc

            if attempt < self._max_attempts:
                delay = self._compute_delay(attempt)
                await asyncio.sleep(delay)

        raise last_exc  # type: ignore[misc]

    def _compute_delay(self, attempt: int) -> float:
        """
        Compute the sleep duration before the next retry attempt.

        Formula: min(base × 2^(attempt-1), max_delay) × (1 ± jitter)
        """
        raw = self._base_delay * (2 ** (attempt - 1))
        capped = min(raw, self._max_delay)
        jitter = capped * self._jitter_factor * (random.random() * 2 - 1)
        return max(0.0, capped + jitter)

    async def aclose(self) -> None:
        """Close the underlying httpx client — call during application shutdown."""
        await self._client.aclose()


# ── Singleton accessors ───────────────────────────────────────────────────────

def init_http_client() -> None:
    """Create the shared HTTP client singleton. Call once during lifespan startup."""
    global _http_client
    if _http_client is None:
        _http_client = ResilientHTTPClient()
        log.info("http_client.initialised")


def get_http_client() -> ResilientHTTPClient:
    """
    Return the shared HTTP client.

    Raises:
        RuntimeError — if called before init_http_client()
    """
    if _http_client is None:
        raise RuntimeError(
            "HTTP client not initialised — call init_http_client() during startup."
        )
    return _http_client


async def close_http_client() -> None:
    """Dispose the shared HTTP client. Call during lifespan shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
        log.info("http_client.closed")
