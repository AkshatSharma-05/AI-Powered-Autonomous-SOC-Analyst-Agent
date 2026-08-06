"""
backend/services/osv_client.py
─────────────────────────────────────────────────────────────────────────────
OSV.dev package-scoped CVE poller — Spec R9.

OSV's /v1/query endpoint is package-scoped (not time-based), which makes it
the right tool for supply-chain CVEs like CVE-2024-3094 (xz-utils backdoor)
where OSV often has better/faster coverage than NVD.

Strategy:
  - On each poll cycle, query OSV with each seeded asset's vendor:product
    extracted from their CPE string.
  - Deduplication against NVD results is handled by the ingestion orchestrator
    (A1) using cve_id as the primary key.
  - OSV results that have no CVE alias are skipped (they're OSV-specific IDs
    like GHSA-xxxx which don't map to our CVE-centric schema).

OSV API endpoint: POST https://api.osv.dev/v1/query
Request body: {"package": {"name": "log4j", "ecosystem": "Maven"}}
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from sqlalchemy import select

from backend.config import get_settings
from backend.database import get_async_session
from backend.models.asset import Asset
from backend.schemas import RawCVE
from backend.services.http_client import get_http_client
from backend.services.redis_client import get_last_poll, set_last_poll

log = structlog.get_logger(__name__)

# Mapping from CPE vendor:product → OSV ecosystem
# Extended as needed to cover seeded assets
_CPE_TO_OSV_ECOSYSTEM: dict[str, str] = {
    "apache:log4j": "Maven",
    "xz:xz_utils": "Linux",
    "openssl:openssl": "PyPI",          # fallback; OpenSSL is best on NVD
    "linux:linux_kernel": "Linux",
    "microsoft:windows_server_2022": "Go",  # placeholder — skip if no match
    "postgresql:postgresql": "PyPI",
    "redis:redis": "PyPI",
    "nginx:nginx": "PyPI",
    "canonical:ubuntu_linux": "Linux",
    "docker:docker": "Go",
}


async def poll_recent() -> list[RawCVE]:
    """
    Query OSV.dev for CVEs affecting the asset portfolio.

    Flow:
        1. Load all asset CPE strings from the DB
        2. For each asset, extract vendor:product and derive OSV package name
        3. POST to OSV /v1/query for each package
        4. Extract CVE aliases from OSV response
        5. Return deduplicated RawCVE list

    Returns an empty list on error (logged, not raised).
    """
    settings = get_settings()
    client = get_http_client()

    # Load packages to query from seeded assets
    packages = await _get_asset_packages()
    if not packages:
        log.warning("osv.no_packages", reason="No assets with CPE strings found in DB")
        return []

    log.info("osv.polling", package_count=len(packages))

    seen_cve_ids: set[str] = set()
    all_cves: list[RawCVE] = []

    for pkg_name, ecosystem in packages:
        try:
            body = {"package": {"name": pkg_name, "ecosystem": ecosystem}}
            resp = await client.post_with_retry(
                f"{settings.osv_api_base_url}/query",
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

            for vuln in data.get("vulns", []):
                raw_cve = _parse_osv_vuln(vuln)
                if raw_cve and raw_cve.cve_id not in seen_cve_ids:
                    seen_cve_ids.add(raw_cve.cve_id)
                    all_cves.append(raw_cve)

        except Exception as exc:
            log.warning(
                "osv.package_query_failed",
                package=pkg_name,
                ecosystem=ecosystem,
                error=str(exc),
            )
            continue  # Don't abort the entire cycle for one bad package

    now_utc = datetime.now(timezone.utc)
    await set_last_poll("osv", now_utc)
    log.info("osv.poll_complete", cve_count=len(all_cves))
    return all_cves


# ── Private helpers ───────────────────────────────────────────────────────────

async def _get_asset_packages() -> list[tuple[str, str]]:
    """
    Load all asset CPE strings from the DB and convert them to OSV package
    queries (name, ecosystem) tuples.

    Uses the _CPE_TO_OSV_ECOSYSTEM lookup table; assets without a mapping
    are skipped with a debug log.
    """
    packages: list[tuple[str, str]] = []
    seen: set[str] = set()

    try:
        async with get_async_session() as session:
            result = await session.execute(select(Asset.cpe_string))
            cpe_strings = [row[0] for row in result.fetchall()]

        for cpe in cpe_strings:
            vendor_product = _extract_vendor_product(cpe)
            if vendor_product in seen:
                continue
            seen.add(vendor_product)

            pkg_name = vendor_product.split(":")[-1]  # product part
            ecosystem = _CPE_TO_OSV_ECOSYSTEM.get(vendor_product)

            if ecosystem is None:
                log.debug("osv.no_ecosystem_mapping", cpe=cpe, vendor_product=vendor_product)
                continue

            packages.append((pkg_name, ecosystem))

    except Exception as exc:
        log.error("osv.asset_load_failed", error=str(exc))

    return packages


def _extract_vendor_product(cpe: str) -> str:
    """
    Extract vendor:product from a CPE 2.3 URI.

    cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*  →  "apache:log4j"
    """
    try:
        parts = cpe.split(":")
        return f"{parts[3]}:{parts[4]}"
    except (IndexError, AttributeError):
        return cpe


def _parse_osv_vuln(vuln: dict[str, Any]) -> Optional[RawCVE]:
    """
    Parse a single OSV vulnerability entry into a RawCVE.

    OSV response structure:
        {
            "id": "GHSA-xxxx" | "CVE-2024-...",
            "aliases": ["CVE-2024-3094"],
            "summary": "...",
            "modified": "2024-03-29T12:00:00Z",
            "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:L/..."}],
            "affected": [{"package": {...}, "ranges": [...]}]
        }
    """
    try:
        osv_id: str = vuln.get("id", "")
        aliases: list[str] = vuln.get("aliases", [])

        # Find the CVE ID — prefer aliases over the OSV ID
        cve_id: Optional[str] = None
        if osv_id.startswith("CVE-"):
            cve_id = osv_id
        else:
            for alias in aliases:
                if alias.startswith("CVE-"):
                    cve_id = alias
                    break

        if cve_id is None:
            return None  # No CVE alias — skip OSV-specific IDs

        summary = vuln.get("summary") or vuln.get("details", "")

        # Published/modified date
        modified_raw = vuln.get("modified") or vuln.get("published")
        published_date: Optional[datetime] = None
        if modified_raw:
            try:
                published_date = datetime.fromisoformat(modified_raw.replace("Z", "+00:00"))
            except ValueError:
                pass

        # Extract CPE URIs from affected[].ranges or ecosystem data
        # OSV uses its own affected format; CPEs are rare in OSV — we leave it empty
        # and rely on NVD for CPE data on the same CVE.
        cpe_uris: list[str] = []
        for affected in vuln.get("affected", []):
            for db_specific in affected.get("database_specific", {}).values():
                if isinstance(db_specific, str) and db_specific.startswith("cpe:"):
                    cpe_uris.append(db_specific)

        return RawCVE(
            cve_id=cve_id,
            cvss_score=None,  # OSV severity is CVSS vector string, complex to parse — rely on NVD
            description=summary[:2000] if summary else None,
            published_date=published_date,
            cpe_uris=cpe_uris,
            source="osv",
        )

    except Exception as exc:
        log.warning("osv.parse_error", error=str(exc))
        return None
