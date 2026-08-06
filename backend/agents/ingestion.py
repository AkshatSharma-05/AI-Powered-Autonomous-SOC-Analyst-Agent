"""
backend/agents/ingestion.py
─────────────────────────────────────────────────────────────────────────────
Agent A1 — CVE Ingestion Orchestrator (Spec R8–R12).

Called by APScheduler every SCHEDULER_POLL_INTERVAL_MINUTES (default: 15).

Pipeline for each poll cycle:
  1. Poll NVD (R8)        → list[RawCVE]
  2. Poll OSV.dev (R9)    → list[RawCVE]
  3. Poll GitHub Advisory (R9) → list[RawCVE]
  4. Deduplicate by cve_id across all three sources (R9)
  5. For each unique CVE:
       a. Build STIX 2.1 bundle (R11)
       b. Upsert into `cve` table (ON CONFLICT DO NOTHING for duplicates)
       c. LPUSH to Redis pipeline queue (R12)
       d. Upsert pipeline_state row: stage=ingested, status=completed
  6. Log any per-CVE failures without aborting the cycle (R10)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.database import get_async_session
from backend.models.cve import CVE
from backend.models.pipeline_state import PipelineState
from backend.schemas import RawCVE
from backend.services import (
    github_advisory_client,
    nvd_client,
    osv_client,
)
from backend.services.redis_client import push_cve
from backend.services.stix_normaliser import build_stix_bundle

log = structlog.get_logger(__name__)


async def run_poll_cycle() -> dict[str, int]:
    """
    Execute a single A1 poll cycle across all three CVE sources.

    Returns a summary dict:
        {
            "nvd_fetched": N,
            "osv_fetched": N,
            "github_fetched": N,
            "unique_cves": N,
            "new_ingested": N,
            "errors": N,
        }
    """
    cycle_start = datetime.now(timezone.utc)
    log.info("a1.poll_cycle.start", ts=cycle_start.isoformat())

    # ── 1. Poll all three sources (concurrently) ──────────────────────────────
    # Run all three polls in parallel — failures in one don't block others
    nvd_results, osv_results, github_results = await asyncio.gather(
        _safe_poll("nvd", nvd_client.poll_recent),
        _safe_poll("osv", osv_client.poll_recent),
        _safe_poll("github_advisory", github_advisory_client.poll_recent),
        return_exceptions=False,  # _safe_poll always returns a list
    )

    log.info(
        "a1.sources_polled",
        nvd=len(nvd_results),
        osv=len(osv_results),
        github=len(github_results),
    )

    # ── 2. Deduplicate across sources ─────────────────────────────────────────
    # Priority order: NVD > OSV > GitHub Advisory (NVD has most complete CPE data)
    seen: dict[str, RawCVE] = {}
    for raw_cve in [*nvd_results, *osv_results, *github_results]:
        if raw_cve.cve_id not in seen:
            seen[raw_cve.cve_id] = raw_cve
        else:
            # Merge: if the winner (NVD) has no CPEs, take them from the challenger
            existing = seen[raw_cve.cve_id]
            if not existing.cpe_uris and raw_cve.cpe_uris:
                seen[raw_cve.cve_id] = raw_cve
            # If winner has no CVSS, take it from challenger
            if existing.cvss_score is None and raw_cve.cvss_score is not None:
                seen[raw_cve.cve_id] = raw_cve

    unique_cves = list(seen.values())
    log.info("a1.dedup_complete", unique_count=len(unique_cves))

    # ── 3. Persist each CVE ───────────────────────────────────────────────────
    new_ingested = 0
    errors = 0

    for raw_cve in unique_cves:
        try:
            was_new = await _persist_cve(raw_cve)
            if was_new:
                new_ingested += 1
                await push_cve(raw_cve.cve_id)
                log.info(
                    "a1.cve_ingested",
                    cve_id=raw_cve.cve_id,
                    source=raw_cve.source,
                    cvss=raw_cve.cvss_score,
                )
        except Exception as exc:
            errors += 1
            log.error(
                "a1.persist_failed",
                cve_id=raw_cve.cve_id,
                error=str(exc),
            )

    cycle_end = datetime.now(timezone.utc)
    duration_ms = int((cycle_end - cycle_start).total_seconds() * 1000)

    summary = {
        "nvd_fetched": len(nvd_results),
        "osv_fetched": len(osv_results),
        "github_fetched": len(github_results),
        "unique_cves": len(unique_cves),
        "new_ingested": new_ingested,
        "errors": errors,
        "duration_ms": duration_ms,
    }

    log.info("a1.poll_cycle.complete", **summary)
    return summary


# ── Private helpers ───────────────────────────────────────────────────────────

async def _safe_poll(source: str, poll_fn) -> list[RawCVE]:
    """
    Wrap a source poll function so that any uncaught exception returns an
    empty list rather than crashing the entire cycle.
    """
    try:
        return await poll_fn()
    except Exception as exc:
        log.error(f"a1.{source}.unexpected_error", error=str(exc))
        return []


async def _persist_cve(raw_cve: RawCVE) -> bool:
    """
    Upsert a single CVE into the database.

    Returns True if this is a NEW cve (inserted), False if it already existed
    (and was skipped by ON CONFLICT DO NOTHING).

    Also creates/updates the pipeline_state row for stage='ingested'.
    """
    stix_bundle = build_stix_bundle(
        cve_id=raw_cve.cve_id,
        description=raw_cve.description,
        cvss_score=raw_cve.cvss_score,
        published_date=raw_cve.published_date,
        cpe_uris=raw_cve.cpe_uris,
        source=raw_cve.source,
    )

    async with get_async_session() as session:
        # Upsert CVE — ON CONFLICT (cve_id) DO UPDATE to refresh data
        stmt = pg_insert(CVE).values(
            cve_id=raw_cve.cve_id,
            cvss_score=raw_cve.cvss_score,
            published_date=raw_cve.published_date,
            description=raw_cve.description,
            stix_data=stix_bundle,
            source=raw_cve.source,
            cpe_uris=raw_cve.cpe_uris,
        ).on_conflict_do_update(
            index_elements=["cve_id"],
            set_={
                # Update CVSS and CPEs if the new source has better data
                "cvss_score": pg_insert(CVE).excluded.cvss_score,
                "cpe_uris": pg_insert(CVE).excluded.cpe_uris,
                "stix_data": pg_insert(CVE).excluded.stix_data,
            },
            where=(
                # Only update if new data improves quality
                CVE.cvss_score.is_(None)
            ),
        )
        result = await session.execute(stmt)
        is_new = result.rowcount > 0

        # Always upsert pipeline_state for ingested stage
        ps_stmt = pg_insert(PipelineState).values(
            cve_id=raw_cve.cve_id,
            stage="ingested",
            status="completed",
        ).on_conflict_do_update(
            index_elements=["cve_id", "stage"],
            set_={"status": "completed"},
        )
        await session.execute(ps_stmt)

    return is_new
