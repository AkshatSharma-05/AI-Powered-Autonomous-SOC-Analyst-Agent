"""
backend/services/github_poc_client.py
─────────────────────────────────────────────────────────────────────────────
GitHub Code Search PoC finder — Spec R24.

Uses the GitHub REST API Code Search endpoint to find repositories
containing the CVE ID alongside exploit-related keywords.

Endpoint: GET https://api.github.com/search/code
Query:    "{cve_id} exploit OR poc OR proof-of-concept"

Rate limits:
  - Without token: 10 req/min (effectively unusable for bulk)
  - With token (GITHUB_TOKEN): 30 req/min

If GITHUB_TOKEN is not set, returns an empty list (graceful degradation).

Result recency is used in A3 for exploit_status tiering:
  - Repository pushed < 48 hours ago → treated as fresh/weaponised indicator
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog

from backend.config import get_settings
from backend.services.http_client import get_http_client

log = structlog.get_logger(__name__)


class GitHubPoCResult:
    """A single GitHub repository containing PoC/exploit code for a CVE."""

    def __init__(
        self,
        repo_name: str,
        repo_url: str,
        file_path: str,
        pushed_at: Optional[datetime],
    ):
        self.repo_name = repo_name
        self.repo_url = repo_url
        self.file_path = file_path
        self.pushed_at = pushed_at

    def is_recent(self, hours: int = 48) -> bool:
        """Return True if the repository was pushed to within the last N hours."""
        if self.pushed_at is None:
            return False
        age = datetime.now(timezone.utc) - self.pushed_at
        return age.total_seconds() < hours * 3600


async def search(cve_id: str) -> list[GitHubPoCResult]:
    """
    Search GitHub for repositories containing PoC/exploit code for a CVE.

    Returns an empty list if:
      - GITHUB_TOKEN is not set
      - The search returns no results
      - The API call fails
    """
    settings = get_settings()

    if not settings.github_token:
        log.debug(
            "github_poc.no_token",
            cve_id=cve_id,
            reason="GITHUB_TOKEN not set — skipping GitHub PoC search",
        )
        return []

    client = get_http_client()
    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    query = f"{cve_id} exploit OR poc OR proof-of-concept"
    params = {
        "q": query,
        "per_page": 10,  # Limit results — we only need to detect presence
        "sort": "indexed",
        "order": "desc",
    }

    try:
        resp = await client.get_with_retry(
            f"{settings.github_rest_api_url}/search/code",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

        results: list[GitHubPoCResult] = []
        for item in data.get("items", []):
            repo = item.get("repository", {})
            pushed_at_raw = repo.get("pushed_at")
            pushed_at: Optional[datetime] = None
            if pushed_at_raw:
                try:
                    pushed_at = datetime.fromisoformat(
                        pushed_at_raw.replace("Z", "+00:00")
                    )
                except ValueError:
                    pass

            results.append(GitHubPoCResult(
                repo_name=repo.get("full_name", ""),
                repo_url=repo.get("html_url", ""),
                file_path=item.get("path", ""),
                pushed_at=pushed_at,
            ))

        log.debug(
            "github_poc.search",
            cve_id=cve_id,
            match_count=len(results),
        )
        return results

    except Exception as exc:
        log.warning(
            "github_poc.search_failed",
            cve_id=cve_id,
            error=str(exc),
        )
        return []
