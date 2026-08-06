"""
backend/services/redis_client.py
─────────────────────────────────────────────────────────────────────────────
Async Redis client — Spec R12 (queue push/pop) + poll-timestamp tracking.

Provides three categories of operations:

  1. CVE pipeline queue (Redis LIST)
       push_cve(cve_id)   → LPUSH — A1 enqueues after upsert
       pop_cve()          → BRPOP (non-blocking, timeout=0.1 s) — pipeline worker

  2. Last-poll timestamps (Redis STRING, ISO-8601)
       set_last_poll(source, ts)
       get_last_poll(source) → datetime | None

  3. Health
       ping() → bool

All keys are prefixed by settings so they never clash across environments.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis
import structlog

from backend.config import get_settings

log = structlog.get_logger(__name__)

# ── Module-level singleton ────────────────────────────────────────────────────
_redis: "aioredis.Redis | None" = None


# ── Public helpers ────────────────────────────────────────────────────────────

async def init_redis() -> None:
    """
    Create the async Redis connection pool.
    Call once during FastAPI lifespan startup.
    """
    global _redis
    if _redis is not None:
        return  # idempotent

    settings = get_settings()
    _redis = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=10,
    )

    # Validate connectivity
    await _redis.ping()
    log.info("redis_client.connected", url=settings.redis_url.split("@")[-1])


async def close_redis() -> None:
    """Close the Redis connection pool. Call during lifespan shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        log.info("redis_client.closed")


def get_redis() -> "aioredis.Redis":
    """
    Return the shared Redis connection.

    Raises:
        RuntimeError — if called before init_redis()
    """
    if _redis is None:
        raise RuntimeError(
            "Redis not initialised — call init_redis() during application startup."
        )
    return _redis


# ── CVE Queue operations ──────────────────────────────────────────────────────

async def push_cve(cve_id: str) -> None:
    """
    Enqueue a CVE ID for A2/A3 processing.

    A1 calls this after successfully upserting the CVE into PostgreSQL.
    Uses LPUSH so the queue is FIFO when combined with BRPOP from the right.
    """
    settings = get_settings()
    r = get_redis()
    await r.lpush(settings.redis_cve_queue_name, cve_id)
    log.debug("redis.cve.pushed", cve_id=cve_id, queue=settings.redis_cve_queue_name)


async def pop_cve(timeout: float = 0.1) -> Optional[str]:
    """
    Dequeue the next CVE ID for processing (non-blocking with short timeout).

    Returns None immediately if the queue is empty.
    Used by the pipeline worker loop.
    """
    settings = get_settings()
    r = get_redis()
    result = await r.brpop(settings.redis_cve_queue_name, timeout=timeout)
    if result is None:
        return None
    _, cve_id = result
    log.debug("redis.cve.popped", cve_id=cve_id)
    return cve_id


async def get_queue_depth() -> int:
    """Return the current number of CVEs waiting in the pipeline queue."""
    settings = get_settings()
    r = get_redis()
    return await r.llen(settings.redis_cve_queue_name)


# ── Poll-timestamp operations ─────────────────────────────────────────────────

async def set_last_poll(source: str, ts: datetime) -> None:
    """
    Store the last successful poll timestamp for a given source.

    source — one of: "nvd" | "osv" | "github_advisory"
    ts     — UTC datetime of the poll completion
    """
    settings = get_settings()
    key = _poll_key(settings, source)
    r = get_redis()
    iso = ts.astimezone(timezone.utc).isoformat()
    await r.set(key, iso)
    log.debug("redis.poll.timestamp_set", source=source, ts=iso)


async def get_last_poll(source: str) -> Optional[datetime]:
    """
    Retrieve the last successful poll timestamp for a given source.

    Returns None if no poll has been recorded yet (first run).
    """
    settings = get_settings()
    key = _poll_key(settings, source)
    r = get_redis()
    raw = await r.get(key)
    if raw is None:
        return None
    return datetime.fromisoformat(raw)


async def ping() -> bool:
    """Return True if Redis is reachable, False otherwise."""
    try:
        r = get_redis()
        await r.ping()
        return True
    except Exception:
        return False


# ── Private helpers ───────────────────────────────────────────────────────────

def _poll_key(settings, source: str) -> str:
    """Map source name to the configured Redis key for that source's poll timestamp."""
    mapping = {
        "nvd": settings.redis_last_poll_key_nvd,
        "osv": settings.redis_last_poll_key_osv,
        "github_advisory": settings.redis_last_poll_key_github,
    }
    if source not in mapping:
        raise ValueError(
            f"Unknown poll source '{source}'. Expected one of: {list(mapping.keys())}"
        )
    return mapping[source]
