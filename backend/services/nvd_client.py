"""
backend/services/nvd_client.py
─────────────────────────────────────────────────────────────────────────────
NVD API v2 CVE poller — Spec R8.

Polls https://services.nvd.nist.gov/rest/json/cves/2.0 for CVEs modified
since the last successful poll (incremental, cursor-based using Redis
timestamp).

Key behaviours:
  • Uses `lastModStartDate` / `lastModEndDate` query params for incremental
    fetching — only new/updated CVEs since last run.
  • Paginates automatically through all result pages.
  • Injects NVD API key header (apiKey) when NVD_API_KEY is set — raises
    rate limit from 5 to 50 req/30 s.
  • Returns a list of RawCVE objects — same schema as OSV and GitHub clients.
  • On first run (no Redis timestamp), fetches CVEs from the last 24 hours.

Also exposes:
  fetch_by_id(cve_id) — single-CVE direct lookup using the `cveId` query
    param. Used by POST /pipeline/inject/{cve_id}. Does NOT use the
    time-window params, does NOT sleep between pages, does NOT update the
    Redis poll timestamp.

NVD CPE data lives inside:
  cve.configurations[].nodes[].cpeMatch[].criteria
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import structlog

from backend.config import get_settings
from backend.schemas import RawCVE
from backend.services.http_client import get_http_client
from backend.services.redis_client import get_last_poll, set_last_poll

log = structlog.get_logger(__name__)

# NVD API enforces a mandatory 6-second sleep between paginated requests
# when using an API key (to stay within the rolling 30-second window)
_NVD_PAGE_DELAY = 6.0  # seconds


async def poll_recent() -> list[RawCVE]:
    """
    Fetch all CVEs modified since the last poll from NVD API v2.

    Flow:
        1. Read last poll timestamp from Redis (default: now - 24h)
        2. Paginate through NVD results in 100-CVE pages
        3. Normalise each CVE into a RawCVE
        4. Update the Redis timestamp on success
        5. Return the full list of RawCVE objects

    Returns an empty list if NVD is unreachable (error is logged, not raised).
    """
    settings = get_settings()
    client = get_http_client()

    last_poll = await get_last_poll("nvd")
    now_utc = datetime.now(timezone.utc)

    if last_poll is None:
        # First ever run — start from 24 hours ago to seed some data
        start_dt = now_utc - timedelta(hours=24)
        log.info("nvd.first_poll", window_hours=24)
    else:
        start_dt = last_poll

    start_str = _fmt_nvd_dt(start_dt)
    end_str = _fmt_nvd_dt(now_utc)

    log.info("nvd.polling", start=start_str, end=end_str)

    headers: dict[str, str] = {}
    if settings.nvd_api_key:
        headers["apiKey"] = settings.nvd_api_key

    all_cves: list[RawCVE] = []
    start_index = 0

    try:
        while True:
            params: dict[str, Any] = {
                "lastModStartDate": start_str,
                "lastModEndDate": end_str,
                "resultsPerPage": settings.nvd_results_per_page,
                "startIndex": start_index,
            }

            resp = await client.get_with_retry(
                settings.nvd_api_base_url,
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

            total_results = data.get("totalResults", 0)
            vulnerabilities = data.get("vulnerabilities", [])

            for item in vulnerabilities:
                raw_cve = _parse_nvd_item(item)
                if raw_cve is not None:
                    all_cves.append(raw_cve)

            fetched_so_far = start_index + len(vulnerabilities)
            log.info(
                "nvd.page_fetched",
                start_index=start_index,
                page_count=len(vulnerabilities),
                total=total_results,
                fetched_so_far=fetched_so_far,
            )

            if fetched_so_far >= total_results:
                break  # All pages consumed

            start_index = fetched_so_far

            # NVD enforces a mandatory sleep between pages
            await asyncio.sleep(_NVD_PAGE_DELAY)

    except Exception as exc:
        log.error("nvd.poll_failed", error=str(exc))
        return []

    # Update timestamp only after a successful poll
    await set_last_poll("nvd", now_utc)
    log.info("nvd.poll_complete", cve_count=len(all_cves))
    return all_cves


async def fetch_by_id(cve_id: str) -> Optional[RawCVE]:
    """
    Fetch a single CVE by ID directly from the NVD API v2.

    Uses the `cveId` query param (not a time-window scan) — returns exactly
    one CVE or raises if not found. This is a cheap single-item call; no
    inter-request delay is applied and the poll timestamp is not updated.

    Raises:
        ValueError  — CVE ID not found in NVD (totalResults == 0)
        httpx.HTTPStatusError — NVD returned a non-200 status
        Exception   — network / parse failure
    """
    settings = get_settings()
    client = get_http_client()

    headers: dict[str, str] = {}
    if settings.nvd_api_key:
        headers["apiKey"] = settings.nvd_api_key

    log.info("nvd.fetch_by_id", cve_id=cve_id)

    resp = await client.get_with_retry(
        settings.nvd_api_base_url,
        headers=headers,
        params={"cveId": cve_id},
    )
    resp.raise_for_status()
    data = resp.json()

    total = data.get("totalResults", 0)
    vulnerabilities = data.get("vulnerabilities", [])

    if total == 0 or not vulnerabilities:
        raise ValueError(f"CVE '{cve_id}' not found in NVD")

    raw_cve = _parse_nvd_item(vulnerabilities[0])
    if raw_cve is None:
        raise ValueError(f"Failed to parse NVD response for '{cve_id}'")

    log.info(
        "nvd.fetch_by_id.success",
        cve_id=raw_cve.cve_id,
        cvss=raw_cve.cvss_score,
        cpe_count=len(raw_cve.cpe_uris),
    )
    return raw_cve


# ── Private helpers ───────────────────────────────────────────────────────────

def _fmt_nvd_dt(dt: datetime) -> str:
    """Format datetime as NVD API expects: 2021-01-01T00:00:00.000"""
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000")


def _parse_nvd_item(item: dict[str, Any]) -> Optional[RawCVE]:
    """
    Parse a single item from the NVD API v2 response into a RawCVE.

    NVD v2 item structure:
        {
            "cve": {
                "id": "CVE-2021-44228",
                "descriptions": [{"lang": "en", "value": "..."}],
                "metrics": {"cvssMetricV31": [{"cvssData": {"baseScore": 10.0}}]},
                "configurations": [{"nodes": [{"cpeMatch": [{"criteria": "cpe:..."}]}]}],
                "published": "2021-12-10T10:15:00.000",
            }
        }
    """
    try:
        cve_data = item.get("cve", {})
        cve_id = cve_data.get("id", "")
        if not cve_id.startswith("CVE-"):
            return None

        # Description (English only)
        description: Optional[str] = None
        for desc in cve_data.get("descriptions", []):
            if desc.get("lang") == "en":
                description = desc.get("value")
                break

        # CVSS v3.1 base score (prefer v31, fall back to v30)
        cvss_score: Optional[float] = None
        metrics = cve_data.get("metrics", {})
        for metric_key in ("cvssMetricV31", "cvssMetricV30"):
            metric_list = metrics.get(metric_key, [])
            if metric_list:
                cvss_score = metric_list[0].get("cvssData", {}).get("baseScore")
                break

        # Published date
        published_raw = cve_data.get("published")
        published_date: Optional[datetime] = None
        if published_raw:
            try:
                published_date = datetime.fromisoformat(published_raw.replace("Z", "+00:00"))
            except ValueError:
                pass

        # CPE URIs from configurations
        cpe_uris: list[str] = []
        for config in cve_data.get("configurations", []):
            for node in config.get("nodes", []):
                for cpe_match in node.get("cpeMatch", []):
                    criteria = cpe_match.get("criteria", "")
                    if criteria.startswith("cpe:"):
                        cpe_uris.append(criteria)

        return RawCVE(
            cve_id=cve_id,
            cvss_score=cvss_score,
            description=description,
            published_date=published_date,
            cpe_uris=cpe_uris,
            source="nvd",
        )

    except Exception as exc:
        log.warning("nvd.parse_error", error=str(exc), item=str(item)[:200])
        return None
