"""
backend/agents/state.py
─────────────────────────────────────────────────────────────────────────────
Shared LangGraph pipeline state — Spec R7.

This module defines the single Pydantic state object that flows through
the entire 5-agent LangGraph pipeline.  It is the contract between all
agents — every agent reads from it and writes back to it.

Spec R7 required fields (exact naming):
    cve_id          : str
    cvss_score      : float
    matched_assets  : list[str]
    exploit_status  : str
    risk_score      : float

All agents import this class:
    from backend.agents.state import PipelineState

V1.0 additions:
    description, published_date, cpe_uris, exposure_multiplier,
    exploit_factor, is_kev_listed

Composite risk formula (R16, R25):
    risk_score = cvss_score × exposure_multiplier × exploit_factor

    exposure_multiplier:
        3.0  if any matched_asset is internet-facing
        1.0  otherwise

    exploit_factor:
        2.0  if exploit_status == "Actively Exploited"
        1.5  if exploit_status == "Weaponised"
        1.2  if exploit_status == "PoC Exists"
        1.0  if exploit_status == "None"
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── Exploit status literals ────────────────────────────────────────────────────
ExploitStatus = Literal["None", "PoC Exists", "Weaponised", "Actively Exploited"]


class PipelineState(BaseModel):
    """
    Shared state object flowing through the LangGraph pipeline.

    Populated incrementally as each agent runs:
        A1 (Ingestion)     → sets cve_id, cvss_score, description, cpe_uris
        A2 (Correlator)    → sets matched_assets, exposure_multiplier, risk_score (partial)
        A3 (Exploit Intel) → sets exploit_status, exploit_factor, risk_score (final)
        A4 (Planner)       → sets remediation_plan (added in V2.0)
        A5 (Reporter)      → sets ticket_url, alert_sent (added in V3.0)
    """

    # ── R7 required fields (exact names from spec) ────────────────────────────

    cve_id: str = Field(
        ...,
        description=(
            "CVE identifier of the vulnerability being processed, "
            "e.g. 'CVE-2021-44228'"
        ),
        examples=["CVE-2021-44228", "CVE-2024-3094"],
    )

    cvss_score: float = Field(
        ...,
        ge=0.0,
        le=10.0,
        description="CVSS v3.1 base score — range 0.0 to 10.0",
        examples=[10.0, 9.8, 7.8],
    )

    matched_assets: list[str] = Field(
        default_factory=list,
        description=(
            "List of asset hostnames (or IDs) from the inventory that are "
            "affected by this CVE.  Populated by Agent A2.  Empty list means "
            "no affected assets found — CVE is filtered out before A3/A4."
        ),
        examples=[["app-server-01", "k8s-node-01"]],
    )

    exploit_status: ExploitStatus = Field(
        default="None",
        description=(
            "Exploit intelligence outcome from Agent A3.  "
            "One of: 'None' | 'PoC Exists' | 'Weaponised' | 'Actively Exploited'"
        ),
    )

    risk_score: float = Field(
        default=0.0,
        ge=0.0,
        description=(
            "Composite risk score computed by Agent A2/A3 using the formula: "
            "cvss_score × exposure_multiplier × exploit_factor.  "
            "Used to prioritise remediation and route to human approval."
        ),
    )

    # ── V1.0 additions ────────────────────────────────────────────────────────

    description: Optional[str] = Field(
        default=None,
        description="English language vulnerability description from NVD/OSV",
    )

    published_date: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when the CVE was first published",
    )

    cpe_uris: list[str] = Field(
        default_factory=list,
        description="List of affected CPE 2.3 URI strings extracted from NVD",
    )

    exposure_multiplier: float = Field(
        default=1.0,
        ge=1.0,
        le=3.0,
        description=(
            "Exposure multiplier set by A2: 3.0 if any matched asset is "
            "internet-facing, 1.0 otherwise"
        ),
    )

    exploit_factor: float = Field(
        default=1.0,
        ge=1.0,
        le=2.0,
        description=(
            "Exploit factor set by A3: 2.0/1.5/1.2/1.0 corresponding to "
            "Actively Exploited / Weaponised / PoC Exists / None"
        ),
    )

    is_kev_listed: bool = Field(
        default=False,
        description="True if the CVE is listed in the CISA KEV catalogue",
    )

    # ── Model configuration ───────────────────────────────────────────────────
    model_config = {
        "extra": "allow",
        "json_schema_extra": {
            "example": {
                "cve_id": "CVE-2021-44228",
                "cvss_score": 10.0,
                "matched_assets": ["app-server-01"],
                "exploit_status": "Actively Exploited",
                "risk_score": 60.0,
                "exposure_multiplier": 3.0,
                "exploit_factor": 2.0,
                "is_kev_listed": True,
            }
        },
    }

    def is_critical(self) -> bool:
        """
        Convenience method — returns True if this CVE warrants human approval.

        Threshold: risk_score > 15 OR cvss_score >= 9.0 with any exploit.
        The exact threshold will be configurable in V2.0.
        """
        return self.risk_score > 15.0 or (
            self.cvss_score >= 9.0 and self.exploit_status != "None"
        )

    def __repr__(self) -> str:
        return (
            f"<PipelineState cve={self.cve_id!r} "
            f"cvss={self.cvss_score} risk={self.risk_score:.1f} "
            f"exploit={self.exploit_status!r}>"
        )
