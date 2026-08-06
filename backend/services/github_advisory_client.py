"""
backend/services/github_advisory_client.py
─────────────────────────────────────────────────────────────────────────────
GitHub Security Advisory GraphQL poller — Spec R9.

Polls the GitHub GraphQL API for security advisories updated since the last
poll. Requires GITHUB_TOKEN with public_repo or read:org scope.

GraphQL query used:
    securityAdvisories(updatedSince: $since, orderBy: {field: UPDATED_AT, direction: DESC})

If GITHUB_TOKEN is not configured, the client logs a warning and returns an
empty list — the ingestion cycle continues without GitHub Advisory data.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import structlog

from backend.config import get_settings
from backend.schemas import RawCVE
from backend.services.http_client import get_http_client
from backend.services.redis_client import get_last_poll, set_last_poll

log = structlog.get_logger(__name__)

_GHSA_QUERY = """
query FetchAdvisories($since: DateTime!, $after: String) {
  securityAdvisories(
    updatedSince: $since
    orderBy: {field: UPDATED_AT, direction: DESC}
    first: 100
    after: $after
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ghsaId
      summary
      publishedAt
      updatedAt
      severity
      cvss {
        score
      }
      identifiers {
        type
        value
      }
      vulnerabilities(first: 20) {
        nodes {
          package {
            name
            ecosystem
          }
          firstPatchedVersion {
            identifier
          }
          vulnerableVersionRange
        }
      }
    }
  }
}
"""


async def poll_recent() -> list[RawCVE]:
    """
    Fetch security advisories updated since the last poll via GitHub GraphQL.

    Returns an empty list if:
      - GITHUB_TOKEN is not configured (graceful degradation)
      - The API call fails after all retry attempts
    """
    settings = get_settings()

    if not settings.github_token:
        log.warning(
            "github_advisory.no_token",
            reason="GITHUB_TOKEN not set — skipping GitHub Advisory polling",
        )
        return []

    client = get_http_client()

    last_poll = await get_last_poll("github_advisory")
    now_utc = datetime.now(timezone.utc)
    since = last_poll or (now_utc - timedelta(hours=24))
    since_iso = since.strftime("%Y-%m-%dT%H:%M:%SZ")

    log.info("github_advisory.polling", since=since_iso)

    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Content-Type": "application/json",
    }

    all_cves: list[RawCVE] = []
    seen_cve_ids: set[str] = set()
    after_cursor: Optional[str] = None

    try:
        while True:
            body: dict[str, Any] = {
                "query": _GHSA_QUERY,
                "variables": {"since": since_iso, "after": after_cursor},
            }

            resp = await client.post_with_retry(
                settings.github_graphql_url,
                json=body,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

            if "errors" in data:
                log.error("github_advisory.graphql_errors", errors=data["errors"])
                break

            advisory_data = data.get("data", {}).get("securityAdvisories", {})
            nodes = advisory_data.get("nodes", [])
            page_info = advisory_data.get("pageInfo", {})

            for node in nodes:
                raw_cve = _parse_advisory_node(node)
                if raw_cve and raw_cve.cve_id not in seen_cve_ids:
                    seen_cve_ids.add(raw_cve.cve_id)
                    all_cves.append(raw_cve)

            if not page_info.get("hasNextPage"):
                break

            after_cursor = page_info.get("endCursor")
            log.debug("github_advisory.next_page", cursor=after_cursor)

    except Exception as exc:
        log.error("github_advisory.poll_failed", error=str(exc))
        return []

    await set_last_poll("github_advisory", now_utc)
    log.info("github_advisory.poll_complete", cve_count=len(all_cves))
    return all_cves


# ── Private helpers ───────────────────────────────────────────────────────────

def _parse_advisory_node(node: dict[str, Any]) -> Optional[RawCVE]:
    """
    Parse a single GitHub Security Advisory GraphQL node into a RawCVE.

    Only advisories that have a CVE identifier (in identifiers list) are
    returned — GHSA-only advisories are skipped.
    """
    try:
        # Extract CVE ID from identifiers
        cve_id: Optional[str] = None
        for identifier in node.get("identifiers", []):
            if identifier.get("type") == "CVE":
                cve_id = identifier.get("value")
                break

        if cve_id is None or not cve_id.startswith("CVE-"):
            return None

        summary = node.get("summary", "")
        cvss_score: Optional[float] = None
        cvss_data = node.get("cvss")
        if cvss_data:
            cvss_score = cvss_data.get("score")

        published_raw = node.get("publishedAt")
        published_date: Optional[datetime] = None
        if published_raw:
            try:
                published_date = datetime.fromisoformat(published_raw.replace("Z", "+00:00"))
            except ValueError:
                pass

        # GitHub advisories don't expose CPE URIs directly
        cpe_uris: list[str] = []

        return RawCVE(
            cve_id=cve_id,
            cvss_score=cvss_score,
            description=summary[:2000] if summary else None,
            published_date=published_date,
            cpe_uris=cpe_uris,
            source="github_advisory",
        )

    except Exception as exc:
        log.warning("github_advisory.parse_error", error=str(exc))
        return None
