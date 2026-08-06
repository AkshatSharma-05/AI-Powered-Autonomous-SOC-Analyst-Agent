"""
backend/services/kev_client.py
─────────────────────────────────────────────────────────────────────────────
CISA Known Exploited Vulnerabilities (KEV) checker — Spec R22.

The KEV catalogue is a JSON feed (~1 MB) published at:
  https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

Strategy:
  - Download on first call, cache the set of CVE IDs in memory
  - Refresh every 1 hour (the feed updates once per day but we stay fresh)
  - is_kev_listed(cve_id) runs in O(1) — pure set membership check

If the download fails, the previous cache is retained and the error is logged.
A KEV check failure is non-fatal — the exploit status defaults to lower tier.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog

from backend.config import get_settings
from backend.services.http_client import get_http_client

log = structlog.get_logger(__name__)

# In-memory cache
_kev_ids: set[str] = set()
_last_refresh: Optional[datetime] = None
_refresh_interval = timedelta(hours=1)
_lock = asyncio.Lock()


async def refresh_if_stale() -> None:
    """Download the KEV feed if never loaded or older than 1 hour."""
    async with _lock:
        global _kev_ids, _last_refresh

        now = datetime.now(timezone.utc)
        if _last_refresh and (now - _last_refresh) < _refresh_interval:
            return  # Still fresh

        await _do_refresh()


async def _do_refresh() -> None:
    """Actually download and parse the KEV feed (must hold _lock)."""
    global _kev_ids, _last_refresh

    settings = get_settings()
    client = get_http_client()

    try:
        log.info("kev.refreshing", url=settings.cisa_kev_url)
        resp = await client.get_with_retry(settings.cisa_kev_url)
        resp.raise_for_status()
        data = resp.json()

        new_ids: set[str] = set()
        for vuln in data.get("vulnerabilities", []):
            cve_id = vuln.get("cveID", "")
            if cve_id.startswith("CVE-"):
                new_ids.add(cve_id)

        _kev_ids = new_ids
        _last_refresh = datetime.now(timezone.utc)
        log.info("kev.refreshed", total_entries=len(_kev_ids))

    except Exception as exc:
        log.error(
            "kev.refresh_failed",
            error=str(exc),
            cached_entries=len(_kev_ids),
            fallback="using cached data",
        )


async def is_kev_listed(cve_id: str) -> bool:
    """
    Return True if the CVE ID is listed in the CISA KEV catalogue.

    Auto-refreshes the cache if stale.
    """
    await refresh_if_stale()
    result = cve_id in _kev_ids
    log.debug("kev.check", cve_id=cve_id, result=result)
    return result


async def get_kev_entry(cve_id: str) -> Optional[dict]:
    """
    Return the full KEV entry for a CVE (for informational display).
    Returns None if not listed.
    """
    await refresh_if_stale()
    if cve_id not in _kev_ids:
        return None
    return {"cve_id": cve_id, "kev_listed": True}
