"""
backend/schemas.py
─────────────────────────────────────────────────────────────────────────────
Shared Pydantic v2 schemas used across the API layer and agent pipeline.

Sections:
  1. RawCVE          — unified intermediate format output by all three A1 sources
  2. CVEResponse     — GET /cves response item
  3. AssetMatch      — single matched asset in GET /cves/{id}/matches
  4. CVEMatchResponse — full matches response body
  5. CVEWebSocketMessage — WS push payload (R19)
  6. PipelineRunRequest — manual trigger POST body (future use)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ── Exploit status literal (mirrors agents/state.py) ─────────────────────────
ExploitStatus = Literal["None", "PoC Exists", "Weaponised", "Actively Exploited"]


# ─────────────────────────────────────────────────────────────────────────────
# 1. RawCVE — intermediate format shared by NVD, OSV, and GitHub Advisory
# ─────────────────────────────────────────────────────────────────────────────

class RawCVE(BaseModel):
    """
    Unified CVE representation produced by each A1 source client before
    normalisation and database upsert.

    This is an internal DTO — not exposed as an API response.
    """

    cve_id: str = Field(..., description="CVE identifier, e.g. 'CVE-2021-44228'")
    cvss_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=10.0,
        description="CVSS v3.1 base score; None if not yet scored",
    )
    description: Optional[str] = Field(
        None, description="English language vulnerability description"
    )
    published_date: Optional[datetime] = Field(
        None, description="UTC timestamp when the CVE was first published"
    )
    cpe_uris: list[str] = Field(
        default_factory=list,
        description="List of affected CPE 2.3 URI strings",
    )
    source: Literal["nvd", "osv", "github_advisory"] = Field(
        ..., description="Which ingestion source produced this record"
    )
    raw_data: Optional[dict[str, Any]] = Field(
        None,
        description="Original source JSON preserved for debugging; not stored in DB",
    )

    model_config = {"extra": "ignore"}


# ─────────────────────────────────────────────────────────────────────────────
# 2. CVEResponse — GET /cves list item
# ─────────────────────────────────────────────────────────────────────────────

class CVEResponse(BaseModel):
    """
    Single CVE item returned by GET /cves.

    Includes denormalized exploit_status and risk_score so the dashboard
    can render the full card without additional queries (R17).
    """

    cve_id: str
    cvss_score: Optional[float] = None
    description: Optional[str] = None
    published_date: Optional[datetime] = None
    source: Optional[str] = None
    exploit_status: ExploitStatus = "None"
    risk_score: float = 0.0
    matched_asset_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────────────────
# 3 & 4. Asset match responses — GET /cves/{id}/matches
# ─────────────────────────────────────────────────────────────────────────────

class AssetMatch(BaseModel):
    """A single asset matched against a CVE."""

    hostname: str
    ip_address: Optional[str] = None
    zone: str
    is_internet_facing: bool
    match_type: Literal["exact", "fuzzy"]
    exposure_multiplier: float

    model_config = {"from_attributes": True}


class CVEMatchResponse(BaseModel):
    """Response body for GET /cves/{cve_id}/matches (R18)."""

    cve_id: str
    cvss_score: Optional[float] = None
    exploit_status: ExploitStatus = "None"
    risk_score: float = 0.0
    matched_assets: list[AssetMatch] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# 5. WebSocket push message — WS /ws/cves (R19)
# ─────────────────────────────────────────────────────────────────────────────

class CVEWebSocketMessage(BaseModel):
    """
    Payload pushed to all connected WebSocket clients when a CVE completes
    the full A1→A2→A3 pipeline (R19).

    The dashboard uses this to append a new card without a page refresh.
    """

    event: Literal["cve_processed"] = "cve_processed"
    cve_id: str
    cvss_score: Optional[float] = None
    description: Optional[str] = None
    published_date: Optional[datetime] = None
    exploit_status: ExploitStatus = "None"
    risk_score: float = 0.0
    matched_assets: list[str] = Field(
        default_factory=list,
        description="List of matched asset hostnames",
    )
    is_kev_listed: bool = False
    source: Optional[str] = None
    processed_at: Optional[datetime] = None


# ─────────────────────────────────────────────────────────────────────────────
# 6. Paginated list wrapper (generic)
# ─────────────────────────────────────────────────────────────────────────────

class PaginatedCVEResponse(BaseModel):
    """Paginated wrapper for GET /cves (R17, R20)."""

    items: list[CVEResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
