"""
backend/agents/correlator.py
─────────────────────────────────────────────────────────────────────────────
Agent A2 — Asset Correlator (Spec R13–R16).

Receives a CVE ID from the Redis pipeline queue and determines which assets
in the seeded inventory are affected.

Matching strategy (in order):
  1. Exact CPE match (R13)  — if any CVE CPE vendor:product equals any asset CPE
  2. Fuzzy CPE match (R14)  — Jaccard similarity ≥ 0.80 on tokenised CPE
  3. No match (R15)         — update pipeline_state to skipped, stop pipeline

Exposure scoring (R16):
  For each matched asset, applies:
    3.0× if asset.is_internet_facing == True  (DMZ / cloud-exposed)
    1.0× otherwise  (internal-only)
  Takes the highest multiplier across all matched assets.

Output:
  - Updates cve.matched_asset_hostnames (denormalized list for fast API)
  - Inserts rows into cve_asset_match junction table
  - Updates pipeline_state: stage=correlated, status=completed|skipped
  - Returns a CorrelationResult dataclass
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import structlog
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.database import get_async_session
from backend.models.asset import Asset
from backend.models.cve import CVE
from backend.models.pipeline_state import PipelineState
from backend.services.cpe_utils import best_fuzzy_score, exact_match, parse_cpe

log = structlog.get_logger(__name__)

FUZZY_THRESHOLD = 0.80


@dataclass
class MatchedAsset:
    """A single asset matched against a CVE."""

    hostname: str
    ip_address: Optional[str]
    zone: str
    is_internet_facing: bool
    cpe_string: str
    match_type: str  # "exact" | "fuzzy"
    fuzzy_score: float  # 1.0 for exact matches
    exposure_multiplier: float


@dataclass
class CorrelationResult:
    """Output of Agent A2 for a single CVE."""

    cve_id: str
    matched_assets: list[MatchedAsset] = field(default_factory=list)
    exposure_multiplier: float = 1.0  # max across matched assets
    has_matches: bool = False


async def correlate(cve_id: str) -> CorrelationResult:
    """
    Run asset correlation for a single CVE.

    Flow:
        1. Load CVE CPE URIs from DB
        2. Load all asset CPE strings from DB
        3. Exact match → Fuzzy match fallback → Skip
        4. Compute exposure multiplier
        5. Persist cve_asset_match rows
        6. Update pipeline_state

    Returns a CorrelationResult — always returns (never raises).
    On error: logs and returns empty result.
    """
    log.info("a2.correlating", cve_id=cve_id)

    try:
        async with get_async_session() as session:
            # Load CVE
            cve_result = await session.execute(
                select(CVE).where(CVE.cve_id == cve_id)
            )
            cve = cve_result.scalar_one_or_none()

            if cve is None:
                log.error("a2.cve_not_found", cve_id=cve_id)
                return CorrelationResult(cve_id=cve_id)

            cve_cpes: list[str] = cve.cpe_uris or []

            if not cve_cpes:
                log.info("a2.no_cpe_data", cve_id=cve_id)
                await _update_pipeline_state(cve_id, "correlated", "skipped")
                return CorrelationResult(cve_id=cve_id)

            # Load all assets
            asset_result = await session.execute(select(Asset))
            all_assets: list[Asset] = asset_result.scalars().all()

        # ── Matching ──────────────────────────────────────────────────────────
        matched: list[MatchedAsset] = []

        for asset in all_assets:
            asset_cpe = asset.cpe_string

            # 1. Exact match
            if exact_match(cve_cpes, [asset_cpe]):
                matched.append(MatchedAsset(
                    hostname=asset.hostname,
                    ip_address=asset.ip_address,
                    zone=asset.zone,
                    is_internet_facing=asset.is_internet_facing,
                    cpe_string=asset_cpe,
                    match_type="exact",
                    fuzzy_score=1.0,
                    exposure_multiplier=3.0 if asset.is_internet_facing else 1.0,
                ))
                continue  # Don't also fuzzy-score this asset

            # 2. Fuzzy match fallback
            score = best_fuzzy_score(cve_cpes, asset_cpe)
            if score >= FUZZY_THRESHOLD:
                matched.append(MatchedAsset(
                    hostname=asset.hostname,
                    ip_address=asset.ip_address,
                    zone=asset.zone,
                    is_internet_facing=asset.is_internet_facing,
                    cpe_string=asset_cpe,
                    match_type="fuzzy",
                    fuzzy_score=score,
                    exposure_multiplier=3.0 if asset.is_internet_facing else 1.0,
                ))

        # ── No matches (R15) ──────────────────────────────────────────────────
        if not matched:
            log.info(
                "a2.no_match",
                cve_id=cve_id,
                cve_cpe_count=len(cve_cpes),
                asset_count=len(all_assets),
            )
            await _update_pipeline_state(cve_id, "correlated", "skipped")
            return CorrelationResult(cve_id=cve_id)

        # ── Exposure multiplier (R16) ─────────────────────────────────────────
        max_exposure = max(m.exposure_multiplier for m in matched)

        log.info(
            "a2.match_found",
            cve_id=cve_id,
            matched_count=len(matched),
            exposure_multiplier=max_exposure,
            match_types=[m.match_type for m in matched],
        )

        # ── Persist matches ───────────────────────────────────────────────────
        await _persist_matches(cve_id, matched)
        await _update_pipeline_state(cve_id, "correlated", "completed")

        return CorrelationResult(
            cve_id=cve_id,
            matched_assets=matched,
            exposure_multiplier=max_exposure,
            has_matches=True,
        )

    except Exception as exc:
        log.error("a2.correlation_failed", cve_id=cve_id, error=str(exc))
        await _update_pipeline_state(cve_id, "correlated", "failed")
        return CorrelationResult(cve_id=cve_id)


# ── Private helpers ───────────────────────────────────────────────────────────

async def _persist_matches(cve_id: str, matched: list[MatchedAsset]) -> None:
    """Insert rows into the cve_asset_match junction table."""
    async with get_async_session() as session:
        # Update denormalized fields on CVE row
        cve_result = await session.execute(
            select(CVE).where(CVE.cve_id == cve_id)
        )
        cve = cve_result.scalar_one_or_none()
        if cve:
            cve.matched_asset_hostnames = [m.hostname for m in matched]

        # Insert into cve_asset_match junction table
        for m in matched:
            stmt = text("""
                INSERT INTO cve_asset_match (cve_id, asset_hostname, match_type,
                    fuzzy_score, exposure_multiplier, is_internet_facing, zone)
                VALUES (:cve_id, :hostname, :match_type, :fuzzy_score,
                    :exposure_multiplier, :is_internet_facing, :zone)
                ON CONFLICT (cve_id, asset_hostname) DO UPDATE
                SET match_type = EXCLUDED.match_type,
                    fuzzy_score = EXCLUDED.fuzzy_score,
                    exposure_multiplier = EXCLUDED.exposure_multiplier
            """)
            await session.execute(stmt, {
                "cve_id": cve_id,
                "hostname": m.hostname,
                "match_type": m.match_type,
                "fuzzy_score": m.fuzzy_score,
                "exposure_multiplier": m.exposure_multiplier,
                "is_internet_facing": m.is_internet_facing,
                "zone": m.zone,
            })


async def _update_pipeline_state(cve_id: str, stage: str, status: str) -> None:
    """Upsert a pipeline_state row for a given (cve_id, stage) pair."""
    async with get_async_session() as session:
        stmt = pg_insert(PipelineState).values(
            cve_id=cve_id,
            stage=stage,
            status=status,
        ).on_conflict_do_update(
            index_elements=["cve_id", "stage"],
            set_={"status": status},
        )
        await session.execute(stmt)
