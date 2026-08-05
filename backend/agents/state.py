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

V0 note: No agent logic is implemented yet — this file is the scaffold only.
         Agent nodes (A1–A5) will be added in V1.0–V3.0 milestones.

Composite risk formula (implemented in A2, V1.0):
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

from typing import Annotated, Literal

from pydantic import BaseModel, Field


# ── Exploit status literals ────────────────────────────────────────────────────
# These are the four possible exploit intelligence outcomes from Agent A3.
# Using a Literal type enforces that only valid values can be set.
ExploitStatus = Literal["None", "PoC Exists", "Weaponised", "Actively Exploited"]


class PipelineState(BaseModel):
    """
    Shared state object flowing through the LangGraph pipeline.

    Populated incrementally as each agent runs:
        A1 (Ingestion)     → sets cve_id, cvss_score
        A2 (Correlator)    → sets matched_assets, exposure_multiplier, risk_score (partial)
        A3 (Exploit Intel) → sets exploit_status, risk_score (final)
        A4 (Planner)       → sets remediation_plan (added in V2.0)
        A5 (Reporter)      → sets ticket_url, alert_sent (added in V3.0)

    V0: only the fields required by spec R7 are defined here.
        Additional fields will be added in later milestones without breaking
        existing code (Pydantic ignores unknown fields by default).
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

    # ── Model configuration ───────────────────────────────────────────────────
    model_config = {
        # Allow extra fields — future milestones will add remediation_plan, ticket_url, etc.
        # This prevents breaking changes when V2.0/V3.0 extend the state.
        "extra": "allow",
        # Enable JSON schema generation for LangGraph state introspection
        "json_schema_extra": {
            "example": {
                "cve_id": "CVE-2021-44228",
                "cvss_score": 10.0,
                "matched_assets": ["app-server-01"],
                "exploit_status": "Actively Exploited",
                "risk_score": 60.0,
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
