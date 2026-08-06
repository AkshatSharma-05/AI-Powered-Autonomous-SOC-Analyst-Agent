"""
backend/services/stix_normaliser.py
─────────────────────────────────────────────────────────────────────────────
STIX 2.1 bundle builder — Spec R11.

Converts a RawCVE (the unified intermediate from all three ingestion sources)
into a STIX 2.1 bundle stored as a dict in the `cve.stix_data` JSONB column.

Bundle structure:
    Bundle
    └── Vulnerability SDO  (id = vulnerability--<uuid5 of CVE ID>)
        ├── name            = CVE ID (e.g. "CVE-2021-44228")
        ├── description     = NVD description
        ├── external_references → NVD URL + CVE URL
        └── custom fields   → x_cvss_score, x_published_date, x_source
    └── Software SCO (one per affected CPE URI)
        └── cpe             = CPE 2.3 string

Using uuid5(NAMESPACE_URL, cve_id) ensures the Vulnerability SDO has the same
STIX ID every time we encounter the same CVE — safe for idempotent upserts.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# STIX NAMESPACE for deterministic uuid5 generation
_STIX_NS = uuid.UUID("00abedb4-aa42-466c-9c01-fed23315a9b7")


def build_stix_bundle(
    cve_id: str,
    description: str | None,
    cvss_score: float | None,
    published_date: datetime | None,
    cpe_uris: list[str],
    source: str,
) -> dict[str, Any]:
    """
    Build a minimal STIX 2.1 bundle for a CVE and return it as a plain dict
    suitable for storage in PostgreSQL JSONB.

    Parameters
    ----------
    cve_id          : str   — CVE ID, e.g. "CVE-2021-44228"
    description     : str | None — English vulnerability description
    cvss_score      : float | None — CVSS v3.1 base score
    published_date  : datetime | None — When the CVE was first published
    cpe_uris        : list[str] — Affected CPE 2.3 URI strings
    source          : str   — Ingestion source: "nvd" | "osv" | "github_advisory"

    Returns
    -------
    dict — STIX 2.1 Bundle serialised as a plain Python dict (JSON-serialisable)
    """
    now_iso = _dt_iso(datetime.utcnow())

    # ── Vulnerability SDO ─────────────────────────────────────────────────────
    vuln_id = f"vulnerability--{uuid.uuid5(_STIX_NS, cve_id)}"

    external_refs = [
        {
            "source_name": "cve",
            "external_id": cve_id,
            "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}",
        },
    ]

    vuln = {
        "type": "vulnerability",
        "spec_version": "2.1",
        "id": vuln_id,
        "created": now_iso,
        "modified": now_iso,
        "name": cve_id,
        "description": description or "",
        "external_references": external_refs,
        # Custom STIX extensions (x_ prefix is spec-compliant for custom props)
        "x_cvss_score": cvss_score,
        "x_published_date": _dt_iso(published_date) if published_date else None,
        "x_source": source,
    }

    # ── Software SCOs (one per CPE) ───────────────────────────────────────────
    software_objects: list[dict[str, Any]] = []
    for cpe in cpe_uris:
        sw_id = f"software--{uuid.uuid5(_STIX_NS, cpe)}"
        software_objects.append(
            {
                "type": "software",
                "spec_version": "2.1",
                "id": sw_id,
                "created": now_iso,
                "modified": now_iso,
                "name": _name_from_cpe(cpe),
                "cpe": cpe,
            }
        )

    # ── Bundle ────────────────────────────────────────────────────────────────
    bundle_id = f"bundle--{uuid.uuid4()}"
    bundle = {
        "type": "bundle",
        "id": bundle_id,
        "objects": [vuln, *software_objects],
    }

    log.debug(
        "stix.bundle_built",
        cve_id=cve_id,
        software_count=len(software_objects),
        source=source,
    )
    return bundle


# ── Private helpers ───────────────────────────────────────────────────────────

def _dt_iso(dt: datetime | None) -> str | None:
    """Return ISO-8601 string in UTC. Returns None if dt is None."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    from datetime import timezone
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _name_from_cpe(cpe: str) -> str:
    """
    Extract a human-readable name from a CPE 2.3 URI.

    cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*
                    ^^^^^^^:^^^^^^:^^^^^^^
                    vendor : product : version
    Returns "apache:log4j:2.14.1" or the full CPE on parse failure.
    """
    try:
        parts = cpe.split(":")
        # cpe:2.3:<part>:<vendor>:<product>:<version>:...
        vendor = parts[3]
        product = parts[4]
        version = parts[5]
        name = f"{vendor}:{product}"
        if version not in ("*", "-", ""):
            name += f":{version}"
        return name
    except (IndexError, AttributeError):
        return cpe
